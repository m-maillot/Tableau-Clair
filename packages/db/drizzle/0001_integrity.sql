-- Contraintes d'intégrité qu'un schéma déclaratif ne sait pas exprimer.
-- Ordre : extension, triggers d'audit, non-chevauchement, propriétaire minimum, circuits.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- 1. updated_at et version sont tenus à jour par la base, jamais par le client.
--    L'API fait `UPDATE ... WHERE id = $1 AND version = $2` : 0 ligne modifiée = conflit d'édition.
CREATE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME <> 'users' THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'properties', 'memberships', 'invitations', 'photos', 'boards', 'board_rows',
    'elements', 'floors', 'rooms', 'fixtures', 'circuits', 'share_links'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()',
      t || '_touch', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- 2. Deux éléments d'une même rangée ne se chevauchent pas.
--    DEFERRABLE : permet d'échanger deux éléments dans une transaction (SET CONSTRAINTS ... DEFERRED).
ALTER TABLE elements
  ADD CONSTRAINT elements_no_overlap
  EXCLUDE USING gist (row_id WITH =, int4range(position, position + width) WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint

-- 3. Un logement a toujours au moins un propriétaire.
--    Vérifié en fin de transaction : on peut ajouter le nouveau propriétaire puis retirer l'ancien,
--    ou créer un logement puis son membre propriétaire dans la même transaction.
--    Si le logement lui-même est supprimé (cascade), il n'y a plus rien à vérifier.
CREATE FUNCTION assert_property_has_owner() RETURNS trigger AS $$
DECLARE pid uuid;
BEGIN
  IF TG_TABLE_NAME = 'properties' THEN
    pid := NEW.id;
  ELSE
    pid := OLD.property_id;
  END IF;

  IF EXISTS (SELECT 1 FROM properties WHERE id = pid)
     AND NOT EXISTS (SELECT 1 FROM memberships WHERE property_id = pid AND role = 'owner') THEN
    RAISE EXCEPTION 'Le logement % doit avoir au moins un propriétaire', pid
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER properties_require_owner
  AFTER INSERT ON properties
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_property_has_owner();
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER memberships_require_owner
  AFTER UPDATE OR DELETE ON memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_property_has_owner();
--> statement-breakpoint

-- 4. Supprimer un disjoncteur ne supprime pas ses équipements : la liaison passe à « inconnu ».
--    Le FK `ON DELETE SET NULL` met breaker_id à NULL ; ce trigger aligne le statut.
CREATE FUNCTION circuit_unlinked_is_unknown() RETURNS trigger AS $$
BEGIN
  IF NEW.breaker_id IS NULL AND OLD.breaker_id IS NOT NULL THEN
    NEW.status := 'unknown';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER circuits_unlink_status
  BEFORE UPDATE ON circuits
  FOR EACH ROW EXECUTE FUNCTION circuit_unlinked_is_unknown();
