import { XMarkIcon } from "@heroicons/react/24/outline";

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
    if (!isOpen) return null;

    const shortcuts = [
        {
            category: "Video Playback",
            items: [
                { label: "Play / Pause", keys: ["Shift", "Space"] },
                { label: "Seek Backward 5s", keys: ["Shift", "←"] },
                { label: "Seek Forward 5s", keys: ["Shift", "→"] },
                { label: "Speed Up (+0.5x)", keys: ["Shift", "↑"] },
                { label: "Speed Down (-0.5x)", keys: ["Shift", "↓"] },
            ]
        },
        {
            category: "Editor",
            items: [
                { label: "New Segment", keys: ["Enter"] },
                { label: "Save Changes", keys: ["⌘", "S"] },
            ]
        }
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-gray-100 transition text-gray-500 hover:text-gray-700"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {shortcuts.map((section) => (
                        <div key={section.category}>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                {section.category}
                            </h4>
                            <div className="space-y-3">
                                {section.items.map((item) => (
                                    <div key={item.label} className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600 font-medium">{item.label}</span>
                                        <div className="flex items-center gap-1">
                                            {item.keys.map((key, idx) => (
                                                <kbd
                                                    key={idx}
                                                    className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded-md min-w-[20px] text-center shadow-sm"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 text-center border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}
