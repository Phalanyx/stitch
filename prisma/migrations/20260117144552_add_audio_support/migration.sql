-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "session_audio" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "audio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audio_user_id_idx" ON "audio"("user_id");
