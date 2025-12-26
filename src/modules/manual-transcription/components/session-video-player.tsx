"use client";

import { forwardRef } from "react";
import { PlayCircleIcon, XMarkIcon } from "@heroicons/react/24/solid";

interface SessionVideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean; // Controlled by parent
  onPlayStateChange: (playing: boolean) => void; // Notify parent
}

const SessionVideoPlayer = forwardRef<HTMLVideoElement, SessionVideoPlayerProps>(
  ({ videoUrl, isPlaying, onPlayStateChange }, ref) => {

    const handlePlayClick = () => {
      onPlayStateChange(true);
    };

    const handleCloseClick = () => {
      onPlayStateChange(false);
    };

    return (
      <div className="relative w-full h-full">
        {/* 🎬 Show Video First Frame as Thumbnail */}
        {!isPlaying && (
          <div
            className="w-full h-full relative group cursor-pointer rounded-2xl overflow-hidden bg-black"
            onClick={handlePlayClick}
          >
            {/* Video thumbnail preview */}
            <video
              src={videoUrl}
              preload="metadata"
              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
              muted
            />
            {/* Play icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg transition-transform transform group-hover:scale-110">
                <PlayCircleIcon className="w-8 h-8 text-[#00A3AF] ml-0.5" />
              </div>
            </div>
          </div>
        )}

        {/* 🎥 When playing */}
        {isPlaying && (
          <div className="relative w-full h-full">
            <video
              ref={ref} // Attach ref for parent control
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full rounded-2xl bg-black object-contain"
            />

            {/* ❌ Close button */}
            <button
              className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg backdrop-blur-sm transition-colors z-10"
              onClick={handleCloseClick}
            >
              <XMarkIcon className="w-5 h-5 text-black" />
            </button>
          </div>
        )}
      </div>
    );
  }
);

SessionVideoPlayer.displayName = "SessionVideoPlayer";
export default SessionVideoPlayer;