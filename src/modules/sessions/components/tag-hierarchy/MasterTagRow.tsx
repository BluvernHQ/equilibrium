"use client";

import React, { useState } from 'react';
import { TagRowLayout } from './TagRowLayout';
import { InlineEditSlot } from './InlineEditSlot';
import { TagActionsColumn } from './TagActionsColumn';

interface MasterTagRowProps {
    name: string;
    isEditing: boolean;
    isHighlighted?: boolean;
    color?: string;
    onEdit: () => void;
    onClick?: () => void;
    onDelete: () => void;
    onComment?: () => void;
    onAdd?: () => void;
    onAddPrimary?: () => void;
    onSave: (newName: string) => void;
    onCancel?: () => void;
}

export const MasterTagRow: React.FC<MasterTagRowProps> = ({
    name,
    isEditing,
    isHighlighted = false,
    color = '#00A3AF',
    onEdit, // Triggers workspace/edit mode
    onClick,
    onDelete,
    onComment,
    onAdd,
    onAddPrimary,
    onSave,
    onCancel,
}) => {
    const [tempName, setTempName] = useState(name);
    const [isRenaming, setIsRenaming] = useState(false);

    // Sync tempName when name changes externally (if not editing)
    React.useEffect(() => {
        if (!isEditing) {
            setTempName(name);
            setIsRenaming(false);
        }
    }, [name, isEditing]);

    const handleSave = () => {
        if (tempName.trim()) {
            if (isRenaming) {
                onSave(tempName.trim());
                setIsRenaming(false);
            } else {
                // Determine what 'Save' means in Workspace Mode effectively commits the session/state? 
                // Or maybe just exits Workspace Mode without renaming?
                // The parent `saveEditing` likely closes the edit state.
                onSave(name); // Save with current name (no change) to allow parent to close
            }
        } else {
            // If user cleared name, revert
            setTempName(name);
            setIsRenaming(false);
            // Don't close workspace mode necessarily? Or treat as cancel?
        }
    };

    const handleCancel = () => {
        if (isRenaming) {
            setIsRenaming(false);
            setTempName(name);
        } else {
            if (onCancel) onCancel();
        }
    };

    return (
        <TagRowLayout
            level={0}
            isHighlighed={isHighlighted}
            className={`border-b border-gray-100 mb-1 ${isEditing ? 'ring-1 ring-[#00A3AF] rounded-sm bg-[#F0FDFA]' : ''}`}
            actions={
                <TagActionsColumn
                    isEditing={isEditing}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onComment={onComment}
                    onAdd={onAdd}
                    onAddPrimary={onAddPrimary}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    hideComment={!onComment}
                />
            }
        >
            {isEditing && isRenaming ? (
                <InlineEditSlot
                    value={tempName}
                    onChange={setTempName}
                    onSave={handleSave}
                    onCancel={() => setIsRenaming(false)}
                    placeholder="New Master Tag name..."
                />
            ) : (
                <div
                    className={`flex items-center gap-2 h-full w-full ${onClick ? 'cursor-pointer' : ''}`}
                    onClick={(e) => {
                        if (onClick) {
                            e.stopPropagation();
                            onClick();
                        }
                    }}
                >
                    {/* Color indicator - vertical pill on the left */}
                    <div
                        className="w-2 h-4 rounded-full"
                        style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-bold text-gray-800 truncate" title={name}>
                        {name}
                    </span>

                    {/* Explicit Rename Pencil - Only acts to rename, separate from main Edit Mode */}
                    {isEditing && !isRenaming && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsRenaming(true);
                            }}
                            className="p-1 text-gray-400 hover:text-[#00A3AF] hover:bg-cyan-50 rounded-full transition-colors ml-1"
                            title="Rename Master Tag"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                            </svg>
                        </button>
                    )}
                </div>
            )}
        </TagRowLayout>
    );
};
