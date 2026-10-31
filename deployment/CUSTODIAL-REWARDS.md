# Server-run red envelopes (SOL and FAFA)

This mode needs no custom program deployment, program rent, ORAO account or address lookup table. It uses existing Pump/Meteora fee collectors and ordinary Solana transfers. It is custodial: the operator controls reward wallets and server randomness. Never call it trustless or provably fair.

## Rules

Each new participating token gets a distinct wallet. Claimable creator fees go there; protocol fees and pool liquidity are excluded. Creators select 900, 3600, 7200 or 14400 seconds. At least one whole token is required at the finalized snapshot. Creator, operator, reward wallet, frozen accounts and off-curve owners are excluded. Separate wallets can each qualify. One uniformly selected wallet receives the recorded quote and base-token amounts. No eligible holders or insufficient reward means accumulation continues. Thresholds are 0.01 SOL or 100 FAFA. Direct donations to reward wallets are also included.

The operator pays network fees and token-account rent separately. No operating-cost percentage is deducted. The server uses Node crypto.randomInt, persists the snapshot and selected winner before payout, and retries that winner on failures. Public snapshots allow inspection of eligibility and payout; they do NOT cryptographically prove the operator used unbiased randomness or prevent operator interference. Cycles are stored at launch but are not enforced by a custom onchain contract.

## Render setup

Use the same release commit for the web service and a separate **Background Worker**. Keep the web feature disabled until the worker is ready.

Both services:

```env
RED_ENVELOPE_MODE=custodial-v1
RED_ENVELOPE_ENABLED=false
RED_ENVELOPE_SNAPSHOT_AUTHORITY=4p1AY1EZ7ZmeTaZEfq21m98u6pb3usCNDhveJK4Vtx3g
DATABASE_URL=<same PostgreSQL connection as the existing web service>
SOLANA_RPC_URL=<same mainnet RPC as the existing web service>
```

Worker only:

```env
RED_ENVELOPE_KEEPER_KEYPAIR=/etc/secrets/red-envelope-keeper.json
```

In the worker's Render Environment → Secret Files, create `red-envelope-keeper.json` using the contents of the existing `~/.fafa-wallets/operator.json` on your Mac. Do not paste it into chat, GitHub, logs or the web service. Do not use the deployment wallet key. Preserve an offline backup of this operator key AND the database: per-token keys are derived from the operator secret and each stored wallet ID. Changing the operator key loses access to existing reward wallets unless the old key is retained.

Build command: `npm ci --include=dev`

Initial start command: `node scripts/custodial-reward-worker.js`

The initial worker provisions public wallet addresses in the database, checks mainnet and the expected key, and runs in simulation mode. It does not submit transactions. It needs a funded operator to simulate fee-paying transactions. The web will continue to report rewards unavailable in this mode.

For a controlled first launch, set `RED_ENVELOPE_ENABLED=true` on the worker and use:

```sh
node scripts/custodial-reward-worker.js --execute
```

Then set `RED_ENVELOPE_ENABLED=true` on the web service. Launch readiness also requires a fresh executing-worker heartbeat, at least 0.01 SOL operator balance and available wallet inventory. BABA red envelopes remain unsupported; ordinary BABA launches are unaffected. Never run the older `red-envelope-keeper.js` for these tokens.

## Verify before advertising live rewards

1. Check `/api/launch/readiness`: redEnvelope architecture must be `custodial-v1`, ready must be true.
2. Launch a controlled SOL or FAFA token with the 15-minute reward option. Verify its metadata names the dedicated wallet and custody rules, and verify fee routing onchain.
3. Generate a small real trade. Wait for finalized collection, snapshot, then payout. Check worker logs and the token page's snapshot and explorer links. Local SOL tests seed protocol fee accounts; they do not prove real Pump trade accrual.
4. Confirm payout amount matches the stored round, only one winner is paid, and restart the worker to check recovery. Verify both the curve and graduated path before claiming both are production-validated.

Keep only one worker instance. PostgreSQL advisory locks and a unique pending-action constraint prevent overlapping work. Signed transaction bytes are recorded before broadcast; an uncertain result waits for finality or proven expiry before replacement. Transactions may be retried, but the recorded winner and amounts stay fixed. Never delete action records to force a retry.

Back up the PostgreSQL database, including reward wallets, rounds and actions. Monitor worker errors and balance. A stale heartbeat disables new reward launches; already enrolled tokens remain visible. Stopping the worker pauses distributions but does not undo fee routing. Setting the web flag false prevents new enrollment; do not retire the worker/key while enrolled tokens still accrue fees.

Existing tokens and old contract-vault assignments are not automatically converted. A fee authority owned by an undeployed PDA cannot be replaced by a server key through a UI setting.
