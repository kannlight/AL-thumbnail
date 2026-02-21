export type MessageRole = "user" | "assistant";

export interface ChatMessage {
    id: string;
    role: MessageRole;
    text: string;
    images?: ChatImage[];
    timestamp: number;
    excludeFromHistory?: boolean;
}

export interface ChatImage {
    id: string;
    mimeType: string;
    data: string;
    thoughtSignature?: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}
