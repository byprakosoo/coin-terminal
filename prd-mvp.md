# Coin Terminal — Product Requirements Document

| Field | Value |
|---|---|
| Status | Draft, implementation-aligned MVP baseline |
| Version | 1.0 |
| Last updated | 2026-07-14 |
| Audience | Product, engineering, QA, and operations |
| Product surface | Authenticated web application |

This document is the product and acceptance baseline for Coin Terminal. Operational setup and runbooks remain in `README.md`; implementation details may evolve as long as the behavior and safety constraints in this PRD remain true.

## 1. Product Summary

Coin Terminal is a private personal-finance and Bitcoin research workspace. It combines a crypto transaction ledger, spending analysis, explainable BTC research, monitored public-wallet activity, late-entry risk warnings, and a data-grounded portfolio assistant.

The product is designed for an individual who wants one auditable place to answer:

- What do I own, what did it cost, and how is it performing?
- How are my income and expenses changing?
- What does the current BTC evidence show, and how fresh is it?
- What activity is visible from public wallets without overstating identity or intent?
- What data is missing before I rely on an answer?

Coin Terminal is research software. It does not execute trades, custody funds, guarantee returns, or replace financial, tax, or legal advice.

### Product principles

1. **Evidence before interpretation.** Research outputs show source, observation time, freshness, calculation period, rule version, and caveats.
2. **Uncertainty is visible.** Missing, stale, conflicting, inferred, or unverified data is labeled and can halt directional output.
3. **Private by default.** Every personal record and conversation is scoped to the authenticated account.
4. **Deterministic finance.** Ledger and spending calculations use decimal arithmetic and do not depend on a language model.
5. **No false authority.** Public transfers are not silently relabeled as trades, model agreement is not a win probability, and research is not presented as personalized execution advice.

## 2. Goals and Success Criteria

### Goals

- Give the user an accurate, editable record of portfolio and spending activity.
- Make portfolio value, allocation, average cost basis, realized P&L, unrealized P&L, and data-quality gaps understandable.
- Publish a daily, explainable BTC research verdict from independent completed-candle sources.
- Keep a separate defensive BTC model behind historical-validation and shadow-observation gates.
- Monitor permitted public-wallet data and surface smart-money proxy events with strong late-entry risk precedence.
- Answer user questions from authenticated, allowlisted data selectors with traceable source receipts.
- Operate on free or free-tier data where practical without evading provider controls or implying premium-data equivalence.

### MVP success criteria

The MVP is acceptable when all of the following are true:

- A user can register, complete onboarding, sign in, sign out, and cannot access another user's data.
- A user can create, edit, delete, import, and export portfolio records and see deterministic recalculation.
- A user can import a Money Lover-compatible CSV through mapping, preview, validation, deduplication, and explicit confirmation.
- Every BTC output displays its mode, availability, freshness, rule version, evidence, and source links.
- Missing, stale, or materially disagreeing required BTC market sources halt the directional model instead of fabricating confidence.
- Public-wallet ingestion preserves the source transaction type; observed transfers are not presented as buys or sells.
- The assistant returns a grounded deterministic answer when no model provider is configured or when model output fails safety checks.
- Scheduled jobs are authenticated, idempotent, observable, and safe to retry.
- Core calculation, authorization, signal, wallet, import, and assistant tests pass.

### Non-goals

- Exchange connectivity, order placement, automated rebalancing, or copy trading.
- Custody of assets or storage of private keys, seed phrases, wallet signatures, or exchange credentials.
- Guaranteed, predictive, or prescriptive investment outcomes.
- Proof that a public wallet belongs to an institution, insider, or skilled trader.
- Tax-lot reporting, tax filing, accounting certification, or financial planning.
- Scraping authenticated services or bypassing access controls, CAPTCHA, rate limits, or provider terms.
- Arkham, Nansen, Bloomberg, Dune, or other paid integrations without approved licensing and credentials.
- Push, email, or SMS alerts in the MVP; alerts are in-app only.

## 3. Users and Primary Jobs

### Primary user

An individual investor or researcher who manually manages their own financial records and independently decides whether to act outside Coin Terminal.

### Primary jobs to be done

- Maintain a complete multi-asset crypto ledger.
- Review current holdings and performance without spreadsheet formulas.
- Consolidate spending exports and compare monthly cash flow.
- Inspect a BTC verdict and understand why it is `BUY`, `SELL`, `WATCH`, or halted.
- Distinguish research-only, shadow, and validated strategy states.
- Monitor selected public addresses while preserving uncertainty about wallet identity and intent.
- Ask natural-language questions and receive answers consistent with the dashboard.

## 4. MVP Scope

### Navigation

`Overview` · `Portfolio` · `Spending` · `BTC Research` · `Smart Money` · `Ask Portfolio` · `Settings`

### Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 | Authentication and isolation | Users can register, sign in, sign out, and access only records owned by their authenticated account. Protected pages and APIs reject unauthenticated access. |
| FR-02 | Onboarding | A new user accepts the research disclaimer and sets display currency and timezone before entering the terminal. |
| FR-03 | Portfolio ledger | Users can create, edit, delete, import, and export `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `REWARD`, `AIRDROP`, and `FEE` records. Invalid ledger sequences, such as selling more than the available balance, are rejected. |
| FR-04 | Price entry | The transaction form may suggest a market price, but the user-entered execution price and fee are authoritative. |
| FR-05 | Portfolio analytics | The system calculates balances, allocation, average cost basis, current value, daily change, realized P&L, unrealized P&L, and incomplete-basis warnings. |
| FR-06 | Auditable imports | Users can upload a CSV of at most 10 MB, map columns, preview accepted/duplicate/invalid rows, and persist only explicitly confirmed rows. |
| FR-07 | Spending analysis | Users can manage normalized income and expense records and view monthly totals, savings, savings rate, category totals, and month-over-month expense change. |
| FR-08 | Overview | The dashboard summarizes portfolio value, allocation, spending, the latest BTC state, the latest smart-money event, source freshness, and data-quality warnings. |
| FR-09 | BTC research verdict | A daily versioned BTC/USD research evaluation uses persisted evidence and publishes `BUY`, `SELL`, `WATCH`, or a halted state without placing an order or prescribing allocation. |
| FR-10 | Defensive BTC model | A separate defensive allocation model is historically validated, observed in shadow mode, and promoted only after every gate passes. Failed gates remain visible and are never silently relaxed. |
| FR-11 | Strategy acknowledgment and reconciliation | Users can mark a ready, validated, non-`WATCH` signal as skipped or reconcile it against a manually recorded execution. Acknowledgment never triggers a trade. |
| FR-12 | Public-wallet watchlist | Users can add supported public addresses, label them, optionally self-attest ownership/control, enable or disable monitoring, and inspect source-linked events. Unsupported ingestion paths remain visibly snapshot-only. |
| FR-13 | Smart-money proxy | Only qualified wallets and normalized `BUY`/`SELL` events may contribute to token-flow clusters. Events show evidence, DEX liquidity/volume context, and an `EARLY`, `CONFIRMED`, `EXTENDED`, or `AVOID` state. |
| FR-14 | Alerts | The system creates in-app research or late-entry alerts and deduplicates the same token, chain, and alert type for 24 hours. |
| FR-15 | Ask Portfolio | The assistant answers questions about the user's portfolio, transactions, spending, BTC evidence, smart-money events, and data quality through authenticated selectors. |
| FR-16 | Auditability | Imports, market snapshots, candles, validation runs, signals, evidence, acknowledgments, wallet events, alerts, job runs, conversations, and assistant generation modes are timestamped and traceable. |

## 5. Core Product Behavior

### 5.1 Portfolio ledger and calculations

- `BUY` increases quantity and cost basis by executed value plus fee.
- `SELL` reduces quantity using average-cost basis and realizes proceeds minus fee and released cost.
- `TRANSFER_IN`, `REWARD`, and `AIRDROP` increase quantity. If acquisition value is absent, the holding is marked as having incomplete basis.
- `TRANSFER_OUT` reduces quantity and its proportional average-cost basis without realizing a sale.
- `FEE` remains in the ledger and reduces realized result as applicable.
- Fully sold assets may disappear from open holdings, but their realized P&L remains in the portfolio total.
- Persisted quantities and financial values remain decimal strings from database through API and calculation layers.
- The system must not allow a `SELL` or `TRANSFER_OUT` that exceeds the available quantity at that point in ledger history.

### 5.2 CSV imports

1. User selects either a spending or portfolio import.
2. System detects the file encoding and parses header-based CSV data.
3. User maps required and optional columns.
4. System normalizes dates, amounts, direction, transaction types, currencies, and symbols.
5. System computes a user-scoped fingerprint and separates accepted, duplicate, and invalid rows.
6. User reviews the preview and explicitly confirms.
7. Confirmation is transactional and idempotent; unconfirmed and invalid rows do not enter a ledger.

Money Lover spending imports require date, amount, and transaction direction. Category, account, note, and currency are optional. Portfolio imports require asset, transaction type, quantity, price, and date; fee, venue, and note are optional.

### 5.3 BTC research verdict

The research lane is a continuous, research-only market verdict. Its current frozen baseline is `btc-consensus-research-v2.1.0`.

| Factor | Weight | Required behavior |
|---|---:|---|
| Price momentum | 25% | Derived from completed daily closes. |
| Trend | 25% | Uses completed-candle moving-average context. |
| Mean reversion | 20% | Uses RSI-derived evidence. |
| Volatility | 15% | Penalizes elevated realized volatility and can trigger a kill switch. |
| CFTC institutional positioning | 10% | Uses official CME Bitcoin Asset Manager/Institutional futures positioning as a delayed, bounded proxy. |
| Public-wallet context | 5% | Uses the prior seven days of qualified, observed BTC transfers as bounded context. |

Rules:

- Evaluate after the completed UTC daily candle is available.
- Require at least 51 completed closes from both Coinbase BTC/USD and Binance BTC/USDT.
- Halt when either market source is missing or their completed-candle consensus differs by more than 1.5%.
- Treat required market data older than 24 hours as stale.
- Publish `BUY` at a composite score of at least 70 and `SELL` at a score of at most 30 only when freshness and risk gates permit; otherwise publish `WATCH` or halted availability.
- Force `WATCH` when the volatility kill threshold is reached.
- Persist the inputs, score, evidence rows, source timestamps, freshness, source agreement, rule version, and summary.
- Missing or over-age CFTC data remains neutral and reduces evidence strength; it does not fabricate institutional activity.
- CFTC futures positioning may represent hedges and must never be described as proof of spot buying or superior performance.
- Wallet movements are transfer context only and must never be described as verified buys, sells, or institutional intent.
- The research verdict is not a model allocation, win probability, or execution instruction.

### 5.4 Defensive BTC strategy lifecycle

The defensive lane is separate from the continuous research verdict. Its current frozen baseline is `btc-defensive-v2.0.0`.

The model:

- Uses completed daily candles, SMA50/SMA200 trend, 90-day and 180-day momentum, 30-day realized volatility, and explicit hard-exit conditions.
- Changes a model BTC target in 10-percentage-point steps, with a maximum target of 50%.
- Requires five consecutive risk-on closes before increasing the target, two risk-off closes before a normal decrease, and a 10-day buy cooldown.
- Moves the model target to 0% on a hard-exit trigger and requires 10 consecutive risk-on closes before recovery.
- Models next-candle execution and transaction costs for validation; it never submits an order.

Lifecycle gates:

1. **Historical validation:** run independently against both market datasets with base and stressed transaction costs. Each source needs at least 365 daily candles.
2. **Acceptance:** require positive aggregate strategy return; no aggregate or yearly drawdown below -20%; better Sortino and Calmar than a static 50/50 benchmark; downside capture below 60%; at least 75% nonnegative yearly folds; and drawdown no worse than -20% under 50 bps stress cost.
3. **Rejected:** persist every failure reason. Continue showing the separate research verdict, but do not relabel a rejected model as validated.
4. **Shadow:** a historical pass starts a 180-ready-close shadow period. Shadow output is observable but not actionable.
5. **Validated:** promotion requires at least 180 elapsed shadow days and 180 ready shadow signals. A validated label describes passed gates, not guaranteed performance.
6. **Reconciliation:** for a ready, unexpired, validated, non-`WATCH` signal, a user can mark it skipped or record what they independently executed and compare it with the signal. The app does not infer execution from acknowledgment.

### 5.5 Public wallets and smart-money proxy

Supported classifications:

| Classification | Meaning |
|---|---|
| `USER_VERIFIED` | The user self-attested ownership or control of the public address. This is not cryptographic identity proof or evidence of skill. |
| `PUBLICLY_ATTRIBUTED` | The address has a manually reviewed public attribution source. |
| `HIGH_PERFORMANCE_PROXY` | Reconstructed history meets the defined performance and behavior thresholds. |
| `UNVERIFIED_WHALE` | Large activity may be visible, but identity, profitability, or intent is unverified. |
| `EXCLUDED` | Known service, exchange, bridge, contract, mixer, or suspicious address excluded from qualification. |

A wallet can be classified `HIGH_PERFORMANCE_PROXY` only when it has at least 20 reconstructed closed positions, positive realized historical performance, a win rate of at least 55%, a median holding period over 30 minutes, activity within 30 days, and no dominant service, transfer, or wash-like behavior.

Provider ingestion requirements:

- Use mempool.space for configured BTC public-address activity and Etherscan V2 for supported EVM activity.
- Solana addresses may be stored, but remain visibly snapshot-only until a permitted Solana ingestion adapter is configured.
- Preserve raw/native/token transfers as transfers unless a separate normalized source proves a swap or trade.
- Curated registry classifications cannot be overwritten through the user API.
- A self-attested BTC address may affect only the bounded personal public-wallet context.
- Every event links to its public transaction source and records the observation time.

Smart-money events:

- Evaluate only normalized `BUY` and `SELL` wallet events from qualified wallets in the previous 24 hours.
- Create a candidate when at least two qualified wallets net-buy the same token or one qualified wallet records a buy of at least $100,000.
- Require positive net buying and a supported DEX pair before creating an event.
- Show chain, token contract, pair, qualified-wallet count, net observed value, timing, liquidity, volume, price movement, source links, and risk factors.

Late-entry precedence:

| Status | Conditions and behavior |
|---|---|
| `AVOID` | Takes precedence for liquidity below $250,000, pair age below 24 hours, concentration above 70%, sharp reversal, suspicious pattern, or stale/incomplete required data. |
| `EXTENDED` | Price move above 35%, RSI at least 70, or observed buy-volume trend below -20%. Create a high-risk warning. |
| `CONFIRMED` | At least two qualified wallets and a price move of 15–35%, with no higher-priority risk state. |
| `EARLY` | Qualified buying remains below the 15% extension threshold and no higher-priority risk state applies. |

### 5.6 Ask Portfolio

Supported selector families:

| Selector | Purpose |
|---|---|
| `getPortfolioSummary` | Holdings, allocation, cost basis, P&L, and data-quality warnings. |
| `getAssetPerformance` | Asset-level position and performance detail. |
| `getTransactions` | Filtered authenticated ledger history. |
| `getSpendingSummary` | Monthly cash flow, categories, and comparison periods. |
| `getBtcSignalExplanation` | Current BTC mode, availability, evidence, lifecycle, and freshness. |
| `getSmartMoneyEvents` | Public-wallet proxy events, entry state, and risk factors. |
| `getDataQualityReport` | Missing prices, stale snapshots, and incomplete acquisition basis. |

Assistant requirements:

- Run an authenticated deterministic selector before any model synthesis.
- Inject account identity on the server; never accept `user_id` from model-generated arguments.
- Use Vercel AI Gateway when configured, direct OpenAI as a secondary provider, and the deterministic response when neither path succeeds.
- Exclude profile name, email, record IDs, fingerprints, and free-form transaction or spending notes from model context.
- Limit model context to allowlisted financial fields and bounded recent history.
- Reject model text that gives direct trade/allocation instructions, guarantees returns, or violates the research-only boundary.
- Persist selector name, generation mode, model identifier when present, source receipts, and a categorized fallback reason.
- Include “Research only — not investment advice” in investment-related answers.
- Make assistant values agree with the same deterministic calculations used by the dashboard.

## 6. User Flows

### First-time setup

1. User registers and signs in.
2. User accepts the research-only disclaimer.
3. User selects timezone and display currency.
4. User records or imports portfolio transactions.
5. User optionally imports spending history and adds public wallet addresses.
6. Overview displays empty, complete, stale, or incomplete states honestly based on available data.

### Daily BTC research

1. Authenticated job fetches independent completed daily candles and supporting context.
2. System validates source availability, age, and cross-source agreement.
3. System persists immutable market evidence before generating outputs.
4. Research verdict runs continuously; the defensive model runs in its current lifecycle mode.
5. User opens BTC Research and reviews mode, availability, evidence, freshness, validation results, and track record.
6. User may acknowledge the state, act independently outside the app, and manually reconcile an execution.

### Wallet monitoring

1. User adds a supported public address and an optional label or self-attestation.
2. System validates the chain/address pair and assigns a conservative classification.
3. Authenticated jobs ingest permitted public activity without changing transfers into trades.
4. Only eligible normalized events reach smart-money evaluation.
5. User reviews the source links and late-entry state before drawing a conclusion.

### Assistant question

1. User asks a question in an authenticated conversation.
2. Server chooses an allowlisted deterministic selector and retrieves user-scoped data.
3. The grounded answer and source receipts are created.
4. Optional model synthesis may improve phrasing but cannot replace the computed facts or safety rules.
5. Response discloses sources, freshness, caveats, generation mode, and fallback state where applicable.

## 7. Data and Architecture Requirements

### Technical baseline

| Layer | Baseline |
|---|---|
| Web | Next.js App Router, React, TypeScript, Tailwind CSS, and accessible UI primitives. |
| Authentication | Better Auth with database-backed sessions and protected server routes. |
| Data | TiDB or MySQL 8-compatible database through Drizzle ORM. |
| Calculations | `decimal.js` with `DECIMAL` persistence for financial values. |
| Market data | CoinGecko for portfolio market context; Coinbase and Binance for independent BTC daily history; CFTC for official weekly futures positioning; DEX Screener for token-pair context. |
| Chain data | mempool.space for BTC public addresses and Etherscan V2 for configured EVM chains. |
| AI | Deterministic selectors with optional Vercel AI Gateway or direct OpenAI synthesis. |
| Jobs | Authenticated, idempotent internal job routes invoked by Vercel Cron, Coolify, or an equivalent scheduler. |
| Deployment | Vercel or the included Docker image on a compatible host. |

### Core data domains

- Identity: users, sessions, accounts, verification, and auth rate limits.
- Finance: import batches/rows, portfolio transactions, and spending transactions.
- Research: data sources, snapshots, candles, rule versions, signals, evidence, strategy profiles, validation runs, acknowledgments, and reconciliations.
- Wallet intelligence: watchlist wallets, wallet events, token-flow events, contributing wallets, and alerts.
- Assistant: conversations, messages, tool calls, source summaries, generation modes, and fallback reasons.
- Operations: job runs and API rate limits.

### Data constraints

- Store timestamps in UTC and render them in the user's selected timezone.
- Store fiat values and token quantities in fixed-precision decimal columns; do not persist JavaScript floating-point results.
- Scope every private query by authenticated user identity.
- Keep database access, provider requests, and secrets server-side.
- Restrict imports to CSV files of 10 MB or less.
- Hash or fingerprint import content for deduplication without exposing it to the model.
- Store source observation time separately from fetch and evaluation time where applicable.
- Prefer visible stale or missing states over silently reusing untrustworthy data.

### Scheduled jobs

The production schedule must preserve this order:

1. Wallet sync after the prior monitoring window closes.
2. Historical defensive validation before daily strategy evaluation, and monthly thereafter.
3. Daily BTC strategy after the completed UTC candle is available.
4. Smart-money evaluation after eligible normalized wallet events and DEX context are available.

Every job requires bearer authentication, a unique idempotency key, persisted status, bounded retries, and an observable failure result. Scheduling precision may vary by host, but a job must not process an incomplete daily candle.

## 8. Security, Privacy, and Safety

- Enforce session and ownership checks in every protected route and data-access function.
- Rate-limit authentication, imports, assistant messages, and provider-facing jobs.
- Do not expose server secrets or provider credentials to client bundles.
- Do not accept or store private wallet material or exchange credentials.
- Sanitize uploads and reject unsupported file types, oversized files, invalid mappings, and invalid rows.
- Treat user records and prior conversation text as data, not as trusted model instructions.
- Audit model-provider authentication, billing, rate-limit, empty-response, provider-error, and unsafe-response fallbacks without leaking secrets.
- Never claim observed public-wallet activity proves identity, intent, inside knowledge, or investment skill.
- Never describe model agreement, confidence, validation, or historical performance as a guaranteed probability of profit.

## 9. UX and Accessibility Requirements

- Use a dark, compact, evidence-first terminal design with readable financial figures.
- Never rely on color alone; every state has a textual label and accessible contrast.
- Show source, timestamp, freshness, rule version, and evidence near every BTC and smart-money interpretation.
- Clearly distinguish `OBSERVED`, `CALCULATED`, `INFERRED`, `UNVERIFIED`, `STALE`, `MISSING`, and `HALTED` states.
- Give `AVOID`, `EXTENDED`, stale, incomplete-basis, and halted warnings visual priority over positive signals.
- Provide intentional empty states that explain the next safe action.
- Keep destructive actions, including record and conversation deletion, behind explicit confirmation.
- Use English for the MVP interface, validation messages, assistant responses, and documentation.

## 10. Quality and Release Acceptance

### Required automated coverage

- Unit tests for decimal portfolio calculations, realized P&L after a position closes, oversell validation, spending conversion, CSV normalization, fingerprints, BTC research rules, defensive strategy rules, backtests, lifecycle gates, wallet qualification, late-entry precedence, and assistant routing/safety.
- Integration tests for authentication, user isolation, imports, idempotent jobs, source disagreement, stale data, provider failures, persisted evidence, signal reconciliation, wallet restrictions, and assistant audit records.
- End-to-end tests for registration/onboarding, sign-in errors, portfolio create/edit/delete/import/export, Money Lover import, BTC evidence display, wallet management, late-entry warnings, assistant answers, settings, and conversation deletion.

### Release checklist

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes with production-like environment validation.
- Database migrations apply cleanly to an empty supported database.
- Protected routes return no private data without a valid session.
- Cross-user access attempts are denied at the server.
- Cron routes reject missing or invalid credentials and safely deduplicate repeated calls.
- BTC research visibly halts on missing or disagreeing required market sources.
- Assistant deterministic fallback works with all model credentials removed.
- Research-only disclosures appear on BTC research, smart-money, and investment-related assistant surfaces.

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Free providers are unavailable, delayed, or throttled | Cache responsibly, apply bounded retries/backoff, persist job failures, and display stale/missing states. |
| Independent market sources diverge | Halt directional output beyond the configured consensus threshold. |
| CFTC data is delayed or misinterpreted | Bound its weight, neutralize stale/missing data, and label futures positioning as a proxy that may include hedges. |
| Wallet transfers are mistaken for trades | Preserve transfer types and require separately normalized `BUY`/`SELL` evidence for smart-money evaluation. |
| Historical results are treated as promises | Separate research, shadow, and validated modes and repeat the non-guarantee disclosure. |
| Incomplete ledger history distorts cost basis | Mark incomplete basis, identify missing prices, and prevent the assistant from hiding data-quality gaps. |
| Model output contradicts calculations or gives advice | Ground answers deterministically, allowlist context, filter unsafe output, and fall back without a model. |
| Scheduled jobs run twice or out of order | Require idempotency keys, persist job runs, and enforce completed-candle/source readiness. |

## 12. Delivery Sequence

1. **Foundation:** application shell, authentication, account isolation, database schema, Docker, and deployment baseline.
2. **Finance:** portfolio ledger, spending ledger, decimal calculations, imports, exports, and overview.
3. **BTC research:** independent source ingestion, immutable evidence, continuous research verdict, and track record.
4. **Defensive strategy:** backtesting, validation acceptance, lifecycle state, shadow observation, acknowledgment, and reconciliation.
5. **Wallet monitoring:** watchlists, public-source ingestion, conservative classification, and evidence receipts.
6. **Smart-money risk:** eligible flow aggregation, DEX enrichment, late-entry precedence, and deduplicated in-app alerts.
7. **Assistant:** authenticated selectors, deterministic responses, optional model synthesis, privacy filtering, and audit records.
8. **Release hardening:** authenticated end-to-end coverage, production migrations, cron verification, provider-failure drills, and security review.
9. **Post-MVP:** consider licensed data adapters and additional notification channels only after cost, terms, privacy, and reliability are approved.

---

Research only — not investment advice.
