-- updated_at et version tenus à jour par la base, comme pour les autres entités (voir 0001_integrity).
CREATE TRIGGER custom_models_touch BEFORE UPDATE ON custom_models
  FOR EACH ROW EXECUTE FUNCTION touch_row();
