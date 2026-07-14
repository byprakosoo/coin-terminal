# Coin Terminal

Private personal-finance and Bitcoin research terminal built with Next.js 16, Drizzle ORM, TiDB/MySQL, and Better Auth.

## Backend capabilities

- Email/password authentication with database-backed sessions and rate limits.
- User-isolated portfolio and spending ledgers using `DECIMAL` columns.
- Server-side Money Lover/portfolio CSV preview, fingerprints, duplicate detection, and transactional confirmation.
- Frozen, hash-verified BTC rules: a continuous research-only Coinbase/Binance consensus verdict with official CFTC institutional-positioning context, plus a separately gated defensive allocation model with historical acceptance, shadow signals, freshness halts, and execution reconciliation.
- Public-wallet watchlists and transfer ingestion from mempool.space and Etherscan V2.
- Smart-money/late-entry persistence, alerts, and evidence receipts.
- Authenticated portfolio-assistant selectors with optional OpenAI Responses API synthesis, deterministic fallback, persisted source receipts, and generation-mode audit records.
- Idempotent cron job runs for market and wallet synchronization.

The application does not execute trades, store exchange credentials, or accept private keys, seed phrases, or wallet signatures.

## Local setup

1. Copy `.env.example` to `.env.local` and configure a MySQL-compatible database. TiDB Cloud uses port `4000` and normally requires `DATABASE_SSL=true`.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Apply the checked-in migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

Register at `/register`. The first authenticated bootstrap creates an empty private ledger, provider metadata, and the reviewed public-wallet watchlist; production does not insert demo financial records or demo signals.

For Coolify, configure the production variables from `.env.example`, apply `npm run db:migrate` from the source checkout or CI before deploying the image, deploy the included multi-stage `Dockerfile`, and use `/api/health` for the health check.

## Scheduled jobs

The checked-in `vercel.json` schedules wallet sync daily at `00:00` UTC, monthly defensive validation at `01:00` UTC on day one, and daily BTC research at `02:00` UTC. Each expression runs at most once per day so it is accepted on Vercel Hobby. The separate hours preserve the required order despite Hobby's hourly scheduling precision. Vercel calls each route with `GET` and automatically supplies `Authorization: Bearer $CRON_SECRET` when that environment variable is configured.

For Coolify or manual operation, call these endpoints with a bearer secret and a unique idempotency key:

```bash
curl -X POST http://localhost:3000/api/internal/jobs/market-sync \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Idempotency-Key: market-$(date -u +%F)"

curl -X POST http://localhost:3000/api/internal/jobs/wallet-sync \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Idempotency-Key: wallets-$(date -u +%Y-%m-%dT%H)"

curl -X POST http://localhost:3000/api/internal/jobs/smart-money-evaluate \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Idempotency-Key: smart-money-$(date -u +%Y-%m-%dT%H)"

curl -X POST http://localhost:3000/api/internal/jobs/btc-strategy-validate \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Idempotency-Key: btc-validation-$(date -u +%Y-%m)"

curl -X POST http://localhost:3000/api/internal/jobs/btc-strategy-daily \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Idempotency-Key: btc-strategy-$(date -u +%F)"
```

Run market sync after the UTC daily candle is complete. Run historical strategy validation before the daily strategy job and monthly thereafter. A historical pass starts a 180-ready-close shadow period; a failure is persisted with every rejection reason and never silently relaxed into an actionable recommendation. The daily job still publishes a separate research-only weighted verdict when the defensive model is rejected. Version `btc-consensus-research-v2.1.0` uses completed Coinbase BTC/USD and Binance BTC/USDT candles, halts on missing/disagreeing market sources, gives a bounded 10% weight to the CFTC's official weekly CME Bitcoin Asset Manager/Institutional futures positioning, and gives a separate 5% weight to the prior seven days of qualified monitored BTC wallet transfers. CFTC positions may be hedges and are delayed; wallet transfers are never relabeled as buys or sells. Missing or over-age CFTC data stays neutral and reduces evidence strength instead of fabricating institutional activity.

The wallet job is intentionally conservative: raw token/native transfers are stored as transfers, not inferred buys or sells. A user-added address remains unverified unless the user explicitly self-attests ownership or control; that statement is not cryptographic identity proof or evidence of trading skill. Self-attested BTC movements may contribute only to the bounded personal public-wallet context. Curated registry classifications cannot be overwritten through the user API. The smart-money evaluator processes only normalized `BUY`/`SELL` wallet events, enriches them with DEX Screener, applies late-entry precedence, and deduplicates alerts over a 24-hour cooldown.

`Ask Portfolio` always runs a deterministic authenticated selector first. On Vercel it uses the project-scoped `VERCEL_OIDC_TOKEN` to call AI Gateway with `AI_GATEWAY_MODEL` (default `openai/gpt-5.6-luna`), so no long-lived model secret is required. The Vercel team must still satisfy AI Gateway customer verification/billing setup before requests are serviced. Local/non-Vercel environments can set `AI_GATEWAY_API_KEY`. Direct OpenAI via `OPENAI_API_KEY` is the secondary provider, and the deterministic answer is returned if neither model path succeeds. Model text that contains direct trade/allocation instructions or guaranteed-return language is discarded in favor of that grounded answer. The UI and persisted tool-call record disclose which path generated each response, including authentication, billing, rate-limit, empty-response, and safety-guard fallback categories. Free-form transaction/spending notes, record IDs, fingerprints, profile name, and email are excluded from model context.

## Useful commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:live-signal
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
```

Financial records remain decimal strings between MySQL, Drizzle, the APIs, and `decimal.js`; no persisted financial value is intentionally converted to a JavaScript float.

Research only — not investment advice.
