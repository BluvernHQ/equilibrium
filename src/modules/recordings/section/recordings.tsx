"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { SparklesIcon, PencilSquareIcon, DocumentTextIcon } from "@heroicons/react/24/outline";

interface VideoItem {
  key: string;
  fileName: string;
  url: string;
  size: number;
  lastModified: string;
  id?: string; // Database video ID
  hasTranscription?: boolean; // Whether transcription exists
}

export default function Recordings() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const router = useRouter();
  const { setVideoUrl } = useSession();

  // Fetch uploaded videos from both Spaces and Database
  const fetchVideos = async () => {
    setLoadingVideos(true);
    try {
      // Fetch from Spaces
      const spacesResponse = await fetch("/api/videos");
      const spacesData = spacesResponse.ok ? await spacesResponse.json() : { videos: [] };
      
      // Fetch from Database
      const dbResponse = await fetch("/api/videos/db");
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
      
      const mergedVideos: VideoItem[] = spacesVideos.map((video: VideoItem) => {
        const dbVideo = findDbVideo(video) as { id?: string; hasTranscript?: boolean } | undefined;
        return {
          ...video,
          id: dbVideo?.id,
          hasTranscription: dbVideo?.hasTranscript || false,
        };
      });
      
      setVideos(mergedVideos);
    } catch (error) {
      console.error("Failed to fetch videos:", error);
    } finally {
      setLoadingVideos(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

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
    <div className="flex h-screen w-full bg-[#F9FAFB]">
      <div className="flex-1 flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <img src="/icons/arrow-left.png" alt="Back" className="w-[24px] h-[24px] cursor-pointer" />
            </Link>
            <h1 className="text-[24px] font-medium text-[#111827]">Recordings</h1>
          </div>
          <button
            onClick={fetchVideos}
            disabled={loadingVideos}
            className="px-4 py-2 bg-[#00A3AF] text-white rounded-lg font-medium hover:bg-[#008C97] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loadingVideos ? (
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
        </div>

        {/* Content */}
        {loadingVideos && videos.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading videos...</div>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-[#E0F7FA] rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[#00A3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-gray-400 mb-2 text-lg font-medium">No recordings found</div>
            <div className="text-sm text-gray-500">Upload videos from the home page to see them here</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
            {videos.map((video) => (
              <div
                key={video.key}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedVideo(video)}
              >
                <div className="relative w-full h-48 bg-[#E0F7FA] rounded-lg flex items-center justify-center mb-3 overflow-hidden group">
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
                </div>
                <h3 className="text-sm font-semibold text-gray-900 truncate mb-2" title={video.fileName}>
                  {video.fileName}
                </h3>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(video.lastModified)}</span>
                  <span>{formatFileSize(video.size)}</span>
                </div>
                <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (video.id) {
                          setVideoUrl(video.url, video.id);
                        } else {
                          setVideoUrl(video.url);
                        }
                        router.push("/auto-transcription");
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#00A3AF] rounded hover:bg-[#008C97] transition-colors"
                    >
                      <SparklesIcon className="w-4 h-4" />
                      {video.hasTranscription ? "Re-transcribe" : "Auto Transcribe"}
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
                  {video.hasTranscription && video.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/sessions?videoId=${video.id}`);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 transition-colors"
                    >
                      <DocumentTextIcon className="w-4 h-4" />
                      View Session
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-center px-3 py-1.5 text-xs font-medium text-[#00A3AF] bg-[#E0F7FA] rounded hover:bg-[#BFE8EB] transition-colors"
                    >
                      View
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(video.url);
                        alert("Video URL copied to clipboard!");
                      }}
                      className="flex-1 text-center px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={selectedVideo.url}
                controls
                className="w-full h-full"
                autoPlay
              >
                Your browser does not support the video tag.
              </video>
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

