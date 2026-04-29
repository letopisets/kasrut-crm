-- Add backup codes column for 2FA account recovery
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[] NOT NULL DEFAULT '{}';
