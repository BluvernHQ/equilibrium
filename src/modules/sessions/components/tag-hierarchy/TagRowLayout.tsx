"use client";

import React from 'react';

interface TagRowLayoutProps {
    level?: 0 | 1 | 2; // 0 = Master, 1 = Primary, 2 = Branch
    children: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
    isHighlighed?: boolean;
}

/**
 * TagRowLayout - The foundation of the hierarchical tagging UI.
 * Uses a fixed grid system to ensure:
 * 1. Consistent indentation
 * 2. Content alignment
 * 3. Fixed width action column (60px)
 */
export const TagRowLayout: React.FC<TagRowLayoutProps> = ({
    level = 0,
    children,
    actions,
    className = '',
    isHighlighed = false,
}) => {
    // Indentation levels: 0px, 16px, 32px
    const indentClass = level === 1 ? 'pl-4' : level === 2 ? 'pl-8' : 'pl-0';

    return (
        <div
            className={`
        group relative grid grid-cols-[1fr_60px] items-center gap-2 py-0.5 min-h-[32px]
        ${indentClass}
        ${isHighlighed ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}
        transition-colors duration-200
        ${className}
      `}
        >
            {/* Decorative vertical guide for branches */}
            {level > 0 && (
                <div
                    className="absolute left-1 top-0 bottom-0 w-px bg-gray-200"
                    style={{ left: `${(level * 16) - 8}px` }}
                />
            )}

            {/* Content Area */}
            <div className="flex-1 min-w-0 overflow-hidden">
                {children}
            </div>

            {/* Action Column - Fixed 60px */}
            <div className="flex items-center justify-end w-[60px] h-full">
                {actions}
            </div>
        </div>
    );
};
