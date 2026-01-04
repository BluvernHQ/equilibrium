import React from 'react';
import { TagEditSlot } from './TagEditSlot';
import { TagActions } from './TagActions';

interface SecondaryTag {
    id?: string;
    value: string;
}

interface SecondaryTagRowProps {
    tag: SecondaryTag;
    index: number;
    isEditing: boolean;
    editValue: string;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
    onEditValueChange: (value: string) => void;
}

/**
 * SecondaryTagRow - Indented row for secondary tags with visual guide line
 * 
 * Features:
 * - Left border guide line (2px, gray-300) for visual hierarchy
 * - 24px left padding for indentation
 * - Grid layout with content + fixed action column
 * - Reserved edit slot that expands smoothly
 */
export const SecondaryTagRow: React.FC<SecondaryTagRowProps> = ({
    tag,
    index,
    isEditing,
    editValue,
    onEdit,
    onSave,
    onCancel,
    onDelete,
    onEditValueChange,
}) => {
    return (
        <div className="pl-6 border-l-2 border-gray-300 ml-3 mt-1">
            {/* Content Grid: Tag name + Actions */}
            <div className="grid grid-cols-[1fr_60px] gap-2 items-center">
                {/* Tag Content */}
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-medium text-purple-600 truncate">
                        {tag.value}
                    </span>
                </div>

                {/* Actions Column - Fixed 60px */}
                <TagActions
                    onEdit={onEdit}
                    onDelete={onDelete}
                    showComment={false}
                />
            </div>

            {/* Edit Slot - Reserved height, smooth transition */}
            <TagEditSlot
                isVisible={isEditing}
                value={editValue}
                placeholder="Secondary tag name..."
                onChange={onEditValueChange}
                onSave={onSave}
                onCancel={onCancel}
            />
        </div>
    );
};
