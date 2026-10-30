-- PostgreSQL 13+ (uses built-in gen_random_uuid)

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE NOT NULL,
  full_name     text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- editable settings: clearance_amount (ETB), currency, support_phone
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- custom messages shown to drivers
CREATE TABLE IF NOT EXISTS error_messages (
  code        text PRIMARY KEY,
  description text NOT NULL,
  message     text NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS letter_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  kind              text NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','driver_only')),
  default_for       text CHECK (default_for IN ('no_driver','no_transactions','with_transactions')),
  body_html         text NOT NULL DEFAULT '',
  elements          jsonb NOT NULL DEFAULT '[]',   -- floating images: logo / signature / stamp / image
  for_contractor_id text,                          -- set for driver_only templates
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES users(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_template_default ON letter_templates(default_for) WHERE default_for IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_reference text UNIQUE NOT NULL,
  chapa_reference    text,
  checkout_url       text,
  amount_cents       integer NOT NULL,
  currency           text NOT NULL DEFAULT 'ETB',
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  phone              text NOT NULL,
  plate              text,
  contractor_id      text,
  scenario           text NOT NULL CHECK (scenario IN ('no_driver','no_transactions','with_transactions')),
  snapshot           jsonb NOT NULL DEFAULT '{}',  -- exactly what the driver saw when paying
  verify_payload     jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz,
  consumed_at        timestamptz,                  -- set when the one allowed download happened
  letter_id          uuid
);

CREATE SEQUENCE IF NOT EXISTS letter_serial_seq;

CREATE TABLE IF NOT EXISTS downloaded_letters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_ref     text UNIQUE NOT NULL,
  source         text NOT NULL CHECK (source IN ('payment','token')),
  payment_id     uuid REFERENCES payments(id),
  token_id       uuid,
  template_id    uuid REFERENCES letter_templates(id),
  template_name  text,
  tpl_body_html  text NOT NULL,                    -- template as it was at download time (with {{placeholders}})
  tpl_elements   jsonb NOT NULL DEFAULT '[]',
  scenario       text NOT NULL,
  phone          text NOT NULL,
  plate          text,
  contractor_id  text,
  driver_name    text,
  data           jsonb NOT NULL DEFAULT '{}',      -- all placeholder values used
  rendered_html  text NOT NULL,                    -- final letter, exactly as downloaded
  reason         text,                             -- token reason (token downloads)
  issued_by      uuid REFERENCES users(id),        -- staff who issued the token
  downloaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_letters_phone ON downloaded_letters(phone);
CREATE INDEX IF NOT EXISTS ix_letters_time ON downloaded_letters(downloaded_at DESC);

CREATE TABLE IF NOT EXISTS download_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       text UNIQUE NOT NULL,
  token_hint       text NOT NULL,                  -- last 4 characters only
  contractor_id    text,
  phone            text NOT NULL,
  plate            text,
  driver_name      text,
  source_letter_id uuid NOT NULL REFERENCES downloaded_letters(id),
  template_id      uuid NOT NULL REFERENCES letter_templates(id),
  reason           text NOT NULL,
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  used_at          timestamptz,
  used_letter_id   uuid REFERENCES downloaded_letters(id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone      text PRIMARY KEY,
  plate      text NOT NULL,
  code_hash  text NOT NULL,
  salt       text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  last_sent  timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS driver_sessions (
  token_hash     text PRIMARY KEY,
  phone          text NOT NULL,
  plate          text NOT NULL,
  status         text NOT NULL CHECK (status IN ('plate_required','no_driver','ready')),
  contractor_id  text,
  driver         jsonb,
  plate_attempts integer NOT NULL DEFAULT 0,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- driver-side problems (phone not found, wrong plate, bad token, ...)
CREATE TABLE IF NOT EXISTS error_logs (
  id            bigserial PRIMARY KEY,
  code          text NOT NULL,
  message_shown text,
  phone         text,
  plate         text,
  details       jsonb NOT NULL DEFAULT '{}',
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- who did what (append-only)
CREATE TABLE IF NOT EXISTS activity_logs (
  id          bigserial PRIMARY KEY,
  staff_id    uuid REFERENCES users(id),
  staff_name  text,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb NOT NULL DEFAULT '{}',
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only: rows cannot be edited or deleted', TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_logs_immutable ON activity_logs;
CREATE TRIGGER activity_logs_immutable BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

DROP TRIGGER IF EXISTS error_logs_immutable ON error_logs;
CREATE TRIGGER error_logs_immutable BEFORE UPDATE OR DELETE ON error_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
