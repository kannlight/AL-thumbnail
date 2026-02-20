export type MessageRole = "user" | "assistant";

export interface ChatMessage {
    id: string;
    role: MessageRole;
    text: string;
    images?: ChatImage[];
    timestamp: number;
}

export interface ChatImage {
    id: string;
    mimeType: string;
    data: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}
