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

            // Function Response を Gemini に返す
            const functionResponseParts: Part[] = functionResponses.map((fr) => ({
                functionResponse: {
                    name: fr.functionResponse.name,
                    response: fr.functionResponse.response,
                },
            }));
            response = await chat.sendMessage({ message: functionResponseParts });
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
