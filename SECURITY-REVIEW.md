# Release review — 31 October 2026

This build is not security audited and is not cleared for an unrestricted mainnet launch.

## Verification completed

- Thirty-six automated tests pass: signature/message binding, wrong-key rejection, transaction tampering and missing signatures, exact integer/UTF-8 limits, unsafe image rejection, official SDK creation signers, domain/auth/replay checks, persistent draft/watchlist operations with a PostgreSQL emulator, empty truthful catalogue, dedicated token routing, event authenticity/deduplication, PumpSwap pool matching, OHLC aggregation without invented gaps, and bounded/coalesced RPC fetching, Chinese-only tickers, safe social links, translation failure/length handling, and canonical website binding through launch confirmation.
- Server syntax and browser bundle build pass.
- Read-only public-mainnet RPC check verified the full genesis hash and loaded the Pump global account using official SDK 4.3.1.
- No mainnet transaction was signed/submitted. No funded wallet/private key was used.

## Dependency findings

`npm audit --omit=dev` reports **2 affected packages: 0 high, 2 moderate, 0 critical**. The remaining reports are the `stream-json` parser and its parent `jayson`. These counts include propagated findings. The report is in `security/npm-audit.json`.

The vulnerable native `bigint-buffer` converter has been replaced through an npm override with a local, bounds-checked JavaScript adapter (`vendor/bigint-buffer`). It implements the four conversion functions used by token layouts, contains no native bindings or install script, and rejects values that do not fit the requested width. Tests cover endian round trips, full-width u64 layouts, invalid sizes, SDK transaction construction and clean installation. This is an application-owned replacement, not a patched upstream release or independent security audit.

Overrides pin `toml` to 5.0.1 and Jayson's `uuid` to 11.1.1. A clean `npm ci`, the full test suite and browser build pass with these changes. No Pump/Solana downgrade was applied.

`stream-json` 3.x uses an incompatible ESM/path API; it cannot safely replace Jayson's 1.x dependency with a version-only override. The application uses Web3's HTTP JSON-RPC client and does not expose Jayson's streaming server. This narrows the observed exposure but is not a proof that every SDK path is unaffected. Keep the remaining advisories visible pending an upstream-compatible fix.

## Required acceptance checks

- Real PostgreSQL persistence and restart behaviour; backup/restore; asset size/rate limits.
- Desktop Phantom and Solflare; wallet account changes, rejected messages and rejected transactions; mobile in-wallet browser.
- Low-value owner-controlled mainnet create/buy/sell and approved Jupiter pairs. Verify SDK fee and slippage output against transaction simulation and wallet review.
- Expired blockhashes, duplicate submit, timeout after broadcast, Jupiter maker-signature handling, failure status, and final order reconciliation.
- Domain-bound login, HTTPS/secure cookies, session expiry/logout and multi-user isolation on real PostgreSQL.
- API abuse protection and provider quotas; the included rate limiter is per process, designed for the single instance in the Blueprint.
- Browser visual/layout and integration QA. The managed browser preview infrastructure was unavailable during development.
- BABAx issuer mint and Raydium approval/config accounts have been checked read-only. Funded two-stage launch, swaps, LP receipt and issuer eligibility remain acceptance tasks. The operator controls the separate stock transaction switch.

Mainnet transaction preparation/submission is disabled by default. No server-held user signing key is required or supported.

The production domain is https://tryfafa.xyz. Wallet challenges remain origin-bound; do not bypass the check to fix a deployment mismatch. Background order reconciliation now handles closed browsers and guards against late mint confirmation downgrading a completed pool launch.
