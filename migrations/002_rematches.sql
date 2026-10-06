ALTER TABLE games ADD COLUMN rematch_requested_by INTEGER
    CHECK (rematch_requested_by IN (0, 1));
ALTER TABLE games ADD COLUMN rematch_game_id TEXT REFERENCES games(id)
    CHECK (rematch_game_id IS NULL OR rematch_requested_by IS NULL);
