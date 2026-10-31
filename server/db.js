import pg from 'pg';
export function database(url){const pool=new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:5000});return pool}
export async function migrate(db){await db.query(`
CREATE TABLE IF NOT EXISTS red_envelope_snapshots (vault text NOT NULL,sequence numeric(20,0) NOT NULL,mint text NOT NULL,root text NOT NULL,snapshot_slot bigint NOT NULL,holders jsonb NOT NULL,begin_signature text,payout_signature text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(vault,sequence));
CREATE TABLE IF NOT EXISTS red_envelope_actions (id uuid PRIMARY KEY,vault text NOT NULL,sequence numeric(20,0) NOT NULL,kind text NOT NULL,signature text NOT NULL UNIQUE,last_valid_height bigint NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS red_envelope_actions_pending ON red_envelope_actions(vault,status);
CREATE TABLE IF NOT EXISTS auth_challenges (id uuid PRIMARY KEY,wallet text NOT NULL,message text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY,wallet text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS drafts (wallet text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS watchlist (wallet text NOT NULL,mint text NOT NULL,PRIMARY KEY(wallet,mint));
CREATE TABLE IF NOT EXISTS assets (id uuid PRIMARY KEY,wallet text NOT NULL,content bytea NOT NULL,mime text NOT NULL);
CREATE TABLE IF NOT EXISTS metadata (id uuid PRIMARY KEY,wallet text NOT NULL,data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id uuid PRIMARY KEY,wallet text NOT NULL,kind text NOT NULL,message text NOT NULL,transaction text NOT NULL,details jsonb NOT NULL,blockhash text,last_valid_height bigint,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'prepared',signature text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS stock_launches (mint text PRIMARY KEY,wallet text NOT NULL,details jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',mint_signature text,pool_signature text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_wallet_idx ON orders(wallet,created_at DESC);
CREATE TABLE IF NOT EXISTS tokens (mint text PRIMARY KEY,wallet text NOT NULL,name text NOT NULL,symbol text NOT NULL,description text NOT NULL,image text NOT NULL,uri text NOT NULL,signature text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
`)}
