"use client";

import { useState, useCallback } from "react";
import type { Speaker } from "@/modules/manual-transcription/components/speakers-carousel";
import type { TranscriptBlock } from "./sessions-types";
import { formatTime } from "./sessions-utils";

export function useSessionSpeakers(videoId: string | null, transcriptBlocks: TranscriptBlock[]) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  const persistSpeakersToServer = useCallback(
    async (currentSpeakers: Speaker[]) => {
      if (!videoId) return;
      try {
        const speakerData = currentSpeakers.map((speaker) => {
          let avatarKey: string | null = null;
          if (speaker.avatar && speaker.avatar.startsWith("http")) {
            try {
              const url = new URL(speaker.avatar);
              avatarKey = url.pathname.startsWith("/") ? url.pathname.substring(1) : url.pathname;
            } catch {
              // ignore
            }
          }
          return {
            name: speaker.name,
            speaker_label: speaker.name,
            avatar_url: speaker.avatar || null,
            avatar_key: avatarKey,
            is_moderator: speaker.role === "coordinator",
          };
        });

        const transcriptData = transcriptBlocks.map((block, idx) => ({
          id: idx,
          name: block.speaker_label,
          time: formatTime(block.start_time_seconds),
          text: block.text,
          startTime: block.start_time_seconds,
          endTime: block.end_time_seconds,
        }));

        await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            transcriptData,
            transcriptionType: "manual",
            speakerData,
          }),
        });
      } catch (error) {
        console.error("Failed to persist speakers to server:", error);
      }
    },
    [videoId, transcriptBlocks]
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, role: "coordinator" | "speaker") => {
      if (!e.target.files?.length) return;
      const file = e.target.files[0];
      const rolePrefix = role === "coordinator" ? "Moderator" : "Speaker";
      const tempId = `uploaded-${Date.now()}-${file.name}`;
      const localPreviewUrl = URL.createObjectURL(file);

      let nextNumber = 1;
      setSpeakers((prev) => {
        const roleNumbers = prev
          .map((s) => {
            const match = s.name.match(new RegExp(`^${rolePrefix} (\\d+)$`));
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter((n) => !isNaN(n));
        nextNumber = roleNumbers.length > 0 ? Math.max(...roleNumbers) + 1 : 1;
        const speakerName = `${rolePrefix} ${nextNumber}`;
        const newSpeaker: Speaker = {
          id: tempId,
          name: speakerName,
          shortName: speakerName,
          avatar: localPreviewUrl,
          isDefault: false,
          role,
        };
        return [...prev, newSpeaker];
      });
      const speakerName = `${rolePrefix} ${nextNumber}`;

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("speakerName", speakerName);
        if (videoId) formData.append("videoId", videoId);
        const response = await fetch("/api/speakers/upload-avatar", { method: "POST", body: formData });
        if (response.ok) {
          const data = await response.json();
          setSpeakers((prev) => {
            const updated = prev.map((s) => (s.id === tempId ? { ...s, avatar: data.url } : s));
            persistSpeakersToServer(updated);
            return updated;
          });
        } else {
          setSpeakers((prev) => prev.filter((s) => s.id !== tempId));
        }
      } catch (error) {
        console.error("Avatar upload error:", error);
        setSpeakers((prev) => prev.filter((s) => s.id !== tempId));
      } finally {
        e.target.value = "";
      }
    },
    [videoId, speakers, persistSpeakersToServer]
  );

  const handleUpdateAvatar = useCallback(
    async (id: string, file: File) => {
      setSpeakers((prev) => {
        const localPreviewUrl = URL.createObjectURL(file);
        return prev.map((s) => (s.id === id ? { ...s, avatar: localPreviewUrl } : s));
      });
      const speaker = speakers.find((s) => s.id === id);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (speaker) formData.append("speakerName", speaker.name);
        if (videoId) formData.append("videoId", videoId);
        const response = await fetch("/api/speakers/upload-avatar", { method: "POST", body: formData });
        if (response.ok) {
          const data = await response.json();
          setSpeakers((prev) => {
            const updated = prev.map((s) => (s.id === id ? { ...s, avatar: data.url } : s));
            persistSpeakersToServer(updated);
            return updated;
          });
        }
      } catch (error) {
        console.error("Avatar upload error:", error);
      }
    },
    [videoId, speakers, persistSpeakersToServer]
  );

  const handleUpdateSpeaker = useCallback(
    (id: string | number, newName: string) => {
      setSpeakers((prev) => {
        const updated = prev.map((spk) =>
          spk.id === id
            ? {
                ...spk,
                name: newName,
                shortName: newName.length > 10 ? newName.substring(0, 8) + "..." : newName,
              }
            : spk
        );
        persistSpeakersToServer(updated);
        return updated;
      });
    },
    [persistSpeakersToServer]
  );

  const handleDeleteSpeaker = useCallback(
    async (id: string) => {
      if (id.length > 20 && !id.startsWith("uploaded-") && !id.startsWith("speaker-")) {
        try {
          await fetch(`/api/speakers/${id}/delete`, { method: "DELETE" });
        } catch (error) {
          console.error("Failed to delete speaker from server:", error);
        }
      }
      setSpeakers((prev) => {
        const updated = prev.filter((s) => s.id !== id);
        persistSpeakersToServer(updated);
        return updated;
      });
    },
    [persistSpeakersToServer]
  );

  return {
    speakers,
    setSpeakers,
    handleFileUpload,
    handleUpdateAvatar,
    handleUpdateSpeaker,
    handleDeleteSpeaker,
  };
}
