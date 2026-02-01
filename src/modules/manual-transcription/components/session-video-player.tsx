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

    // Persistence logic
    const saveCurrentTime = () => {
      if (videoId && internalVideoRef.current) {
        const time = internalVideoRef.current.currentTime;
        // Only save if it's a valid positive number
        if (typeof time === 'number' && time > 0) {
          localStorage.setItem(`video-time-${videoId}`, time.toString());
        }
      }
    };

    // Restore time
    const restoreTime = () => {
      if (!videoId || !internalVideoRef.current || isInitialSeekDone.current) return;

      const savedTime = localStorage.getItem(`video-time-${videoId}`);
      if (savedTime) {
        const time = parseFloat(savedTime);
        if (!isNaN(time) && time > 0) {
          console.log(`Restoring video time for ${videoId}: ${time}`);
          
          // Seek immediately if possible
          try {
            internalVideoRef.current.currentTime = time;
          } catch (e) {
            console.warn("Immediate seek failed, will retry in timeout", e);
          }

          // And also after a delay to be safe (for some browsers/formats)
          setTimeout(() => {
            if (internalVideoRef.current) {
              internalVideoRef.current.currentTime = time;
            }
          }, 150);
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
    }, [videoId]);

    // Decode HTML entities in URL (e.g., &amp; -> &)
    const decodedUrl = videoUrl && videoUrl.trim() ? videoUrl.replace(/&amp;/g, '&') : null;

    // Reset error state when URL changes
    useEffect(() => {
      setHasError(false);
      setErrorMessage(null);
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
        
        // Only reload if the URL has actually changed significantly
        // For presigned URLs, we check if the base part (before query) is the same
        const getBaseUrl = (url: string) => url.split('?')[0];
        const isNewSource = getBaseUrl(currentSrc) !== getBaseUrl(decodedUrl) && 
                           !currentSrc.endsWith(decodedUrl);

        if (isNewSource || hasError) {
          console.log("Source URL changed or recovering from error, reloading video...");
          
          // CRITICAL: Save current time before switching source to prevent reset to 0
          saveCurrentTime();
          
          isInitialSeekDone.current = false; // Prepare for new seek
          video.src = decodedUrl;
          video.load();
          setIsLoaded(false);
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

    const handlePlayClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!decodedUrl || !decodedUrl.trim()) {
        alert("No valid video URL available");
        return;
      }

      onPlayStateChange(true);
    };

    const handleCloseClick = () => {
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
                  onClick={handleCloseClick}
                >
                  <XMarkIcon className="w-5 h-5 text-black" />
                </button>
              </div>
            ) : (
              <div 
                className="relative w-full h-full group bg-black rounded-2xl overflow-hidden"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const isControlElement = target.closest('button, input, progress') || 
                                         ['BUTTON', 'INPUT', 'PROGRESS'].includes(target.tagName);
                  
                  if (!isControlElement && internalVideoRef.current) {
                    onPlayStateChange(internalVideoRef.current.paused);
                  }
                }}
              >
                <video
                  ref={internalVideoRef}
                  src={decodedUrl}
                  controls
                  playsInline
                  preload="auto"
                  className="w-full h-full object-contain"
                  onPlay={() => onPlayStateChange(true)}
                  onPause={() => {
                    onPlayStateChange(false);
                    saveCurrentTime();
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    restoreTime();
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
                  onError={(e) => {
                    const error = e.currentTarget.error;
                    if (error?.code === error?.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                      setHasError(true);
                      setErrorMessage("Video source not accessible. Check CORS settings on your storage bucket.");
                    }
                  }}
                />

                {/* Overlay Play Button when paused by system OR not playing */}
                {!isPlaying && isLoaded && (
                  <div 
                    className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity group-hover:bg-black/40 cursor-pointer"
                    onClick={handlePlayClick}
                  >
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md shadow-2xl scale-100 group-hover:scale-110 transition-transform">
                      <PlayCircleIcon className="w-12 h-12 text-white" />
                    </div>
                  </div>
                )}
                
                {/* Initial Loading state */}
                {!isLoaded && (
                  <div className="absolute inset-0 w-full h-full bg-gray-900 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}
            
            <button
              className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg z-10"
              onClick={handleCloseClick}
            >
              <XMarkIcon className="w-5 h-5 text-black" />
            </button>
          </div>
        ) : videoId ? (
          // Loading state if we have a videoId but no URL yet
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
