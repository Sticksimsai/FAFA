# FAFA red-envelope mainnet setup

Status: preparation only. No deployment, funding or payout has been submitted.

## Wallet roles

- Payout operator / snapshot authority: `4p1AY1EZ7ZmeTaZEfq21m98u6pb3usCNDhveJK4Vtx3g`.
- Deployment / upgrade authority: `7EbtR2dyJG5GpjPLaZDPrmbkN49ghwuYGNDgzmNax3VW`.
- Both addresses had zero SOL at the read-only setup check. Recheck balances before signing.
- `RED_ENVELOPE_DEPLOY_AUTHORITY` is used only by setup. `RED_ENVELOPE_SNAPSHOT_AUTHORITY` is the keeper. The legacy setup variable `RED_ENVELOPE_OPERATOR` meant upgrade authority; use the new name to avoid swapping wallets.

## Remaining release requirements

1. Program identity: `3kFwkbymXkMhjveEyrGfdaDHjqWFwLsih7BLt2GLo3r4`. Its private keypair stays on the owner's Mac at `~/.fafa-wallets/red-envelope-program.json`. Source is bound to this identity; deploy only the rebuilt and tested binary. No deployment is implied by assigning an address.
2. Complete fee-collection acceptance for Pump SOL and Meteora FAFA, before and after graduation. Passing deposit-to-payout tests does not prove fee collection.
3. Estimate deployment rent and fees from the final binary and current RPC. Fund the deployment wallet accordingly. The keeper also requires SOL for repeated ORAO requests, transaction fees and account rent; one-cycle funding is not a long-term operating budget.
4. Owner signs deployment with their deployment wallet. Record program ID and deployment transaction. The upgrade authority must match the address above.
5. Copy `deployment/red-envelope.env.example` to a private environment file outside Git, fill RPC and program ID, then run `node --env-file=/absolute/path/to/private.env scripts/red-envelope-setup.js inspect`. Review the deployed ProgramData hash and set `RED_ENVELOPE_PROGRAM_SHA256`.
6. Run setup commands `initialize`, `create-lookup`, `extend-lookup`, then `freeze-lookup`. Each defaults to simulation; owner execution requires `--execute --keypair /absolute/path/to/deployment-keypair.json`. Record each finalized transaction. Set the returned `RED_ENVELOPE_LOOKUP_TABLE` before extending. Freezing is irreversible. Never share keypair files in chat or Git.
7. On Render, create a separate Background Worker from the release commit, with build command `npm ci --include=dev` and initial start command `node scripts/red-envelope-keeper.js`. Copy the web service's DATABASE_URL and SOLANA_RPC_URL, plus the verified program ID/hash/lookup and snapshot authority. Install only the operator keypair as secret file `red-envelope-keeper.json`; set its path as shown in the example. Do not install the deployment key.
8. Run `node scripts/red-envelope-preflight.js` with the shared configuration and inspect the worker's read-only output. The release gate deliberately keeps readiness false until acceptance is complete.
9. After acceptance and deployment verification, release the source gate, set RED_ENVELOPE_ENABLED=true on web and worker, and change worker start command to `node scripts/red-envelope-keeper.js --execute`. Verify an enrolled launch, actual fee collection, randomness fulfillment and one finalized payout before advertising live rewards.

Creators choose 15 minutes, 1 hour, 2 hours or 4 hours. Existing tokens are not retroactively enrolled. Keep durable snapshots and action records during rollback so pending rounds remain recoverable.
