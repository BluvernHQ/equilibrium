"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { PlayCircleIcon, XMarkIcon } from "@heroicons/react/24/solid";

interface SessionVideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean; // Controlled by parent
  onPlayStateChange: (playing: boolean) => void; // Notify parent
}

const SessionVideoPlayer = forwardRef<HTMLVideoElement, SessionVideoPlayerProps>(
  ({ videoUrl, isPlaying, onPlayStateChange }, ref) => {
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Decode HTML entities in URL (e.g., &amp; -> &)
    // Only process if videoUrl is a valid non-empty string
    const decodedUrl = videoUrl && videoUrl.trim() ? videoUrl.replace(/&amp;/g, '&') : null;

    // Reset error state when URL changes or when closing
    useEffect(() => {
      if (!isPlaying) {
        setHasError(false);
        setErrorMessage(null);
      }
    }, [isPlaying, decodedUrl]);

    // Sync refs - forward ref to the playing video element
    useEffect(() => {
      if (typeof ref === 'function') {
        ref(internalVideoRef.current);
      } else if (ref) {
        ref.current = internalVideoRef.current;
      }
    }, [ref, isPlaying, internalVideoRef.current]);
    
    // Update playing video src when URL changes and video is playing
    useEffect(() => {
      if (isPlaying && internalVideoRef.current && decodedUrl && decodedUrl.trim()) {
        const currentSrc = internalVideoRef.current.src || internalVideoRef.current.getAttribute('src') || '';
        if (currentSrc !== decodedUrl) {
          // Set the src and load the video
          internalVideoRef.current.src = decodedUrl;
          // Load the video (this will clear any previous error state)
          internalVideoRef.current.load();
        }
      }
    }, [decodedUrl, isPlaying]);

    const handlePlayClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Change state first to show the video element
      onPlayStateChange(true);
      
      // Immediately try to play the video (user interaction context)
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        setTimeout(async () => {
          if (internalVideoRef.current) {
            try {
              // Ensure video src is set (only if we have a valid URL)
              if (decodedUrl && decodedUrl.trim() && (!internalVideoRef.current.src || internalVideoRef.current.src !== decodedUrl)) {
                internalVideoRef.current.src = decodedUrl;
              } else if (!decodedUrl || !decodedUrl.trim()) {
                throw new Error("No valid video URL available");
              }
              
              // Load the video
              internalVideoRef.current.load();
              
              // Wait for video to be ready
              if (internalVideoRef.current.readyState < 2) {
                await new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    reject(new Error("Video load timeout"));
                  }, 10000);
                  
                  const videoEl = internalVideoRef.current;
                  if (!videoEl) {
                    clearTimeout(timeout);
                    reject(new Error("Video element not found"));
                    return;
                  }
                  
                  const onCanPlay = () => {
                    clearTimeout(timeout);
                    videoEl.removeEventListener('canplay', onCanPlay);
                    videoEl.removeEventListener('error', onError);
                    resolve();
                  };
                  
                  const onError = () => {
                    clearTimeout(timeout);
                    videoEl.removeEventListener('canplay', onCanPlay);
                    videoEl.removeEventListener('error', onError);
                    reject(new Error("Video load error"));
                  };
                  
                  videoEl.addEventListener('canplay', onCanPlay, { once: true });
                  videoEl.addEventListener('error', onError, { once: true });
                });
              }
              
              // Play the video
              await internalVideoRef.current.play();
              console.log("Video playing successfully");
            } catch (err) {
              console.error("Video play error on click:", err);
              // Show user-friendly error with CORS guidance
              const errorMessage = err instanceof Error && err.message.includes("CORS")
                ? "Video cannot be played due to CORS restrictions. Please configure CORS on your Digital Ocean Spaces bucket."
                : "Unable to play video. This may be due to CORS configuration. Please check the console for details.";
              alert(errorMessage);
            }
          }
        }, 100);
      });
    };

    const handleCloseClick = () => {
      onPlayStateChange(false);
      // Pause video when closing
      if (internalVideoRef.current) {
        internalVideoRef.current.pause();
      }
    };

    // Handle video play when isPlaying changes
    useEffect(() => {
      if (isPlaying && internalVideoRef.current) {
        const video = internalVideoRef.current;
        
        // Ensure video is loaded before playing
        const tryPlay = () => {
          if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            video.play().catch((err) => {
              console.error("Video play error:", err);
              // If autoplay fails, show error or try again on user interaction
            });
          } else {
            // Wait for video to be ready
            video.addEventListener('loadeddata', tryPlay, { once: true });
            video.addEventListener('canplay', tryPlay, { once: true });
            video.load(); // Force reload if needed
          }
        };

        // Small delay to ensure video element is ready
        const timer = setTimeout(tryPlay, 100);
        return () => {
          clearTimeout(timer);
          video.removeEventListener('loadeddata', tryPlay);
          video.removeEventListener('canplay', tryPlay);
        };
      } else if (!isPlaying && internalVideoRef.current) {
        internalVideoRef.current.pause();
      }
    }, [isPlaying]);

    return (
      <div className="relative w-full h-full">
        {/* 🎬 Show Video First Frame as Thumbnail */}
        {!isPlaying && (
          <div
            className="w-full h-full relative group cursor-pointer rounded-2xl overflow-hidden bg-black"
            onClick={handlePlayClick}
          >
            {/* Video thumbnail preview - use a placeholder instead of trying to load video */}
            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                <PlayCircleIcon className="w-10 h-10 text-white/80" />
              </div>
            </div>
            {/* Play icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg transition-transform transform group-hover:scale-110">
                <PlayCircleIcon className="w-8 h-8 text-[#00A3AF] ml-0.5" />
              </div>
            </div>
          </div>
        )}

        {/* 🎥 When playing - Only render when playing and we have a valid URL */}
        {isPlaying && decodedUrl && decodedUrl.trim() ? (
          <div className="relative w-full h-full">
            {hasError ? (
              <div className="w-full h-full flex items-center justify-center bg-black rounded-2xl">
                <div className="text-white text-center p-6 max-w-md">
                  <div className="mb-4">
                    <svg className="w-12 h-12 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Video Playback Error</h3>
                  <p className="text-sm text-gray-300 mb-4">{errorMessage || "Unable to load video"}</p>
                  <div className="text-xs text-gray-400 bg-gray-900/50 p-3 rounded">
                    <p className="font-semibold mb-2">To fix this:</p>
                    <ol className="list-decimal list-inside space-y-1 text-left">
                      <li>Go to Digital Ocean Spaces dashboard</li>
                      <li>Select your bucket and go to Settings → CORS</li>
                      <li>Add your domain ({window.location.origin}) to allowed origins</li>
                      <li>Allow GET and HEAD methods</li>
                    </ol>
                  </div>
                </div>
                <button
                  className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg backdrop-blur-sm transition-colors z-10"
                  onClick={handleCloseClick}
                >
                  <XMarkIcon className="w-5 h-5 text-black" />
                </button>
              </div>
            ) : (
              <video
              ref={internalVideoRef}
              src={decodedUrl}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="w-full h-full rounded-2xl bg-black object-contain"
            onLoadedData={() => {
              // Ensure video plays when data is loaded
              if (internalVideoRef.current && isPlaying) {
                internalVideoRef.current.play().catch((err) => {
                  console.error("Video play error on load:", err);
                });
              }
            }}
            onCanPlay={() => {
              // Try to play when video can play
              if (internalVideoRef.current && isPlaying) {
                internalVideoRef.current.play().catch((err) => {
                  console.error("Video play error on canplay:", err);
                });
              }
            }}
            onLoadedMetadata={() => {
              console.log("Video metadata loaded:", {
                duration: internalVideoRef.current?.duration,
                videoWidth: internalVideoRef.current?.videoWidth,
                videoHeight: internalVideoRef.current?.videoHeight,
                readyState: internalVideoRef.current?.readyState
              });
            }}
            onError={(e) => {
              const video = e.currentTarget;
              const error = video.error;
              let errorMsg = "Unknown video error";
              
              if (error) {
                switch (error.code) {
                  case error.MEDIA_ERR_ABORTED:
                    errorMsg = "Video loading aborted";
                    break;
                  case error.MEDIA_ERR_NETWORK:
                    errorMsg = "Network error while loading video";
                    break;
                  case error.MEDIA_ERR_DECODE:
                    errorMsg = "Video decoding error";
                    break;
                  case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMsg = "Video source not accessible. This is likely a CORS configuration issue.";
                    setHasError(true);
                    setErrorMessage("CORS Error: Video cannot be loaded. Please configure CORS on your Digital Ocean Spaces bucket to allow video playback from this domain.");
                    break;
                  default:
                    errorMsg = `Video error code: ${error.code}`;
                }
              }
              
              console.error("Video error:", {
                message: errorMsg,
                error: error,
                networkState: video.networkState,
                readyState: video.readyState,
                src: video.src,
                currentSrc: video.currentSrc,
                errorCode: error?.code,
                errorMessage: error?.message,
                networkStateText: video.networkState === 0 ? 'EMPTY' : 
                                  video.networkState === 1 ? 'IDLE' :
                                  video.networkState === 2 ? 'LOADING' :
                                  video.networkState === 3 ? 'NO_SOURCE' : 'UNKNOWN'
              });
              
              // If it's a source not supported error, it might be a CORS issue
              if (error?.code === error?.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                console.warn("⚠️ Video source not accessible. This might be a CORS issue.");
                console.warn("Please ensure your Digital Ocean Spaces bucket has CORS configured to allow video playback from your domain.");
                console.warn("CORS configuration should allow: GET, HEAD methods and include your domain in allowed origins.");
                console.warn("Current origin:", window.location.origin);
                console.warn("Video URL:", video.src);
                
                // Log detailed error for debugging
                console.error("Full error details:", {
                  errorCode: error?.code,
                  networkState: video.networkState,
                  readyState: video.readyState,
                  src: video.src,
                  currentSrc: video.currentSrc,
                });
              }
            }}
            onClick={(e) => {
              // If video is paused, play it on click (user interaction)
              if (internalVideoRef.current && internalVideoRef.current.paused) {
                internalVideoRef.current.play().catch((err) => {
                  console.error("Video play error on click:", err);
                });
              }
            }}
          />
            )}
            
            {/* ❌ Close button */}
            <button
              className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg backdrop-blur-sm transition-colors z-10"
              onClick={handleCloseClick}
            >
              <XMarkIcon className="w-5 h-5 text-black" />
            </button>
          </div>
        ) : isPlaying ? (
          // Show error message if trying to play but no valid URL
          <div className="relative w-full h-full flex items-center justify-center bg-black rounded-2xl">
            <div className="text-white text-center p-4">
              <p className="text-sm">No video URL available</p>
            </div>
            <button
              className="absolute top-2 right-2 bg-white/80 hover:bg-white p-1 rounded-full shadow-lg backdrop-blur-sm transition-colors z-10"
              onClick={handleCloseClick}
            >
              <XMarkIcon className="w-5 h-5 text-black" />
            </button>
          </div>
        ) : null}
      </div>
    );
  }
);

SessionVideoPlayer.displayName = "SessionVideoPlayer";
export default SessionVideoPlayer;