"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { getErrorMessage } from "@/lib/errors";
import { SparklesIcon, PencilSquareIcon, DocumentTextIcon, DocumentDuplicateIcon, CloudArrowUpIcon, EllipsisVerticalIcon, TrashIcon, FolderIcon, ChevronRightIcon, PlusIcon, ArrowUturnLeftIcon, XCircleIcon } from "@heroicons/react/24/outline";

interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  _count: {
    videos: number;
    sessions: number;
    children: number;
  };
}

interface VideoItem {
  key: string;
  fileName: string;
  url: string;
  size: number;
  lastModified: string;
  id?: string; // Database video ID
  hasTranscription?: boolean; // Whether transcription exists
  transcriptionType?: 'auto' | 'manual'; // Type of transcription
  hasSession?: boolean; // Whether session (tagging) exists
  source_type?: string; // e.g. 'upload' | 'merged' – merged has no video to play
}

export default function Recordings() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Root' }]);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState<{ id: string; type: 'video' | 'folder' } | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [isMerging, setIsMerging] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showSelectProjectModal, setShowSelectProjectModal] = useState(false);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string | null>(null);
  const [uploadTargetFolderName, setUploadTargetFolderName] = useState<string>('');
  const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'video'; id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const itemsPerLoad = 6;
  
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const folderIdFromRoute = pathname?.startsWith("/project/") && params?.folderId ? String(params.folderId) : null;
  const isRoot = pathname === "/" || pathname === "/project";

  const { setVideoUrl, queueUploads, uploadQueue, abortUpload, isUploading, uploadStatus, uploadProgress, setUploadFolderId } = useSession();
  const { confirm } = useConfirm();
  const { toast, toastError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Close video playback modal with Escape key
  useEffect(() => {
    if (!selectedVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        setSelectedVideo(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedVideo]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      let clickedInside = false;

      menuRefs.current.forEach((menuElement) => {
        if (menuElement && menuElement.contains(target)) {
          clickedInside = true;
        }
      });

      if (!clickedInside) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle delete recording (video)
  const handleDeleteRecording = async (video: VideoItem) => {
    if (!video.id && !video.key) {
      toast("Cannot delete: Video identifier not found", "error");
      return;
    }

    const isMergedFile = video.source_type === "merged";
    const noun = isMergedFile ? "file" : "recording";

    const confirmed = await confirm({
      title: isMergedFile ? "Delete file?" : "Delete recording?",
      message: `Are you sure you want to delete the ${noun} "${video.fileName}"?\nThis will also delete all transcriptions and associated data.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    const deleteId = video.id || video.key;
    setDeleting(deleteId);
    try {
      const url = video.id 
        ? `/api/videos/delete/${video.id}` 
        : `/api/videos/delete/none?fileKey=${encodeURIComponent(video.key)}`;
        
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete ${noun}`);
      }

      // Refresh videos list
      await fetchVideos(currentFolderId);
      setOpenMenuId(null);
    } catch (error: any) {
      console.error('Delete recording error:', error);
      toastError(error, `Failed to delete ${noun}`);
    } finally {
      setDeleting(null);
    }
  };

  // Handle delete transcription
  const handleDeleteTranscription = async (video: VideoItem) => {
    if (!video.id) {
      toast("Cannot delete: Video ID not found", "error");
      return;
    }

    const confirmed = await confirm({
      title: "Delete transcription?",
      message: `Are you sure you want to delete the transcription for "${video.fileName}"?\nThe recording will remain.`,
      confirmLabel: "Delete transcription",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setDeleting(`transcription-${video.id}`);
    try {
      const response = await fetch(`/api/transcriptions/${video.id}/delete`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete transcription');
      }

      // Clear local storage for this transcription
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`transcript:${video.id}`);
      }

      // Refresh videos list
      await fetchVideos(currentFolderId);
      setOpenMenuId(null);
    } catch (error: any) {
      console.error('Delete transcription error:', error);
      alert(`Failed to delete transcription: ${error.message}`);
    } finally {
      setDeleting(null);
    }
  };

  // Fetch folders for the current folder level
  const fetchFolders = async (parentId: string | null) => {
    setLoadingFolders(true);
    try {
      const response = await fetch(`/api/folders?parentId=${parentId || 'root'}`);
      const data = await response.json();
      if (data.success) {
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Fetch uploaded videos from both Spaces and Database (parallel for faster load)
  const fetchVideos = async (folderId: string | null) => {
    setLoadingVideos(true);
    try {
      const dbUrl = folderId ? `/api/videos/db?folderId=${folderId}` : "/api/videos/db?folderId=root";
      const [spacesResponse, dbResponse] = await Promise.all([
        fetch("/api/videos"),
        fetch(dbUrl),
      ]);
      const spacesData = spacesResponse.ok ? await spacesResponse.json() : { videos: [] };
      const dbData = dbResponse.ok ? await dbResponse.json() : { videos: [] };

      // Merge data: use Spaces as source of truth, enrich with DB data
      const spacesVideos = spacesData.videos || [];
      const dbVideos = dbData.videos || [];

      // Create multiple lookup maps for matching
      const dbVideosByKey = new Map(
        dbVideos.filter((v: any) => v.fileKey).map((v: any) => [v.fileKey, v])
      );

      // Also match by source_url containing the video filename
      const findDbVideo = (spacesVideo: VideoItem) => {
        // First try by fileKey
        if (dbVideosByKey.has(spacesVideo.key)) {
          return dbVideosByKey.get(spacesVideo.key);
        }
        // Then try matching by source_url containing the filename
        const filename = spacesVideo.fileName || spacesVideo.key.split('/').pop();
        return dbVideos.find((v: any) =>
          v.source_url?.includes(filename) ||
          v.fileUrl?.includes(filename)
        );
      };

      // If we're in a specific folder, only show videos that belong to it in the DB
      // Note: Spaces videos are always in "Equilibrium/" prefix. 
      // If we're in root, we might want to show videos not in any DB folder yet.
      // If we're in a folder, we only show videos that the DB says are in that folder.
      
      let mergedVideos: VideoItem[] = [];
      
      if (folderId) {
          // In a subfolder, only show videos explicitly assigned to it in DB
          mergedVideos = dbVideos.map((dbVideo: any) => {
              // Find matching spaces video for the URL
              const spacesVideo = spacesVideos.find((sv: any) => 
                  sv.key === dbVideo.fileKey || 
                  sv.fileName === dbVideo.fileName
              );
              
              return {
                  key: dbVideo.fileKey || `db-${dbVideo.id}`,
                  fileName: dbVideo.fileName,
                  url: spacesVideo?.url || dbVideo.source_url || dbVideo.fileUrl,
                  size: parseInt(dbVideo.fileSize || "0"),
                  lastModified: dbVideo.createdAt,
                  id: dbVideo.id,
                  hasTranscription: dbVideo.hasTranscript || false,
                  transcriptionType: dbVideo.latestTranscript?.transcription_type,
                  hasSession: dbVideo.hasSession || false,
                  source_type: dbVideo.source_type,
              };
          });
      } else {
          // In root, show videos assigned to root in DB AND videos not in DB yet (orphans)
          mergedVideos = spacesVideos.map((video: VideoItem) => {
            const dbVideo = findDbVideo(video);
            
            // If dbVideo exists but is in a folder, don't show it in root
            if (dbVideo && dbVideo.folder_id) {
                return null;
            }

            return {
              ...video,
              id: dbVideo?.id,
              hasTranscription: dbVideo?.hasTranscript || false,
              transcriptionType: dbVideo?.latestTranscript?.transcription_type,
              hasSession: dbVideo?.hasSession || false,
              source_type: dbVideo?.source_type,
            };
          }).filter(Boolean) as VideoItem[];
      }

      setVideos(mergedVideos);
      // Reset visible count if needed
      if (mergedVideos.length < visibleCount) {
        setVisibleCount(Math.max(itemsPerLoad, mergedVideos.length));
      }
    } catch (error) {
      console.error("Failed to fetch videos:", error);
    } finally {
      setLoadingVideos(false);
    }
  };

  // Sync state from URL: root vs /project/[folderId] — load folder + videos in parallel when in a project
  useEffect(() => {
    if (isRoot) {
      setCurrentFolderId(null);
      setBreadcrumbs([{ id: null, name: "Root" }]);
      setVideos([]);
      fetchFolders(null);
    } else if (folderIdFromRoute) {
      setCurrentFolderId(folderIdFromRoute);
      setLoadingFolders(false); // not loading folder list when viewing a project
      // Load videos and folder breadcrumb in parallel so folder view appears faster
      Promise.all([
        fetchVideos(folderIdFromRoute),
        fetch(`/api/folders/${folderIdFromRoute}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.success && data.folder) {
              setBreadcrumbs([{ id: null, name: "Root" }, { id: data.folder.id, name: data.folder.name }]);
            }
          })
          .catch(() => setBreadcrumbs([{ id: null, name: "Root" }, { id: folderIdFromRoute, name: "Project" }])),
      ]);
    }
  }, [folderIdFromRoute, isRoot]);

  const handleNavigateToFolder = (folder: FolderItem | null) => {
    if (!folder) {
      router.push("/");
    } else {
      router.push(`/project/${folder.id}`);
    }
  };

  const handleGoBack = () => {
    router.push("/");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    setIsCreatingFolder(true);
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName,
          parentId: currentFolderId,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setNewFolderName('');
        setIsCreateFolderModalOpen(false);
        fetchFolders(currentFolderId);
      } else {
        toast(getErrorMessage(data.error, "Failed to create folder"), "error");
      }
    } catch (error) {
      console.error("Create folder error:", error);
      toastError(error, "An error occurred");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleMoveItem = async (folderId: string | null) => {
      if (!itemToMove) return;
      
      try {
          const response = await fetch('/api/folders/move', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoIds: itemToMove.type === 'video' ? [itemToMove.id] : [],
                  folderId: folderId,
              }),
          });
          const data = await response.json();
          if (data.success) {
              setIsMoveModalOpen(false);
              setItemToMove(null);
              fetchVideos(currentFolderId);
              fetchFolders(currentFolderId);
          } else {
              alert(data.error || "Failed to move item");
          }
      } catch (error) {
          console.error("Move item error:", error);
          alert("An error occurred");
      }
  };

  const handleMergeTranscriptions = async () => {
    if (selectedVideoIds.size < 2) return;
    const count = selectedVideoIds.size;
    const confirmed = await confirm({
      title: "Merge transcriptions?",
      message: `Merge ${count} transcriptions into one?\nThis creates a single transcript for tagging (no video merge).`,
      confirmLabel: "Merge",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setIsMerging(true);
    try {
        const response = await fetch('/api/transcriptions/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoIds: Array.from(selectedVideoIds),
                folderId: currentFolderId,
            }),
        });
        const data = await response.json();
        if (data.success) {
            setSelectedVideoIds(new Set());
            fetchVideos(currentFolderId);
            router.push(`/transcription/${data.videoId}`);
        } else {
            toast(getErrorMessage(data.error, "Failed to merge transcriptions"), "error");
        }
    } catch (error) {
        console.error("Merge transcriptions error:", error);
        toastError(error, "An error occurred");
    } finally {
        setIsMerging(false);
    }
  };


  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < videos.length) {
          setVisibleCount((prev) => prev + itemsPerLoad);
        }
      },
      { threshold: 0.1, root: gridContainerRef.current }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [videos.length, visibleCount]);

  // Refresh videos and folders list after successful upload
  useEffect(() => {
    if (uploadStatus === "success") {
      // Wait a bit for the database to be fully updated and available, then refresh
      const timer = setTimeout(() => {
        fetchVideos(currentFolderId);
        fetchFolders(currentFolderId);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [uploadStatus, currentFolderId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    setPendingUploadFiles(files);
    if (currentFolderId !== null) {
      setUploadTargetFolderId(currentFolderId);
      setUploadTargetFolderName(
        breadcrumbs[breadcrumbs.length - 1]?.name ?? "this project"
      );
      setShowUploadConfirm(true);
    } else {
      setShowSelectProjectModal(true);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadConfirm = async () => {
    if (!pendingUploadFiles.length) return;

    const targetFolderId = uploadTargetFolderId ?? null;
    setUploadFolderId(targetFolderId);
    // Clear pending + close modal
    setPendingUploadFiles([]);
    setShowUploadConfirm(false);
    setUploadTargetFolderId(null);
    setUploadTargetFolderName("");

    await queueUploads(pendingUploadFiles, targetFolderId);
  };

  const handleUploadCancel = () => {
    if (isUploading) {
      abortUpload();
    }
    setPendingUploadFiles([]);
    setShowUploadConfirm(false);
    setShowSelectProjectModal(false);
    setUploadTargetFolderId(null);
    setUploadTargetFolderName('');
  };

  const handleSelectProjectForUpload = (folder: FolderItem) => {
    setUploadTargetFolderId(folder.id);
    setUploadTargetFolderName(folder.name);
    setShowSelectProjectModal(false);
    setShowUploadConfirm(true);
  };

  const openRenameFolder = (folder: FolderItem) => {
    setRenameTarget({ type: 'folder', id: folder.id, currentName: folder.name });
    setRenameValue(folder.name);
    setOpenMenuId(null);
  };

  const openRenameVideo = (video: VideoItem) => {
    if (!video.id) return;
    setRenameTarget({ type: 'video', id: video.id, currentName: video.fileName || '' });
    setRenameValue(video.fileName || '');
    setOpenMenuId(null);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      if (renameTarget.type === 'folder') {
        const res = await fetch(`/api/folders/${renameTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: renameValue.trim() }),
        });
        const data = await res.json();
        if (data.success) {
          setRenameTarget(null);
          fetchFolders(currentFolderId);
        } else {
          alert(data.error || 'Failed to rename');
        }
      } else {
        const res = await fetch(`/api/videos/metadata/${renameTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: renameValue.trim() }),
        });
        const data = await res.json();
        if (data.success) {
          setRenameTarget(null);
          fetchVideos(currentFolderId);
        } else {
          toast(getErrorMessage(data.error, "Failed to rename"), "error");
        }
      }
    } catch (e) {
      console.error(e);
      toastError(e, "An error occurred");
    } finally {
      setIsRenaming(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const visibleVideos = videos.slice(0, visibleCount);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-screen w-full bg-[#F9FAFB] relative">
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Upload progress bar (linear) */}
        {isUploading && (
          <div className="absolute top-0 left-0 right-0 z-40 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00A3AF] transition-[width] duration-300 ease-out rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-4">
              {!isRoot ? (
                <>
                  <button
                    onClick={handleGoBack}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-[#00A3AF] transition-colors"
                    title="Go back"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                    Back
                  </button>
                  <h1 className="text-[24px] font-medium text-[#111827]">
                    {breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1].name : "Project"}
                  </h1>
                </>
              ) : (
                <h1 className="text-[24px] font-medium text-[#111827]">Project</h1>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="audio/*,video/*,.mts,.m2ts"
              multiple
              onChange={handleFileSelect}
            />
            {currentFolderId === null && (
              <button
                onClick={() => setIsCreateFolderModalOpen(true)}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                New Folder
              </button>
            )}
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="px-4 py-2 bg-[#111827] text-white rounded-lg font-medium hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <CloudArrowUpIcon className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
            <button
              onClick={() => { fetchVideos(currentFolderId); fetchFolders(currentFolderId); }}
              disabled={loadingVideos || loadingFolders || isUploading}
              className="px-4 py-2 bg-[#00A3AF] text-white rounded-lg font-medium hover:bg-[#008C97] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loadingVideos || loadingFolders ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
            {selectedVideoIds.size >= 2 && (
                <button
                    onClick={handleMergeTranscriptions}
                    disabled={isMerging}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                    {isMerging ? (
                        <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Merging...
                        </>
                    ) : (
                        <>
                            <DocumentTextIcon className="w-4 h-4" />
                            Merge Selected ({selectedVideoIds.size})
                        </>
                    )}
                </button>
            )}
          </div>
        </div>


        {/* Content */}
        {(loadingVideos || loadingFolders) && (isRoot ? folders.length === 0 : videos.length === 0) ? (
          // Shimmer skeletons while initial data is loading
          <div className="flex-1 overflow-y-auto pr-2 py-6">
            {isRoot ? (
              // Folder card shimmer grid (root view)
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gray-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-100 rounded w-3/4" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Video card shimmer grid (project view, uses same grid layout as videos)
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="aspect-video w-full rounded-lg bg-gray-100" />
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-100 rounded w-3/4" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                        <div className="h-3 bg-gray-100 rounded w-1/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : isRoot ? (
          /* Root: project list only */
          <div className="flex-1 overflow-y-auto pr-2">
            {folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-[#E0F7FA] rounded-full flex items-center justify-center mb-4">
                  <FolderIcon className="w-8 h-8 text-[#00A3AF]" />
                </div>
                <div className="text-gray-400 mb-2 text-lg font-medium">No projects yet</div>
                <div className="text-sm text-gray-500">Create a project folder or upload to get started</div>
              </div>
            ) : (
              <div ref={gridContainerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow relative cursor-pointer group"
                  onClick={() => handleNavigateToFolder(folder)}
                >
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
                            <FolderIcon className="w-8 h-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 truncate mb-1" title={folder.name}>
                                {folder.name}
                            </h3>
                            <div className="text-xs text-gray-500 flex gap-2">
                                <span>{folder._count.videos} {folder._count.videos === 1 ? 'file' : 'files'}</span>
                                {folder._count.children > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{folder._count.children} {folder._count.children === 1 ? 'folder' : 'folders'}</span>
                                  </>
                                )}
                            </div>
                        </div>
                        <div
                            className="absolute top-2 right-2"
                            ref={(el) => {
                                if (el) {
                                    menuRefs.current.set(`folder-${folder.id}`, el);
                                } else {
                                    menuRefs.current.delete(`folder-${folder.id}`);
                                }
                            }}
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === folder.id ? null : folder.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
                            </button>
                            
                            {/* Folder Menu */}
                            {openMenuId === folder.id && (
                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openRenameFolder(folder); }}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    >
                                        <PencilSquareIcon className="w-4 h-4" />
                                        Rename
                                    </button>
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const confirmed = await confirm({
                                              title: "Delete folder and files?",
                                              message: `Are you sure you want to permanently delete the folder "${folder.name}"?\n\nThis will delete ALL files inside it, along with their transcriptions and related data. This action cannot be undone.`,
                                              confirmLabel: "Delete",
                                              cancelLabel: "Cancel",
                                            });
                                            if (!confirmed) return;
                                            setDeleting(folder.id);
                                            try {
                                                const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
                                                const data = await res.json().catch(() => ({}));
                                                if (res.ok && data.success) {
                                                    fetchFolders(currentFolderId);
                                                    await fetchVideos(currentFolderId);
                                                } else {
                                                    toast(getErrorMessage(data.error, "Failed to delete folder"), "error");
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                toastError(err, "Failed to delete folder");
                                            } finally {
                                                setDeleting(null);
                                            }
                                        }}
                                        disabled={deleting === folder.id}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {deleting === folder.id ? (
                                          <>
                                            <svg className="h-4 w-4 animate-spin text-red-500" viewBox="0 0 24 24">
                                              <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                                fill="none"
                                              />
                                              <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                              />
                                            </svg>
                                            <span>Deleting…</span>
                                          </>
                                        ) : (
                                          <>
                                            <TrashIcon className="w-4 h-4" />
                                            <span>Delete Folder</span>
                                          </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
              ))}
              </div>
            )}
          </div>
        ) : (
          /* Project page: videos only */
          <div className="flex-1 overflow-y-auto pr-2">
            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-[#E0F7FA] rounded-full flex items-center justify-center mb-4">
                  <FolderIcon className="w-8 h-8 text-[#00A3AF]" />
                </div>
                <div className="text-gray-400 mb-2 text-lg font-medium">This project is empty</div>
                <div className="text-sm text-gray-500">Upload videos to see them here</div>
              </div>
            ) : (
              <div ref={gridContainerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {/* Video Items */}
              {visibleVideos.map((video) => (
                <div
                  key={video.key}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow relative"
                >
                {/* Three-dot menu button */}
                <div
                  className="absolute top-2 right-2 z-10"
                  ref={(el) => {
                    if (el) {
                      menuRefs.current.set(video.key, el);
                    } else {
                      menuRefs.current.delete(video.key);
                    }
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === video.key ? null : video.key);
                    }}
                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                    title="More options"
                  >
                    <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
                  </button>

                  {/* Dropdown menu */}
                  {openMenuId === video.key && (
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      {video.id && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToMove({ id: video.id!, type: 'video' });
                              setIsMoveModalOpen(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <FolderIcon className="w-4 h-4" />
                            Move to Folder
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openRenameVideo(video); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                            Rename
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecording(video);
                        }}
                        disabled={deleting === video.id || deleting === video.key}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-100 mt-1"
                      >
                        {deleting === video.id || deleting === video.key ? (
                          <>
                            <svg className="h-4 w-4 animate-spin text-red-500" viewBox="0 0 24 24">
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            <span>Deleting…</span>
                          </>
                        ) : (
                          <>
                            <TrashIcon className="w-4 h-4" />
                            <span>Delete Recording</span>
                          </>
                        )}
                      </button>
                      {video.hasTranscription && video.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTranscription(video);
                          }}
                          disabled={deleting === `transcription-${video.id}`}
                          className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deleting === `transcription-${video.id}` ? (
                            <>
                              <svg className="h-4 w-4 animate-spin text-orange-500" viewBox="0 0 24 24">
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              <span>Deleting…</span>
                            </>
                          ) : (
                            <>
                              <TrashIcon className="w-4 h-4" />
                              <span>Delete Transcription</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="relative w-full h-48 bg-[#E0F7FA] rounded-lg flex items-center justify-center mb-3 overflow-hidden group cursor-pointer"
                  onClick={() => { setSelectedVideo(video); setVideoError(null); }}
                >
                  {/* Selection Checkbox */}
                  {video.hasTranscription && !video.hasSession && (
                      <div 
                        className="absolute top-2 left-2 z-20"
                        onClick={(e) => {
                            e.stopPropagation();
                            const newSelected = new Set(selectedVideoIds);
                            if (video.id) {
                                if (newSelected.has(video.id)) {
                                    newSelected.delete(video.id);
                                } else {
                                    newSelected.add(video.id);
                                }
                            }
                            setSelectedVideoIds(newSelected);
                        }}
                      >
                          <input 
                            type="checkbox" 
                            checked={video.id ? selectedVideoIds.has(video.id) : false}
                            onChange={() => {}} // Handled by div onClick
                            className="w-5 h-5 rounded border-gray-300 text-[#00A3AF] focus:ring-[#00A3AF] cursor-pointer"
                          />
                      </div>
                  )}

                  {video.source_type === 'merged' ? (
                    <DocumentDuplicateIcon className="w-14 h-14 text-[#00A3AF] group-hover:scale-110 transition-transform" aria-hidden />
                  ) : (
                    <>
                      <svg
                        className="w-12 h-12 text-[#00A3AF] group-hover:scale-110 transition-transform"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-6 h-6 text-[#00A3AF]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 truncate mb-2" title={video.fileName}>
                  {video.fileName}
                </h3>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(video.lastModified)}</span>
                  <span>{formatFileSize(video.size)}</span>
                </div>
                <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
                  {/* PRIMARY ACTIONS: View Transcription & View Session (when they exist) */}
                  {video.hasTranscription && video.id && (
                    <div className="flex items-center gap-2">
                      {/* View Transcription - ALWAYS shown when transcription exists */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/transcription/${video.id}`);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#00A3AF] rounded hover:bg-[#008C97] transition-colors"
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                        View Transcription
                      </button>

                      {/* View Session - ALWAYS shown when transcription exists (session is available) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/sessions?videoId=${video.id}`);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Tagging
                      </button>
                    </div>
                  )}

                  {/* NEW TRANSCRIPTION ACTIONS: Only shown when NO transcription exists */}
                  {!video.hasTranscription && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (video.id) {
                            setVideoUrl(video.url, video.id);
                            router.push(`/auto-transcription?videoId=${video.id}`);
                          } else {
                            setVideoUrl(video.url);
                            router.push("/auto-transcription");
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#00A3AF] rounded hover:bg-[#008C97] transition-colors"
                      >
                        <SparklesIcon className="w-4 h-4" />
                        Auto Transcribe
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (video.id) {
                            setVideoUrl(video.url, video.id);
                          } else {
                            setVideoUrl(video.url);
                          }
                          router.push("/manual-transcription");
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#111827] rounded hover:bg-black transition-colors"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                        Manual Transcribe
                      </button>
                    </div>
                  )}

                </div>
              </div>
            ))}
            
            {/* Infinite Scroll Sentinel */}
            {visibleCount < videos.length && (
              <div 
                ref={loadMoreRef} 
                className="col-span-full h-20 flex items-center justify-center"
              >
                <div className="flex items-center gap-2 text-gray-500">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Loading more...</span>
                </div>
              </div>
            )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Folder Modal */}
      {isCreateFolderModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">Create New Folder</h2>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3AF] mb-6"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                  <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => setIsCreateFolderModalOpen(false)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                      >
                          Cancel
                      </button>
                      <button 
                        onClick={handleCreateFolder}
                        disabled={isCreatingFolder || !newFolderName.trim()}
                        className="px-6 py-2 bg-[#00A3AF] text-white rounded-lg font-medium hover:bg-[#008C97] transition-colors disabled:opacity-50"
                      >
                          {isCreatingFolder ? 'Creating...' : 'Create Folder'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Rename Modal (folder or session/merged) */}
      {renameTarget && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">
                      {renameTarget.type === 'folder' ? 'Rename project' : 'Rename session'}
                  </h2>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder={renameTarget.type === 'folder' ? 'Project name' : 'Session name'}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3AF] mb-6"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                  />
                  <div className="flex justify-end gap-3">
                      <button
                        onClick={() => { setRenameTarget(null); setRenameValue(''); }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                      >
                          Cancel
                      </button>
                      <button
                        onClick={handleRenameSubmit}
                        disabled={isRenaming || !renameValue.trim()}
                        className="px-6 py-2 bg-[#00A3AF] text-white rounded-lg font-medium hover:bg-[#008C97] transition-colors disabled:opacity-50"
                      >
                          {isRenaming ? 'Saving...' : 'Save'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Select base project (when uploading from root) */}
      {showSelectProjectModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                  <h2 className="text-xl font-semibold mb-2 text-gray-900">Select base project</h2>
                  <p className="text-sm text-gray-500 mb-4">Choose the project folder to upload to</p>
                  <div className="max-h-[280px] overflow-y-auto border border-gray-100 rounded-lg mb-6">
                      {folders.length === 0 ? (
                          <div className="px-4 py-8 text-center text-gray-400 text-sm">No projects yet. Create a folder from the home view first.</div>
                      ) : (
                          folders.map(folder => (
                              <button
                                  key={folder.id}
                                  onClick={() => handleSelectProjectForUpload(folder)}
                                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
                              >
                                  <FolderIcon className="w-5 h-5 text-blue-500 shrink-0" />
                                  <span className="font-medium">{folder.name}</span>
                              </button>
                          ))
                      )}
                  </div>
                  <div className="flex justify-end">
                      <button onClick={handleUploadCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                  </div>
              </div>
          </div>
      )}

      {/* Upload confirm */}
      {showUploadConfirm && pendingUploadFiles.length > 0 && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                  <h2 className="text-xl font-semibold mb-2 text-gray-900">Upload video?</h2>
                  <p className="text-sm text-gray-500 mb-4 break-words">
                    Upload{" "}
                    <strong className="break-all">
                      {pendingUploadFiles.length === 1
                        ? pendingUploadFiles[0].name
                        : `${pendingUploadFiles.length} files`}
                    </strong>{" "}
                    to{" "}
                    <strong className="break-words">
                      {uploadTargetFolderName || "project"}
                    </strong>
                    ?
                  </p>
                  {isUploading && (
                    <div className="mb-4">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00A3AF] transition-[width] duration-300 ease-out rounded-full"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-right">{uploadProgress}%</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                      <button onClick={handleUploadCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                      <button
                          onClick={handleUploadConfirm}
                          disabled={isUploading}
                          className="px-6 py-2 bg-[#00A3AF] text-white rounded-lg font-medium hover:bg-[#008C97] transition-colors disabled:opacity-50"
                      >
                          {isUploading ? 'Uploading...' : 'Upload'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Move Item Modal */}
      {isMoveModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl">
                  <h2 className="text-xl font-semibold mb-2 text-gray-900">Move to Folder</h2>
                  <p className="text-sm text-gray-500 mb-4">Select a destination folder</p>
                  
                  <div className="max-h-[300px] overflow-y-auto border border-gray-100 rounded-lg mb-6">
                      {/* Root Option */}
                      <button
                        onClick={() => handleMoveItem(null)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                      >
                          <ArrowUturnLeftIcon className="w-5 h-5 text-gray-400" />
                          <span className="font-medium">Move to Root</span>
                      </button>
                      
                      {/* Available Folders (exclude current item if it's a folder) */}
                      {folders.map(folder => (
                          <button
                            key={folder.id}
                            onClick={() => handleMoveItem(folder.id)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                          >
                              <FolderIcon className="w-5 h-5 text-blue-500" />
                              <span className="font-medium">{folder.name}</span>
                          </button>
                      ))}
                      
                      {folders.length === 0 && (
                          <div className="px-4 py-8 text-center text-gray-400 text-sm">
                              No subfolders available
                          </div>
                      )}
                  </div>
                  
                  <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => { setIsMoveModalOpen(false); setItemToMove(null); }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 truncate flex-1 mr-4">
                {selectedVideo.fileName}
              </h2>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
              {videoError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-center p-6">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                    <XCircleIcon className="w-10 h-10 text-red-500" />
                  </div>
                  <h3 className="text-white font-medium mb-2">Playback Error</h3>
                  <p className="text-gray-400 text-sm max-w-sm">
                    {videoError}
                  </p>
                  <p className="text-gray-500 text-xs mt-4">
                    Tip: Try converting this file to MP4 (H.264) for web playback.
                  </p>
                </div>
              ) : (
                <video
                  src={selectedVideo.url}
                  controls
                  className="w-full h-full"
                  autoPlay
                  onError={(e) => {
                    const video = e.currentTarget;
                    if (video.error?.code === video.error?.MEDIA_ERR_SRC_NOT_SUPPORTED || selectedVideo.fileName?.toLowerCase().endsWith('.mts') || selectedVideo.fileName?.toLowerCase().endsWith('.m2ts')) {
                      setVideoError("This video format (.MTS) is not supported by your browser for direct playback.");
                    } else {
                      setVideoError("An error occurred while trying to play this video.");
                    }
                  }}
                >
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>Uploaded: {formatDate(selectedVideo.lastModified)}</span>
              <span>Size: {formatFileSize(selectedVideo.size)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
