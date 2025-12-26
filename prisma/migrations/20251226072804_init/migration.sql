-- CreateTable
CREATE TABLE "master_tags" (
    "sessionId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(7),
    "icon" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(36),
    "id" UUID NOT NULL,

    CONSTRAINT "master_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primary_tags" (
    "master_tag_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,

    CONSTRAINT "primary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secondary_tags" (
    "primary_tag_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,

    CONSTRAINT "secondary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "media_url" TEXT,
    "video_file_key" VARCHAR(500),
    "file_name" VARCHAR(255),
    "transcription_type" VARCHAR(20),
    "transcription_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_cross_references" (
    "tag_instance_id" UUID NOT NULL,
    "referenced_session_id" UUID,
    "referenced_tag_id" UUID,
    "relationship" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,

    CONSTRAINT "tag_cross_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_instances" (
    "primary_tag_id" UUID NOT NULL,
    "secondary_tag_id" UUID,
    "text_content" TEXT NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "start_timestamp" INTEGER,
    "end_timestamp" INTEGER,
    "speaker" VARCHAR(255),
    "comment" TEXT,
    "context_before" VARCHAR(200),
    "context_after" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,

    CONSTRAINT "tag_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" UUID NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_url" TEXT NOT NULL,
    "provider_video_id" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "fileName" TEXT,
    "fileKey" TEXT,
    "fileUrl" TEXT,
    "fileSize" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "transcription_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptBlock" (
    "id" UUID NOT NULL,
    "transcript_id" UUID NOT NULL,
    "speaker_label" VARCHAR(255),
    "start_time_seconds" DOUBLE PRECISION,
    "end_time_seconds" DOUBLE PRECISION,
    "text" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "TranscriptBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "transcript_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "start_block_index" INTEGER NOT NULL,
    "end_block_index" INTEGER,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subsection" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "start_block_index" INTEGER NOT NULL,
    "end_block_index" INTEGER,

    CONSTRAINT "Subsection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterTag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(7),
    "icon" VARCHAR(100),
    "created_by" VARCHAR(36),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchTag" (
    "id" UUID NOT NULL,
    "master_tag_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimaryTag" (
    "id" UUID NOT NULL,
    "master_tag_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrimaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecondaryTag" (
    "id" UUID NOT NULL,
    "primary_tag_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecondaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagImpression" (
    "id" UUID NOT NULL,
    "transcript_id" UUID NOT NULL,
    "block_ids" JSONB NOT NULL,
    "selected_text" TEXT,
    "selection_ranges" JSONB,
    "master_tag_id" UUID NOT NULL,
    "primary_tag_id" UUID,
    "secondary_tag_ids" JSONB,
    "comment" TEXT,
    "section_id" UUID,
    "subsection_id" UUID,
    "created_by" VARCHAR(36),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagImpression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_tags_name_idx" ON "master_tags"("name");

-- CreateIndex
CREATE INDEX "master_tags_sessionId_idx" ON "master_tags"("sessionId");

-- CreateIndex
CREATE INDEX "primary_tags_master_tag_id_idx" ON "primary_tags"("master_tag_id");

-- CreateIndex
CREATE INDEX "primary_tags_master_tag_id_name_idx" ON "primary_tags"("master_tag_id", "name");

-- CreateIndex
CREATE INDEX "secondary_tags_primary_tag_id_idx" ON "secondary_tags"("primary_tag_id");

-- CreateIndex
CREATE INDEX "secondary_tags_primary_tag_id_name_idx" ON "secondary_tags"("primary_tag_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "secondary_tags_primary_tag_id_name_key" ON "secondary_tags"("primary_tag_id", "name");

-- CreateIndex
CREATE INDEX "sessions_media_url_idx" ON "sessions"("media_url");

-- CreateIndex
CREATE INDEX "sessions_video_file_key_idx" ON "sessions"("video_file_key");

-- CreateIndex
CREATE INDEX "tag_cross_references_referenced_session_id_idx" ON "tag_cross_references"("referenced_session_id");

-- CreateIndex
CREATE INDEX "tag_cross_references_tag_instance_id_idx" ON "tag_cross_references"("tag_instance_id");

-- CreateIndex
CREATE INDEX "tag_instances_primary_tag_id_idx" ON "tag_instances"("primary_tag_id");

-- CreateIndex
CREATE INDEX "tag_instances_secondary_tag_id_idx" ON "tag_instances"("secondary_tag_id");

-- CreateIndex
CREATE INDEX "tag_instances_speaker_idx" ON "tag_instances"("speaker");

-- CreateIndex
CREATE INDEX "tag_instances_start_offset_end_offset_idx" ON "tag_instances"("start_offset", "end_offset");

-- CreateIndex
CREATE UNIQUE INDEX "Video_fileKey_key" ON "Video"("fileKey");

-- CreateIndex
CREATE INDEX "Video_source_url_idx" ON "Video"("source_url");

-- CreateIndex
CREATE INDEX "Video_provider_video_id_idx" ON "Video"("provider_video_id");

-- CreateIndex
CREATE INDEX "Video_source_type_idx" ON "Video"("source_type");

-- CreateIndex
CREATE INDEX "Video_createdAt_idx" ON "Video"("createdAt");

-- CreateIndex
CREATE INDEX "Transcript_video_id_idx" ON "Transcript"("video_id");

-- CreateIndex
CREATE INDEX "Transcript_created_at_idx" ON "Transcript"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_video_id_version_key" ON "Transcript"("video_id", "version");

-- CreateIndex
CREATE INDEX "TranscriptBlock_transcript_id_idx" ON "TranscriptBlock"("transcript_id");

-- CreateIndex
CREATE INDEX "TranscriptBlock_transcript_id_order_index_idx" ON "TranscriptBlock"("transcript_id", "order_index");

-- CreateIndex
CREATE INDEX "TranscriptBlock_start_time_seconds_end_time_seconds_idx" ON "TranscriptBlock"("start_time_seconds", "end_time_seconds");

-- CreateIndex
CREATE INDEX "Section_transcript_id_idx" ON "Section"("transcript_id");

-- CreateIndex
CREATE INDEX "Subsection_section_id_idx" ON "Subsection"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subsection_section_id_name_key" ON "Subsection"("section_id", "name");

-- CreateIndex
CREATE INDEX "MasterTag_name_idx" ON "MasterTag"("name");

-- CreateIndex
CREATE INDEX "MasterTag_created_at_idx" ON "MasterTag"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "MasterTag_name_key" ON "MasterTag"("name");

-- CreateIndex
CREATE INDEX "BranchTag_master_tag_id_idx" ON "BranchTag"("master_tag_id");

-- CreateIndex
CREATE INDEX "BranchTag_master_tag_id_name_idx" ON "BranchTag"("master_tag_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BranchTag_master_tag_id_name_key" ON "BranchTag"("master_tag_id", "name");

-- CreateIndex
CREATE INDEX "PrimaryTag_master_tag_id_idx" ON "PrimaryTag"("master_tag_id");

-- CreateIndex
CREATE INDEX "PrimaryTag_master_tag_id_name_idx" ON "PrimaryTag"("master_tag_id", "name");

-- CreateIndex
CREATE INDEX "SecondaryTag_primary_tag_id_idx" ON "SecondaryTag"("primary_tag_id");

-- CreateIndex
CREATE INDEX "SecondaryTag_primary_tag_id_name_idx" ON "SecondaryTag"("primary_tag_id", "name");

-- CreateIndex
CREATE INDEX "TagImpression_transcript_id_idx" ON "TagImpression"("transcript_id");

-- CreateIndex
CREATE INDEX "TagImpression_master_tag_id_idx" ON "TagImpression"("master_tag_id");

-- CreateIndex
CREATE INDEX "TagImpression_primary_tag_id_idx" ON "TagImpression"("primary_tag_id");

-- CreateIndex
CREATE INDEX "TagImpression_section_id_idx" ON "TagImpression"("section_id");

-- CreateIndex
CREATE INDEX "TagImpression_subsection_id_idx" ON "TagImpression"("subsection_id");

-- CreateIndex
CREATE INDEX "TagImpression_created_at_idx" ON "TagImpression"("created_at");

-- AddForeignKey
ALTER TABLE "master_tags" ADD CONSTRAINT "master_tags_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primary_tags" ADD CONSTRAINT "primary_tags_master_tag_id_fkey" FOREIGN KEY ("master_tag_id") REFERENCES "master_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secondary_tags" ADD CONSTRAINT "secondary_tags_primary_tag_id_fkey" FOREIGN KEY ("primary_tag_id") REFERENCES "primary_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_cross_references" ADD CONSTRAINT "tag_cross_references_referenced_session_id_fkey" FOREIGN KEY ("referenced_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_cross_references" ADD CONSTRAINT "tag_cross_references_tag_instance_id_fkey" FOREIGN KEY ("tag_instance_id") REFERENCES "tag_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_instances" ADD CONSTRAINT "tag_instances_primary_tag_id_fkey" FOREIGN KEY ("primary_tag_id") REFERENCES "primary_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_instances" ADD CONSTRAINT "tag_instances_secondary_tag_id_fkey" FOREIGN KEY ("secondary_tag_id") REFERENCES "secondary_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptBlock" ADD CONSTRAINT "TranscriptBlock_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subsection" ADD CONSTRAINT "Subsection_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTag" ADD CONSTRAINT "BranchTag_master_tag_id_fkey" FOREIGN KEY ("master_tag_id") REFERENCES "MasterTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrimaryTag" ADD CONSTRAINT "PrimaryTag_master_tag_id_fkey" FOREIGN KEY ("master_tag_id") REFERENCES "MasterTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecondaryTag" ADD CONSTRAINT "SecondaryTag_primary_tag_id_fkey" FOREIGN KEY ("primary_tag_id") REFERENCES "PrimaryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagImpression" ADD CONSTRAINT "TagImpression_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagImpression" ADD CONSTRAINT "TagImpression_master_tag_id_fkey" FOREIGN KEY ("master_tag_id") REFERENCES "MasterTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagImpression" ADD CONSTRAINT "TagImpression_primary_tag_id_fkey" FOREIGN KEY ("primary_tag_id") REFERENCES "PrimaryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
