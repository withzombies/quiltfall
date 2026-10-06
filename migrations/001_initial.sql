CREATE TABLE players (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE games (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES players(id),
    guest_id TEXT REFERENCES players(id),
    state TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    ended_at INTEGER,
    winner_id TEXT REFERENCES players(id)
);

CREATE INDEX games_host ON games(host_id);
CREATE INDEX games_guest ON games(guest_id);
