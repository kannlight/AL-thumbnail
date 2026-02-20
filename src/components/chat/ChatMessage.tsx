import React from 'react';
import { ChatMessage as ChatMessageType } from '@/types';
import { ImagePreview } from './ImagePreview';
import { User, Bot } from 'lucide-react';

interface ChatMessageProps {
    message: ChatMessageType;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const isUser = message.role === 'user';

    // タイムスタンプのフォーマットHH:MM
    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
            <div className={`flex max-w-[85%] sm:max-w-[75%] gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

                {/* アイコン */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600' : 'bg-gray-700'
                    }`}>
                    {isUser ? <User size={20} className="text-white" /> : <Bot size={20} className="text-white" />}
                </div>

                {/* コンテンツ領域 */}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-gray-500 mb-1 mx-1">
                        {isUser ? 'あなた' : 'AI'} • {formatTime(message.timestamp)}
                    </span>

                    <div className={`px-4 py-3 rounded-2xl ${isUser ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700'
                        }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>

                        {/* 画像プレビュー領域 */}
                        {message.images && message.images.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-4">
                                {message.images.map(img => (
                                    <ImagePreview key={img.id} image={img} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};
