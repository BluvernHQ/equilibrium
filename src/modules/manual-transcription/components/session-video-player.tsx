"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { PlayCircleIcon, XMarkIcon } from "@heroicons/react/24/solid";

interface SessionVideoPlayerProps {
  videoId?: string | null;
  videoUrl: string;
  isPlaying: boolean; // Controlled by parent
  onPlayStateChange: (playing: boolean) => void; // Notify parent
}

const SessionVideoPlayer = forwardRef<HTMLVideoElement, SessionVideoPlayerProps>(
  ({ videoId, videoUrl, isPlaying, onPlayStateChange }, ref) => {
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isInitialSeekDone = useRef(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const bufferingTimeoutRef = useRef<number | null>(null);

    // Persistence logic
    const saveCurrentTime = () => {
      if (videoId && internalVideoRef.current) {
        const time = internalVideoRef.current.currentTime;
        // Only save if it's a valid positive number
        if (typeof time === 'number' && time > 0) {
          localStorage.setItem(`video-time-${videoId}`, JSON.stringify({
            time: time,
            timestamp: Date.now()
          }));
        }
      }
    };

    // Restore time
    const restoreTime = () => {
      if (!videoId || !internalVideoRef.current || isInitialSeekDone.current) return;

      const savedData = localStorage.getItem(`video-time-${videoId}`);
      if (savedData) {
        try {
          const { time, timestamp } = JSON.parse(savedData);
          const now = Date.now();
          
          // Only restore if saved within the last 4 hours (to avoid stale resumes)
          if (time > 0 && (now - timestamp < 4 * 60 * 60 * 1000)) {
            console.log(`Restoring video time for ${videoId}: ${time}`);
            
            // Seek immediately
            internalVideoRef.current.currentTime = time;

            // And also after a delay to be safe
            setTimeout(() => {
              if (internalVideoRef.current) {
                internalVideoRef.current.currentTime = time;
              }
            }, 150);
          }
        } catch (e) {
          console.error("Failed to parse saved video time", e);
        }
      }
      isInitialSeekDone.current = true;
    };

    // Throttle time update saves
    const lastSaveTime = useRef(0);
    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSaveTime.current > 2000) { // Save every 2 seconds
        saveCurrentTime();
        lastSaveTime.current = now;
      }
    };

    // Reset initial seek if videoId changes
    useEffect(() => {
      isInitialSeekDone.current = false;
      setIsLoaded(false);
      setIsMetadataLoaded(false);
      setIsBuffering(false);
    }, [videoId]);

    // Decode HTML entities in URL (e.g., &amp; -> &)
    const decodedUrl = videoUrl && videoUrl.trim() ? videoUrl.replace(/&amp;/g, '&') : null;

    // Reset error state when URL changes
    useEffect(() => {
      setHasError(false);
      setErrorMessage(null);
      setIsMetadataLoaded(false);
      setIsBuffering(false);
    }, [decodedUrl]);

    // Sync refs
    useEffect(() => {
      if (typeof ref === 'function') {
        ref(internalVideoRef.current);
      } else if (ref) {
        ref.current = internalVideoRef.current;
      }
    }, [ref]); 
    
    // Explicit cleanup on component unmount
    useEffect(() => {
      const handleBeforeUnload = () => saveCurrentTime();
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        saveCurrentTime();
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (internalVideoRef.current) {
          internalVideoRef.current.pause();
          internalVideoRef.current.src = "";
          internalVideoRef.current.load();
        }
      };
    }, [videoId]); 

    // Update playing video src when URL changes
    useEffect(() => {
      const video = internalVideoRef.current;
      if (video && decodedUrl && decodedUrl.trim()) {
        const currentSrc = video.src || video.getAttribute('src') || '';
        const getBaseUrl = (url: string) => url.split('?')[0];
        const isNewSource = getBaseUrl(currentSrc) !== getBaseUrl(decodedUrl) && 
                           !currentSrc.endsWith(decodedUrl);

        if (isNewSource || hasError) {
          saveCurrentTime();
          isInitialSeekDone.current = false;
          setIsLoaded(false);
          setIsMetadataLoaded(false);
          setIsBuffering(false);
          
          // Set source without calling load() - browser will handle progressive loading
          // Only call load() if we're recovering from an error
          if (hasError) {
            video.src = decodedUrl;
            video.load();
          } else {
            // For normal source changes, just update src - browser handles it progressively
            video.src = decodedUrl;
            // Don't call load() - let the browser handle it naturally for better performance
          }
        }
      }
    }, [decodedUrl, videoId, hasError]);

    // Handle video play/pause when isPlaying prop changes
    useEffect(() => {
      const video = internalVideoRef.current;
      if (!video || !isLoaded) return;

      if (isPlaying) {
        if (video.paused) {
          video.play().catch((err) => {
            console.warn("Play request interrupted or failed:", err.message);
          });
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }
    }, [isPlaying, isLoaded]);

    const handlePlayPauseToggle = (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const video = internalVideoRef.current;
      if (!video || !isLoaded) return;

      if (video.paused) {
        // Optimistic UI: start playing immediately for better responsiveness
        video.play().catch(() => {});
        onPlayStateChange(true);
      } else {
        video.pause();
        onPlayStateChange(false);
      }
    };

    const handleCloseClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (internalVideoRef.current) {
        internalVideoRef.current.pause();
      }
      onPlayStateChange(false);
    };

    return (
      <div className="relative w-full h-full">
        {decodedUrl && decodedUrl.trim() ? (
          <div className="relative w-full h-full">
            {hasError ? (
              <div className="w-full h-full flex items-center justify-center bg-black rounded-2xl">
                <div className="text-white text-center p-6 max-w-md">
                  <div className="mb-4 text-red-400">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Video Playback Error</h3>
                  <p className="text-sm text-gray-300 mb-4">{errorMessage || "Unable to load video"}</p>
                </div>
                <button
                  className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg"
                  onClick={(e) => handleCloseClick(e)}
                >
                  <XMarkIcon className="w-5 h-5 text-black" />
                </button>
              </div>
            ) : (
              <div 
                className="relative w-full h-full group bg-black rounded-2xl overflow-hidden"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const isControlElement =
                    target.closest('button, input, progress') ||
                    ['BUTTON', 'INPUT', 'PROGRESS'].includes(target.tagName);
                  const isVideoElement =
                    target.tagName === 'VIDEO' || !!target.closest('video');

                  // If the user clicked native video controls or within the video element,
                  // let the browser handle play/pause without our custom toggle.
                  if (isControlElement || isVideoElement) {
                    return;
                  }

                  handlePlayPauseToggle();
                }}
              >
                <video
                  ref={internalVideoRef}
                  src={decodedUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                  onPlay={() => onPlayStateChange(true)}
                  onPause={() => {
                    onPlayStateChange(false);
                    saveCurrentTime();
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    setIsMetadataLoaded(true);
                    restoreTime();
                    // Metadata loaded means we can show the video frame and controls
                    setIsLoaded(true);
                  }}
                  onLoadedData={() => {
                    setIsLoaded(true);
                    restoreTime();
                    if (isPlaying) {
                      internalVideoRef.current?.play().catch(() => {});
                    }
                  }}
                  onCanPlay={() => {
                    setIsLoaded(true);
                    if (isPlaying) {
                      internalVideoRef.current?.play().catch(() => {});
                    }
                  }}
                  onCanPlayThrough={() => {
                    // Video has buffered enough to play through without stopping
                    setIsLoaded(true);
                    setIsBuffering(false);
                    if (bufferingTimeoutRef.current !== null) {
                      window.clearTimeout(bufferingTimeoutRef.current);
                      bufferingTimeoutRef.current = null;
                    }
                  }}
                  onWaiting={() => {
                    // Browser reports that playback has stalled to buffer more data.
                    // Delay showing the pill slightly so quick seeks (like clicking timestamps)
                    // don't flash an annoying buffering UI.
                    if (bufferingTimeoutRef.current !== null) {
                      return;
                    }
                    bufferingTimeoutRef.current = window.setTimeout(() => {
                      setIsBuffering(true);
                    }, 500);
                  }}
                  onPlaying={() => {
                    // Playback resumed – clear any pending timeout and hide pill.
                    if (bufferingTimeoutRef.current !== null) {
                      window.clearTimeout(bufferingTimeoutRef.current);
                      bufferingTimeoutRef.current = null;
                    }
                    setIsBuffering(false);
                  }}
                  onError={(e) => {
                    const error = e.currentTarget.error;
                    if (error?.code === error?.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                      setHasError(true);
                      setErrorMessage("This video format is not supported by your browser. Please use MP4 or WebM, or check CORS settings.");
                    }
                  }}
                />

                {/* Overlay Play Button when paused */}
                {!isPlaying && isLoaded && (
                  <div 
                    className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity group-hover:bg-black/40 cursor-pointer"
                    onClick={(e) => handlePlayPauseToggle(e)}
                  >
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md shadow-2xl scale-100 group-hover:scale-110 transition-transform">
                      <PlayCircleIcon className="w-12 h-12 text-white" />
                    </div>
                  </div>
                )}
                
                {/* Initial Loading state - only show while metadata is loading */}
                {!isMetadataLoaded && (
                  <div className="absolute inset-0 w-full h-full bg-gray-900 flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-white/20 border-t-[#00A3AF] rounded-full animate-spin" />
                      <p className="text-white text-xs font-medium">Loading video...</p>
                    </div>
                  </div>
                )}
                
                {/* Lightweight buffering indicator, only when playback is actually stalled */}
                {isMetadataLoaded && isPlaying && isBuffering && (
                  <div className="absolute bottom-3 left-3 z-20">
                    <div className="bg-black/70 backdrop-blur-sm text-white text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Buffering…</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <button
              className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg z-10"
              onClick={(e) => handleCloseClick(e)}
            >
              <XMarkIcon className="w-5 h-5 text-black" />
            </button>
          </div>
        ) : videoId ? (
          <div className="relative w-full h-full flex items-center justify-center bg-gray-900 rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-white/20 border-t-[#00A3AF] rounded-full animate-spin" />
              <p className="text-white text-xs font-medium">Loading session...</p>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center bg-black rounded-2xl">
            <p className="text-white text-sm">No video URL available</p>
          </div>
        )}
      </div>
    );
  }
);

SessionVideoPlayer.displayName = "SessionVideoPlayer";
export default SessionVideoPlayer;
