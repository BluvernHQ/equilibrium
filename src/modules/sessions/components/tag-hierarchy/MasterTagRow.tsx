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
    onCancel: () => void;
}

export const MasterTagRow: React.FC<MasterTagRowProps> = ({
    name,
    isEditing,
    isHighlighted = false,
    color = '#00A3AF',
    onEdit,
    onClick,
    onDelete,
    onComment,
    onAdd,
    onAddPrimary,
    onSave,
    onCancel,
}) => {
    const [tempName, setTempName] = useState(name);

    // Sync tempName when name changes externally (if not editing)
    React.useEffect(() => {
        if (!isEditing) {
            setTempName(name);
        }
    }, [name, isEditing]);

    const handleSave = () => {
        if (tempName.trim()) {
            onSave(tempName.trim());
        } else {
            onCancel();
        }
    };

    return (
        <TagRowLayout
            level={0}
            isHighlighed={isHighlighted}
            className="border-b border-gray-100 mb-1"
            actions={
                <TagActionsColumn
                    isEditing={isEditing}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onComment={onComment}
                    onAdd={onAdd}
                    onAddPrimary={onAddPrimary}
                    onSave={handleSave}
                    onCancel={onCancel}
                    hideComment={!onComment}
                />
            }
        >
            {isEditing ? (
                <InlineEditSlot
                    value={tempName}
                    onChange={setTempName}
                    onSave={handleSave}
                    onCancel={onCancel}
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
                    <div
                        className="w-2 h-4 rounded-full"
                        style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-bold text-gray-800 truncate" title={name}>
                        {name}
                    </span>
                </div>
            )}
        </TagRowLayout>
    );
};
