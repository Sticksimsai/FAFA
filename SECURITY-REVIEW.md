# Release review — 31 October 2026

This build is not security audited and is not cleared for an unrestricted mainnet launch.

## Verification completed

- Twenty-one automated tests pass: signature/message binding, wrong-key rejection, transaction tampering and missing signatures, exact integer/UTF-8 limits, unsafe image rejection, official SDK creation signers, domain/auth/replay checks, persistent draft/watchlist operations with a PostgreSQL emulator, empty truthful catalogue, dedicated token routing, event authenticity/deduplication, PumpSwap pool matching, OHLC aggregation without invented gaps, and bounded/coalesced RPC fetching, Chinese-only tickers, safe social links, translation failure/length handling, and canonical website binding through launch confirmation.
- Server syntax and browser bundle build pass.
- Read-only public-mainnet RPC check verified the full genesis hash and loaded the Pump global account using official SDK 4.3.1.
- No mainnet transaction was signed/submitted. No funded wallet/private key was used.

## Dependency findings

`npm audit --omit=dev` after updating direct fixable dependencies reports **14 affected packages: 7 high, 7 moderate, 0 critical**. These package counts include propagated dependency findings, not 14 distinct vulnerabilities.

Underlying advisory packages are `bigint-buffer`, `toml`, `stream-json`, and `uuid`, inherited through Pump/Anchor/Solana dependencies. The report is included at `security/npm-audit.json` with advisory URLs and dependency paths. Do not use an automatic major downgrade of Pump SDK as an audit fix: it can remove current protocol support. No untested cross-major override was applied.

Application exposure analysis is incomplete. This app does not accept TOML and uses Node's crypto.randomUUID for its own IDs, but these facts do not establish that dependency findings are unreachable throughout the SDK. Deployment/build environments can load native bigint bindings unlike the current environment. Review patched upstream versions or independently validated replacements before public launch.

## Required acceptance checks

- Real PostgreSQL persistence and restart behaviour; backup/restore; asset size/rate limits.
- Desktop Phantom and Solflare; wallet account changes, rejected messages and rejected transactions; mobile in-wallet browser.
- Low-value owner-controlled mainnet create/buy/sell and approved Jupiter pairs. Verify SDK fee and slippage output against transaction simulation and wallet review.
- Expired blockhashes, duplicate submit, timeout after broadcast, Jupiter maker-signature handling, failure status, and final order reconciliation.
- Domain-bound login, HTTPS/secure cookies, session expiry/logout and multi-user isolation on real PostgreSQL.
- API abuse protection and provider quotas; the included rate limiter is per process, designed for the single instance in the Blueprint.
- Browser visual/layout and integration QA. The managed browser preview infrastructure was unavailable during development.
- Stock token asset/issuer/eligibility approval remains entirely outstanding; stock trading is disabled.

Mainnet transaction preparation/submission is disabled by default. No server-held user signing key is required or supported.
