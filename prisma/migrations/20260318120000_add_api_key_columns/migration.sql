-- Add missing API key columns for Project, MockRoute, and McpServer
-- Use a deterministic default generator that works on any Postgres install
ALTER TABLE "Project"
  ADD COLUMN "apiKey" TEXT NOT NULL DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 24));

CREATE UNIQUE INDEX "Project_apiKey_key" ON "Project"("apiKey");

ALTER TABLE "MockRoute"
  ADD COLUMN "requireApiKey" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "apiKey" TEXT NOT NULL DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 24));

CREATE UNIQUE INDEX "MockRoute_apiKey_key" ON "MockRoute"("apiKey");

ALTER TABLE "McpServer"
  ADD COLUMN "requireApiKey" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "apiKey" TEXT NOT NULL DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 24));

CREATE UNIQUE INDEX "McpServer_apiKey_key" ON "McpServer"("apiKey");
