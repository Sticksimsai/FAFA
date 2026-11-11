import pg from 'pg';
export function database(url){const pool=new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:5000});return pool}
export async function migrate(db){await db.query(`
CREATE TABLE IF NOT EXISTS custodial_reward_wallets (id uuid PRIMARY KEY,wallet text NOT NULL UNIQUE,operator text NOT NULL,mint text UNIQUE,creator text,cycle_seconds integer,quote_mint text,assigned_at timestamptz,next_due bigint,sequence bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS custodial_reward_worker (operator text PRIMARY KEY,executing boolean NOT NULL,balance_lamports numeric(20,0) NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS custodial_reward_rounds (wallet text NOT NULL,sequence bigint NOT NULL,mint text NOT NULL,root text NOT NULL,snapshot_slot bigint NOT NULL,holders jsonb NOT NULL,winner text NOT NULL,winner_index integer NOT NULL,audit_nonce text NOT NULL,reward numeric(20,0) NOT NULL,base_reward numeric(20,0) NOT NULL,state text NOT NULL DEFAULT 'planned',payout_signature text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet,sequence));
CREATE TABLE IF NOT EXISTS custodial_reward_actions (id uuid PRIMARY KEY,wallet text NOT NULL,sequence bigint NOT NULL,kind text NOT NULL,signature text NOT NULL UNIQUE,raw_transaction text NOT NULL,last_valid_height bigint NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS custodial_reward_single_pending ON custodial_reward_actions(wallet) WHERE status='pending';
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
CREATE TABLE IF NOT EXISTS token_stats (mint text PRIMARY KEY,progress double precision,complete boolean,market_cap_usd double precision,volume_usd double precision,holders integer,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS comments (id uuid PRIMARY KEY,mint text NOT NULL,wallet text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS comments_mint_idx ON comments(mint,created_at DESC);
`)}
