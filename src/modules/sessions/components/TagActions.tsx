import React from 'react';
import { PencilSquareIcon, ChatBubbleLeftIcon, TrashIcon } from '@heroicons/react/24/outline';

interface TagActionsProps {
    onEdit?: () => void;
    onComment?: () => void;
    onDelete?: () => void;
    showEdit?: boolean;
    showComment?: boolean;
    showDelete?: boolean;
    className?: string;
}

/**
 * TagActions - Fixed-width action column for tag operations
 * 
 * This component provides a stable 60px action column that never shifts.
 * Icons are right-aligned and vertically centered. Hover states provide
 * visual feedback without changing layout.
 */
export const TagActions: React.FC<TagActionsProps> = ({
    onEdit,
    onComment,
    onDelete,
    showEdit = true,
    showComment = true,
    showDelete = true,
    className = '',
}) => {
    return (
        <div className={`flex items-center justify-end gap-1 w-[60px] flex-shrink-0 ${className}`}>
            {showEdit && onEdit && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-1 hover:bg-blue-50 rounded transition-colors"
                    title="Edit"
                >
                    <PencilSquareIcon className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                </button>
            )}
            {showComment && onComment && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onComment();
                    }}
                    className="p-1 hover:bg-blue-50 rounded transition-colors"
                    title="Add comment"
                >
                    <ChatBubbleLeftIcon className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                </button>
            )}
            {showDelete && onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="p-1 hover:bg-red-50 rounded transition-colors"
                    title="Delete"
                >
                    <TrashIcon className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                </button>
            )}
        </div>
    );
};
