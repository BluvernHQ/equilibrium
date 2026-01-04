"use client";

import React from 'react';
import {
    PencilSquareIcon,
    TrashIcon,
    CheckIcon,
    XMarkIcon,
    PlusIcon,
    ChatBubbleBottomCenterTextIcon
} from '@heroicons/react/24/outline';

interface TagActionsColumnProps {
    isEditing?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
    onComment?: () => void;
    onSave?: () => void;
    onCancel?: () => void;
    onAdd?: () => void;
    onAddPrimary?: () => void;
    hideComment?: boolean;
}

/**
 * TagActionsColumn - Consistent 60px action container.
 * Switches between Edit/Delete and Save/Cancel modes based on the isEditing flag.
 */
export const TagActionsColumn: React.FC<TagActionsColumnProps> = ({
    isEditing = false,
    onEdit,
    onDelete,
    onComment,
    onSave,
    onCancel,
    onAdd,
    onAddPrimary,
    hideComment = false,
}) => {
    if (isEditing) {
        return (
            <div className="flex items-center justify-end gap-1 w-full">
                {onAdd && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onAdd(); }}
                        className="p-1 text-gray-400 hover:text-[#00A3AF] hover:bg-cyan-50 rounded transition-colors"
                        title="Add branch tag"
                    >
                        <PlusIcon className="w-3.5 h-3.5" />
                    </button>
                )}
                {onAddPrimary && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddPrimary(); }}
                        className="p-1 text-cyan-600 hover:bg-cyan-50 rounded transition-colors"
                        title="Add primary tag"
                    >
                        <PlusIcon className="w-4 h-4 stroke-2" />
                    </button>
                )}
                <button
                    onClick={onSave}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                    title="Save changes"
                >
                    <CheckIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={onCancel}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                    title="Cancel"
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
            {onAdd && (
                <button
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                    className="p-1 text-gray-400 hover:text-[#00A3AF] hover:bg-cyan-50 rounded transition-colors"
                    title="Add branch tag"
                >
                    <PlusIcon className="w-3.5 h-3.5" />
                </button>
            )}
            {onAddPrimary && (
                <button
                    onClick={(e) => { e.stopPropagation(); onAddPrimary(); }}
                    className="p-1 text-cyan-600 hover:bg-cyan-50 rounded transition-colors"
                    title="Add primary tag"
                >
                    <PlusIcon className="w-4 h-4 stroke-2" />
                </button>
            )}
            {!hideComment && onComment && (
                <button
                    onClick={onComment}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Add comment"
                >
                    <ChatBubbleBottomCenterTextIcon className="w-3.5 h-3.5" />
                </button>
            )}
            {onEdit && (
                <button
                    onClick={onEdit}
                    className="p-1 text-gray-400 hover:text-[#00A3AF] hover:bg-cyan-50 rounded transition-colors"
                    title="Edit"
                >
                    <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
            )}
            {onDelete && (
                <button
                    onClick={onDelete}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete"
                >
                    <TrashIcon className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};
