import { GoogleGenAI, Chat, GenerateContentResponse, Type, Tool } from "@google/genai";

// ============================================================
// シングルトン クライアント
// ============================================================
let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
    if (!_ai) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY が設定されていません");
        }
        _ai = new GoogleGenAI({ apiKey });
    }
    return _ai;
}

// ============================================================
// モデル名
// ============================================================
export const GEMINI_MODEL =
    process.env.GEMINI_MODEL ?? "gemini-3-pro-image-preview";

// ============================================================
// システムプロンプト
// ============================================================
export const MCP_AGENT_PROMPT =
    + "# 役割\n"
    + "あなたは、遊戯王の対戦動画用のサムネイル画像を生成するための情報収集アシスタントです。\n"
    + "ユーザーからの入力（対戦デッキ名など）から、必要な参照画像を判断し、MCPツールを呼び出してください。\n"
    + "# ルール\n"
    + "1. **テーマ名の場合:** `get_theme_illustrations` を使用する。\n"
    + "2. **特定のカード名の場合:** `get_card_illustration` を使用する。\n"
    + "3. 画像検索が必要ない入力（単なる挨拶や雑談など）に対してはツールを呼ばず、そのままテキストで返答してください。\n";

export const IMAGE_GEN_AGENT_PROMPT =
    + "# 役割\n"
    + "あなたは、遊戯王の対戦動画用のサムネイル画像を生成する専用アシスタント（デザイナー）です。\n"
    + "ユーザーの要望（構図、テキスト等の指示）と、提供された参照画像（コンテキスト内の画像）を使って、魅力的なサムネイル画像を生成してください。\n"

// ============================================================
// Generation Config
// ============================================================
export const GENERATION_CONFIG = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K",
    },
};

// ============================================================
// MCP Function Declarations（Gemini Function Calling 定義）
// ============================================================
export const MCP_TOOLS = [
    {
        functionDeclarations: [
            {
                name: "get_card_illustration",
                description: "指定したカードのイラスト画像を取得します。",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        card_name: {
                            type: Type.STRING,
                            description: "取得したいカードの名前",
                        },
                    },
                    required: ["card_name"],
                },
            },
            {
                name: "get_theme_illustrations",
                description: "指定したテーマに属するカードのイラスト画像を最大10件取得します。",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        theme_name: {
                            type: Type.STRING,
                            description: "テーマ名",
                        },
                    },
                    required: ["theme_name"],
                },
            },
        ],
    },
] as Tool[];

// ============================================================
// チャットセッションの型
// ============================================================
export interface GeminiHistoryPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface GeminiHistoryItem {
    role: "user" | "model";
    parts: GeminiHistoryPart[];
}

// ============================================================
// チャットセッション作成
// ============================================================
export function createMcpChat(history: GeminiHistoryItem[]): Chat {
    const ai = getAI();
    return ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
            systemInstruction: MCP_AGENT_PROMPT,
            tools: MCP_TOOLS,
        },
        history,
    });
}

export function createImageGenChat(history: GeminiHistoryItem[]): Chat {
    const ai = getAI();
    return ai.chats.create({
        model: GEMINI_MODEL,
        config: {
            systemInstruction: IMAGE_GEN_AGENT_PROMPT,
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
                aspectRatio: "16:9",
                imageSize: "1K",
            },
        },
        history,
    });
}

// ============================================================
// レスポンスパーサー
// ============================================================
export interface ParsedGeminiResponse {
    text: string;
    images: { mimeType: string; data: string; thoughtSignature?: string }[];
    // テキストパートの thoughtSignature（最後のパートに含まれることが多い）
    textThoughtSignature?: string;
}

export function parseGeminiResponse(
    response: GenerateContentResponse
): ParsedGeminiResponse {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const texts: string[] = [];
    const images: { mimeType: string; data: string; thoughtSignature?: string }[] = [];
    let textThoughtSignature: string | undefined;

    for (const part of parts) {
        if (part.text) {
            texts.push(part.text);
            // テキストパートの thoughtSignature を保持
            if (part.thoughtSignature) {
                textThoughtSignature = part.thoughtSignature;
            }
        } else if (part.inlineData?.data && part.inlineData?.mimeType) {
            images.push({
                mimeType: part.inlineData.mimeType,
                data: part.inlineData.data,
                thoughtSignature: part.thoughtSignature,
            });
        }
    }

    return {
        text: texts.join("\n").trim(),
        images,
        textThoughtSignature,
    };
}
