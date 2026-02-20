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
// システムプロンプト（MCP 未実装段階の暫定版）
// ============================================================
export const SYSTEM_INSTRUCTION =
    "あなたは遊戯王OCGの対戦動画サムネイルを作成するアシスタントです。\n" +
    "以下のルールに従い、サムネイル画像を生成してください。\n" +
    "1. ユーザーの要望に応じて、必ずMCPツール（get_theme_illustrations または get_card_illustration）を使用し、関連するイラストを参照する。\n" +
    "2. MCPから取得したイラストを参照画像として扱う。参照画像の配置や背景を変更する程度に留め、できるだけ参照画像をそのまま使用する。\n" +
    "3. アスペクト比は16:9で生成する。\n";

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
                description: "指定されたカード名の公式イラストを取得します",
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
                description:
                    "指定されたテーマ（アーキタイプ）に属するカードのイラストを複数取得します",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        theme: {
                            type: Type.STRING,
                            description: "テーマ名（例: ブルーアイズ、ブラック・マジシャン）",
                        },
                        limit: {
                            type: Type.NUMBER,
                            description: "取得するイラストの最大枚数（デフォルト: 5）",
                        },
                    },
                    required: ["theme"],
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
export function createChat(history: GeminiHistoryItem[]): Chat {
    const ai = getAI();
    return ai.chats.create({
        model: GEMINI_MODEL,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
                aspectRatio: "16:9",
                imageSize: "1K",
            },
            tools: MCP_TOOLS,
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
