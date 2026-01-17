/*
  Warnings:

  - A unique constraint covering the columns `[audio_id]` on the table `videos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "audio_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "videos_audio_id_key" ON "videos"("audio_id");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
