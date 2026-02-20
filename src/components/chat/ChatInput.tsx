import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
    onSend: (text: string) => void;
    isLoading?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading = false }) => {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 自動リサイズ
    const adjustHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
    }, [text]);

    const handleSubmit = () => {
        if (text.trim() && !isLoading) {
            onSend(text.trim());
            setText('');
            // 入力クリア後に高さをリセット
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="w-full bg-gray-900 border-t border-gray-800 p-4">
            <div className="max-w-4xl mx-auto relative flex items-end bg-gray-800 rounded-xl border border-gray-700 shadow-lg focus-within:border-blue-500 transition-colors">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="メッセージを入力..."
                    disabled={isLoading}
                    className="w-full max-h-[200px] py-4 pl-4 pr-12 bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none resize-none overflow-y-auto min-h-[56px] disabled:opacity-50"
                    rows={1}
                />
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!text.trim() || isLoading}
                    className="absolute right-2 bottom-2 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors flex items-center justify-center"
                >
                    <Send size={18} />
                </button>
            </div>
            <div className="max-w-4xl mx-auto mt-2 text-center text-xs text-gray-500">
                Enter で送信 / Shift + Enter で改行
            </div>
        </div>
    );
};
