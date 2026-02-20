import { NextRequest, NextResponse } from "next/server";
import {
    createChat,
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

    try {
        const body = await request.json();
        message = body.message;
        history = body.history ?? [];

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
        // 3. チャットセッション構築
        const chat = createChat(history);

        // 4. メッセージ送信
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let response: any = await chat.sendMessage({ message: message.trim() });

        // 5. Function Calling ループ
        //    Gemini が MCP ツールを呼び出す必要があると判断した場合、
        //    FunctionCall レスポンスを受け取り、MCPサーバーに実行を依頼して
        //    結果を Gemini に返す。このループは最大10回で終了する。
        const mcpClient = createMcpClient();
        let functionCallCount = 0;
        const MAX_FUNCTION_CALLS = 10;

        while (hasFunctionCall(response) && functionCallCount < MAX_FUNCTION_CALLS) {
            const functionCalls = extractFunctionCalls(response);
            console.log(
                `[chat/route] Function Call 検出 (${functionCalls.length}件):`,
                functionCalls.map((fc) => fc.name).join(", ")
            );

            if (!mcpClient) {
                // MCP クライアントが利用できない場合はエラーレスポンスを返す
                const functionResponseParts: Part[] = functionCalls.map((fc) => ({
                    functionResponse: {
                        name: fc.name,
                        response: {
                            error: "MCPサーバーが設定されていません。MCP_SERVER_URL と AUTH_PASSWORD を確認してください。",
                        },
                    },
                }));
                response = await chat.sendMessage({ message: functionResponseParts });
                break;
            }

            // 全ての Function Call を並列実行
            const functionResponses = await Promise.all(
                functionCalls.map(async (fc) => {
                    try {
                        const result = await mcpClient.executeTool(fc.name, fc.args);

                        // ===== MCPレスポンスの詳細ログ =====
                        console.log(`[chat/route] MCPツール "${fc.name}" レスポンス全体:`, JSON.stringify(result, null, 2));

                        // content 配列の各要素を個別にログ出力
                        const mcpResult = result as Record<string, unknown>;
                        const contents = (mcpResult?.content ?? mcpResult?.contents) as Array<Record<string, unknown>> | undefined;
                        if (Array.isArray(contents)) {
                            console.log(`[chat/route] MCPレスポンス content件数: ${contents.length}`);
                            contents.forEach((item, idx) => {
                                const type = item?.type;
                                console.log(`[chat/route]   content[${idx}] type: ${type}`);
                                if (type === "text") {
                                    console.log(`[chat/route]   content[${idx}] text: ${item?.text}`);
                                } else if (type === "image") {
                                    const mimeType = item?.mimeType ?? item?.mime_type;
                                    console.log(`[chat/route]   content[${idx}] image, mimeType: ${mimeType}`);
                                } else {
                                    console.log(`[chat/route]   content[${idx}] keys: ${Object.keys(item ?? {}).join(", ")}`);
                                }
                            });
                        } else {
                            console.log(`[chat/route] MCPレスポンスに content 配列が見つかりません。キー一覧: ${Object.keys(mcpResult ?? {}).join(", ")}`);
                        }
                        // ===== ログここまで =====

                        return {
                            functionResponse: {
                                name: fc.name,
                                response: result as Record<string, unknown>,
                            },
                        };
                    } catch (err) {
                        const errMsg =
                            err instanceof Error ? err.message : String(err);
                        console.error(
                            `[chat/route] MCPツール "${fc.name}" の実行エラー:`,
                            errMsg
                        );
                        return {
                            functionResponse: {
                                name: fc.name,
                                response: {
                                    error: `ツールの実行に失敗しました: ${errMsg}`,
                                },
                            },
                        };
                    }
                })
            );

            // Function Response と 抽出した fileData を Gemini に返す
            const messageParts: Part[] = [];
            const fileDataParts: Part[] = [];
            for (const fr of functionResponses) {
                // 1. 本来の functionResponse を追加
                messageParts.push({
                    functionResponse: {
                        name: fr.functionResponse.name,
                        response: fr.functionResponse.response,
                    },
                });

                // 2. response 内のテキストから fileData JSON を抽出して追加
                const mcpResult = fr.functionResponse.response as Record<string, unknown>;
                const contents = (mcpResult?.content ?? mcpResult?.contents) as Array<Record<string, unknown>> | undefined;

                if (Array.isArray(contents)) {
                    for (const item of contents) {
                        if (item.type === "text" && typeof item.text === "string") {
                            const fileDataRegex = /```json\s*(\{[\s\S]*?"fileData"[\s\S]*?\})\s*```/g;
                            let match;
                            while ((match = fileDataRegex.exec(item.text)) !== null) {
                                try {
                                    const parsed = JSON.parse(match[1]);
                                    if (parsed?.fileData?.fileUri && parsed?.fileData?.mimeType) {
                                        fileDataParts.push({
                                            fileData: {
                                                fileUri: parsed.fileData.fileUri,
                                                mimeType: parsed.fileData.mimeType,
                                            },
                                        });
                                        console.log(`[chat/route] 抽出した fileData を履歴のユーザーパートに追加予定: ${parsed.fileData.fileUri}`);
                                    }
                                } catch (e) {
                                    console.warn("[chat/route] fileData JSON のパースに失敗しました:", match[1]);
                                }
                            }
                        }
                    }
                }
            }
            // 抽出した画像がある場合は、エラーを避けるため functionResponse とは別に、
            // 履歴上の「直前のユーザーメッセージ」に遡って画像パートを追加する
            if (fileDataParts.length > 0) {
                const history = await chat.getHistory();
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].role === "user") {
                        if (!history[i].parts) {
                            history[i].parts = [];
                        }
                        history[i].parts!.push(...fileDataParts);
                        break;
                    }
                }
            }

            response = await chat.sendMessage({ message: messageParts });
            functionCallCount++;
        }

        if (functionCallCount >= MAX_FUNCTION_CALLS) {
            console.warn(
                `[chat/route] Function Calling が最大回数 (${MAX_FUNCTION_CALLS}) に達しました`
            );
        }

        // 6. レスポンスのパース
        const parsed = parseGeminiResponse(response);

        // 7. JSON レスポンス返却
        return NextResponse.json(parsed, { status: 200 });
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
