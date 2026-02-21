import React, { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface ImageSelectionModalProps {
    images: { mimeType: string; data: string }[];
    onSubmit: (selectedImages: { mimeType: string; data: string }[]) => void;
    onCancel: () => void;
}

export function ImageSelectionModal({ images, onSubmit, onCancel }: ImageSelectionModalProps) {
    const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

    const toggleSelection = (index: number) => {
        const newSet = new Set(selectedIndexes);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndexes(newSet);
    };

    const handleSubmit = () => {
        const selected = images.filter((_, i) => selectedIndexes.has(i));
        onSubmit(selected); // 0個でもテキスト指示のみで生成試行とする
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 sm:p-6 border-b border-gray-800 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white">参照画像を選択してください</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            これらをベースにしてサムネイルを生成します（複数選択可）
                        </p>
                    </div>
                </div>

                <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {images.map((img, index) => {
                            const isSelected = selectedIndexes.has(index);
                            const imgSrc = img.data.startsWith('data:') ? img.data : `data:${img.mimeType};base64,${img.data}`;

                            return (
                                <div
                                    key={index}
                                    onClick={() => toggleSelection(index)}
                                    className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200 aspect-video group ${isSelected ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-transparent hover:border-gray-600'
                                        }`}
                                >
                                    <img
                                        src={imgSrc}
                                        alt={`Option ${index + 1}`}
                                        className={`w-full h-full object-cover transition-transform duration-300 ${isSelected ? 'scale-105' : 'group-hover:scale-105'}`}
                                    />
                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />

                                    <div className="absolute top-2 right-2">
                                        {isSelected ? (
                                            <div className="bg-white rounded-full flex items-center justify-center shadow-lg">
                                                <CheckCircle2 className="text-blue-500" size={24} />
                                            </div>
                                        ) : (
                                            <div className="bg-black/30 rounded-full flex items-center justify-center backdrop-blur-sm">
                                                <Circle className="text-white/70" size={24} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {images.length === 0 && (
                        <div className="text-center text-gray-400 py-10">
                            画像が見つかりませんでした。
                        </div>
                    )}
                </div>

                <div className="p-4 sm:p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 flex-none">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-lg font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-5 py-2.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-900/20"
                    >
                        {selectedIndexes.size > 0 ? `${selectedIndexes.size}枚を選択して生成` : '画像なしで生成'}
                    </button>
                </div>
            </div>
        </div>
    );
}
