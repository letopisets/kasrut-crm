-- Two-factor single use without Redis.
--
-- users.twoFactorLastStep: the last TOTP time step accepted for the account.
-- A code is accepted only for a later step (RFC 6238 section 5.2), so a code
-- that was already used cannot open a second session within its 30 s window.
ALTER TABLE "users" ADD COLUMN "twoFactorLastStep" INTEGER;

-- two_factor_challenges: pending 2FA challenges (jti of the 2fa-pending token)
-- that already produced a session. Previously a Redis SET NX key, which made
-- every 2FA sign-in (mandatory for owners) fail while Redis was down.
CREATE TABLE "two_factor_challenges" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_challenges_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "two_factor_challenges_expiresAt_idx" ON "two_factor_challenges"("expiresAt");
