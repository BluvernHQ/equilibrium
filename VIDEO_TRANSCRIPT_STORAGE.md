# Video & Transcript Storage Implementation

This document describes the PostgreSQL database implementation for storing videos and transcripts according to the system documentation.

## Database Schema

### Video Model
Stores video references with source information:
- `id` (UUID) - Primary key
- `source_type` - youtube | s3 | local_upload | external_url
- `source_url` - Canonical URL (required)
- `provider_video_id` - Optional (e.g. YouTube ID)
- `duration_seconds` - Optional video duration
- Legacy fields: `fileName`, `fileKey`, `fileUrl`, `fileSize`

### Transcript Model
Immutable transcript versions:
- `id` (UUID) - Primary key
- `video_id` - Foreign key to Video
- `version` - Version number (increments on edits)
- `language` - Language code (default: "en")
- `transcription_type` - auto | manual | hybrid
- `created_at` - Timestamp

### TranscriptBlock Model
Normalized transcript blocks (atomic units):
- `id` (UUID) - Primary key
- `transcript_id` - Foreign key to Transcript
- `speaker_label` - Speaker identifier (e.g. "Person 1")
- `start_time_seconds` - Start time in seconds
- `end_time_seconds` - End time in seconds
- `text` - Block text content
- `order_index` - Order within transcript

## API Endpoints

### Save Video
**POST** `/api/videos/save`

Request body:
```json
{
  "source_type": "youtube" | "s3" | "local_upload" | "external_url",
  "source_url": "https://...",
  "provider_video_id": "optional-youtube-id",
  "duration_seconds": 123.45,
  // Legacy fields (backward compatible)
  "fileName": "video.mp4",
  "fileKey": "Equilibrium/uuid.mp4",
  "fileUrl": "https://...",
  "fileSize": 1234567
}
```

### Save Transcript
**POST** `/api/transcriptions/save`

Request body:
```json
{
  "videoId": "uuid",
  "transcriptData": [
    {
      "speaker_label": "Speaker 1",
      "start_time_seconds": 0.0,
      "end_time_seconds": 5.2,
      "text": "Hello, this is a transcript block."
    }
  ],
  "transcriptionType": "auto" | "manual" | "hybrid",
  "language": "en"
}
```

Supports multiple input formats:
- Array of blocks (as shown above)
- AssemblyAI format with `utterances`
- AssemblyAI format with `words` (auto-grouped into sentences)
- Simple text format (auto-split into sentences)

### Load Transcript
**GET** `/api/transcriptions/load/[videoId]?version=1`

Returns the latest transcript (or specific version) with all blocks:
```json
{
  "success": true,
  "transcript": {
    "id": "uuid",
    "video_id": "uuid",
    "version": 1,
    "language": "en",
    "transcription_type": "auto",
    "created_at": "2024-...",
    "blocks": [...],
    "sections": [...],
    "blocks_count": 42
  }
}
```

### Get All Videos
**GET** `/api/videos/db?includeTranscripts=true&includeBlocks=true`

Query parameters:
- `includeTranscripts` - Include transcript metadata (default: false)
- `includeBlocks` - Include full transcript blocks (default: false)

Returns list of videos with optional transcript information.

## Usage Examples

### 1. Save a YouTube Video
```javascript
const response = await fetch('/api/videos/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_type: 'youtube',
    source_url: 'https://www.youtube.com/watch?v=...',
    provider_video_id: 'video-id',
    duration_seconds: 600.5
  })
});
```

### 2. Save Auto-Generated Transcript
```javascript
// After getting transcript from AssemblyAI
const transcriptData = assemblyAIResponse.utterances.map(u => ({
  speaker_label: `Speaker ${u.speaker}`,
  start_time_seconds: u.start / 1000,
  end_time_seconds: u.end / 1000,
  text: u.text
}));

const response = await fetch('/api/transcriptions/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    videoId: video.id,
    transcriptData,
    transcriptionType: 'auto',
    language: 'en'
  })
});
```

### 3. Retrieve Video with Transcript
```javascript
// Get video list
const videosResponse = await fetch('/api/videos/db?includeTranscripts=true');
const { videos } = await videosResponse.json();

// Get full transcript with blocks
const transcriptResponse = await fetch(
  `/api/transcriptions/load/${videoId}`
);
const { transcript } = await transcriptResponse.json();
```

## Database Migration

To apply the schema changes to your database:

```bash
# Create migration
npx prisma migrate dev --name add_video_transcript_models

# Or if you want to reset (WARNING: deletes all data)
npx prisma migrate reset
```

## Key Features

1. **Immutable Transcripts**: Each edit creates a new version, preserving history
2. **Normalized Blocks**: Transcripts are stored as atomic blocks for precise tagging
3. **Efficient Retrieval**: Blocks are indexed for fast queries
4. **Backward Compatible**: Legacy fields supported for existing code
5. **Flexible Input**: Supports multiple transcript formats

## Next Steps

- [ ] Create migration and apply to database
- [ ] Update frontend to use new API endpoints
- [ ] Implement tagging system (TagImpression model)
- [ ] Add sections/subsections management
- [ ] Implement transcript versioning UI

