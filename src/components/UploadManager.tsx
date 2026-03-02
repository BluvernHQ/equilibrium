"use client";

import { useMemo } from "react";
import { useSession } from "@/context/SessionContext";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
};

export default function UploadManager() {
  const { uploadQueue, clearUploadQueue } = useSession();

  const inProgressCount = useMemo(
    () =>
      uploadQueue.filter(
        (u) => u.status === "uploading" || u.status === "queued"
      ).length,
    [uploadQueue]
  );

  if (!uploadQueue.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-h-64 w-80 flex-col rounded-xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-800">Uploads</span>
        <div className="flex items-center gap-2 pointer-events-auto">
          {inProgressCount > 0 && (
            <span className="text-[11px] text-gray-500">
              {inProgressCount} in progress
            </span>
          )}
          <button
            type="button"
            onClick={clearUploadQueue}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none"
            aria-label="Close uploads panel"
          >
            <span className="text-xs leading-none">&times;</span>
          </button>
        </div>
      </div>
      <div className="pointer-events-auto max-h-52 overflow-y-auto px-3 py-2 space-y-1">
        {uploadQueue.map((item) => {
          const isUploadingItem = item.status === "uploading";
          const isQueued = item.status === "queued";
          const isSuccess = item.status === "success";
          const isError = item.status === "error";

          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-2.5 py-1.5 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <div
                  className="text-gray-900 break-all leading-snug"
                  title={item.fileName}
                >
                  {item.fileName}
                </div>
                <div className="text-[10px] text-gray-400">
                  {formatFileSize(item.size)}
                  {item.error && (
                    <span className="ml-1 text-rose-500">
                      · {item.error}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-2 flex items-center gap-1">
                {isUploadingItem && (
                  <svg
                    className="h-3 w-3 animate-spin text-[#00A3AF]"
                    viewBox="0 0 24 24"
                  >
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
                )}
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                    (isQueued
                      ? "bg-gray-100 text-gray-500"
                      : isUploadingItem
                      ? "bg-blue-50 text-[#0369A1]"
                      : isSuccess
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-600")
                  }
                >
                  {isQueued && "Queued"}
                  {isUploadingItem && "Uploading"}
                  {isSuccess && "Done"}
                  {isError && "Failed"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

