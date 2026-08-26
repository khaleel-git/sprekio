-- schema.sql
CREATE TABLE IF NOT EXISTS lemmas (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  language TEXT NOT NULL,
  part_of_speech TEXT,
  gender TEXT,
  frequency REAL DEFAULT 0,
  source TEXT
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  lemma_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  normalized TEXT NOT NULL,
  grammatical_info TEXT,
  FOREIGN KEY(lemma_id) REFERENCES lemmas(id)
);

CREATE TABLE IF NOT EXISTS senses (
  id TEXT PRIMARY KEY,
  lemma_id TEXT NOT NULL,
  translation TEXT NOT NULL,
  definition TEXT,
  frequency REAL DEFAULT 0,
  FOREIGN KEY(lemma_id) REFERENCES lemmas(id)
);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forms_normalized ON forms(normalized);
CREATE INDEX IF NOT EXISTS idx_ai_cache_key ON ai_cache(cache_key);
