-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "user_dislikes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "user_likes" TEXT NOT NULL DEFAULT '';
