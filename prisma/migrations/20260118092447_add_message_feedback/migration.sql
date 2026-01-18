-- CreateTable
CREATE TABLE "message_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "message_content" TEXT NOT NULL,
    "feedback_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_feedback_user_id_idx" ON "message_feedback"("user_id");
