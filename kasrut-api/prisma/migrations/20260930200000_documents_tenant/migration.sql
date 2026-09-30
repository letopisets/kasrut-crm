-- Tenant-scoped documents. NULL = global (owner-managed, visible to every CRM
-- role); existing rows stay NULL, so today's documents remain global.
ALTER TABLE "documents" ADD COLUMN "rabbanutId" TEXT;

CREATE INDEX "documents_rabbanutId_idx" ON "documents"("rabbanutId");

ALTER TABLE "documents"
ADD CONSTRAINT "documents_rabbanutId_fkey"
FOREIGN KEY ("rabbanutId") REFERENCES "rabbanuts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
