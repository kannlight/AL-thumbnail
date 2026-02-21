import { NextRequest, NextResponse } from "next/server";
import {
    callMcpAgent,
    createImageGenChat,
    parseGeminiResponse,
    GeminiHistoryItem,
} from "@/lib/gemini";
import { McpClient } from "@/lib/mcp";
import type { Part } from "@google/genai";

// ============================================================
// MCP クライアントを生成する（リクエストごとに生成）
// ============================================================
function createMcpClient(): McpClient | null {
    const serverUrl = process.env.MCP_SERVER_URL;
    const password = process.env.AUTH_PASSWORD;

    if (!serverUrl || !password) {
        console.warn(
            "[chat/route] MCP_SERVER_URL または AUTH_PASSWORD が未設定のため、MCPツールは無効です"
        );
        return null;
    }

    return new McpClient(serverUrl, password);
}

// ============================================================
// Function Call を含むかどうかを判定するヘルパー
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasFunctionCall(response: any): boolean {
    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    return parts.some((p: { functionCall?: unknown }) => p.functionCall != null);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFunctionCalls(response: any): Array<{ name: string; args: Record<string, unknown> }> {
    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    return parts
        .filter((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall != null)
        .map((p: { functionCall: { name: string; args: Record<string, unknown> } }) => ({
            name: p.functionCall.name,
            args: p.functionCall.args ?? {},
        }));
}

// ============================================================
// POST ハンドラー
// ============================================================
export async function POST(request: NextRequest) {
    // 1. リクエストボディのパース & バリデーション
    let message: string;
    let history: GeminiHistoryItem[];
    let selectedImages: { mimeType: string; data: string }[] | undefined;

    try {
        const body = await request.json();
        message = body.message;
        history = body.history ?? [];
        selectedImages = body.selectedImages;

        if (!message || typeof message !== "string" || message.trim() === "") {
            return NextResponse.json(
                { error: "message は必須のフィールドです" },
                { status: 400 }
            );
        }
    } catch {
        return NextResponse.json(
            { error: "リクエストボディの解析に失敗しました" },
            { status: 400 }
        );
    }

    // 2. API キー確認
    if (!process.env.GEMINI_API_KEY) {
        console.error("[chat/route] GEMINI_API_KEY が未設定です");
        return NextResponse.json(
            { error: "サーバー設定エラー。管理者にお問い合わせください。" },
            { status: 500 }
        );
    }

    try {
        if (selectedImages !== undefined) {
            // ==========================================
            // パターンB: 画像選択後（またはツール不要時）
            // ==========================================
            let chat = createImageGenChat(history);

            const messageParts: Part[] = [{ text: message.trim() }];

            // 選択された画像があれば追加
            for (const img of selectedImages) {
                const b64 = img.data.includes(",") ? img.data.split(",")[1] : img.data;
                messageParts.push({
                    inlineData: {
                        mimeType: img.mimeType,
                        data: b64,
                    }
                });
            }

            // 画像生成実行
            const response = await chat.sendMessage({ message: messageParts });

            // 6. レスポンスのパース
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsed = parseGeminiResponse(response as any);
            return NextResponse.json(parsed, { status: 200 });

        } else {
            // ==========================================
            // パターンA: 初回リクエスト（MCPツール判定）
            // ==========================================
            let response = await callMcpAgent(message.trim());

            if (hasFunctionCall(response)) {
                const functionCalls = extractFunctionCalls(response);
                console.log(
                    `[chat/route] Function Call 検出 (${functionCalls.length}件):`,
                    functionCalls.map((fc) => fc.name).join(", ")
                );

                const mcpClient = createMcpClient();
                if (!mcpClient) {
                    return NextResponse.json(
                        { error: "MCPサーバーが設定されていません。" },
                        { status: 500 }
                    );
                }

                const fetchedImages: { mimeType: string; data: string }[] = [];

                await Promise.all(
                    functionCalls.map(async (fc) => {
                        try {
                            const result = await mcpClient.executeTool(fc.name, fc.args);

                            let contents: Array<Record<string, unknown>> = [];
                            if (Array.isArray(result)) {
                                contents = result;
                            } else {
                                const mcpResult = result as Record<string, unknown>;
                                contents = (mcpResult?.content ?? mcpResult?.contents ?? []) as Array<Record<string, unknown>>;
                            }

                            if (Array.isArray(contents)) {
                                for (const item of contents) {
                                    if (item.type === "image" && typeof item.data === "string") {
                                        const mimeType = item.mimeType ?? item.mime_type ?? "image/jpeg";
                                        fetchedImages.push({
                                            mimeType: String(mimeType),
                                            data: item.data,
                                        });
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`[chat/route] MCPツール "${fc.name}" の実行エラー:`, err);
                        }
                    })
                );

                // 画像抽出リストをそのままフロントエンドに返却（生成は行わない）
                return NextResponse.json({
                    type: "mcp_results",
                    images: fetchedImages
                }, { status: 200 });
            } else {
                // MCPツール不要と判断された場合、参照画像なしで画像生成エージェントを実行する
                const chat = createImageGenChat(history);
                const messageParts: Part[] = [{ text: message.trim() }];
                const imgResponse = await chat.sendMessage({ message: messageParts });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parsed = parseGeminiResponse(imgResponse as any);
                return NextResponse.json(parsed, { status: 200 });
            }
        }
    } catch (error: unknown) {
        console.error("[chat/route] Gemini API エラー:", error);

        const errorMessage =
            error instanceof Error ? error.message : String(error);

        // レート制限
        if (
            errorMessage.includes("429") ||
            errorMessage.toLowerCase().includes("rate limit") ||
            errorMessage.toLowerCase().includes("quota")
        ) {
            return NextResponse.json(
                {
                    error: "リクエストが多すぎます。しばらくしてからお試しください。",
                    details: errorMessage,
                },
                { status: 429 }
            );
        }

        // コンテンツフィルター
        if (
            errorMessage.toLowerCase().includes("safety") ||
            errorMessage.toLowerCase().includes("blocked") ||
            errorMessage.toLowerCase().includes("finish_reason: safety")
        ) {
            return NextResponse.json(
                {
                    error:
                        "コンテンツポリシーにより生成がブロックされました。プロンプトを変更してお試しください。",
                    details: errorMessage,
                },
                { status: 400 }
            );
        }

        // タイムアウト
        if (
            errorMessage.toLowerCase().includes("timeout") ||
            errorMessage.toLowerCase().includes("deadline")
        ) {
            return NextResponse.json(
                {
                    error: "リクエストがタイムアウトしました。再度お試しください。",
                    details: errorMessage,
                },
                { status: 504 }
            );
        }

        // API キー / 認証エラー
        if (
            errorMessage.includes("401") ||
            errorMessage.includes("403") ||
            errorMessage.toLowerCase().includes("api key")
        ) {
            return NextResponse.json(
                {
                    error: "サーバー設定エラー。管理者にお問い合わせください。",
                    details: errorMessage,
                },
                { status: 500 }
            );
        }

        // その他の API エラー
        return NextResponse.json(
            {
                error: "画像生成に失敗しました。しばらくしてからお試しください。",
                details: errorMessage,
            },
            { status: 500 }
        );
    }
}
