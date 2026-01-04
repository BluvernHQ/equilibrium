"use client";

import React, { useState } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';

interface BranchTagChipProps {
    name: string;
    isEditing: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onSave: (newName: string) => void;
    onCancel: () => void;
    variant?: 'master' | 'primary';
}

export const BranchTagChip: React.FC<BranchTagChipProps> = ({
    name,
    isEditing,
    onEdit,
    onDelete,
    onSave,
    onCancel,
    variant = 'master',
}) => {
    const [tempName, setTempName] = useState(name);

    React.useEffect(() => {
        if (!isEditing) {
            setTempName(name);
        }
    }, [name, isEditing]);

    const handleSave = () => {
        if (tempName.trim() && tempName.trim() !== name) {
            onSave(tempName.trim());
        } else {
            onCancel();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onCancel();
    };

    const bgColor = variant === 'master' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-blue-50 hover:bg-blue-100';
    const textColor = variant === 'master' ? 'text-gray-600' : 'text-blue-600';
    const borderColor = variant === 'master' ? 'border-gray-200' : 'border-blue-100';

    if (isEditing) {
        return (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#00A3AF] bg-white shadow-sm ring-1 ring-[#00A3AF]/20 animate-in fade-in zoom-in duration-200`}>
                <input
                    autoFocus
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className="text-[10px] w-20 outline-none bg-transparent font-medium"
                />
                <button onMouseDown={handleSave} className="text-emerald-500 hover:text-emerald-600">
                    <CheckIcon className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <div
            className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${borderColor} ${bgColor} transition-all duration-200 cursor-pointer`}
            onClick={onEdit}
        >
            <span className={`text-[10px] font-semibold ${textColor} whitespace-nowrap`}>
                {name}
            </span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all duration-200"
            >
                <XMarkIcon className="w-2.5 h-2.5" />
            </button>
        </div>
    );
};
