ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "documentsCreated" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" u SET "documentsCreated" = (SELECT COUNT(*)::integer FROM "Document" d WHERE d."ownerId" = u.id);
ALTER TABLE "User" ADD CONSTRAINT "User_documentsCreated_nonnegative" CHECK ("documentsCreated" >= 0);
