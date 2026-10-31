# Active implementation: server-run rewards

The new launch mode is `custodial-v1`, with no custom-program deployment. See [deployment/CUSTODIAL-REWARDS.md](deployment/CUSTODIAL-REWARDS.md) for setup, custody disclosure, activation and recovery. The contract design below is retained for reference and is not used by custodial launches.

---

# Red envelope release status

This commit ships the UI, rules, database tables, program source and separate keeper. It does not activate rewards. `RED_ENVELOPE_RELEASE_READY=false` rejects reward launches and mainnet keeper execution regardless of environment flags. Ordinary launches default to FAFA; SOL and BABA remain explicit options. Existing tokens and saved explicit quote selections are unchanged.

FAFA mint: `CcSRXUReR3VVG92C4rE8FqsLomzwmH6Dn1WhTGebpump`. Default graduation target: 10,000,000 FAFA (`FAFA_GRADUATION_TARGET`). Creators pay SOL account/network costs; traders pay the quote asset. No upfront quote liquidity deposit is required.

## Implemented reward design

Each enrolled launch creates a per-mint vault. Creators choose 15 minutes, 1 hour, 2 hours or 4 hours. Claimable creator fees are directed to the vault, excluding protocol fees and pool liquidity. The keeper collects fees, snapshots finalized balances, persists the full list, commits its root and the round amounts, then requests fresh ORAO randomness. One eligible wallet wins both committed quote and base-token fees. Each wallet has one entry; the creator, off-curve addresses and frozen accounts are excluded. Hold at least one whole token. Multiple wallets remain a Sybil limitation.

Minimum quote rewards: 0.01 SOL, 0.01 BABA in raw-unit terms, or 100 FAFA. Underfunded rounds accumulate. The next cycle starts after settlement. Snapshot completeness depends on the configured keeper; random selection is verified onchain. Program upgrade authority remains a trust assumption. Vault donations and any rent returned during wrapped-SOL collection may also enter the pot.

## Required before activation

1. Build the Solana program for SBF and review it. The checked-in program ID is a development placeholder, not a deployed address. Host Rust tests are not a deployment or security audit.
2. Run validator/end-to-end acceptance tests for native SOL and SPL quotes, fee collection before and after graduation, snapshot proof validation, fresh randomness, duplicate payout rejection, failed sends, process restarts, and insufficient funding. Mainnet-only provider adapters need fixtures in test environments.
3. Deploy the reviewed program, initialize its config with the chosen snapshot authority, and create an active immutable address lookup table for launch transactions. Record the deployed program ID and upgrade-authority policy.
4. Configure `RED_ENVELOPE_PROGRAM_ID`, `RED_ENVELOPE_SNAPSHOT_AUTHORITY`, `RED_ENVELOPE_LOOKUP_TABLE`, and `RED_ENVELOPE_PROGRAM_SHA256`. The hash covers the actual ProgramData bytes after the 45-byte loader header, including allocated trailing bytes; do not substitute an unverified local .so hash.
5. Provision a separate funded keeper wallet for gas and ORAO charges. `RED_ENVELOPE_KEEPER_KEYPAIR` is a file path in the worker environment, never a secret in Git or a user's wallet key. Database, RPC and deployment configuration are shared with the app.
6. After acceptance, explicitly release the code gate and set `RED_ENVELOPE_ENABLED=true`. Do not remove the gate merely to make the UI say available.

Dry run: `node --env-file=.env scripts/red-envelope-keeper.js --once` (requires a verified deployment). Execution is a separate worker with `--execute`; it is never started by the web process. Non-mainnet execution also requires the exact `RED_ENVELOPE_TEST_GENESIS_HASH`.

The database migration is additive. Keep rewards disabled for rollback; do not discard snapshots/action records needed to settle an existing round. Existing launches cannot be retroactively enrolled by changing a database flag.
