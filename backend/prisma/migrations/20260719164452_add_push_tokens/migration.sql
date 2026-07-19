-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('android', 'ios');

-- CreateEnum
CREATE TYPE "PushTokenType" AS ENUM ('fcm', 'apns_voip');

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "token_type" "PushTokenType" NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_user_id_device_id_token_type_key" ON "push_tokens"("user_id", "device_id", "token_type");
