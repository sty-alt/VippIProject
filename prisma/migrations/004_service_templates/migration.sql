CREATE TABLE "ServiceTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workshopId" TEXT NOT NULL REFERENCES "Workshop"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL CHECK (length(trim("name")) BETWEEN 1 AND 160),
  "price" INTEGER NOT NULL CHECK ("price" BETWEEN 0 AND 100000000),
  "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "ServiceTemplate_workshopId_name_key" ON "ServiceTemplate"("workshopId", "name");
