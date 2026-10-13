-- Provisioned now, wired into the app in the next phase (review history + repo context retrieval).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS reviews (
  id              BIGSERIAL PRIMARY KEY,
  owner           TEXT        NOT NULL,
  repo            TEXT        NOT NULL,
  pull_number     INTEGER     NOT NULL,
  head_sha        TEXT        NOT NULL,
  status          TEXT        NOT NULL,
  comments_posted INTEGER     NOT NULL DEFAULT 0,
  input_tokens    INTEGER     NOT NULL DEFAULT 0,
  output_tokens   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner, repo, pull_number, head_sha)
);
