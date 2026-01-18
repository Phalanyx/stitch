-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "show_tool_options_preview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tool_edit_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "param_name" TEXT NOT NULL,
    "original_value" TEXT NOT NULL,
    "edited_value" TEXT NOT NULL,
    "user_context" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_edit_history_user_id_idx" ON "tool_edit_history"("user_id");
