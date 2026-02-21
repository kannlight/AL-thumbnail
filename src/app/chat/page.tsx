'use client';

import React, { useRef, useEffect } from 'react';
import { PlusCircle, AlertCircle } from 'lucide-react';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { ImageSelectionModal } from '@/components/chat/ImageSelectionModal';
import { useChat } from '@/hooks/useChat';
import { listSessions } from '@/stores/chatStore';

export default function ChatPage() {
    const {
        messages,
        isLoading,
        error,
        sendMessage,
        startNewChat,
        loadSession,
        pendingMcpImages,
        submitSelectedImages,
        cancelMcpSelection,
    } = useChat();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isFirstRender = useRef(true);

    // 初期マウント時の履歴復元
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            // SSR時はスキップされ、クライアントマウント時に実行される
            const sessions = listSessions();
            if (sessions.length > 0 && sessions[0].id) {
                loadSession(sessions[0].id);
            }
        }
    }, [loadSession]);

    // 自動スクロール
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

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
                    onClick={startNewChat}
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                    title="新規チャット"
                >
                    <PlusCircle size={18} />
                    <span className="hidden sm:inline">新しいチャット</span>
                </button>
            </header>

            {/* エラー表示 */}
            {error && (
                <div className="bg-red-900/50 border-l-4 border-red-500 p-4 m-4 rounded-md flex items-center gap-3">
                    <AlertCircle className="text-red-400" size={20} />
                    <p className="text-red-200 text-sm">{error}</p>
                </div>
            )}

            {/* モーダル表示 */}
            {pendingMcpImages && (
                <ImageSelectionModal
                    images={pendingMcpImages}
                    onSubmit={submitSelectedImages}
                    onCancel={cancelMcpSelection}
                />
            )}

            {/* メッセージエリア */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto flex flex-col">
                {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70">
                        <div className="w-16 h-16 mb-4 rounded-full bg-blue-900/30 flex items-center justify-center">
                            <span className="text-3xl">✨</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-200 mb-2">遊戯王OCGの対戦動画向けサムネイルを作ります！</h2>
                        <p className="text-gray-400 max-w-sm">
                            「〇〇vs××」「~というカードを映して」「〇〇風の雰囲気で」など、要望を入力して送信してください。<br />生成結果が気に入らなければ対話による修正も可能です。
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 space-y-2">
                        {messages.map((message) => (
                            <ChatMessage key={message.id} message={message} />
                        ))}

                        {/* ローディングインジケーター */}
                        {isLoading && (
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
                <ChatInput onSend={sendMessage} isLoading={isLoading} />
            </div>
        </div>
    );
}
