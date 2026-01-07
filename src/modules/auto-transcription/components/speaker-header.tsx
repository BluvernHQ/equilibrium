"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { PencilSquareIcon, UserIcon, PlusIcon } from "@heroicons/react/24/solid";

interface Speaker {
  name: string;
  isCoordinator?: boolean;
  avatar?: string; // Avatar URL
}

interface SpeakerHeaderProps {
  transcriptionData: Array<{ name: string; [key: string]: any }>;
  onUpdateSpeaker: (oldName: string, newName: string) => void;
  onUpdateAvatar?: (name: string, avatarUrl: string, avatarKey: string) => void;
  onAddModerator?: (file: File) => void; // Callback when moderator file is uploaded
  onAddSpeaker?: (file: File) => void; // Callback when generic speaker file is uploaded
  sectionTitle?: string;
  moderatorName?: string | null; // Current moderator name (read-only)
  videoId?: string | null; // Video ID for avatar upload
  speakerAvatars?: Record<string, { url: string; key: string }>; // Map of speaker name to avatar data
}

export default function SpeakerHeader({
  transcriptionData,
  onUpdateSpeaker,
  onUpdateAvatar,
  onAddModerator,
  onAddSpeaker,
  sectionTitle,
  moderatorName,
  videoId,
  speakerAvatars = {}
}: SpeakerHeaderProps) {
  // Get unique speakers from transcription data + moderator if exists
  const uniqueSpeakers = useMemo(() => {
    const speakerMap = new Map<string, Speaker>();
    
    // Add speakers from transcription data
    if (transcriptionData && transcriptionData.length > 0) {
      transcriptionData.forEach((entry) => {
        if (entry.name && !speakerMap.has(entry.name)) {
          const avatarData = speakerAvatars[entry.name];
          speakerMap.set(entry.name, {
            name: entry.name,
            isCoordinator: moderatorName ? entry.name === moderatorName : false,
            avatar: avatarData?.url || undefined
          });
        }
      });
    }

    // Add moderator as a separate speaker if it exists and is not in transcription data
    if (moderatorName && !speakerMap.has(moderatorName)) {
      const moderatorAvatarData = speakerAvatars[moderatorName];
      speakerMap.set(moderatorName, {
        name: moderatorName,
        isCoordinator: true,
        avatar: moderatorAvatarData?.url || undefined
      });
    }
    
    return Array.from(speakerMap.values());
  }, [transcriptionData, moderatorName, speakerAvatars]);

  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const moderatorInputRef = useRef<HTMLInputElement | null>(null);
  const speakerInputRef = useRef<HTMLInputElement | null>(null);

  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = (name: string) => {
    setEditingSpeaker(name);
    setEditValue(name);
  };

  const handleSaveEdit = (oldName: string) => {
    if (editValue.trim() && editValue.trim() !== oldName) {
      onUpdateSpeaker(oldName, editValue.trim());
    }
    setEditingSpeaker(null);
  };

  const handleCancelEdit = () => {
    setEditingSpeaker(null);
  };

  const triggerModeratorUpload = () => {
    setShowAddMenu(false);
    moderatorInputRef.current?.click();
  };

  const triggerSpeakerUpload = () => {
    setShowAddMenu(false);
    speakerInputRef.current?.click();
  };

  const handleModeratorFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAddModerator) {
      onAddModerator(file);
    }
    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleSpeakerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAddSpeaker) {
      onAddSpeaker(file);
    }
    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    };

    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAddMenu]);


  const handleAvatarClick = (name: string) => {
    fileInputRefs.current[name]?.click();
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>, speakerName: string) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateAvatar) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setUploadingAvatar(speakerName);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('speakerName', speakerName);
      if (videoId) {
        formData.append('videoId', videoId);
      }

      const response = await fetch('/api/speakers/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload avatar');
      }

      const data = await response.json();
      
      // Update avatar in parent component
      onUpdateAvatar(speakerName, data.url, data.key);
    } catch (error: any) {
      console.error('Avatar upload error:', error);
      alert(`Failed to upload avatar: ${error.message}`);
    } finally {
      setUploadingAvatar(null);
      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const hasModerator = uniqueSpeakers.some(s => s.isCoordinator);

  return (
    <div className="w-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative mb-6" style={{ minHeight: '200px' }}>
      {/* CUSTOM SCROLLBAR + SLIDE CSS */}
      <style jsx>{`
        .custom-slider::-webkit-scrollbar {
          display: none;
        }
        .custom-slider {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* --- HEADER --- */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-gray-100">
        <h3 className="text-[15px] font-semibold text-gray-800">
          {sectionTitle || "Auto Transcription"}
        </h3>

        <div className="relative" ref={menuRef}>
          {(onAddModerator || onAddSpeaker) && (
            <>
              <button 
                onClick={() => setShowAddMenu(!showAddMenu)}
                className={`p-1.5 rounded-full shadow-sm transition-all bg-[#00A3AF] text-white hover:bg-[#008C97]`}
                title="Add New"
              >
                <PlusIcon className="w-5 h-5" />
              </button>

              {showAddMenu && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 z-50">
                  {onAddModerator && (
                    <button 
                      onClick={triggerModeratorUpload}
                      disabled={hasModerator}
                      className={`px-4 py-3 text-left text-sm font-medium border-b border-gray-100 flex items-center justify-between
                        ${hasModerator 
                          ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                          : "hover:bg-[#E0F7FA] text-gray-700 hover:text-[#00A3AF]"
                        }
                      `}
                    >
                      <span>Add Moderator</span>
                      {hasModerator && <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-500">Done</span>}
                    </button>
                  )}
                  {onAddSpeaker && (
                    <button 
                      onClick={triggerSpeakerUpload}
                      className="px-4 py-3 text-left text-sm font-medium hover:bg-[#E0F7FA] text-gray-700 hover:text-[#00A3AF] transition-colors"
                    >
                      Add Speaker
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* HIDDEN INPUT FOR MODERATOR */}
      <input 
        type="file" 
        hidden 
        id="moderator-upload-input"
        ref={moderatorInputRef} 
        accept="image/*" 
        onChange={handleModeratorFileChange} 
      />

      {/* HIDDEN INPUT FOR SPEAKER */}
      <input 
        type="file" 
        hidden 
        id="speaker-upload-input"
        ref={speakerInputRef} 
        accept="image/*" 
        onChange={handleSpeakerFileChange} 
      />

      {/* --- CAROUSEL SLIDER --- */}
      <div className="overflow-x-auto overflow-y-hidden pb-4 pt-4 custom-slider" style={{ minHeight: '140px' }}>
        <div className="flex items-center px-6 gap-2 min-w-max flex-nowrap">
          {uniqueSpeakers.length === 0 && (
            <div className="flex flex-col items-center justify-center w-full text-gray-400 text-sm italic">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <UserIcon className="w-7 h-7 text-gray-300" />
              </div>
              No speakers found
            </div>
          )}

          {uniqueSpeakers.map((speaker) => {
            const isEditing = editingSpeaker === speaker.name;

            return (
              <div key={speaker.name} className="mt-[10px] speaker-item flex flex-col items-center w-[120px] group relative shrink-0">
                <div className="relative w-[100px] h-[100px] mb-3">
                  {speaker.avatar ? (
                    <img 
                      src={speaker.avatar} 
                      alt={speaker.name} 
                      className={`w-full h-full rounded-full object-cover shadow-sm transition-transform group-hover:scale-105 border-4
                        ${speaker.isCoordinator ? "border-[#FFF4C0]" : "border-white"}
                      `}
                    />
                  ) : (
                    <div className={`w-full h-full rounded-full flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 border-4 bg-gray-200
                      ${speaker.isCoordinator ? "border-[#FFF4C0]" : "border-white"}
                    `}>
                      <UserIcon className="w-7 h-7 text-gray-400" />
                    </div>
                  )}
                  
                  {speaker.isCoordinator && (
                    <span className="absolute -top-1 -right-1 bg-[#FFF4C0] text-black text-[8px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10 border-2 border-white">
                      MODERATOR
                    </span>
                  )}

                  {uploadingAvatar === speaker.name && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  <input
                    type="file"
                    ref={(el) => { fileInputRefs.current[speaker.name] = el; }}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAvatarFileChange(e, speaker.name)}
                  />

                  {!isEditing && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAvatarClick(speaker.name);
                        }}
                        className="p-1.5 bg-white/20 hover:bg-white rounded-full text-white hover:text-blue-500 transition-all"
                        title="Change Image"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(speaker.name);
                        }}
                        className="p-1.5 bg-white/20 hover:bg-white rounded-full text-white hover:text-[#00A3AF] transition-all"
                        title="Edit Name"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="w-full text-center px-1 h-[24px] flex items-center justify-center">
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full text-sm text-center border-b border-[#00A3AF] focus:outline-none bg-transparent"
                      autoFocus
                      onBlur={() => handleSaveEdit(speaker.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit(speaker.name);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                    />
                  ) : (
                    <h4 
                      className="text-[14px] font-medium text-gray-800 truncate w-full cursor-pointer hover:text-[#00A3AF] select-none" 
                      title="Double click to edit name"
                      onDoubleClick={() => handleStartEdit(speaker.name)}
                    >
                      {speaker.name}
                    </h4>
                  )}
                </div>
              </div>
            );
          })}

          <div className="w-2 shrink-0"></div>
        </div>
      </div>
    </div>
  );
}

