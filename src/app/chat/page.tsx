'use client';

export default function ChatPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 max-w-2xl w-full text-center">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-4">
                    チャット画面（仮）
                </h1>
                <p className="text-gray-600 mb-8">
                    認証が成功しました。ここにチャットUIが実装されます。
                </p>

                <div className="animate-pulse flex flex-col items-center justify-center p-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    <span className="text-sm font-medium text-gray-500">開発中...</span>
                </div>
            </div>
        </div>
    );
}
