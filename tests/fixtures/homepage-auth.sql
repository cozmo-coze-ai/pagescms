-- Synthetic pre-existing CMS auth tables for isolated PostgreSQL integration tests.
CREATE TABLE "user" (
  id text PRIMARY KEY, name text NOT NULL, image text, email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false, role text NOT NULL DEFAULT 'editor',
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE session (
  id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  ip_address text, user_agent text, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text, access_token_expires_at timestamp,
  refresh_token_expires_at timestamp, scope text, password text,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
