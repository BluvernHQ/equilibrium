"use client";

import { useCallback, useState } from "react";
import { getVideoPresignedUrl } from "./recordings-api";

/**
 * Fetch a presigned URL for a video key on demand (e.g. when list was loaded with presign=false).
 * Caches the URL in state for the lifetime of the component.
 */
export function useVideoUrl(key: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUrl = useCallback(async () => {
    if (!key) return null;
    if (url) return url;
    setLoading(true);
    setError(null);
    try {
      const resolved = await getVideoPresignedUrl(key);
      setUrl(resolved);
      return resolved;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [key, url]);

  return { url, loading, error, fetchUrl };
}
