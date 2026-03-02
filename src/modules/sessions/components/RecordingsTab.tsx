"use client";

import React from "react";
import type { VideoItem } from "../section/sessions-types";
import { useToast } from "@/context/ToastContext";

interface RecordingsTabProps {
  videos: VideoItem[];
  loadingVideos: boolean;
  onRefresh: () => Promise<void>;
}

export function RecordingsTab({ videos, loadingVideos, onRefresh }: RecordingsTabProps) {
  const { toast } = useToast();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Uploaded Videos</h3>
        <button
          onClick={onRefresh}
          className="text-sm text-[#00A3AF] hover:text-[#008C97] font-medium"
        >
          Refresh
        </button>
      </div>

      {loadingVideos ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">Loading videos...</div>
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-gray-400 mb-2">No videos uploaded yet</div>
          <div className="text-sm text-gray-500">Upload videos from the home page to see them here</div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          {videos.map((video) => (
            <div
              key={video.key}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-16 h-16 bg-[#E0F7FA] rounded-lg flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-[#00A3AF]"
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
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate mb-1">
                    {video.fileName}
                  </h4>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                    <span>
                      {new Date(video.lastModified).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span>
                      {(video.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#00A3AF] hover:text-[#008C97] font-medium"
                    >
                      View Video
                    </a>
                    <span className="text-gray-300">•</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(video.url);
                        toast("Video URL copied to clipboard", "success");
                      }}
                      className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
