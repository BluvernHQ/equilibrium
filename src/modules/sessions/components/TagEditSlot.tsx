import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface TagEditSlotProps {
    isVisible: boolean;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
    className?: string;
}

/**
 * TagEditSlot - Reusable edit input component with reserved height
 * 
 * This component uses smooth height transitions to expand/collapse without
 * causing layout shifts. The min-h-0 and max-h-0 when hidden ensure no space
 * is taken, while min-h-[32px] when visible reserves the exact height needed.
 */
export const TagEditSlot: React.FC<TagEditSlotProps> = ({
    isVisible,
    value,
    placeholder = 'Enter value...',
    onChange,
    onSave,
    onCancel,
    className = '',
}) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div
            className={`
        transition-all duration-200 ease-in-out overflow-hidden
        ${isVisible ? 'min-h-[32px] opacity-100 mt-1' : 'min-h-0 max-h-0 opacity-0'}
        ${className}
      `}
        >
            {isVisible && (
                <div className="flex items-center gap-2 py-1" onClick={(e) => e.stopPropagation()}>
                    <input
                        autoFocus
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#00A3AF] min-w-0"
                    />
                    <button
                        onClick={onSave}
                        className="p-1 hover:bg-emerald-50 rounded flex-shrink-0 transition-colors"
                        title="Save"
                    >
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                    </button>
                    <button
                        onClick={onCancel}
                        className="p-1 hover:bg-gray-100 rounded flex-shrink-0 transition-colors"
                        title="Cancel"
                    >
                        <XMarkIcon className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                </div>
            )}
        </div>
    );
};
