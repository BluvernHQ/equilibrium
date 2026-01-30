"use client";

import React, { useState } from 'react';
import { TagRowLayout } from './TagRowLayout';
import { InlineEditSlot } from './InlineEditSlot';
import { TagActionsColumn } from './TagActionsColumn';

interface PrimaryTagRowProps {
    name: string;
    isEditing: boolean;
    selectedText?: string; // The selected phrase/text that was tagged
    onEdit: () => void;
    onDelete: () => void;
    onComment?: () => void;
    onAdd?: () => void;
    onClick?: () => void; // Click handler for highlighting
    onSave: (newName: string) => void;
    onCancel: () => void;
    noIndent?: boolean;
    isUnfocused?: boolean;
}

export const PrimaryTagRow: React.FC<PrimaryTagRowProps> = ({
    name,
    isEditing,
    selectedText,
    onEdit,
    onDelete,
    onComment,
    onAdd,
    onClick,
    onSave,
    onCancel,
    noIndent = false,
    isUnfocused = false,
}) => {
    const [tempName, setTempName] = useState(name);
    const [isRenaming, setIsRenaming] = useState(false);

    React.useEffect(() => {
        if (!isEditing) {
            setTempName(name);
            setIsRenaming(false);
        }
    }, [name, isEditing]);

    const handleSave = () => {
        if (tempName.trim()) {
            onSave(tempName.trim());
        } else {
            // Revert if empty
            setTempName(name);
            setIsRenaming(false);
        }
    };

    return (
        <TagRowLayout
            level={2}
            noIndent={noIndent}
            isUnfocused={isUnfocused}
            actions={
                <TagActionsColumn
                    isEditing={isEditing}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onComment={onComment}
                    onAdd={onAdd}
                    addButtonTitle={onAdd ? "Add secondary tag" : undefined}
                    onSave={() => {
                        // If we are renaming, save the name. If not, just close (save nothing/current).
                        if (isRenaming) handleSave();
                        else onCancel(); // Or onSave(name)? Parent onSave likely closes mode.
                        // Actually, standard Save button usually means "Commit changes and Close". 
                        // If we haven't changed the name, calling onSave(name) is fine.
                        // But if user didn't rename, maybe they just want to close.
                        // Let's call onSave(name) to be safe/consistent.
                        if (!isRenaming) onSave(name);
                    }}
                    onCancel={onCancel}
                />
            }
        >
            {isEditing && isRenaming ? (
                <InlineEditSlot
                    value={tempName}
                    onChange={setTempName}
                    onSave={handleSave}
                    onCancel={() => { setIsRenaming(false); setTempName(name); }}
                    placeholder="Edit primary tag..."
                />
            ) : (
                <>
                    <div
                        className={`text-xs font-semibold text-gray-700 truncate ${isEditing ? 'cursor-text hover:bg-gray-50 px-1 -ml-1 rounded border border-transparent hover:border-gray-200' : onClick ? 'cursor-pointer hover:bg-gray-50 px-1 -ml-1 rounded' : ''}`}
                        title={isEditing ? "Click to rename" : onClick ? "Click to highlight selections" : name}
                        onClick={(e) => {
                            if (isEditing) {
                                setIsRenaming(true);
                            } else if (onClick) {
                                e.stopPropagation();
                                onClick();
                            }
                        }}
                    >
                        {name}
                    </div>
                </>
            )}
        </TagRowLayout>
    );
};
