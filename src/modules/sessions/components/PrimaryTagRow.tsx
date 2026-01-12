import React from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { TagEditSlot } from './TagEditSlot';
import { TagActions } from './TagActions';
import { SecondaryTagRow } from './SecondaryTagRow';

interface SecondaryTag {
    id?: string;
    value: string;
}

interface PrimaryTag {
    id?: string;
    value: string;
    displayName?: string;
    comment?: string;
    selectedText?: string;
    secondaryTags?: SecondaryTag[];
    originalIndex: number;
    impressionId?: string;
}

interface PrimaryTagRowProps {
    tag: PrimaryTag;
    tagColor: string;
    isEditing: boolean;
    isEditingComment: boolean;
    editValue: string;
    commentValue: string;
    onEdit: () => void;
    onEditComment: () => void;
    onSave: () => void;
    onSaveComment: () => void;
    onCancel: () => void;
    onCancelComment: () => void;
    onDelete: () => void;
    onEditValueChange: (value: string) => void;
    onCommentValueChange: (value: string) => void;

    // Secondary tag props
    secondaryInput: { primaryIndex: number; value: string } | null;
    onToggleSecondaryInput: () => void;
    onAddSecondary: (value: string) => void;
    onSecondaryInputChange: (value: string) => void;

    // Secondary tag editing
    editingSecondary: { index: number; value: string } | null;
    onEditSecondary: (index: number, value: string) => void;
    onSaveSecondary: (index: number) => void;
    onCancelSecondary: () => void;
    onDeleteSecondary: (index: number) => void;
    onSecondaryEditValueChange: (value: string) => void;

    isFirstOfAll?: boolean;
}

/**
 * PrimaryTagRow - Stable row component for primary tags
 * 
 * Features:
 * - Grid layout with fixed 60px action column
 * - Reserved edit slots (hidden when not editing)
 * - Smooth height transitions
 * - Truncation for long names
 * - Nested secondary tags with proper indentation
 */
export const PrimaryTagRow: React.FC<PrimaryTagRowProps> = ({
    tag,
    tagColor,
    isEditing,
    isEditingComment,
    editValue,
    commentValue,
    onEdit,
    onEditComment,
    onSave,
    onSaveComment,
    onCancel,
    onCancelComment,
    onDelete,
    onEditValueChange,
    onCommentValueChange,
    secondaryInput,
    onToggleSecondaryInput,
    onAddSecondary,
    onSecondaryInputChange,
    editingSecondary,
    onEditSecondary,
    onSaveSecondary,
    onCancelSecondary,
    onDeleteSecondary,
    onSecondaryEditValueChange,
    isFirstOfAll = false,
}) => {
    return (
        <div className="p-2">
            {/* Content Grid: Dot + Name + Secondary Pills + Actions */}
            <div className="grid grid-cols-[1fr_60px] gap-2 items-center">
                {/* Tag Content */}
                <div className="flex items-center gap-2 flex-1 min-w-0 group">
                    {/* Color Dot */}
                    <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tagColor }}
                    />

                    {/* Tag Name */}
                    <span className={`text-xs font-semibold text-gray-700 truncate ${isFirstOfAll ? 'text-sm' : ''}`}>
                        {tag.displayName || tag.value}
                    </span>

                    {/* Simple X button for quick removal */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="p-1 hover:bg-red-50 rounded text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove primary tag"
                    >
                        <XMarkIcon className="w-3.5 h-3.5" />
                    </button>

                    {/* Comment Badge */}
                    {tag.comment && !isEditingComment && (
                        <span className="text-[9px] text-[#00A3AF] bg-[#00A3AF]/10 px-1.5 py-0.5 rounded border border-[#00A3AF]/20 flex-shrink-0">
                            💬
                        </span>
                    )}

                    {/* Secondary Tag Pills */}
                    {tag.secondaryTags && tag.secondaryTags.length > 0 && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {tag.secondaryTags.map((sec, idx) => (
                                <span
                                    key={sec.id || idx}
                                    className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200"
                                >
                                    {sec.value}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions Column - Fixed 60px */}
                <TagActions
                    onEdit={onEdit}
                    onComment={onEditComment}
                    onDelete={onDelete}
                />
            </div>

            {/* Edit Slot - Reserved height */}
            <TagEditSlot
                isVisible={isEditing}
                value={editValue}
                placeholder="Primary tag name..."
                onChange={onEditValueChange}
                onSave={onSave}
                onCancel={onCancel}
            />

            {/* Comment Edit Slot - Reserved height */}
            <TagEditSlot
                isVisible={isEditingComment}
                value={commentValue}
                placeholder="Add comment..."
                onChange={onCommentValueChange}
                onSave={onSaveComment}
                onCancel={onCancelComment}
                className="ml-3"
            />

            {/* Comment Display */}
            {tag.comment && !isEditingComment && (
                <p className="text-[10px] text-[#00A3AF] mt-0.5 ml-3 italic truncate">
                    "{tag.comment}"
                </p>
            )}

            {/* Selected Text Preview */}
            {tag.selectedText && (
                <p className="text-[10px] text-gray-400 italic mt-1 line-clamp-1 border-l border-gray-200 pl-2 ml-1">
                    "{tag.selectedText}"
                </p>
            )}

            {/* Secondary Tags List */}
            {tag.secondaryTags && tag.secondaryTags.length > 0 && (
                <div className="mt-2">
                    {tag.secondaryTags.map((sec, idx) => (
                        <SecondaryTagRow
                            key={sec.id || idx}
                            tag={sec}
                            index={idx}
                            isEditing={editingSecondary?.index === idx}
                            editValue={editingSecondary?.value || ''}
                            onEdit={() => onEditSecondary(idx, sec.value)}
                            onSave={() => onSaveSecondary(idx)}
                            onCancel={onCancelSecondary}
                            onDelete={() => onDeleteSecondary(idx)}
                            onEditValueChange={onSecondaryEditValueChange}
                        />
                    ))}
                </div>
            )}

            {/* Add Secondary Input */}
            {secondaryInput && (
                <div className="pl-6 border-l-2 border-gray-300 ml-3 mt-2">
                    <TagEditSlot
                        isVisible={true}
                        value={secondaryInput.value}
                        placeholder="Secondary tag name..."
                        onChange={onSecondaryInputChange}
                        onSave={() => onAddSecondary(secondaryInput.value)}
                        onCancel={onToggleSecondaryInput}
                    />
                </div>
            )}

            {/* Add Secondary Button */}
            {!secondaryInput && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSecondaryInput();
                    }}
                    className="ml-9 mt-2 text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-1 transition-colors"
                >
                    <PlusIcon className="w-3 h-3" />
                    <span>Add secondary tag</span>
                </button>
            )}
        </div>
    );
};
