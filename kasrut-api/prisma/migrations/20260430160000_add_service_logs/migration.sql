CREATE TABLE "service_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "action" TEXT,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "requestId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "service_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_logs_createdAt_idx" ON "service_logs"("createdAt");
CREATE INDEX "service_logs_level_idx" ON "service_logs"("level");
CREATE INDEX "service_logs_service_idx" ON "service_logs"("service");
CREATE INDEX "service_logs_userId_idx" ON "service_logs"("userId");
