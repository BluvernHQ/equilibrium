"use client";

import React, { useState } from 'react';
import { TagRowLayout } from './TagRowLayout';
import { InlineEditSlot } from './InlineEditSlot';
import { TagActionsColumn } from './TagActionsColumn';

interface BranchTagRowProps {
    name: string;
    isEditing: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onSave: (newName: string) => void;
    onCancel: () => void;
}

export const BranchTagRow: React.FC<BranchTagRowProps> = ({
    name,
    isEditing,
    onEdit,
    onDelete,
    onSave,
    onCancel,
}) => {
    const [tempName, setTempName] = useState(name);

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
            level={2}
            actions={
                <TagActionsColumn
                    isEditing={isEditing}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onSave={handleSave}
                    onCancel={onCancel}
                    hideComment={true}
                />
            }
        >
            {isEditing ? (
                <InlineEditSlot
                    value={tempName}
                    onChange={setTempName}
                    onSave={handleSave}
                    onCancel={onCancel}
                    placeholder="New branch name..."
                />
            ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                    <span className="text-[10px] font-medium text-gray-500 truncate" title={name}>
                        {name}
                    </span>
                </div>
            )}
        </TagRowLayout>
    );
};
