import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

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
    "あなたは遊戯王OCGの対戦動画サムネイルを作成するアシスタントです。" +
    "ユーザーの要望に応じて 16:9 のサムネイル画像を生成してください。";

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
