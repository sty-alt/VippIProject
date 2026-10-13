-- Workshop creation is part of the user INSERT transaction. GET handlers remain read-only.
CREATE FUNCTION create_owner_workshop() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "Workshop" (id, "ownerId", name) VALUES (gen_random_uuid()::text, NEW.id, NEW.name);
  RETURN NEW;
END;
$$;
CREATE TRIGGER owner_workshop AFTER INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION create_owner_workshop();
INSERT INTO "Workshop" (id, "ownerId", name)
SELECT gen_random_uuid()::text, u.id, u.name FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Workshop" w WHERE w."ownerId" = u.id);
