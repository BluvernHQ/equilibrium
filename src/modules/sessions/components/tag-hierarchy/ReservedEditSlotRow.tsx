"use client";

import React, { useState } from 'react';
import { TagRowLayout } from './TagRowLayout';
import { InlineEditSlot } from './InlineEditSlot';
import { TagActionsColumn } from './TagActionsColumn';

interface ReservedEditSlotRowProps {
    level: 1 | 2;
    placeholder?: string;
    initialValue?: string;
    isComment?: boolean;
    onSave: (value: string) => void;
    onCancel: () => void;
}

/**
 * ReservedEditSlotRow - A specialized row that only exists for the "Adding" state.
 * It reserves vertical space and maintains the grid indentation.
 */
export const ReservedEditSlotRow: React.FC<ReservedEditSlotRowProps> = ({
    level,
    placeholder = 'Add new...',
    initialValue = '',
    isComment = false,
    onSave,
    onCancel,
}) => {
    const [value, setValue] = useState(initialValue);

    const handleSave = () => {
        if (value.trim()) {
            onSave(value.trim());
        } else {
            onCancel();
        }
        setValue('');
    };

    return (
        <TagRowLayout
            level={level}
            className={isComment ? "bg-blue-50/30 border-l-2 border-blue-200" : "bg-cyan-50/30"}
            actions={
                <TagActionsColumn
                    isEditing={true}
                    onSave={handleSave}
                    onCancel={onCancel}
                />
            }
        >
            <InlineEditSlot
                value={value}
                onChange={setValue}
                onSave={handleSave}
                onCancel={onCancel}
                placeholder={placeholder}
            />
        </TagRowLayout>
    );
};
