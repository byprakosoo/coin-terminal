# Coin Terminal

Private personal-finance and Bitcoin research terminal built with Next.js 16, Drizzle ORM, TiDB/MySQL, and Better Auth.

## Backend capabilities

- Email/password authentication with database-backed sessions and rate limits.
- User-isolated portfolio and spending ledgers using `DECIMAL` columns.
- Server-side Money Lover/portfolio CSV preview, fingerprints, duplicate detection, and transactional confirmation.
- Versioned BTC snapshots, evidence, signal history, freshness, and risk kill switches.
- Public-wallet watchlists and transfer ingestion from mempool.space and Etherscan V2.
- Smart-money/late-entry persistence, alerts, and evidence receipts.
- Authenticated assistant tools with persisted conversations and tool-call audit records.
- Idempotent cron job runs for market and wallet synchronization.

The application does not execute trades, store exchange credentials, or accept private keys, seed phrases, or wallet signatures.

## Local setup

1. Copy `.env.example` to `.env.local` and configure a MySQL-compatible database. TiDB Cloud uses port `4000` and normally requires `DATABASE_SSL=true`.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Apply the checked-in migration:

   ```bash
   npm run db:migrate
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

Register at `/register`. The first authenticated bootstrap creates an idempotent sample workspace; replace or clear it from Settings.

For Coolify, configure the production variables from `.env.example`, apply `npm run db:migrate` from the source checkout or CI before deploying the image, deploy the included multi-stage `Dockerfile`, and use `/api/health` for the health check.

## Scheduled jobs

Call these endpoints from Coolify cron with a bearer secret and a unique idempotency key:

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
```

Run market sync after the UTC daily candle is complete. The wallet job is intentionally conservative: raw token/native transfers are stored as transfers, not inferred buys or sells. The smart-money evaluator processes normalized `BUY`/`SELL` wallet events, enriches them with DEX Screener, applies late-entry precedence, and deduplicates alerts over a 24-hour cooldown.

## Useful commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
```

Financial records remain decimal strings between MySQL, Drizzle, the APIs, and `decimal.js`; no persisted financial value is intentionally converted to a JavaScript float.

Research only — not investment advice.
