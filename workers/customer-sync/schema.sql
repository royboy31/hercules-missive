-- Hercules CRM — D1 Schema
-- Run: npx wrangler d1 execute hercules-customers --file=schema.sql

CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  region          TEXT NOT NULL,
  wc_customer_id  INTEGER NOT NULL,
  email           TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  company         TEXT,
  phone           TEXT,
  synced_at       TEXT,
  UNIQUE(region, wc_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS quotes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  region          TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_name   TEXT,
  company         TEXT,
  line_items      TEXT,
  total           REAL,
  currency        TEXT,
  notes           TEXT,
  files           TEXT,
  status          TEXT DEFAULT 'draft',
  created_at      TEXT,
  updated_at      TEXT,
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotes_email ON quotes(customer_email);
