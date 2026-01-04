
import React from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

interface TagContextHeaderProps {
    sectionName?: string;
    subSectionName?: string;
    masterTagName?: string;
    className?: string;
}

/**
 * TagContextHeader - A persistent context panel in the top control bar.
 * Acts as a live breadcrumb/anchor to prevent cognitive loss.
 */
export const TagContextHeader: React.FC<TagContextHeaderProps> = ({
    sectionName,
    subSectionName,
    masterTagName,
    className = '',
}) => {
    // Only render if at least one context item is present
    if (!sectionName && !subSectionName && !masterTagName) return null;

    return (
        <div className={`flex items-center gap-1.5 animate-fadeIn ${className}`}>
            {/* 1. Master Section */}
            {sectionName && (
                <div className="flex items-center group relative max-w-[140px] transition-all hover:max-w-[300px]" title={sectionName}>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1.5 hidden lg:block">Sec</span>
                    <div className="text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full truncate">
                        {sectionName}
                    </div>
                </div>
            )}

            {/* 2. Sub-section */}
            {sectionName && subSectionName && (
                <ChevronRightIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
            )}

            {subSectionName && (
                <div className="flex items-center group relative max-w-[140px] transition-all hover:max-w-[300px]" title={subSectionName}>
                    <div className="text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full truncate">
                        {subSectionName}
                    </div>
                </div>
            )}

            {/* 3. Master Tag */}
            {(sectionName || subSectionName) && masterTagName && (
                <ChevronRightIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
            )}

            {masterTagName && (
                <div className="flex items-center max-w-[160px] transition-all hover:max-w-[300px]" title={masterTagName}>
                    <div className="text-xs font-semibold text-[#00A3AF] bg-[#E0F7FA] border border-[#B2EBF2] px-2.5 py-1 rounded-full truncate shadow-sm">
                        {masterTagName}
                    </div>
                </div>
            )}
        </div>
    );
};
