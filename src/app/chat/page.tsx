'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PlusCircle } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '@/types';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';

// 開発用モックデータ
const mockMessages: ChatMessageType[] = [
    {
        id: "1",
        role: "user",
        text: "ブルーアイズ・ホワイト・ドラゴンをテーマにしたサムネイルを作って",
        timestamp: Date.now() - 60000,
    },
    {
        id: "2",
        role: "assistant",
        text: "ブルーアイズ・ホワイト・ドラゴンをモチーフにしたサムネイルを作成しました！",
        images: [
            {
                id: "img-1",
                mimeType: "image/png",
                data: "https://placehold.co/600x400/2a2a2a/ffffff?text=Blue-Eyes+White+Dragon", // Placeholder for demo
            },
        ],
        timestamp: Date.now(),
    },
];

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessageType[]>(mockMessages);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 自動スクロール
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    // メッセージ送信時（モック用）
    const handleSendMessage = (text: string) => {
        const newUserMsg: ChatMessageType = {
            id: Date.now().toString(),
            role: 'user',
            text,
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, newUserMsg]);
        setIsTyping(true);

        // AIのダミー応答をシミュレート
        setTimeout(() => {
            const newAiMsg: ChatMessageType = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: '現在UI開発中のため、ダミーのテキストを返却しています。画像生成はAPI連携後にお試しください。',
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, newAiMsg]);
            setIsTyping(false);
        }, 1500);
    };

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">

            {/* ヘッダー */}
            <header className="flex-none h-14 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                        AL-Thumbnail
                    </span>
                </div>
                <button
                    onClick={() => setMessages([])}
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                    title="新規チャット"
                >
                    <PlusCircle size={18} />
                    <span className="hidden sm:inline">新しいチャット</span>
                </button>
            </header>

            {/* メッセージエリア */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto flex flex-col">
                {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70">
                        <div className="w-16 h-16 mb-4 rounded-full bg-blue-900/30 flex items-center justify-center">
                            <span className="text-3xl">✨</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-200 mb-2">サムネイルを作りましょう！</h2>
                        <p className="text-gray-400 max-w-sm">
                            「〇〇のテーマでクールに」「〇〇のような雰囲気で」など、要望を入力して送信してください。
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 space-y-2">
                        {messages.map((message) => (
                            <ChatMessage key={message.id} message={message} />
                        ))}

                        {/* ローディングインジケーター */}
                        {isTyping && (
                            <div className="flex justify-start mb-6">
                                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-none px-4 py-3 flex gap-2 items-center">
                                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4" />
                    </div>
                )}
            </main>

            {/* 入力エリア */}
            <div className="flex-none w-full">
                <ChatInput onSend={handleSendMessage} isLoading={isTyping} />
            </div>

        </div>
    );
}
