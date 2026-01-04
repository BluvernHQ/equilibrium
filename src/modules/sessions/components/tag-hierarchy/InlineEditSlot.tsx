"use client";

import React, { useEffect, useRef } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface InlineEditSlotProps {
    value: string;
    placeholder?: string;
    autoFocus?: boolean;
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
    className?: string;
}

/**
 * InlineEditSlot - A state-driven input for inline editing.
 * Designed to fit perfectly within the TagRowLayout's content column.
 */
export const InlineEditSlot: React.FC<InlineEditSlotProps> = ({
    value,
    placeholder = 'Enter label...',
    autoFocus = true,
    onChange,
    onSave,
    onCancel,
    className = '',
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [autoFocus]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className={`flex items-center w-full gap-2 ${className}`}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="
          w-full px-2 py-0.5 text-xs font-medium bg-white 
          border border-[#00A3AF] rounded-sm 
          focus:outline-none focus:ring-1 focus:ring-[#00A3AF]
          placeholder:text-gray-400 placeholder:font-normal
        "
            />
        </div>
    );
};
