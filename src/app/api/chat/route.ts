import { NextRequest, NextResponse } from "next/server";
import { createChat, parseGeminiResponse, GeminiHistoryItem } from "@/lib/gemini";

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
        const result = await chat.sendMessage({ message: message.trim() });

        // 5. レスポンスのパース
        const parsed = parseGeminiResponse(result);

        // 6. JSON レスポンス返却
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
