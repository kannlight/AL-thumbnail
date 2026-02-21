import { useState, useCallback, useEffect } from "react";
import { ChatMessage, saveHistory, loadHistory, saveImage, loadImage } from "../stores/chatStore";

// Blob を Data URI 文字列に変換するヘルパー
function blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string>("");

    // MCP画像選択待ちのステート
    const [pendingMcpImages, setPendingMcpImages] = useState<{ mimeType: string; data: string }[] | null>(null);
    const [pendingMessage, setPendingMessage] = useState<string>("");

    useEffect(() => {
        // 新しいセッションIDを発行して管理する
        const sessionId = Date.now().toString();
        setCurrentSessionId(sessionId);
    }, []);

    const startNewChat = useCallback(() => {
        setMessages([]);
        setError(null);
        setPendingMcpImages(null);
        setPendingMessage("");
        setCurrentSessionId(Date.now().toString());
    }, []);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        const newUserMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            text: text,
            timestamp: Date.now(),
        };

        const updatedMessages = [...messages, newUserMessage];
        setMessages(updatedMessages);
        setIsLoading(true);
        setError(null);
        setPendingMcpImages(null);
        setPendingMessage("");

        try {
            // Gemini APIのhistory形式に変換 (直近10ターン分程度に絞る)
            const historyToSend = updatedMessages.slice(-20).map(msg => {
                const parts: any[] = [];
                const isModel = msg.role === "assistant";

                // テキストパートの追加
                // モデル応答でテキストが空の場合はパートを追加しない
                // （Gemini 3ではモデルの全パートにthoughtSignatureが必須）
                if (msg.text || !isModel) {
                    const textPart: any = { text: msg.text };
                    if (msg.textThoughtSignature) {
                        textPart.thoughtSignature = msg.textThoughtSignature;
                    }
                    parts.push(textPart);
                }

                // msg に含まれる画像データを inlineData として添付する
                // img.data は "data:<mimeType>;base64,<b64>" 形式で保持しているので、
                // カンマ以降の純粋な Base64 部分を取り出す
                if (msg.images && msg.images.length > 0) {
                    for (const img of msg.images) {
                        const b64 = img.data.includes(",")
                            ? img.data.split(",")[1]
                            : img.data;
                        if (b64) {
                            const imgPart: any = {
                                inlineData: {
                                    mimeType: img.mimeType,
                                    data: b64,
                                }
                            };
                            // thoughtSignature を添付（Gemini 3 の要件）
                            if (img.thoughtSignature) {
                                imgPart.thoughtSignature = img.thoughtSignature;
                            }
                            parts.push(imgPart);
                        }
                    }
                }

                return {
                    role: msg.role === "user" ? "user" : "model",
                    parts
                };
            });

            // ユーザーの最新メッセージは body.message に入れるので履歴からは除く
            const history = historyToSend.slice(0, -1);

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    history: history,
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `エラーが発生しました (${res.status})`);
            }

            const data = await res.json();

            // MCPツール実行結果による画像一覧が返ってきた場合（生成前）
            if (data.type === "mcp_results") {
                setPendingMcpImages(data.images || []);
                setPendingMessage(text);
                setIsLoading(false);
                return;
            }

            // AIからの画像を処理
            // Data URI 形式 ("data:image/png;base64,...") で保持する
            // → <img src> でもそのまま表示可能、API送信時も Base64 を抽出可能
            const newImages = [];
            if (data.images && data.images.length > 0) {
                for (let i = 0; i < data.images.length; i++) {
                    const img = data.images[i];
                    const imageId = `img-${Date.now()}-${i}`;
                    const b64Data = img.data;
                    const dataUri = `data:${img.mimeType};base64,${b64Data}`;

                    // IndexedDB にも Blob で保存（リロード復元用）
                    try {
                        const resBlob = await fetch(dataUri);
                        const blob = await resBlob.blob();
                        await saveImage(currentSessionId, imageId, blob);
                    } catch (e) {
                        console.warn("IndexedDB への画像保存に失敗:", e);
                    }

                    newImages.push({
                        id: imageId,
                        mimeType: img.mimeType,
                        data: dataUri, // Data URI をそのまま保持
                        thoughtSignature: img.thoughtSignature, // Gemini 3 の署名を保持
                    });
                }
            }

            const newAiMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                text: data.text || "",
                images: newImages.length > 0 ? newImages : undefined,
                timestamp: Date.now(),
                textThoughtSignature: data.textThoughtSignature,
            };

            const finalMessages = [...updatedMessages, newAiMessage];
            setMessages(finalMessages);

            // localStorage に履歴を保存
            saveHistory(currentSessionId, finalMessages);

        } catch (err: any) {
            console.error("チャット送信エラー:", err);
            setError(err.message || "予期せぬエラーが発生しました");
        } finally {
            setIsLoading(false);
        }
    }, [messages, currentSessionId]);

    const submitSelectedImages = useCallback(async (selectedImages: { mimeType: string; data: string }[]) => {
        if (!pendingMessage) return;

        setIsLoading(true);
        setError(null);

        try {
            // 最新のメッセージはユーザーの pendingMessage のはず
            const historyToSend = messages.slice(-20).map(msg => {
                const parts: any[] = [];
                const isModel = msg.role === "assistant";

                if (msg.text || !isModel) {
                    const textPart: any = { text: msg.text };
                    if (msg.textThoughtSignature) textPart.thoughtSignature = msg.textThoughtSignature;
                    parts.push(textPart);
                }

                if (msg.images && msg.images.length > 0) {
                    for (const img of msg.images) {
                        const b64 = img.data.includes(",") ? img.data.split(",")[1] : img.data;
                        if (b64) {
                            const imgPart: any = { inlineData: { mimeType: img.mimeType, data: b64 } };
                            if (img.thoughtSignature) imgPart.thoughtSignature = img.thoughtSignature;
                            parts.push(imgPart);
                        }
                    }
                }

                return { role: msg.role === "user" ? "user" : "model", parts };
            });

            const history = historyToSend.slice(0, -1);

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: pendingMessage,
                    history: history,
                    selectedImages: selectedImages,
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `エラーが発生しました (${res.status})`);
            }

            const data = await res.json();

            const newImages = [];
            if (data.images && data.images.length > 0) {
                for (let i = 0; i < data.images.length; i++) {
                    const img = data.images[i];
                    const imageId = `img-${Date.now()}-${i}`;
                    const dataUri = `data:${img.mimeType};base64,${img.data}`;

                    try {
                        const resBlob = await fetch(dataUri);
                        const blob = await resBlob.blob();
                        await saveImage(currentSessionId, imageId, blob);
                    } catch (e) {
                        console.warn("IndexedDB への画像保存に失敗:", e);
                    }

                    newImages.push({
                        id: imageId,
                        mimeType: img.mimeType,
                        data: dataUri,
                        thoughtSignature: img.thoughtSignature,
                    });
                }
            }

            const newAiMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                text: data.text || "",
                images: newImages.length > 0 ? newImages : undefined,
                timestamp: Date.now(),
                textThoughtSignature: data.textThoughtSignature,
            };

            const finalMessages = [...messages, newAiMessage];
            setMessages(finalMessages);
            saveHistory(currentSessionId, finalMessages);

            // 完了後は選択状態リセット
            setPendingMcpImages(null);
            setPendingMessage("");

        } catch (err: any) {
            console.error("チャット送信エラー:", err);
            setError(err.message || "予期せぬエラーが発生しました");
        } finally {
            setIsLoading(false);
        }
    }, [messages, currentSessionId, pendingMessage]);

    const cancelMcpSelection = useCallback(() => {
        setPendingMcpImages(null);
        setPendingMessage("");
        setMessages((prev) => {
            const newMessages = [...prev];
            // ユーザーの最後のリクエストを取り消す
            if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === "user") {
                newMessages.pop();
            }
            return newMessages;
        });
        setIsLoading(false);
    }, []);

    // 履歴を復元する関数
    const loadSession = useCallback(async (sessionId: string) => {
        try {
            const history = loadHistory(sessionId);
            if (!history) return;

            // 履歴に含まれる画像の ID を用いて、IndexedDB から Blob を読み出し、Data URI に復元
            const restoredMessages = await Promise.all(history.map(async (msg) => {
                if (!msg.images || msg.images.length === 0) return msg;

                const restoredImages = await Promise.all(msg.images.map(async (img) => {
                    const blob = await loadImage(img.id);
                    if (!blob) return img; // みつからなければ元の（空）のまま

                    const dataUri = await blobToDataUri(blob);
                    return { ...img, data: dataUri };
                }));

                return { ...msg, images: restoredImages };
            }));

            setMessages(restoredMessages);
            setCurrentSessionId(sessionId);
        } catch (e) {
            console.error("履歴の復元に失敗しました", e);
        }
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        startNewChat,
        currentSessionId,
        loadSession,

        // 新しく追加したステートと関数
        pendingMcpImages,
        submitSelectedImages,
        cancelMcpSelection,
    };
}
