# 发发 FāFā — Pump.fun / Solana integration candidate

**Status: implementation candidate, not a completed or audited mainnet launch.** The code includes real SDK transaction builders, wallet signing and backend persistence. No real transaction has been signed or submitted during development. The shipped configuration disables transaction preparation/submission. The existing ChatGPT-hosted demo is separate from this Render application.

## Implemented

- Chinese default UI, English toggle, animated hero, refined dark/lime UI, consistent SVG action icons and reduced-motion support.
- Phantom and Solflare injected browser wallets; detected/install states, explicit connection/signature progress, cancellation/retry, account-change cleanup and trusted matching-session restoration; signed, domain-bound, single-use login challenges; server sessions in HttpOnly SameSite cookies.
- PostgreSQL-backed drafts, watchlists, token metadata, raster images, prepared orders and confirmed launches.
- Official `@pump-fun/pump-sdk` 4.3.1: SOL-paired `create_v2`, SOL-quoted curve buy/sell transaction construction, current onchain state/fee reads, RPC simulation before signing.
- Mint keypair generated in the user's browser, used only to sign creation. No user private keys/seed phrases are sent to the server.
- Creator is always the signed-in wallet. No platform fee recipient, custody, tax, holder rewards or mayhem configuration is silently added.
- Strict transaction-message matching at submission, wallet/mint signature verification, duplicate-submission protection, transaction status checks. A submit response is not treated as confirmation.
- Jupiter Swap API v2 order/execute proxy; API key remains server-side. Default allowlist: SOL and USDC. The original signed message and user signature must match the stored order. Jupiter can add its own maker signatures during execution.
- Token catalogue contains only launches confirmed through this app. Search by full mint inspects other Pump coins. No fabricated market prices/activity/holders.
- Dedicated `/token/<mint>` terminal with responsive candlestick chart, 1m/5m/15m/1h aggregation, zoom/pan/crosshair, live confirmed trades, buy/sell filters and pagination. Buy/sell controls use the existing simulation, review and wallet-signing flow.
- Responsive live UI, order review, wallet approval, confirmation tracking and transaction history.
- Render Blueprint and GitHub Actions checks.

## Deliberate limitations / outstanding work

1. **Mainnet acceptance testing has not been completed.** Test a low-value create, buy, sell and SOL/USDC swap with your own wallet after configuring your RPC. Check rejected signatures, expiry, retries, a server restart and metadata retrieval. Review the transaction instructions in the wallet. Do not open public transactions before this review.
2. **Dependency audit findings remain in the upstream Solana/Pump dependency tree.** See `SECURITY-REVIEW.md`. Passing tests are not a security audit.
3. **Chinese stock token trading remains disabled.** BABAx is an integration candidate; Tencent/JD/Baidu labels are unverified concepts. There is no verified stock mint registry, issuer eligibility implementation, or stock pool integration. Do not add stocks to the generic allowlist as a shortcut.
4. **Only SOL-quoted Pump curves and SOL-paired creation are supported in this release.** Pump quote-asset capabilities can change. Other quote mints are rejected by this adapter. USDC in Jupiter does not imply USDC Pump launches.
5. **Graduated coins require an operator-verified Jupiter allowlist entry and an available route.** Direct PumpSwap pool trading and global token discovery/indexing are not implemented. The token page charts decoded confirmed trades from a bounded RPC window. It is not a complete historical index or global market feed. The global graduated filter remains unavailable.
6. **Token metadata/images are immutable records hosted at APP_ORIGIN.** They are not IPFS-pinned. Keep the origin/domain stable and PostgreSQL backed up for as long as issued tokens exist. Image hosting and database quotas need operational monitoring.
7. A single server instance is configured: rate limits are in memory. Add a shared rate-limit store before horizontal scaling. Database rows are durable but order confirmation currently occurs when an authenticated user checks history/status; no independent indexer/reconciler is deployed.
8. Browser wallet / mobile / visual E2E testing has not been completed in this environment. Phantom and Solflare extensions/in-wallet browsers are implemented; universal mobile deep links and a full Wallet Standard chooser are not.
9. Exchange-specific promotions, public community moderation/reporting, abuse operations, availability monitoring and production backups remain operator responsibilities. The UI does not imply geographic eligibility to trade stock products.

## Local development

Use Node 24 and PostgreSQL. Never paste keys into frontend files or commit `.env`.

```sh
npm ci
cp .env.example .env
# Configure DATABASE_URL, APP_ORIGIN, and a dedicated SOLANA_RPC_URL.
npm run build
npm run dev
```

Open `http://localhost:3000`. The server creates its tables on startup. `APP_ORIGIN` must exactly match the browser's scheme/host/port; use `localhost`, not `127.0.0.1`, if that is the configured origin. To run checks:

```sh
npm run check
```

Tests use pg-mem for the API persistence flows and mock only the database connection. This is not a substitute for a real PostgreSQL deployment test. No test signs or sends a real blockchain transaction. Test module mocking uses Node's experimental test API.

## GitHub → Render

1. Extract the source ZIP, create your GitHub repository and push the contents so `package.json` and `render.yaml` are at the repository root. No secret files are included.
2. In Render, create a **Blueprint** from that repository. The blueprint provisions a paid Node web service and paid PostgreSQL instance. Review the plans in Render before creating them.
3. Supply `APP_ORIGIN` (the exact final HTTPS service/custom-domain origin), `SOLANA_RPC_URL` (a dedicated mainnet endpoint), and `JUPITER_API_KEY` (your server-side key). PostgreSQL's internal connection string is wired automatically. If swaps are not needed initially, leave the Jupiter key unset/empty and keep swaps unavailable.
4. Build: `npm ci --include=dev && npm run build`. Start: `npm start`. Health check: `/healthz`. Render supplies `PORT`.
5. Keep `TRANSACTIONS_ENABLED=false` while validating health, bilingual UI, wallet login, drafts, watchlists, upload persistence, API rate limits, and DB backups. Verify that `.env` and API keys are absent from browser responses and bundled assets.
6. After security review, set `TRANSACTIONS_ENABLED=true` in a restricted-access staging deployment for owner-controlled mainnet acceptance tests. The chain adapter verifies the mainnet genesis hash. This is **real mainnet**, not a simulator; wallet confirmation can spend SOL/tokens. No keypair is stored on the server.
7. Verify creation, buy/sell, expected slippage limits, fees/rent in the wallet, rejection paths, blockhash expiry, interrupted requests, order-history confirmation, and data survival after restart. Resolve upstream security findings and conduct application review before public access.
8. Keep the same domain for token metadata. If you change it later, old mint metadata still points at the old origin.

`render.yaml` deliberately resets the transaction switch to false on a Blueprint sync. Once your launch acceptance is complete, update the Blueprint deliberately rather than relying on a hidden dashboard-only setting.

## API map

| Route | Purpose |
| --- | --- |
| `GET /api/config` | Public readiness/capabilities; no secret values |
| `POST /api/auth/challenge`, `/api/auth/verify` | Wallet signature login |
| `GET /api/me`, `POST /api/auth/logout` | Session identity/logout |
| `GET/PUT /api/draft` | Authenticated wallet's draft |
| `GET /api/watchlist`, `PUT/DELETE /api/watchlist/:mint` | Wallet's saved mints |
| `POST /api/assets` | Authenticated raster upload, limited to 2 MB |
| `GET /assets/:id`, `/metadata/:id` | Immutable public token assets |
| `GET /api/tokens`, `/api/token/:mint` | App launches / live Pump curve state |
| `GET /api/token/:mint/market?venue=curve&before=...` | Confirmed Pump curve or canonical PumpSwap trade events; paginated market data |
| `POST /api/launch/prepare` | Build and simulate unsigned create transaction |
| `POST /api/trade/prepare` | Build and simulate curve buy/sell |
| `POST /api/swap/prepare` | Jupiter executable order for allowed mints |
| `POST /api/orders/:id/submit` | Verify signed message and submit once |
| `GET /api/orders`, `/api/orders/:id` | Owner's history and chain confirmation |

## Reference material

- Pump official SDK: https://www.npmjs.com/package/@pump-fun/pump-sdk
- Official creation docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md
- Jupiter order/execute: https://developers.jup.ag/docs/swap/order-and-execute
- Render Blueprints: https://render.com/docs/blueprint-spec
- Alibaba issuer: https://assets.backed.fi/products/alibaba-xstock

## Brand options

| Name | Meaning / direction |
| --- | --- |
| **FāFā 发发** | Recommended. Short, playful, connected to the existing design. |
| Fāshè 发射 | Literally “launch”; direct and product-focused. |
| Jīncháo 金潮 | “Golden tide”; broader finance identity. |
| Lóngqǐ 龙起 | “Dragon rising”; Chinese cultural identity and momentum. |

These are creative candidates, not trademark/domain clearance. `branding/fafa-logo-concept.png` is the generated FāFā concept board. It is an exploratory raster identity, not a final vector master. The logo prompt requests an original lime/charcoal mark blending a Chinese seal with upward launch strokes and a FĀFĀ / 发发 lockup. Built-in image generation was used.

## Dedicated token terminal (v0.3)

Open `/token/<exact-Solana-mint>` on the Render origin. Homepage token details and mint-address search navigate here. No static redirect rule is needed: Express serves the page for valid mints.

The backend fetches 25 recent signatures for the curve or canonical SOL PumpSwap pool, decodes authenticated program events, excludes failed transactions and deduplicates CPI/log emissions. The frontend refreshes every 15 seconds while visible and supports loading older signature pages. Requests are cached/coalesced for 15 seconds; transaction concurrency is bounded. Your dedicated RPC must support `getSignaturesForAddress` and `getTransaction` with v0 transaction metadata. Public endpoints may rate-limit this workload. No new paid chart provider is required.

Candles use event execution prices in SOL per token, before the event's separate fees. Stats and change percentages refer only to loaded trades. Missing time buckets are not filled. Pagination is bounded per request; high-volume markets can have gaps between polling windows. This is not a full-market index, USD price feed, or streaming WebSocket service. The page labels partial/missing RPC data and keeps previous data visible if refresh fails. Different pools/DEXs are not aggregated.

The table displays up to 200 filtered rows; additional loaded trades still contribute to candles and loaded-window stats. RPC read capabilities work independently of the transaction enable switch. For graduated tokens, the page routes buy/sell through Jupiter only if its exact mint is allowlisted; the quote preview shows Jupiter's selected slippage. Stock tokens remain disabled.

## Creation experience (v0.4)

- `/create` is a full page with image drop/upload, live card preview, name, Chinese ticker, description, X/Twitter and Telegram fields.
- New tickers accept **1–13 Han characters**. This follows the documented Pump create_v2 symbol character limit; it is not a legacy Metaplex byte limit. Latin letters, digits, whitespace, emoji and punctuation are rejected by both client and server. Existing external ticker symbols are displayed accurately and are not renamed. Chinese name/ticker transactions still require real wallet/mainnet acceptance testing.
- Metadata includes `name`, `symbol`, `description`, `image`, `showName`, `createdOn`, `website`, `external_url`, and optional `twitter`/`telegram`. `createdOn` is this application's origin; it does not impersonate Pump.fun. Media support is PNG/JPEG/WebP, not video.
- The website field is read-only and generated as `APP_ORIGIN/token/<mint>`. The server rejects a client-supplied website override and builds the URL itself. Published metadata cannot be edited through the API. Changing a later draft does not change an earlier token.
- A confirmed launch shows a permanent token-page link. The create success URL and order history retain access after reload. A mint generated during unsubmitted editing is provisional; refreshing a draft can generate a new mint until a launch is confirmed.
- Wallet switching/disconnection clears local signing state; session restoration never automatically asks for a new signature. Phantom can restore only-if-trusted; Solflare is restored only when already connected. Mobile deep links remain outside this release.
- The screenshot's northeast-arrow glyph has been removed throughout source pages. Context-specific wallet, launch, document, chain-link, lock and copy icons replace it.

### English → Chinese ticker assistance

Six curated naming pairs work without an external service (e.g. Lucky cat → 招财猫). Free-form translation uses Google Cloud Translation Basic v2 from the server. Add `GOOGLE_TRANSLATE_API_KEY` to the Render service environment after enabling that API in your Google Cloud project; no key is shipped in the browser or source. The create page explains when text will be sent to this provider. If no key is configured, curated examples remain available and arbitrary requests return a clear unavailable response.

Translations are not automatically shortened or substituted. If a result is longer than the ticker policy or contains non-Han characters, the user must shorten/edit it. The user explicitly applies a valid suggestion; it never overwrites the field automatically.

New endpoints: `POST /api/translate/ticker` (authenticated and rate limited) and `GET /api/token/:mint/record` (confirmed token record, including immutable website/social metadata). The startup migration adds a `metadata` JSONB column to existing `tokens` tables without modifying prior token records.

## Wallet and terminal update

Standalone Swap navigation and its form have been removed. Trading lives at `/token/<mint>`; Jupiter remains an internal route for supported graduated tokens. The terminal includes candle intervals, confirmed trade history refreshed every 15 seconds, buy/sell previews, creator/date/raw metadata for site-created tokens, and metadata on mobile. External Pump mints without a local record show their address and onchain state; external metadata indexing is not implemented.

Wallet login now separates provider connection from a user-clicked message-signing step. Pending requests, provider denial and backend origin errors are distinguished. A provider denial cannot be bypassed: open the extension and review its prompt. Tests do not replace browser extension acceptance testing.

## Quote-asset selection

Create supports explicit SOL selection and a BABAx stock-pair draft option. BABAx is not enabled for issuance or trading; choosing it updates the preview and can be saved, while both client and server block launch. A supported stock-quote launch/pool adapter, verified issuer mint and asset eligibility handling are still required. The app never substitutes SOL for a selected stock quote.

Bundled artwork under /assets now falls through to static hosting when its path is not a database-upload UUID. A regression test checks the actual WebP response.
