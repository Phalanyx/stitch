/*
  Warnings:

  - You are about to drop the column `file_size` on the `videos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "videos" DROP COLUMN "file_size",
ADD COLUMN     "twelve_labs_task_id" TEXT;
