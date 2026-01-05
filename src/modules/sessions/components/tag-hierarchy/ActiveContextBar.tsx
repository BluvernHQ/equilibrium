import React from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * Context Item Interface
 * Represents a single context item (section, subsection, or master tag)
 */
export interface ContextItem {
  id: string;
  name: string;
  type: 'section' | 'subsection' | 'master-tag';
  onClick?: () => void; // Optional click handler for navigation
}

/**
 * ActiveContextBar Props
 * Supports both single-context (edit mode) and multi-context (view mode)
 */
interface ActiveContextBarProps {
  /**
   * Single context mode (edit mode)
   * Only one of each type can be active
   */
  sectionName?: string;
  subSectionName?: string;
  masterTagName?: string;
  
  /**
   * Multi-context mode (view mode)
   * Multiple entries of each type can be active
   */
  contextItems?: ContextItem[];
  
  /**
   * Mode: 'edit' for single context, 'view' for multi-context
   */
  mode?: 'edit' | 'view';
  
  className?: string;
}

/**
 * ContextItemChip - Individual context chip component
 */
const ContextItemChip: React.FC<{
  label: string;
  value: string;
  type: 'section' | 'subsection' | 'master-tag';
  onClick?: () => void;
}> = ({ label, value, type, onClick }) => {
  const baseStyles = "text-xs font-medium px-2.5 py-1 rounded-full truncate transition-all";
  const typeStyles = {
    'section': 'text-gray-600 bg-gray-50 border border-gray-200',
    'subsection': 'text-gray-600 bg-gray-50 border border-gray-200',
    'master-tag': 'text-[#00A3AF] bg-[#E0F7FA] border border-[#B2EBF2] shadow-sm font-semibold'
  };
  
  const containerClass = onClick 
    ? "cursor-pointer hover:opacity-80 active:scale-95" 
    : "";
  
  return (
    <div className={`flex items-center group relative ${containerClass}`} title={value}>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1.5 hidden lg:block">
        {label}:
      </span>
      <div className={`${baseStyles} ${typeStyles[type]}`} onClick={onClick}>
        {value}
      </div>
    </div>
  );
};

/**
 * ActiveContextBar - Persistent context indicator
 * 
 * Shows current active context (section, subsection, master tag) in the top panel.
 * Prevents context loss during tagging operations.
 * 
 * Rules:
 * - Only shows active items (no placeholders)
 * - Updates reactively
 * - Supports single (edit) and multi (view) modes
 */
export const ActiveContextBar: React.FC<ActiveContextBarProps> = ({
  sectionName,
  subSectionName,
  masterTagName,
  contextItems,
  mode = 'edit',
  className = '',
}) => {
  // Edit mode: Single context from props
  if (mode === 'edit') {
    // Only render if at least one context item is present
    if (!sectionName && !subSectionName && !masterTagName) return null;

    return (
      <div className={`flex items-center gap-1.5 animate-fadeIn ${className}`}>
        {/* Master Section */}
        {sectionName && (
          <>
            <ContextItemChip
              label="Master section"
              value={sectionName}
              type="section"
            />
            {(subSectionName || masterTagName) && (
              <ChevronRightIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
            )}
          </>
        )}

        {/* Sub-section */}
        {subSectionName && (
          <>
            <ContextItemChip
              label="Sub-section"
              value={subSectionName}
              type="subsection"
            />
            {masterTagName && (
              <ChevronRightIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
            )}
          </>
        )}

        {/* Master Tag */}
        {masterTagName && (
          <ContextItemChip
            label="Master tag"
            value={masterTagName}
            type="master-tag"
          />
        )}
      </div>
    );
  }

  // View mode: Multi-context from contextItems array
  if (mode === 'view' && contextItems && contextItems.length > 0) {
    // Group items by type for better organization
    const sections = contextItems.filter(item => item.type === 'section');
    const subsections = contextItems.filter(item => item.type === 'subsection');
    const masterTags = contextItems.filter(item => item.type === 'master-tag');

    // If only a few items, show horizontally
    if (contextItems.length <= 3) {
      return (
        <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
          {contextItems.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <ChevronRightIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
              )}
              <ContextItemChip
                label={
                  item.type === 'section' ? 'Master section' :
                  item.type === 'subsection' ? 'Sub-section' :
                  'Master tag'
                }
                value={item.name}
                type={item.type}
                onClick={item.onClick}
              />
            </React.Fragment>
          ))}
        </div>
      );
    }

    // If many items, show as vertical stack
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {sections.map(item => (
          <ContextItemChip
            key={item.id}
            label="Master section"
            value={item.name}
            type="section"
            onClick={item.onClick}
          />
        ))}
        {subsections.map(item => (
          <ContextItemChip
            key={item.id}
            label="Sub-section"
            value={item.name}
            type="subsection"
            onClick={item.onClick}
          />
        ))}
        {masterTags.map(item => (
          <ContextItemChip
            key={item.id}
            label="Master tag"
            value={item.name}
            type="master-tag"
            onClick={item.onClick}
          />
        ))}
      </div>
    );
  }

  return null;
};

