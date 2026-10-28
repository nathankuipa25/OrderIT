CREATE TABLE IF NOT EXISTS "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MobileSession_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MobileSession_userId_revokedAt_idx" ON "MobileSession"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "MobileSession_expiresAt_idx" ON "MobileSession"("expiresAt");
