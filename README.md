# Coin Terminal

Coin Terminal is a private, self-hostable personal-finance and Bitcoin research
workspace. It brings portfolio accounting, spending analysis, explainable market
research, public-wallet monitoring, and a data-grounded assistant into one
auditable application.

The project is built for people who want to understand their financial data
without handing an application exchange credentials, private keys, or authority
to trade on their behalf.

> Research only — not investment advice. Coin Terminal does not execute trades,
> custody assets, or guarantee returns.

## Why Coin Terminal exists

Personal-finance apps, portfolio trackers, and crypto research dashboards usually
solve separate parts of the same problem. Moving between them makes it difficult
to trace a conclusion back to the transaction, price snapshot, market source, or
calculation that produced it. Crypto products can also overstate what public
wallet transfers reveal or present opaque model output as a recommendation.

Coin Terminal fills that gap with an evidence-first design:

- Personal records are isolated by authenticated account.
- Portfolio and spending calculations use deterministic decimal arithmetic.
- Imports are previewed, validated, deduplicated, and explicitly confirmed.
- BTC research records its sources, timestamps, freshness, rule version, and
  rejection reasons.
- Conflicting, stale, or missing market data halts directional output instead of
  fabricating confidence.
- Public-wallet transfers remain transfers unless a separate source proves a
  trade; wallet identity and intent are never inferred from movement alone.
- The portfolio assistant starts with authenticated, allowlisted selectors and
  falls back to a deterministic answer if model synthesis is unavailable or
  violates the product's safety boundary.

## What it includes

- **Portfolio ledger:** multi-asset transactions, average-cost basis, fees,
  realized and unrealized P&L, allocation, data-quality warnings, CSV import, and
  export.
- **Spending analysis:** Money Lover-compatible imports, income and expense
  normalization, monthly comparisons, categories, savings, and carryovers.
- **Portfolio recap:** saved net-worth snapshots and IDR/USD reporting.
- **BTC research:** completed-candle consensus from Coinbase and Binance, bounded
  CFTC and public-wallet context, evidence receipts, backtesting, and a separately
  gated defensive strategy.
- **Public-wallet research:** BTC and EVM watchlists, source-linked transfers,
  conservative wallet qualification, and late-entry risk classification.
- **Ask Portfolio:** natural-language questions answered from the same
  deterministic calculations shown by the dashboard, with optional model
  synthesis and persisted source receipts.
- **Operations:** authenticated and idempotent scheduled jobs for market, wallet,
  smart-money, and strategy updates.

## Project reach and impact

Coin Terminal is an early-stage project under active development, so it does not
yet have package-registry downloads or known downstream dependents. Development
on the current main branch began in July 2026. As of July 23, 2026, the repository
contains 166 source files and 101 automated test cases across 19 test files,
covering financial calculations, ledger validation, imports, wallet
qualification, research signals, backtesting, strategy lifecycle, and assistant
privacy and safety.

Its impact today is the gap it addresses: there are few self-hostable tools that
combine personal cash-flow and portfolio accounting with explainable Bitcoin
research while treating uncertainty, provenance, privacy, and non-custodial
safety as first-class product requirements. Coin Terminal provides both a usable
personal terminal and a concrete reference for developers exploring auditable
financial software.

The intended users are individual investors, researchers, and self-hosters who
currently rely on disconnected spreadsheets, finance exports, portfolio
trackers, and market dashboards. The next stage of the project is to make setup
easier, publish clearer contributor guidance, harden provider integrations, and
grow a community around transparent, non-custodial financial research.

## How the Claude Max subscription will support the project

I will use the Claude Max subscription primarily through Claude Code as a
development and maintenance tool for Coin Terminal. The additional capacity will
support repository-wide work that is difficult to complete reliably in short,
disconnected sessions:

- reviewing architecture and cross-cutting changes across the UI, API, database,
  scheduled jobs, and provider integrations;
- debugging market-data edge cases and improving graceful handling of stale,
  missing, rate-limited, or conflicting sources;
- expanding tests for decimal financial calculations, authentication and
  account isolation, migrations, import idempotency, and research-rule
  regressions;
- reviewing privacy and security boundaries around personal financial data and
  model context;
- refactoring complex research and strategy code without weakening its frozen
  rules, evidence receipts, or safety gates; and
- maintaining documentation, contributor guidance, issue triage, and release
  notes as the project grows.

As the solo maintainer, I will use the subscription to shorten the feedback loop
between implementation, review, testing, and documentation. All generated
changes will remain subject to human review and automated checks. Claude will not
be given production financial records, make investment decisions, or become a
runtime requirement for deterministic portfolio and spending calculations.

## Technology

- Next.js 16 and React 19
- TypeScript and Tailwind CSS
- Drizzle ORM with TiDB or MySQL 8
- Better Auth
- Vitest and Testing Library
- Vercel or Docker/Coolify deployment

## Local setup

### Prerequisites

- Node.js 20.9 or newer
- A MySQL 8-compatible database

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Configure the required database, authentication, application URL, and cron
   values in `.env.local`. TiDB Cloud normally uses port `4000` with
   `DATABASE_SSL=true`.

4. Apply the checked-in migrations:

   ```bash
   npm run db:migrate
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000/register` and create an account.

The first authenticated bootstrap creates an empty private ledger and provider
metadata. Production does not insert demo financial records or demo signals.

## Configuration

The required and optional variables are documented in `.env.example`.

- A model credential is optional. Without one, Ask Portfolio returns its
  authenticated deterministic answer.
- Ask Portfolio can save multiple per-user OpenAI, Claude/Anthropic, Kimi, or
  OpenAI-compatible model configurations. API keys are encrypted server-side;
  run `npm run db:migrate` after deploying the `ai_model_configs` migration.
- Set `AI_CREDENTIALS_ENCRYPTION_KEY` in production when you want a separate
  encryption key for saved AI credentials; it falls back to `BETTER_AUTH_SECRET`.
- Vercel deployments can use the project-scoped OIDC token with AI Gateway.
- Direct OpenAI access is an optional secondary synthesis provider.
- Etherscan credentials are only required for supported EVM wallet ingestion.
- Free-form notes, record IDs, fingerprints, profile names, and email addresses
  are excluded from model context.

## Scheduled jobs

`vercel.json` defines daily wallet and BTC research jobs and a monthly defensive
strategy validation job. For Coolify or manual operation, call the internal job
routes with the cron bearer secret and a unique idempotency key:

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

Run market sync after the completed UTC daily candle is available. Historical
strategy validation should run before the daily strategy job and monthly
thereafter. Failed acceptance gates are persisted with their rejection reasons
and are never silently relaxed into an actionable result.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Additional commands:

```bash
npm run test:live-signal
npm run db:generate
npm run db:migrate
npm run db:studio
```

The live-signal audit calls external data providers and is intentionally separate
from the deterministic default test suite.

## Safety boundaries

Coin Terminal intentionally does not:

- connect to exchanges or place orders;
- store exchange credentials, private keys, seed phrases, or wallet signatures;
- treat a public transfer as proof of a buy, sale, identity, or trading skill;
- turn model agreement into a probability of profit;
- allow a language model to calculate or overwrite persisted financial values; or
- replace financial, tax, or legal advice.

Persisted financial values remain decimal strings between MySQL, Drizzle, the
API, and `decimal.js`; they are not intentionally converted to JavaScript
floating-point values.
