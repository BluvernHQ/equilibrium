/**
 * Recordings data layer: folder and video list fetching.
 * Use these from the Recordings UI or from a future useRecordingsData hook (e.g. with SWR).
 */

export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  _count: { videos: number; sessions: number; children: number };
}

export interface VideoItem {
  key: string;
  fileName: string;
  url: string | null;
  size: number;
  lastModified: string;
  id?: string;
  hasTranscription?: boolean;
  transcriptionType?: "auto" | "manual";
  hasSession?: boolean;
  source_type?: string;
}

/** Fetch folders for a parent (null = root). */
export async function getFolders(parentId: string | null): Promise<FolderItem[]> {
  const res = await fetch(`/api/folders?parentId=${parentId ?? "root"}`);
  const data = await res.json();
  if (!data.success) return [];
  return data.folders ?? [];
}

/**
 * Fetch and merge video list from Spaces and DB in parallel.
 * Use presign=false for faster list load; then get URLs on demand via GET /api/videos/[key].
 */
export async function getVideosMerged(
  folderId: string | null,
  options?: { presign?: boolean }
): Promise<VideoItem[]> {
  const presign = options?.presign !== false;
  const videosUrl = presign ? "/api/videos" : "/api/videos?presign=false";
  const dbUrl = folderId
    ? `/api/videos/db?folderId=${folderId}`
    : "/api/videos/db?folderId=root";

  const [spacesRes, dbRes] = await Promise.all([
    fetch(videosUrl),
    fetch(dbUrl),
  ]);
  const spacesData = spacesRes.ok ? await spacesRes.json() : { videos: [] };
  const dbData = dbRes.ok ? await dbRes.json() : { videos: [] };

  const spacesVideos: VideoItem[] = spacesData.videos ?? [];
  const dbVideos: any[] = dbData.videos ?? [];

  const dbVideosByKey = new Map(
    dbVideos.filter((v: any) => v.fileKey).map((v: any) => [v.fileKey, v])
  );

  const findDbVideo = (spacesVideo: { key: string; fileName?: string }) => {
    if (dbVideosByKey.has(spacesVideo.key)) return dbVideosByKey.get(spacesVideo.key);
    const filename = spacesVideo.fileName ?? spacesVideo.key.split("/").pop();
    return dbVideos.find(
      (v: any) =>
        v.source_url?.includes(filename) || v.fileUrl?.includes(filename)
    );
  };

  if (folderId) {
    return dbVideos.map((dbVideo: any) => {
      const spacesVideo = spacesVideos.find(
        (sv: any) =>
          sv.key === dbVideo.fileKey || sv.fileName === dbVideo.fileName
      );
      return {
        key: dbVideo.fileKey ?? `db-${dbVideo.id}`,
        fileName: dbVideo.fileName,
        url: spacesVideo?.url ?? dbVideo.source_url ?? dbVideo.fileUrl ?? null,
        size: parseInt(dbVideo.fileSize ?? "0", 10),
        lastModified: dbVideo.createdAt,
        id: dbVideo.id,
        hasTranscription: dbVideo.hasTranscript ?? false,
        transcriptionType: dbVideo.latestTranscript?.transcription_type,
        hasSession: dbVideo.hasSession ?? false,
        source_type: dbVideo.source_type,
      };
    });
  }

  return spacesVideos
    .map((video: any) => {
      const dbVideo = findDbVideo(video);
      if (dbVideo && dbVideo.folder_id) return null;
      return {
        ...video,
        id: dbVideo?.id,
        hasTranscription: dbVideo?.hasTranscript ?? false,
        transcriptionType: dbVideo?.latestTranscript?.transcription_type,
        hasSession: dbVideo?.hasSession ?? false,
        source_type: dbVideo?.source_type,
      };
    })
    .filter(Boolean) as VideoItem[];
}

/**
 * Fetch a single presigned URL for a video key (for on-demand use when list was loaded with presign=false).
 */
export async function getVideoPresignedUrl(key: string): Promise<string> {
  const res = await fetch(`/api/videos/${encodeURIComponent(key)}`);
  const data = await res.json();
  if (!data.success || !data.url) throw new Error("Failed to get video URL");
  return data.url;
}
