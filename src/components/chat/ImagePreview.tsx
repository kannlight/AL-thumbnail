import React, { useState } from 'react';
import { Download, Maximize2, X } from 'lucide-react';
import { ChatImage } from '@/types';

interface ImagePreviewProps {
    image: ChatImage;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ image }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ダウンロード処理
    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = image.data;
        const date = new Date();
        const filename = `al-thumbnail-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}.png`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <div
                className="relative group w-48 h-48 sm:w-64 sm:h-64 rounded-lg overflow-hidden border border-gray-700 cursor-pointer"
                onClick={() => setIsFullscreen(true)}
            >
                <img
                    src={image.data}
                    alt="Generated Preview"
                    className="w-full h-full object-cover"
                />

                {/* ホバー時のオーバーレイ */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button
                        type="button"
                        className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
                        title="拡大"
                    >
                        <Maximize2 size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="p-2 bg-blue-600 rounded-full hover:bg-blue-500 text-white"
                        title="ダウンロード"
                    >
                        <Download size={20} />
                    </button>
                </div>
            </div>

            {/* フルスクリーンモーダル */}
            {isFullscreen && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setIsFullscreen(false)}
                >
                    <button
                        type="button"
                        className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsFullscreen(false);
                        }}
                    >
                        <X size={32} />
                    </button>

                    <img
                        src={image.data}
                        alt="Fullscreen Preview"
                        className="max-w-full max-h-[90vh] object-contain rounded"
                        onClick={(e) => e.stopPropagation()}
                    />

                    <button
                        type="button"
                        className="absolute bottom-8 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center gap-2 font-medium shadow-lg"
                        onClick={handleDownload}
                    >
                        <Download size={20} />
                        ダウンロード
                    </button>
                </div>
            )}
        </>
    );
};
