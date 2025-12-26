"use client";

import { useState, useEffect } from "react";
import { ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/24/solid";

// Master tag colors - consistent colors based on ID/name hash
const masterTagColors = [
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#2196F3", "#00BCD4", "#009688", "#4CAF50",
  "#8BC34A", "#CDDC39", "#FFC107", "#FF9800",
  "#FF5722", "#795548", "#607D8B", "#00A3AF"
];

// Generate consistent color for a master tag based on its ID or name
function getMasterTagColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % masterTagColors.length;
  return masterTagColors[index];
}

// --- Types ---
interface RecentPrimary {
  id: string;
  value: string;
  displayName?: string; // Display name with numbering
  impressionId?: string;
  secondaryTags?: { id: string, name: string }[];
}

interface RecentMaster {
  id: string;
  name: string;
  description?: string;
  branchTags?: { id: string, name: string }[];
  primaries: RecentPrimary[];
  color?: string;
}

interface RecentSession {
  id: string;
  videoId: string;
  fileName: string;
  createdAt: string;
  tags: RecentMaster[];
}

interface RecentTagsProps {}

export default function RecentTags({}: RecentTagsProps) {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Fetch recent sessions with tags from database
  useEffect(() => {
    const fetchRecentTags = async () => {
      setLoading(true);
      try {
        // Fetch videos with transcriptions
        const videosRes = await fetch("/api/videos/db");
        if (!videosRes.ok) throw new Error("Failed to fetch videos");
        const videosData = await videosRes.json();
        
        // Filter to only videos with transcriptions
        // Note: API returns hasTranscript/latestTranscript (singular)
        const videosWithTranscripts = (videosData.videos || []).filter(
          (v: any) => v.hasTranscript && v.latestTranscript?.id
        );
        
        // Fetch tags for each transcript
        const sessionsWithTags: RecentSession[] = [];
        
        for (const video of videosWithTranscripts.slice(0, 10)) { // Limit to 10 recent
          const transcriptId = video.latestTranscript.id;
          const tagsRes = await fetch(`/api/tags/load/${transcriptId}`);
          
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            
            if (tagsData.tagGroups && tagsData.tagGroups.length > 0) {
              const tags: RecentMaster[] = tagsData.tagGroups.map((group: any) => ({
                id: group.id || group.masterTag.id,
                name: group.masterTag.name,
                description: group.masterTag.description,
                branchTags: group.branchTags, // Added
                // Use stored color from DB, or generate consistent color based on ID
                color: group.masterTag.color || getMasterTagColor(group.masterTag.id || group.masterTag.name),
                primaries: group.primaryTags.map((pt: any) => ({
                  id: pt.id,
                  value: pt.name,
                  displayName: pt.displayName,
                  impressionId: pt.impressionId,
                  secondaryTags: pt.secondaryTags, // Added
                })),
              }));
              
              sessionsWithTags.push({
                id: transcriptId,
                videoId: video.id,
                fileName: video.fileName || "Untitled",
                createdAt: video.latestTranscript.created_at, // Note: API uses snake_case
                tags,
              });
            }
          }
        }
        
        setSessions(sessionsWithTags);
      } catch (error) {
        console.error("Failed to fetch recent tags:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRecentTags();
  }, []);

  // Filter Logic
  const filteredSessions = sessions.filter((session) => {
    if (selectedSession && session.id !== selectedSession) return false;
    return true;
  });

  const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);

  const handleSelectSession = (id: string | null, name?: string) => {
    setSelectedSession(id);
    setSearchTerm(name || "");
    setIsDropdownOpen(false);
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-[#00A3AF] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 mt-3">Loading recent tags...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">No Recent Tags</h3>
        <p className="text-xs text-gray-500 max-w-[200px]">
          Tags you create will appear here for quick reference.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* --- Session Dropdown --- */}
      <div className="mb-6 relative">
        <div
          onClick={toggleDropdown}
          className={`flex items-center px-3 py-2 rounded-xl shadow-sm border transition-all duration-300 bg-white cursor-pointer
            ${isDropdownOpen ? "border-[#00A3AF] shadow-lg" : "border-gray-200 hover:border-[#00A3AF]"}`}
        >
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 mr-2" />
          <span className="flex-1 text-sm text-gray-700 select-none truncate">
            {searchTerm || "All Sessions"}
          </span>
          <ChevronDownIcon
            className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${
              isDropdownOpen ? "rotate-180 text-[#00A3AF]" : ""
            }`}
          />
        </div>

        {/* Dropdown Content */}
        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden max-h-[300px] overflow-y-auto">
            <div
              className="px-4 py-2 text-sm hover:bg-[#E7FAFC] hover:text-[#00A3AF] cursor-pointer text-gray-600 transition"
              onClick={() => handleSelectSession(null)}
            >
              All Sessions
            </div>
            {sessions.map((session) => (
              <div
                key={session.id}
                className="px-4 py-2 text-sm cursor-pointer text-gray-600 border-t border-gray-50 hover:bg-[#E7FAFC] hover:text-[#00A3AF] transition"
                onClick={() => handleSelectSession(session.id, session.fileName)}
              >
                <div className="font-medium truncate">{session.fileName}</div>
                <div className="text-xs text-gray-400">{formatDate(session.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Tag List --- */}
      <div className="flex-1 overflow-y-auto pb-4 space-y-6">
        {filteredSessions.map((session) => (
          <div key={session.id}>
            {/* Session Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#00A3AF]" />
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider truncate flex-1">
                {session.fileName}
              </h3>
              <span className="text-[10px] text-gray-400">{formatDate(session.createdAt)}</span>
            </div>

            {/* Tags for this session */}
            <div className="space-y-3">
              {(() => {
                const renderedMasterNames = new Set<string>();
                
                return session.tags.map((tag) => {
                  const shouldShowHeader = !renderedMasterNames.has(tag.name);
                  renderedMasterNames.add(tag.name);
                  
                  return (
                <div
                  key={tag.id}
                  className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden"
                  style={{ borderLeftColor: tag.color, borderLeftWidth: "3px" }}
                >
                      {/* Master Header - Only show once per master name in this session */}
                      {shouldShowHeader && (
                  <div className="px-3 py-2 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span
                          className="text-sm font-semibold truncate"
                          style={{ color: tag.color }}
                          title={tag.name}
                        >
                          {tag.name}
                        </span>
                        
                        {/* Branch Tags Display */}
                        {tag.branchTags && tag.branchTags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {tag.branchTags.map((b) => (
                              <span key={b.id} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                {b.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {tag.primaries.length} tag{tag.primaries.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                      )}

                  {/* Primary Tags */}
                  {tag.primaries.length > 0 && (
                    <div className="px-2 py-1.5 space-y-1">
                      {tag.primaries.map((p, pIdx) => {
                            // Display only the primary tag name (master tag name is shown in header)
                            const displayText = p.displayName || p.value;
                        
                        return (
                          <div
                            key={p.impressionId || `${p.id}-${pIdx}`}
                            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors overflow-hidden"
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0`}
                              style={{ backgroundColor: tag.color }}
                            />
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-xs text-gray-700 truncate" title={displayText}>
                                {displayText}
                              </span>
                              
                              {/* Secondary Tags Display */}
                              {p.secondaryTags && p.secondaryTags.length > 0 && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {p.secondaryTags.map((sec) => (
                                    <span key={sec.id} className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100">
                                      {sec.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                  );
                });
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}