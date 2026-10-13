CREATE UNIQUE INDEX "Version_one_draft" ON "Version" ("estimateId") WHERE "publishedAt" IS NULL;
CREATE UNIQUE INDEX "PublicLink_one_active" ON "PublicLink" ("versionId") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "Question_one_unanswered" ON "Question" ("versionId") WHERE "answeredAt" IS NULL;
ALTER TABLE "Item" ADD CONSTRAINT "Item_money_bounds" CHECK (quantity BETWEEN 1 AND 100 AND price BETWEEN 0 AND 100000000);
ALTER TABLE "Version" ADD CONSTRAINT "Version_total_bounds" CHECK (total BETWEEN 0 AND 1000000000);
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_outcome" CHECK (outcome IN ('approved', 'declined'));
ALTER TABLE "Version" ADD CONSTRAINT "Version_positive_number" CHECK (number >= 1);
CREATE UNIQUE INDEX "Version_id_estimate" ON "Version" (id, "estimateId");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_current_own_version" FOREIGN KEY ("currentVersionId", id) REFERENCES "Version" (id, "estimateId") DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION immutable_published_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL AND
     ROW(NEW."clientName", NEW.device, NEW.note, NEW.explanation, NEW.completion, NEW.warranty, NEW."validUntil", NEW.total, NEW.number, NEW."estimateId", NEW."publishedAt")
     IS DISTINCT FROM ROW(OLD."clientName", OLD.device, OLD.note, OLD.explanation, OLD.completion, OLD.warranty, OLD."validUntil", OLD.total, OLD.number, OLD."estimateId", OLD."publishedAt")
  THEN RAISE EXCEPTION 'Published conditions are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_version BEFORE UPDATE ON "Version" FOR EACH ROW EXECUTE FUNCTION immutable_published_version();

CREATE FUNCTION immutable_published_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Version" WHERE id = COALESCE(NEW."versionId", OLD."versionId") AND "publishedAt" IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM "Version" WHERE id = OLD."versionId" AND "publishedAt" IS NOT NULL))
  THEN RAISE EXCEPTION 'Published items are immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER immutable_item BEFORE INSERT OR UPDATE OR DELETE ON "Item" FOR EACH ROW EXECUTE FUNCTION immutable_published_item();
