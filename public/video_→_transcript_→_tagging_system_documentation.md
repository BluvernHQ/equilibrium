# Video → Transcript → Tagging System

## 1. Purpose of the System

The goal of this system is to **convert video-based conversations into structured, analyzable knowledge** without altering the original content.

This is achieved by:
- Storing video references
- Generating and storing immutable transcripts
- Applying a flexible, semantic tagging layer on top of the transcript

The system is intentionally designed to support **human-driven sensemaking first**, with AI assistance as an enhancement — not a replacement.

---

## 2. High-Level Data Flow

```
Video
  ↓
Transcription (auto / manual)
  ↓
Transcript stored in PostgreSQL (immutable)
  ↓
Tagging & semantic organization
  ↓
Filtering, analytics, insights
```

---

## 3. Video Storage & Reference Model

Videos are **not duplicated** unnecessarily. The system stores a **stable reference** that allows re-fetching or re-playing the video.

### Video Entity

**Video**
- id (UUID)
- source_type (youtube | s3 | local_upload | external_url)
- source_url (canonical URL)
- provider_video_id (optional, e.g. YouTube ID)
- duration_seconds
- created_at

This allows:
- Replaying video during transcript review
- Time-based transcript syncing
- Future reprocessing (retranscription, AI passes)

---

## 4. Transcript Storage Model

### Core Principle

> **Transcript text is immutable once saved.**

Edits create a new version — existing tags are never silently broken.

### Transcript Entity

**Transcript**
- id (UUID)
- video_id (FK → Video)
- version
- language
- transcription_type (auto | manual | hybrid)
- created_at

---

## 5. Transcript Normalization (Critical)

Transcripts are **not stored as one large blob**.
They are broken into **atomic blocks**.

### TranscriptBlock Entity

Each block represents a speaker turn or sentence group.

**TranscriptBlock**
- id (UUID)
- transcript_id (FK)
- speaker_label (e.g. Person 1, Person 2)
- start_time_seconds
- end_time_seconds
- text
- order_index

This enables:
- Precise tagging
- Video ↔ text sync
- Partial selection
- Accurate analytics

---

## 6. Sections & Subsections (Contextual Layer)

Sections are **positional and contextual**, not semantic.

They help users orient within the transcript but **do not define meaning**.

### Rules
- Sections can exist without tags
- Tags can span across sections
- Sections do not restrict tag reuse

### Section Entity

**Section**
- id (UUID)
- transcript_id (FK)
- name
- start_block_index
- end_block_index

Subsections follow the same pattern, scoped under a section.

---

## 7. Tagging Model (Semantic Layer)

Tagging creates **semantic overlays** on transcript blocks.

### Tag Hierarchy

1. **Master Tag** – High-level concept
   - e.g. Family, Education, Career

2. **Primary Tag** – Sub-concept under a master tag
   - e.g. Siblings, Job Security

3. **Secondary / Branch Tag** – Attributes or refinements
   - e.g. Older Brother, AI Risk

---

## 8. Tag Uniqueness Rules (Invariants)

These rules are mandatory to maintain data integrity.

- Master tag name: **globally unique**
- Primary tag name: unique **within its master tag**
- Same master tag can be reused across transcripts
- Same primary tag can appear multiple times (as impressions)

---

## 9. Tag Impressions (The Most Important Concept)

Tags are not directly attached to text.

Instead, each tagging action creates a **Tag Impression**.

### TagImpression Entity

**TagImpression**
- id (UUID)
- transcript_id
- block_ids[]
- master_tag_id
- primary_tag_id (nullable)
- secondary_tag_ids[] (nullable)
- created_by
- created_at

This allows:
- Multiple uses of the same tag
- Accurate counting
- Analytics over time
- Overlapping tags

---

## 10. Manual vs Automatic Tagging

### Manual Tagging
- User selects text blocks
- Searches existing tags or creates new ones
- Explicit confirmation required

### Automatic (AI-assisted) Tagging
- AI suggests tags
- User reviews and confirms
- No silent auto-commit

**All tags are ultimately user-owned decisions.**

---

## 11. Untagged Text Handling

Untagged text is **first-class content**.

Capabilities:
- Hide untagged text (filter only)
- Show all by default
- Untagged ≠ deleted

---

## 12. Filtering & Exploration

Users can:
- Select / unselect tags
- Expand a master tag to see its primaries
- View only relevant transcript segments
- Navigate tags ↔ transcript bidirectionally

---

## 13. Analytics Enabled by Design

Because impressions are stored explicitly, the system can answer:

- How often a master tag appears
- Which transcripts discuss a topic
- Tag co-occurrence patterns
- Coverage gaps
- Section-wise distributions (derived)

No pre-aggregation is required.

---

## 14. PostgreSQL Considerations

### Indexing (Required)

Indexes should exist on:
- transcript_id
- video_id
- master_tag_id
- primary_tag_id
- created_at

### Versioning

- Transcript edits create a new version
- Old tag impressions remain linked to old versions
- Prevents silent data corruption

---

## 15. System Definition (Anchor)

> **This system allows humans to incrementally impose semantic structure on video conversations through immutable transcripts and flexible tagging, enabling deep analysis without destroying context.**

---

## 16. What This System Is NOT

- Not a strict taxonomy
- Not enforcing a single truth
- Not auto-tag-only
- Not NLP-dependent

It is a **thinking and analysis tool**, built to evolve.

