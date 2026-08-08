-- AlterEnum
ALTER TYPE "ChatType" ADD VALUE 'meeting';

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'call_log';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "enc_version" INTEGER,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_edited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_encrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sender_device_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "personal_meeting_id" TEXT;

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "identity_key" TEXT NOT NULL,
    "identity_dh_key" TEXT NOT NULL,
    "registration_id" INTEGER NOT NULL,
    "signed_prekey_id" INTEGER NOT NULL,
    "signed_prekey_pub" TEXT NOT NULL,
    "signed_prekey_sig" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "platform" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_prekeys" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "key_id" INTEGER NOT NULL,
    "public_key" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "one_time_prekeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_ciphers" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "recipient_device_id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_ciphers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender_key_distributions" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "sender_device_id" TEXT NOT NULL,
    "recipient_device_id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_key_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_link_payloads" (
    "id" TEXT NOT NULL,
    "approving_device_id" TEXT NOT NULL,
    "new_device_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_link_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meetings_chat_id_key" ON "meetings"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_slug_key" ON "meetings"("slug");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_user_id_device_id_key" ON "devices"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "one_time_prekeys_device_id_used_idx" ON "one_time_prekeys"("device_id", "used");

-- CreateIndex
CREATE UNIQUE INDEX "one_time_prekeys_device_id_key_id_key" ON "one_time_prekeys"("device_id", "key_id");

-- CreateIndex
CREATE INDEX "message_ciphers_recipient_device_id_idx" ON "message_ciphers"("recipient_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_ciphers_message_id_recipient_device_id_key" ON "message_ciphers"("message_id", "recipient_device_id");

-- CreateIndex
CREATE INDEX "sender_key_distributions_recipient_device_id_idx" ON "sender_key_distributions"("recipient_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "sender_key_distributions_chat_id_sender_device_id_recipient_key" ON "sender_key_distributions"("chat_id", "sender_device_id", "recipient_device_id");

-- CreateIndex
CREATE INDEX "device_link_payloads_new_device_id_idx" ON "device_link_payloads"("new_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_link_payloads_new_device_id_chat_id_key" ON "device_link_payloads"("new_device_id", "chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "backups_user_id_key" ON "backups"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_personal_meeting_id_key" ON "users"("personal_meeting_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personal_meeting_id_fkey" FOREIGN KEY ("personal_meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_prekeys" ADD CONSTRAINT "one_time_prekeys_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_ciphers" ADD CONSTRAINT "message_ciphers_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_ciphers" ADD CONSTRAINT "message_ciphers_recipient_device_id_fkey" FOREIGN KEY ("recipient_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_key_distributions" ADD CONSTRAINT "sender_key_distributions_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_key_distributions" ADD CONSTRAINT "sender_key_distributions_sender_device_id_fkey" FOREIGN KEY ("sender_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_key_distributions" ADD CONSTRAINT "sender_key_distributions_recipient_device_id_fkey" FOREIGN KEY ("recipient_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_link_payloads" ADD CONSTRAINT "device_link_payloads_approving_device_id_fkey" FOREIGN KEY ("approving_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_link_payloads" ADD CONSTRAINT "device_link_payloads_new_device_id_fkey" FOREIGN KEY ("new_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

