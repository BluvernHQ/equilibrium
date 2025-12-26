# Next Steps: Video & Transcript Storage Integration

## Current Status ✅
- ✅ Database schema created (Video, Transcript, TranscriptBlock models)
- ✅ API routes created for saving/retrieving videos and transcripts
- ✅ Database synced with schema

## What Needs to Be Done

### 1. **Update Video Upload Flow** 🔄
**File**: `src/app/api/upload/route.ts`

Currently saves videos with legacy fields. Update to use new schema:
- Add `source_type: "s3"` (or detect from URL)
- Use `source_url` instead of just `fileUrl`
- Optionally extract `duration_seconds` if available

**Action**: Update the `/api/videos/save` call in upload route to include new fields.

---

### 2. **Update Transcription Save Format** 🔄
**File**: `src/context/SessionContext.tsx` (line ~226)

Currently sends `formattedData` in old format. The new API expects:
- Array of blocks with `speaker_label`, `start_time_seconds`, `end_time_seconds`, `text`

**Current format**:
```typescript
{
  id: number,
  name: string,
  time: string,
  text: string,
  startTime: number,
  endTime: number
}
```

**New format needed**:
```typescript
{
  speaker_label: string,
  start_time_seconds: number,
  end_time_seconds: number,
  text: string
}
```

**Action**: Transform the data before sending to `/api/transcriptions/save`.

---

### 3. **Update Transcript Retrieval** 🔄
**Files**: Any components that load transcripts

The new API returns transcripts with `blocks` array instead of `transcriptData`. Update:
- `src/modules/manual-transcription/section/manual-transcription.tsx`
- `src/modules/auto-transcription/section/auto-transcription.tsx`
- Any other components using transcripts

**Action**: Update transcript loading to use new block-based format.

---

### 4. **Test the Complete Flow** 🧪

Test end-to-end:
1. Upload a video → Should save with new schema
2. Transcribe video → Should save as normalized blocks
3. Retrieve video with transcript → Should load blocks correctly
4. Verify data in database using Prisma Studio

**Command**: `npx prisma studio`

---

### 5. **Handle Video Duration** (Optional) 📹

Extract video duration when uploading:
- Use a library like `ffprobe` or `get-video-duration`
- Or extract from video metadata if available
- Store in `duration_seconds` field

---

## Quick Start: Update Transcription Save

Here's the transformation needed in `SessionContext.tsx`:

```typescript
// After line 221, before saving to database:
if (videoId && formattedData.length > 0) {
    try {
        // Transform to new block format
        const blocks = formattedData.map((entry) => ({
            speaker_label: entry.name,
            start_time_seconds: entry.startTime,
            end_time_seconds: entry.endTime,
            text: entry.text,
        }));

        await fetch("/api/transcriptions/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                videoId: videoId,
                transcriptData: blocks, // New format
                transcriptionType: "auto",
            }),
        });
    } catch (dbError) {
        console.error("Failed to save transcription to database:", dbError);
    }
}
```

---

## Priority Order

1. **HIGH**: Update transcription save format (#2) - This is the most critical
2. **MEDIUM**: Update video upload to use new schema (#1)
3. **MEDIUM**: Update transcript retrieval (#3)
4. **LOW**: Add video duration extraction (#5)
5. **VERIFY**: Test complete flow (#4)

---

## Testing Checklist

- [ ] Upload video saves correctly with new schema
- [ ] Transcription saves as normalized blocks
- [ ] Transcript retrieval works with new format
- [ ] Frontend displays transcripts correctly
- [ ] Database contains proper data structure
- [ ] No errors in browser console
- [ ] No errors in server logs

