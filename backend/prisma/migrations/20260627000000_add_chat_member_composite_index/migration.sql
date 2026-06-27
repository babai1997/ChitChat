-- DropIndex
DROP INDEX "chat_members_chat_id_idx";

-- DropIndex
DROP INDEX "chat_members_user_id_idx";

-- CreateIndex
-- Composite index on (user_id, chat_id) enables index-only scans for getUserChats
-- and the unread-count batch query (JOIN chat_members ON chat_id AND user_id = ?)
CREATE INDEX "chat_members_user_id_chat_id_idx" ON "chat_members"("user_id", "chat_id");
