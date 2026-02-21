export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    images?: { id: string; mimeType: string; data: string; thoughtSignature?: string }[];
    timestamp: number;
    // Gemini 3 の thought_signature（テキストパート用）
    textThoughtSignature?: string;
    // キャンセル時など、画面には残すが履歴として送信しないためのフラグ
    excludeFromHistory?: boolean;
}

export interface ChatSession {
    id: string;
    title: string;
    updatedAt: number;
}

const STORAGE_KEY_SESSIONS = "chat-sessions";
const MAX_HISTORY_TURNS = 20;
const MAX_MESSAGES = MAX_HISTORY_TURNS * 2;

// --- localStorage: テキスト履歴の管理 ---

export function saveHistory(sessionId: string, messages: ChatMessage[]): void {
    if (typeof window === "undefined") return;

    try {
        // メッセージ数の制限（直近N件を残す）
        const recentMessages = messages.slice(-MAX_MESSAGES);

        // メッセージから画像データ（Base64部分）と巨大な thoughtSignature を削除
        // （画像実体はIndexedDBで管理、thoughtSignatureはメモリ内のみ保持）
        const storeMessages = recentMessages.map(msg => ({
            ...msg,
            textThoughtSignature: undefined,  // 巨大なため localStorage からは除外
            images: msg.images?.map(img => ({
                id: img.id,
                mimeType: img.mimeType,
                data: "",
                thoughtSignature: undefined,  // 巨大なため localStorage からは除外
            }))
        }));

        localStorage.setItem(`chat-history-${sessionId}`, JSON.stringify(storeMessages));

        // セッション一覧の更新
        const sessions = listSessions();
        const existingIndex = sessions.findIndex(s => s.id === sessionId);

        const title = storeMessages.find(m => m.role === "user")?.text.slice(0, 30) || "新しいチャット";

        const currentSession: ChatSession = {
            id: sessionId,
            title,
            updatedAt: Date.now()
        };

        if (existingIndex >= 0) {
            sessions[existingIndex] = currentSession;
        } else {
            sessions.unshift(currentSession);
        }

        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch (e) {
        console.error("テキスト履歴の保存に失敗しました", e);
    }
}

export function loadHistory(sessionId: string): ChatMessage[] | null {
    if (typeof window === "undefined") return null;
    try {
        const data = localStorage.getItem(`chat-history-${sessionId}`);
        if (!data) return null;
        return JSON.parse(data) as ChatMessage[];
    } catch (e) {
        console.error("テキスト履歴の読み込みに失敗しました", e);
        return null;
    }
}

export function deleteHistory(sessionId: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(`chat-history-${sessionId}`);
        const sessions = listSessions().filter(s => s.id !== sessionId);
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch (e) {
        console.error("履歴の削除に失敗しました", e);
    }
}

export function listSessions(): ChatSession[] {
    if (typeof window === "undefined") return [];
    try {
        const data = localStorage.getItem(STORAGE_KEY_SESSIONS);
        if (!data) return [];
        return JSON.parse(data) as ChatSession[];
    } catch (e) {
        console.error("セッション一覧の読み込みに失敗しました", e);
        return [];
    }
}

// --- IndexedDB: 画像データの管理 ---
const DB_NAME = "chat-images-db";
const STORE_NAME = "images";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
    if (typeof window === "undefined") return Promise.reject(new Error("IndexedDB is not available in SSR"));

    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    // セッション単位で削除しやすいようにインデックスを張る
                    const store = db.createObjectStore(STORE_NAME, { keyPath: "imageId" });
                    store.createIndex("sessionId", "sessionId", { unique: false });
                    store.createIndex("timestamp", "timestamp", { unique: false });
                }
            };
        });
    }
    return dbPromise;
}

export async function saveImage(sessionId: string, imageId: string, blob: Blob): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const request = store.put({
            imageId,
            sessionId,
            blob,
            timestamp: Date.now()
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function loadImage(imageId: string): Promise<Blob | null> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(imageId);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.blob);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("画像の読み込みに失敗しました", e);
        return null;
    }
}

export async function deleteSessionImages(sessionId: string): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const index = store.index("sessionId");
            const request = index.getAllKeys(sessionId);

            request.onsuccess = () => {
                const keys = request.result;
                keys.forEach(key => store.delete(key));
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("セッション画像の削除に失敗しました", e);
    }
}

// 制限を超えた古い画像を削除するロジック（必要に応じて呼び出す）
export async function cleanupOldImages(maxImages: number = 50): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const index = store.index("timestamp");

            const request = index.getAllKeys();
            request.onsuccess = () => {
                const keys = request.result as string[];
                // 古い順なので、全体から残す分を引いた数が削除対象
                if (keys.length > maxImages) {
                    const deleteCount = keys.length - maxImages;
                    for (let i = 0; i < deleteCount; i++) {
                        store.delete(keys[i]);
                    }
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("古い画像のクリーンアップに失敗しました", e);
    }
}
