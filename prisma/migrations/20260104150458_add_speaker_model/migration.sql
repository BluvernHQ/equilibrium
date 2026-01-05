-- CreateTable
CREATE TABLE "Speaker" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "speaker_label" VARCHAR(255),
    "avatar_url" VARCHAR(500),
    "avatar_key" VARCHAR(500),
    "is_moderator" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Speaker_video_id_idx" ON "Speaker"("video_id");

-- CreateIndex
CREATE INDEX "Speaker_speaker_label_idx" ON "Speaker"("speaker_label");

-- CreateIndex
CREATE INDEX "Speaker_video_id_is_moderator_idx" ON "Speaker"("video_id", "is_moderator");

-- CreateIndex
CREATE UNIQUE INDEX "Speaker_video_id_speaker_label_key" ON "Speaker"("video_id", "speaker_label");

-- AddForeignKey
ALTER TABLE "Speaker" ADD CONSTRAINT "Speaker_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
