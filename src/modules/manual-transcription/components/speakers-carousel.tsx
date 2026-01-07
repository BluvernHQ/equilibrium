"use client";

import { useRef, useState, useEffect } from "react";
import { PlusIcon, PencilIcon, TrashIcon, UserIcon } from "@heroicons/react/24/solid";

export interface Speaker {
  id: string;
  name: string;
  shortName: string;
  avatar: string;
  isDefault?: boolean;
  role: 'coordinator' | 'speaker';
}

interface SpeakersCarouselProps {
  speakersData: Speaker[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, role: 'coordinator' | 'speaker') => void;
  onUpdateAvatar: (id: string, file: File) => void;
  onUpdateSpeaker: (id: string, newName: string) => void;
  onDeleteSpeaker: (id: string) => void;
}

export default function SpeakersCarousel({ 
  speakersData, 
  onUpload, 
  onUpdateAvatar,
  onUpdateSpeaker,
  onDeleteSpeaker
}: SpeakersCarouselProps) {
  
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  
  const menuRef = useRef<HTMLDivElement>(null);
  const coordinatorInputRef = useRef<HTMLInputElement>(null);
  const speakerInputRef = useRef<HTMLInputElement>(null);
  const updateAvatarInputRef = useRef<HTMLInputElement>(null);
  const [updatingAvatarId, setUpdatingAvatarId] = useState<string | null>(null);

  const hasCoordinator = speakersData.some(s => s.role === 'coordinator');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Optional: Mouse wheel vertical → horizontal scroll
useEffect(() => {
  const slider = document.querySelector(".custom-slider") as HTMLElement | null;
  if (!slider) return;

  let isScrolling: number | null = null;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    const scrollAmount = e.deltaY * 1.5; // Increase for speed
    const start = slider.scrollLeft;
    const end = start + scrollAmount;

    const startTime = performance.now();
    const duration = 280; // animation duration in ms

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      slider.scrollLeft = start + (end - start) * easeOutQuad(progress);

      if (progress < 1) {
        isScrolling = requestAnimationFrame(animate);
      }
    };

    // Easing function
    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

    if (isScrolling) cancelAnimationFrame(isScrolling);
    isScrolling = requestAnimationFrame(animate);
  };

  slider.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    slider.removeEventListener("wheel", onWheel);
    if (isScrolling) cancelAnimationFrame(isScrolling);
  };
}, []);




  const triggerUpload = (role: 'coordinator' | 'speaker') => {
    setShowAddMenu(false);
    if (role === 'coordinator') {
      coordinatorInputRef.current?.click();
    } else {
      speakerInputRef.current?.click();
    }
  };

  const triggerAvatarUpdate = (id: string) => {
    setUpdatingAvatarId(id);
    setTimeout(() => {
      updateAvatarInputRef.current?.click();
    }, 0);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && updatingAvatarId) {
      onUpdateAvatar(updatingAvatarId, e.target.files[0]);
    }
    e.target.value = "";
    setUpdatingAvatarId(null);
  };

  const startNameEditing = (speaker: Speaker) => {
    setEditingNameId(speaker.id);
    setTempName(speaker.name);
  };

  const saveNameEditing = (id: string) => {
    if (tempName.trim()) {
      onUpdateSpeaker(id, tempName);
    }
    setEditingNameId(null);
  };

  return (
    <div className="w-[870px] flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
      
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
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <h3 className="text-[15px] font-semibold text-gray-800">
          D.1.2.1 - 4 Wheelers - Transcription
        </h3>

        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="p-1.5 rounded-full bg-[#00A3AF] text-white hover:bg-[#008C97] shadow-sm transition-all"
            title="Add New"
          >
            <PlusIcon className="w-5 h-5" />
          </button>

          {showAddMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 z-50">
              <button 
                onClick={() => triggerUpload('coordinator')}
                disabled={hasCoordinator}
                className={`px-4 py-3 text-left text-sm font-medium border-b border-gray-100 flex items-center justify-between
                  ${hasCoordinator 
                    ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                    : "hover:bg-[#E0F7FA] text-gray-700 hover:text-[#00A3AF]"
                  }
                `}
              >
                <span>Add Moderator</span>
                {hasCoordinator && <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-500">Done</span>}
              </button>

              <button 
                onClick={() => triggerUpload('speaker')}
                disabled={!hasCoordinator}
                className={`px-4 py-3 text-left text-sm font-medium flex items-center justify-between
                  ${!hasCoordinator 
                    ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                    : "hover:bg-[#E0F7FA] text-gray-700 hover:text-[#00A3AF]"
                  }
                `}
              >
                <span>Add Speaker</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* HIDDEN INPUTS */}
      <input id="coordinator-upload-input" type="file" hidden ref={coordinatorInputRef} accept="image/*" onChange={(e) => onUpload(e, 'coordinator')} />
      <input id="speaker-upload-input" type="file" hidden ref={speakerInputRef} accept="image/*" onChange={(e) => onUpload(e, 'speaker')} />
      <input id="avatar-update-input" type="file" hidden ref={updateAvatarInputRef} accept="image/*" onChange={handleAvatarFileChange} />

      {/* --- CAROUSEL SLIDER --- */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden custom-slider pb-2 scrollbar-hide">
  <div className="flex items-center px-6 gap-2 min-w-max flex-nowrap">
          
          {speakersData.length === 0 && (
             <div className="mt-[16px] flex flex-col items-center justify-center w-full text-gray-400 text-sm italic pr-12">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                    <UserIcon className="w-7 h-7 text-gray-300" />
                </div>
                Add a Moderator to start...
             </div>
          )}

          {speakersData.map((speaker) => (
            <div key={speaker.id} className="mt-[10px] speaker-item flex flex-col items-center w-[120px] group relative shrink-0">
              
              <div className="relative w-25 h-25 mb-3">
                {speaker.avatar && speaker.avatar.trim() ? (
                  <img 
                    src={speaker.avatar} 
                    alt={speaker.name} 
                    className={`w-full h-full rounded-full object-cover shadow-sm transition-transform group-hover:scale-105 border-4
                      ${speaker.role === 'coordinator' ? "border-[#FFF4C0]" : "border-white"}
                    `}
                  />
                ) : (
                  <div className={`w-full h-full rounded-full flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 border-4 bg-gray-200
                    ${speaker.role === 'coordinator' ? "border-[#FFF4C0]" : "border-white"}
                  `}>
                    <UserIcon className="w-7 h-7 text-gray-400" />
                  </div>
                )}
                
                {speaker.role === 'coordinator' && (
                  <span className="absolute -top-1 -right-1 bg-[#FFF4C0] text-black text-[8px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10 border-2 border-white">
                    MODERATOR
                  </span>
                )}

                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                   <button 
                      onClick={() => triggerAvatarUpdate(speaker.id)}
                      className="p-1.5 bg-white/20 hover:bg-white rounded-full text-white hover:text-[#00A3AF] transition-all"
                      title="Change Image"
                   >
                     <PencilIcon className="w-4 h-4" />
                   </button>
                   <button 
                      onClick={() => onDeleteSpeaker(speaker.id)}
                      className="p-1.5 bg-white/20 hover:bg-white rounded-full text-white hover:text-red-500 transition-all"
                      title="Delete Speaker"
                   >
                     <TrashIcon className="w-4 h-4" />
                   </button>
                </div>
              </div>

              <div className="w-full text-center px-1 h-[24px] flex items-center justify-center">
                {editingNameId === speaker.id ? (
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full text-sm text-center border-b border-[#00A3AF] focus:outline-none bg-transparent"
                    autoFocus
                    onBlur={() => saveNameEditing(speaker.id)}
                    onKeyDown={(e) => e.key === 'Enter' && saveNameEditing(speaker.id)}
                  />
                ) : (
                  <h4 
                    className="text-[14px] font-medium text-gray-800 truncate w-full cursor-pointer hover:text-[#00A3AF] select-none" 
                    title="Double click to edit name"
                    onDoubleClick={() => startNameEditing(speaker)}
                  >
                    {speaker.name}
                  </h4>
                )}
              </div>
            </div>
          ))}

          <div className="w-2 shrink-0"></div>
        </div>
      </div>
    </div>
  );
}
