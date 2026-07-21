# Coin Terminal Portfolio Recap — Product Requirements Document

| Field | Value |
|---|---|
| Status | Approved for implementation |
| Version | 1.0 |
| Last updated | 2026-07-14 |
| Product | Coin Terminal |
| Feature | Portfolio Recap, Gold Tracking, Annual Growth, and XLSX Backup |
| Product surface | Authenticated web application |
| Canonical recap currency | IDR |
| Audience | Product, engineering, QA, operations, and AI implementation agents |

This document is the normative product and acceptance specification for replacing the user's recurring `Portofolio.xlsx` workflow with persisted features in Coin Terminal. An implementation may organize code differently, but it must preserve every behavior, calculation, safety boundary, and acceptance criterion in this PRD.

The repository's existing broad product requirements remain applicable. This document takes precedence when a portfolio-recap requirement is more specific.

## 1. Product Context

The user currently maintains portfolio history manually in `Portofolio.xlsx`:

- `Income History` stores dated allocation snapshots for Bank, RDPU, IHSG, S&P 500, BTC, ETH, Altcoin, and Gold.
- `Overview` visualizes total net worth and allocation through five charts.
- `Gold` records gold purchases and sales.
- `Annual Recap` records salary and annual net-worth growth.

The user wants the web application to become the system of record for those workflows. The spreadsheet remains necessary only as a downloadable backup in the same recognizable workbook format.

The existing Coin Terminal portfolio ledger is transaction-based and USD-native. Bank balances, mutual funds, index exposure, and manually valued assets are not naturally represented by that ledger. This feature therefore introduces a separate IDR-native snapshot system. The existing ledger is not replaced or rewritten; it supplies supported crypto values when preparing a new snapshot.

## 2. Goals and Success Criteria

### 2.1 Goals

- Let the user record, review, edit, and delete dated whole-portfolio snapshots without opening a spreadsheet.
- Show whether total net worth is growing and how the latest allocation is distributed.
- Prefill supported crypto and gold values while keeping every snapshot value editable.
- Track physical-gold purchases, sales, holdings, cost basis, and manual market valuations.
- Calculate annual net-worth change, year-over-year growth, and true compound annual growth.
- Import the user's existing workbook through an audited preview and conflict-resolution flow.
- Download an XLSX backup that preserves the workbook's sheets, styles, formulas, hidden sheet, and charts.
- Keep all personal workbook content private and scoped to the authenticated account.

### 2.2 Success criteria

The feature is complete only when all of the following are true:

1. A signed-in user can maintain portfolio snapshots for all eight fixed categories in IDR.
2. Multiple snapshots in the same month are allowed and retain deterministic ordering.
3. A new snapshot can be prefilled from prior manual values, the existing crypto ledger, current market data, FX data, gold transactions, and a manual gold valuation.
4. Saved snapshots remain frozen even when market prices or FX rates later change.
5. Overview treats the latest recap as total net worth and clearly separates the existing transaction-ledger value.
6. Gold calculations remain correct after inserting, editing, or deleting an older transaction.
7. Annual rows use a selected or deterministic closing snapshot and show YoY growth plus true net-worth CAGR.
8. The existing `Portofolio.xlsx` data can be previewed, merged, deduplicated, conflict-resolved, and confirmed transactionally.
9. A downloaded backup opens as a valid XLSX with all 11 original sheets, the hidden `Temp` sheet, and five working Overview charts.
10. The seven unmanaged sheets retain the content from the user's confirmed template.
11. No workbook binary, personal financial value, database URL, password, or authentication secret is committed to source control.
12. Typecheck, tests, build, migration verification, API smoke tests, and workbook structural and visual checks pass.

## 3. Product Decisions

The following decisions are final for version 1 and must not be reopened during implementation.

| Topic | Decision |
|---|---|
| Monthly workflow | Hybrid prefill followed by user review and editing. |
| Existing history | Import the existing workbook through an idempotent audited flow. |
| Backup shape | Preserve the complete workbook template and all 11 sheets. |
| Canonical currency | Store all recap, gold, salary, and annual values in IDR. |
| Allocation categories | Fixed to Bank, RDPU, IHSG, S&P 500, BTC, ETH, Altcoin, and Gold. |
| Same-month entries | Allow multiple snapshots; warn but do not block. |
| Gold market price | Manual dated IDR price per gram; no live provider in version 1. |
| Annual metrics | Show annual change, YoY growth, and true date-adjusted net-worth CAGR. |
| CAGR meaning | Net-worth growth including contributions and withdrawals, not investment return. |
| App location | Dedicated `Portfolio Recap` navigation page with four tabs. |
| Overview source | Latest recap is primary net worth; ledger value remains separate. |
| Import overlap | Preview and merge; exact duplicates skip, conflicts require explicit resolution. |
| Unmanaged worksheets | Preserve from the imported template but do not edit them in the app. |
| Workbook storage | Private per-user database binary; never a public or repository asset. |
| Export technique | Selective OOXML patching with `jszip` and `fast-xml-parser`; do not round-trip the workbook through ExcelJS. |

## 4. Scope

### 4.1 In scope

- Portfolio Recap navigation and page.
- Monthly snapshot CRUD and deterministic calculations.
- Hybrid snapshot prefill with source and freshness metadata.
- Five recap visualizations on Overview.
- Gold transaction and valuation CRUD.
- Gold holdings and profit/loss calculations.
- Annual recap settings and calculations.
- Chunked XLSX upload, workbook preview, deduplication, conflict resolution, and confirmation.
- Private workbook-template retention.
- Full-format XLSX backup generation and streaming download.
- Import audit integration and personal-data deletion.
- Database migrations, shared types, validation, server services, tests, and documentation.

### 4.2 Non-goals

- Custom or user-defined allocation categories.
- Automatic bank, broker, mutual-fund, or gold-price integrations.
- Editing `Milestones`, `Monthly Exp`, `TP Strategy`, `FIRE Calculator`, `Stocks`, `Crypto`, or `Temp` through the app.
- Replacing the existing crypto transaction ledger.
- Automatically creating ledger transactions from recap snapshots.
- Tax-lot accounting, tax reports, or accounting certification.
- Time-weighted return, money-weighted return, or XIRR based on contributions and withdrawals.
- Trade execution, rebalancing, allocation advice, or guaranteed-return claims.
- Public workbook links or anonymous import/export access.

## 5. Terminology and Ordering Rules

| Term | Definition |
|---|---|
| Snapshot | A frozen set of eight IDR allocation values as of a user-selected date. |
| Snapshot sequence | A positive integer that orders snapshots sharing the same `asOfDate`. |
| Latest snapshot | Highest `asOfDate`, then highest `sequence`, then latest creation time. |
| Previous snapshot | The immediately preceding record in ascending date/sequence order. |
| Manual categories | Bank, RDPU, IHSG, and S&P 500. Their default values are carried forward. |
| Ledger-prefilled categories | BTC, ETH, and Altcoin, valued from the existing ledger where data is available. |
| Altcoin | Every open ledger holding except BTC and ETH, including stablecoins and other tokens. |
| Gold valuation | A dated manual IDR market price per gram. |
| Annual closing snapshot | The snapshot used as that year's net-worth value. |
| Managed sheets | `Overview`, `Income History`, `Gold`, and `Annual Recap`. |
| Unmanaged sheets | The other seven sheets retained from the template without app editing. |
| Active template | The most recently confirmed source workbook stored for future backup generation. |

Snapshot ordering must never depend on database natural order. The service assigns `sequence = max(sequence for user/date) + 1` transactionally. When an imported record is kept alongside an existing sequence collision, it receives the next available sequence.

## 6. Functional Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| PR-FR-01 | Authentication and isolation | Every recap page, API, query, workbook upload, template, and export is scoped by the authenticated `userId`. Unauthenticated access returns `401`; another user's identifier returns `404` or equivalent non-disclosing failure. |
| PR-FR-02 | Portfolio Recap navigation | The primary navigation includes `Portfolio Recap` near `Portfolio`. The page route is `/portfolio-recap` and contains Monthly, Gold, Annual, and Backup tabs. |
| PR-FR-03 | Snapshot CRUD | Users can create, inspect, edit, and delete snapshots containing the eight fixed categories, date, and optional note. All numeric values are nonnegative decimal strings. |
| PR-FR-04 | Same-month snapshots | Saving when the same calendar month already contains a snapshot shows a warning listing the existing entries. The user may continue without replacing them. |
| PR-FR-05 | Frozen snapshots | Saved category values and the saved FX rate do not change after a provider refresh. Editing requires an explicit user action. |
| PR-FR-06 | Hybrid prefill | A prefill request returns carried-forward manual values, ledger-derived crypto values, gold value, the FX rate, field-level provenance, missing-price assets, and warnings. |
| PR-FR-07 | Editable prefill | Every prefilled category can be overridden before saving. The saved metadata records whether each field was carried, calculated, manually entered, overridden, or unavailable. |
| PR-FR-08 | Snapshot analytics | The system calculates liquid, stocks, crypto, total net worth, per-category allocation, absolute change, and percentage change deterministically with `decimal.js`. |
| PR-FR-09 | Overview net worth | Latest snapshot total is the primary net-worth metric. If no snapshot exists, show an explicit empty state rather than silently substituting ledger value. Ledger value is shown separately as tracked holdings. |
| PR-FR-10 | Overview charts | Show total history, latest eight-category allocation, grouped allocation, crypto split, and stock split. Empty/zero data produces an accessible empty state, not an invalid chart. |
| PR-FR-11 | Gold transaction CRUD | Users can create, edit, and delete BUY and SELL records with date, gold type, grams, unit price, venue, and note. |
| PR-FR-12 | Gold valuation CRUD | Users can create, edit, and delete manual dated IDR-per-gram valuations. The latest valuation on or before an as-of date is used. |
| PR-FR-13 | Gold calculations | Calculate grams held, remaining cost basis, weighted-average cost, gross purchases, grams sold, sale proceeds, realized P/L, market value, and unrealized P/L. |
| PR-FR-14 | Gold sequence safety | A sale that exceeds holdings at that chronological point is rejected. Editing or deleting an older transaction reruns the whole sequence and is rejected if it would invalidate any later sale. |
| PR-FR-15 | Annual recap | Show each represented year, monthly salary, closing date/value, gain/loss, average monthly net-worth change, YoY growth, and the overall CAGR. |
| PR-FR-16 | Annual closing selection | Default to the latest snapshot in the year. Users may pin another snapshot from that year. Deleting a pinned snapshot clears the pin and falls back to the latest remaining snapshot. |
| PR-FR-17 | Workbook upload | Uploads use authenticated 2 MiB chunks, resumable session metadata, checksums, size validation, and expiration. A workbook is never accepted directly as an oversized single request. |
| PR-FR-18 | Workbook validation | Validate XLSX ZIP structure, required sheet names, expected managed-sheet headers, compressed and uncompressed limits, and reject encrypted, macro-enabled, or malformed files. |
| PR-FR-19 | Workbook preview | Preview displays accepted, duplicate, conflict, invalid, and skipped-placeholder rows grouped by source sheet with source row numbers and issues. Nothing enters financial tables before confirmation. |
| PR-FR-20 | Import conflict resolution | Every conflict requires `KEEP_APP`, `USE_WORKBOOK`, or `KEEP_BOTH` where supported. Annual year conflicts support only `KEEP_APP` and `USE_WORKBOOK`. |
| PR-FR-21 | Transactional confirmation | Confirmation applies accepted rows and resolutions, activates the template, updates the import audit, and cleans staging data in one recoverable workflow. Partial financial imports are not permitted. |
| PR-FR-22 | Template replacement | Confirming a later workbook atomically replaces the previous active binary after successful import. Historical import-batch audit records remain. |
| PR-FR-23 | Full workbook backup | Export regenerates the four managed sheets from current database data and preserves the seven unmanaged sheets and all unrelated package parts from the active template. |
| PR-FR-24 | Chart-compatible backup | Export updates worksheet data, formulas, formula results, chart references, and chart caches so charts display current data before and after spreadsheet recalculation. |
| PR-FR-25 | Streaming export | Export uses a Node streaming response with private/no-store headers and a dated `.xlsx` filename. It must work when the archive exceeds the normal Vercel response payload limit. |
| PR-FR-26 | Import audit | `PORTFOLIO_XLSX` batches appear in Settings audit with accepted, duplicate, conflict, and invalid counts and confirmation time. Workbook binary content is not returned there. |
| PR-FR-27 | Clear personal data | Clearing personal data also deletes snapshots, gold records, annual settings, staged chunks, active template, and recap import records. |
| PR-FR-28 | Privacy | Workbook bytes are never sent to an AI provider, logged, cached publicly, included in bootstrap, or exposed in client state after the upload flow ends. |

## 7. Calculation Requirements

All persisted and API financial values are decimal strings. Authoritative calculations use `decimal.js`; application code must not use JavaScript floating-point arithmetic for business results. Conversion to `number` is allowed only at the final presentation boundary required by a charting component, after the displayed value has already been calculated as a decimal string.

### 7.1 Snapshot totals

For snapshot `s`:

```text
liquidIdr = bankIdr + rdpuIdr
stocksIdr = ihsgIdr + sp500Idr
cryptoIdr = btcIdr + ethIdr + altcoinIdr
totalIdr = liquidIdr + stocksIdr + cryptoIdr + goldIdr
```

For each category or group `x`:

```text
allocationPct(x) = totalIdr > 0 ? x / totalIdr * 100 : 0
```

Against the previous snapshot `p`:

```text
increaseIdr = s.totalIdr - p.totalIdr
changePct = p.totalIdr > 0 ? increaseIdr / p.totalIdr * 100 : unavailable
```

This deliberately uses the previous total as the percentage denominator, even if an old spreadsheet formula used a different denominator.

If the snapshot has a positive frozen `idrPerUsd`:

```text
totalUsd = totalIdr / idrPerUsd
```

### 7.2 Snapshot prefill

Given an `asOf` date:

1. Bank, RDPU, IHSG, and S&P 500 default to the values from the latest prior snapshot. If none exists, default to `0` and mark them `MANUAL_REQUIRED`.
2. Calculate ledger quantities through the requested date using existing ledger rules.
3. Value BTC from symbol `BTC` and ETH from symbol `ETH`.
4. Value every other open ledger holding into Altcoin.
5. Prefer the latest persisted market price observed on or before the requested as-of timestamp. For a current-date recap, the current fresh/delayed market snapshot may be used.
6. If any open asset lacks a price, do not silently count it as zero without warning. Include its symbol in `missingAssetPrices`, mark the affected field incomplete, and let the user enter a value.
7. Use the latest positive IDR-per-USD rate available on or before the valuation timestamp. Return the rate and observation time.
8. Calculate gold grams through the as-of date and multiply by the latest manual valuation on or before that date. If no valuation exists, return gold as unavailable and prompt for a price or manual value.
9. All fields remain editable. Overrides are frozen as the saved values.

Prefill metadata must record enough source context to explain the proposal without storing a full copy of the ledger or provider payload.

### 7.3 Gold accounting

Sort gold transactions by `occurredOn`, then `createdAt`, then `id`.

For a BUY:

```text
purchaseCost = grams * unitPriceIdr
heldGrams = heldGrams + grams
remainingCostBasis = remainingCostBasis + purchaseCost
averageCostPerGram = remainingCostBasis / heldGrams
```

For a SELL:

```text
releasedCost = grams * averageCostPerGramBeforeSale
saleProceeds = grams * unitPriceIdr
realizedPnl = realizedPnl + saleProceeds - releasedCost
heldGrams = heldGrams - grams
remainingCostBasis = max(0, remainingCostBasis - releasedCost)
```

At a selected valuation:

```text
marketValueIdr = heldGrams * valuationPricePerGramIdr
unrealizedPnlIdr = marketValueIdr - remainingCostBasis
unrealizedPnlPct = remainingCostBasis > 0 ? unrealizedPnlIdr / remainingCostBasis * 100 : unavailable
```

`grossPurchaseCostIdr`, `soldGrams`, and `saleProceedsIdr` are lifetime totals and remain separate from remaining cost basis.

### 7.4 Annual recap

For each year with a snapshot or annual setting:

- `closingSnapshot` is the pinned snapshot when valid; otherwise the latest snapshot in that year.
- `netWorthIdr` is the closing snapshot total.
- `gainLossIdr` is current closing net worth minus the prior represented year's closing net worth.
- `yoyPct` is `gainLossIdr / priorNetWorthIdr * 100` when prior net worth is positive.
- `monthlySalaryIdr` is a manual input and does not affect growth calculations.
- `averageMonthlyChangeIdr` divides gain/loss by the number of whole calendar-month boundaries between closing snapshots, with a minimum divisor of one. For the first represented year, divide closing net worth by the number of elapsed calendar months from January through its closing month.

Overall CAGR uses the first and latest valid annual closing snapshots:

```text
elapsedYears = elapsedDays / 365.2425
cagrPct = ((latestNetWorth / firstNetWorth) ^ (1 / elapsedYears) - 1) * 100
```

CAGR is unavailable when there are fewer than two valid closing snapshots, either endpoint is nonpositive, or elapsed days are zero. The UI must state: `Net-worth CAGR includes contributions and withdrawals; it is not investment return.`

## 8. Data Model

Use the project's existing UUID, timestamp, `money(30,8)`, `quantity(38,18)`, JSON, ownership, index, and mapper conventions.

### 8.1 `portfolio_snapshots`

| Column | Type and rule |
|---|---|
| `id` | UUID primary key |
| `user_id` | Required FK to users, cascade delete |
| `import_batch_id` | Nullable FK to import batches, set null on batch deletion |
| `as_of_date` | Required SQL `DATE` |
| `sequence` | Required positive integer |
| `source` | `MANUAL`, `HYBRID_PREFILL`, or `XLSX_IMPORT` |
| `bank_idr` | Nonnegative money |
| `rdpu_idr` | Nonnegative money |
| `ihsg_idr` | Nonnegative money |
| `sp500_idr` | Nonnegative money |
| `btc_idr` | Nonnegative money |
| `eth_idr` | Nonnegative money |
| `altcoin_idr` | Nonnegative money |
| `gold_idr` | Nonnegative money |
| `idr_per_usd` | Nullable positive money frozen at save time |
| `prefill_metadata` | Nullable typed JSON with source timestamps, field provenance, and warnings |
| `note` | Nullable text, maximum 5,000 characters at validation layer |
| `fingerprint` | Nullable 64-character user-scoped hash |
| `created_at`, `updated_at` | Millisecond timestamps |

Indexes and constraints:

- Index `(user_id, as_of_date, sequence)`.
- Unique `(user_id, fingerprint)` when fingerprint is non-null.
- Unique `(user_id, as_of_date, sequence)`.
- No unique month constraint.

### 8.2 `gold_transactions`

| Column | Type and rule |
|---|---|
| `id` | UUID primary key |
| `user_id` | Required FK, cascade delete |
| `import_batch_id` | Nullable FK, set null |
| `transaction_type` | `BUY` or `SELL` |
| `occurred_on` | Required SQL `DATE` |
| `gold_type` | Required string, maximum 120; use `Unspecified` only for an explicitly accepted import warning |
| `grams` | Positive quantity |
| `unit_price_idr` | Positive money |
| `venue` | Nullable string, maximum 160 |
| `note` | Nullable text, maximum 5,000 characters |
| `fingerprint` | Nullable user-scoped hash |
| `created_at`, `updated_at` | Millisecond timestamps |

Indexes: `(user_id, occurred_on)` and unique `(user_id, fingerprint)` when non-null.

### 8.3 `gold_valuations`

| Column | Type and rule |
|---|---|
| `id` | UUID primary key |
| `user_id` | Required FK, cascade delete |
| `import_batch_id` | Nullable FK, set null |
| `as_of_date` | Required SQL `DATE` |
| `price_per_gram_idr` | Positive money |
| `source` | `MANUAL` or `XLSX_IMPORT` |
| `note` | Nullable text, maximum 1,000 characters |
| `fingerprint` | Nullable user-scoped hash |
| `created_at`, `updated_at` | Millisecond timestamps |

Multiple valuations on one date are allowed. The most recently created record wins for that date.

### 8.4 `annual_recap_settings`

| Column | Type and rule |
|---|---|
| `id` | UUID primary key |
| `user_id` | Required FK, cascade delete |
| `year` | Required integer, 1900–2200 |
| `monthly_salary_idr` | Nullable nonnegative money |
| `closing_snapshot_id` | Nullable FK to portfolio snapshots, set null on deletion; service verifies same user and year |
| `created_at`, `updated_at` | Millisecond timestamps |

Unique `(user_id, year)`.

### 8.5 Workbook storage and staging

`portfolio_workbook_templates` contains one active row per user:

- UUID, user FK, source import-batch FK, filename, SHA-256 checksum, MIME type, byte size, `longblob` content, activation time, and timestamps.
- Unique `user_id`.
- Never include `content` in bootstrap, list endpoints, logs, or client JSON.

`portfolio_workbook_uploads` tracks upload sessions:

- UUID, user FK, filename, expected SHA-256, total bytes, total chunks, status, expiration, and timestamps.
- Status: `UPLOADING`, `READY`, `PREVIEWED`, `CONFIRMED`, `FAILED`, or `EXPIRED`.

`portfolio_workbook_upload_chunks` stores authenticated chunks:

- Upload FK, zero-based chunk index, byte size, chunk SHA-256, binary content, timestamp.
- Composite primary key `(upload_id, chunk_index)`.
- Cascade delete with upload session.

### 8.6 Import model changes

- Add `PORTFOLIO_XLSX` to `import_batches.source`.
- Add `CONFLICT` to `import_rows.status`.
- Add `conflict_rows` count to import batches and the public `ImportBatch` type.
- XLSX normalized rows include `entity`, `sourceSheet`, `sourceRow`, normalized fields, candidate fingerprint, existing record ID when conflicting, and supported resolutions.
- Existing CSV import behavior must remain backward compatible.

## 9. Public Types and API Contracts

### 9.1 Required public types

Add typed decimal-string interfaces for:

- `PortfolioSnapshotValues`
- `PortfolioSnapshot`
- `SnapshotFieldSource`
- `SnapshotPrefillMetadata`
- `PortfolioSnapshotSummary`
- `GoldTransaction`
- `GoldValuation`
- `GoldSummary`
- `AnnualRecapSetting`
- `AnnualRecapRow`
- `PortfolioRecapSummary`
- `WorkbookTemplateSummary`
- `WorkbookUploadSession`
- `WorkbookImportPreview`
- `WorkbookImportConflict`
- `WorkbookConflictResolution`

`SnapshotFieldSource` must support at least:

```text
MANUAL_REQUIRED
CARRIED_FORWARD
LEDGER_CALCULATED
GOLD_CALCULATED
WORKBOOK_IMPORTED
USER_OVERRIDE
UNAVAILABLE
```

### 9.2 Read model

`GET /api/portfolio-recap`

Returns:

```text
{
  snapshots: PortfolioSnapshot[],
  latestSummary?: PortfolioSnapshotSummary,
  gold: {
    transactions: GoldTransaction[],
    valuations: GoldValuation[],
    summary: GoldSummary
  },
  annual: {
    settings: AnnualRecapSetting[],
    rows: AnnualRecapRow[],
    cagrPct?: DecimalString
  },
  template: WorkbookTemplateSummary
}
```

The template summary contains availability, filename, checksum, size, and activation time only.

### 9.3 Snapshot endpoints

- `GET /api/portfolio-recap/prefill?asOf=YYYY-MM-DD`
- `POST /api/portfolio-recap/snapshots`
- `PATCH /api/portfolio-recap/snapshots/:id`
- `DELETE /api/portfolio-recap/snapshots/:id`

Create and patch accept the eight category decimal strings, `asOfDate`, optional `idrPerUsd`, prefill metadata, source, and note. Server validation and calculations are authoritative.

Delete returns `204`. If annual settings referenced the snapshot, database `SET NULL` activates the documented fallback.

### 9.4 Gold endpoints

- `POST /api/portfolio-recap/gold/transactions`
- `PATCH /api/portfolio-recap/gold/transactions/:id`
- `DELETE /api/portfolio-recap/gold/transactions/:id`
- `POST /api/portfolio-recap/gold/valuations`
- `PATCH /api/portfolio-recap/gold/valuations/:id`
- `DELETE /api/portfolio-recap/gold/valuations/:id`

Every gold mutation recalculates and returns or invalidates the gold summary. Sequence-invalid mutations return `422` with code `INSUFFICIENT_GOLD_BALANCE` and identify the first failing sale date without exposing another user's data.

### 9.5 Annual endpoint

`PUT /api/portfolio-recap/annual/:year`

Body:

```text
{
  monthlySalaryIdr?: DecimalString,
  closingSnapshotId?: string | null
}
```

An omitted or null closing snapshot uses automatic latest-in-year behavior.

### 9.6 Workbook upload and import endpoints

1. `POST /api/portfolio-recap/workbook/uploads`
   - Accepts filename, byte size, full SHA-256, and total chunk count.
   - Returns upload ID, required 2 MiB chunk size, and one-hour expiry.
2. `PUT /api/portfolio-recap/workbook/uploads/:uploadId/chunks/:index`
   - Accepts raw binary and chunk checksum.
   - Is idempotent when the same chunk/checksum is retried.
3. `POST /api/portfolio-recap/workbook/uploads/:uploadId/preview`
   - Verifies all chunks and full checksum, validates and parses the workbook, creates a `PREVIEW` import batch, and returns grouped preview rows.
4. `POST /api/portfolio-recap/workbook/imports/:batchId/confirm`
   - Accepts a resolution for every conflict.
   - Applies import and activates the template.
5. Existing `GET /api/imports` includes the resulting audit summary without binary content.

Use rate limits consistent with existing import APIs. Minimum limits are five new workbook sessions per user per hour and enough chunk requests to upload a 20 MiB file twice without accidental throttling.

### 9.7 Export endpoint

`GET /api/portfolio-recap/export`

- Node runtime only.
- Requires an active template; otherwise returns `409` with `WORKBOOK_TEMPLATE_REQUIRED`.
- Returns a streamed XLSX with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Filename: `coin-terminal-portofolio-backup-YYYY-MM-DD.xlsx`.
- Headers include `Cache-Control: private, no-store` and safe `Content-Disposition`.

## 10. User Experience Requirements

### 10.1 Portfolio Recap page

Use the established Coin Terminal component system, dark visual language, responsive breakpoints, loading states, toast behavior, dialogs, tables, and accessibility conventions.

Header:

- Eyebrow: `Whole-portfolio history`
- Title: `Portfolio Recap`
- Description explains that snapshots are frozen IDR records separate from the trade ledger.
- Primary action on Monthly: `Add recap`.

Tabs:

1. `Monthly`
2. `Gold`
3. `Annual`
4. `Backup`

Tab selection should be addressable through a query parameter such as `?tab=gold` so refresh and direct links preserve context.

### 10.2 Monthly tab

Show:

- Latest net worth, change since prior snapshot, liquid total, stocks total, crypto total, and gold total.
- Total-history chart and latest allocation chart.
- Snapshot table with date, total, absolute/percentage change, category summary, source, note indicator, and edit/delete actions.
- Empty state explaining how to create or import the first recap.

The add/edit form must:

- Default `asOfDate` to today in the profile timezone.
- Offer `Prefill values` and visibly label each field source.
- Display FX and market observation times and incomplete-price warnings.
- Group fields as Liquid, Stocks, Crypto, and Gold without changing the fixed underlying categories.
- Format IDR for readability while sending decimal strings.
- Warn about same-month records before final save.
- Never change a value merely because a provider refresh occurs while the form is open; refreshing prefill is explicit.

### 10.3 Gold tab

Show:

- Held grams, latest valuation price/date, market value, remaining cost basis, average cost, realized P/L, and unrealized P/L.
- Separate transaction and valuation actions.
- Chronological transaction table with BUY/SELL badge, type, grams, unit price, total, venue, note, and edit/delete.
- Valuation history with latest marker.
- Clear validation when a historical edit would overdraw later holdings.

### 10.4 Annual tab

Show:

- Overall true CAGR card and its contribution-inclusive disclaimer.
- Average YoY growth as a distinct metric; do not label it CAGR.
- Table columns: Year, Monthly Salary, Closing Snapshot, Net Worth, Gain/Loss, Average Monthly Change, and YoY.
- Edit action for salary and closing snapshot.
- Current partial year remains visibly marked as year-to-date.

### 10.5 Backup tab

Import wizard stages:

1. Select workbook.
2. Chunked upload progress.
3. Workbook validation summary.
4. Accepted/duplicate/conflict/invalid preview grouped by sheet.
5. Conflict resolution.
6. Confirmation result and active-template summary.

The export section shows active template filename, confirmation date, size, and `Download XLSX backup`. If no template exists, show `Import Portofolio.xlsx first` and disable export.

### 10.6 Overview integration

- Primary net-worth card reads latest recap total and its as-of date.
- Do not silently mix recap and ledger totals.
- Existing ledger total is relabeled or presented as `Tracked ledger holdings`.
- Render the workbook-equivalent five views:
  1. Latest eight-category allocation.
  2. Total net-worth history.
  3. Crypto split: BTC, ETH, Altcoin.
  4. Stocks split: IHSG, S&P 500.
  5. Grouped split: Liquid, Stocks, Crypto, Gold.
- Charts must have accessible labels, deterministic colors, currency tooltips, and zero-data states.

## 11. Workbook Import Specification

### 11.1 Security and limits

- Accept `.xlsx` only.
- Compressed file limit: 20 MiB.
- Total uncompressed ZIP content limit: 100 MiB.
- Maximum ZIP entries: 200.
- Reject path traversal names, duplicate normalized entry names, encrypted ZIPs, VBA/macro content types, and missing core OOXML relationships.
- Validate actual package content, not only filename or MIME type.
- Upload session expires after one hour; expired/failed chunks are deleted opportunistically and by a scheduled or maintenance cleanup path.
- Do not log cell values, notes, binary content, or raw normalized rows.

### 11.2 Required workbook structure

For the initial full-format migration, require these 11 sheet names:

1. `Overview`
2. `Income History`
3. `Milestones`
4. `Monthly Exp`
5. `TP Strategy`
6. `Annual Recap`
7. `FIRE Calculator`
8. `Stocks`
9. `Gold`
10. `Crypto`
11. `Temp`

Validate that `Temp` is hidden and that managed sheets contain recognizable headers. Resolve worksheet paths through workbook relationships; do not assume `sheet1.xml`, `sheet2.xml`, and so on.

### 11.3 `Income History` parsing

- Locate the table by `DATE` and the expected category headers.
- Parse source columns A:I: Date, Bank, RDPU/RD, IHSG, S&P500, BTC, ETH, Altcoin, Gold.
- Ignore derived columns J onward as import authorities.
- For formula cells in B:I, use a valid numeric cached value. If absent, mark the row invalid rather than executing arbitrary formulas.
- Parse numeric dates using the workbook date system. Parse string dates as explicit `dd/mm/yyyy` or unambiguous localized text; reject unresolved ambiguity.
- Preserve source row order through snapshot `sequence`.
- A row with no valid date or no category values is a skipped placeholder.
- Negative allocation values are invalid.

### 11.4 `Gold` parsing

Buy section:

- A date, B gold type, C grams, D purchase price per gram, E derived total, F venue.

Sell section:

- H sale date, I gold type, J grams, K sale price per gram, L derived total, M note.

Rules:

- Ignore E and L and recalculate totals.
- Blank or zero-gram rows are skipped placeholders.
- Positive grams and unit price plus a valid date are required.
- Missing gold type may be imported as `Unspecified` only after a visible warning.
- Preview sequence validation against existing and candidate transactions; an overdraw is invalid unless conflict resolution removes the cause.

### 11.5 `Annual Recap` parsing

- Parse Year and Salary from columns C and D.
- Ignore cached Gain/Loss, Monthly Income, Percentage, and Average Increase as calculation authorities.
- When the Net Worth formula references an `Income History` total row, map that source row to the imported snapshot and pin it as the closing snapshot.
- If no valid row reference exists, default to the latest imported snapshot in that year and add a preview warning.
- Salary is interpreted as monthly salary in IDR.

### 11.6 Duplicates and conflicts

Compute fingerprints with the existing user-scoped hashing convention.

- Exact normalized fingerprint already present: `DUPLICATE`.
- Same snapshot date and sequence slot with different values: `CONFLICT`.
- Same gold identity (type, date, gold type, grams, and venue) with changed mutable values: `CONFLICT`.
- Same valuation date with different price: `CONFLICT`.
- Same annual year with different salary or closing selection: `CONFLICT`.
- Validation failure with no safe resolution: `INVALID`.

Resolution behavior:

- `KEEP_APP`: retain existing data and skip workbook candidate.
- `USE_WORKBOOK`: update/replace the identified app record with the normalized workbook candidate.
- `KEEP_BOTH`: insert a new snapshot, gold transaction, or valuation and allocate safe ordering. Not available for annual settings.

Confirmation must refuse unresolved conflicts and invalid rows selected for acceptance.

## 12. Workbook Export Specification

### 12.1 Export engine

- Add `jszip` and `fast-xml-parser` as runtime dependencies.
- Use `jszip` to load the OOXML package and `generateNodeStream({ streamFiles: true })` to stream the generated archive.
- Use `fast-xml-parser` in namespace- and attribute-preserving mode for controlled managed parts. Do not parse and reserialize untouched XML entries.
- Do not use ExcelJS to read and save the full template because unsupported chart parts may be lost.
- Rebuild only managed worksheet XML and required chart XML/caches. Copy every other ZIP entry's bytes unchanged into the generated archive.
- Escape user-entered text and emit it as string content, never as a formula, to prevent formula injection.

### 12.2 `Income History` output

Maintain the recognizable column layout:

| Column | Output |
|---|---|
| A | Snapshot date |
| B | Bank |
| C | RDPU |
| D | IHSG |
| E | S&P 500 |
| F | BTC |
| G | ETH |
| H | Altcoin |
| I | Gold |
| J | Liquid formula and cached value |
| K | Total formula and cached value |
| L | Percentage change formula and cached value |
| M | Absolute increase formula and cached value |
| N | USD value formula or frozen value using snapshot FX |
| O | Average year-to-date monthly increase on the first exported row of each represented year |
| P | Year on the first exported row of each represented year |
| R:Z | Latest allocation and grouped chart helper values |

- Sort data ascending by date and sequence.
- Clone the template's relevant row styles, number formats, widths, and frozen panes.
- Extend the worksheet dimension and chart history range to the actual last row.
- Formula cached values must match server-side decimal calculations.
- For each represented year, column O is the arithmetic average of that year's exported column-M increases through the year's last snapshot; column P contains the year. Leave O:P blank on the other rows for that year.

### 12.3 `Gold` output

- Populate BUY records in A:F and SELL records in H:M.
- Preserve headings, styles, date formats, and IDR formats.
- Write quantity × unit price formulas with correct cached totals.
- Do not export zero-value placeholder sales.

### 12.4 `Annual Recap` output

- Preserve the current C:H layout: Year, Salary, Net Worth, Gain/Loss, Monthly Income, Percentage.
- `Monthly Income` contains the app's average monthly net-worth change for format compatibility.
- Preserve the workbook's `Average Increase (%)` area as arithmetic average YoY, not CAGR.
- True CAGR remains an app metric and is not inserted into a new workbook column in version 1.
- Point Net Worth formulas to each selected closing row in `Income History` and include matching cached values.

### 12.5 Overview charts

Preserve five chart objects and update source formulas and caches:

1. Latest eight-category allocation: Bank, RDPU, IHSG, S&P 500, BTC, ETH, Altcoin, Gold.
2. Total history: snapshot dates and total IDR.
3. Crypto split: BTC, ETH, Altcoin.
4. Stocks split: IHSG, S&P 500.
5. Grouped split: Liquid, Stocks, Crypto, Gold.

Update category caches, numeric caches, point counts, and dynamic last-row references. Preserve drawing anchors, chart styles, colors, titles, relationships, and worksheet drawing references.

Set workbook calculation properties to automatic/full recalculation on open while still supplying cached values for viewers that do not recalculate.

### 12.6 Unmanaged content

The following must remain logically and byte-content unchanged within the ZIP entries, except where an OOXML relationship legitimately requires a controlled reference update:

- `Milestones`
- `Monthly Exp`
- `TP Strategy`
- `FIRE Calculator`
- `Stocks`
- `Crypto`
- `Temp`
- Styles, theme, persons, hyperlinks, and unrelated drawings/relationships

Recompression may change the outer XLSX file hash; acceptance compares package structure and individual untouched entry content, not whole-file hash.

## 13. Server and State Integration

- Implement deterministic calculations in shared pure functions with unit tests.
- Keep database operations and workbook bytes in server-only modules.
- Do not add the template binary, upload chunks, or full recap history to persisted Zustand/local storage.
- Bootstrap may include only the latest recap summary needed by Overview. The dedicated page loads full recap data from its endpoint.
- Sign-out clears recap summaries from client memory.
- Existing Portfolio ledger CRUD, CSV export, spending, BTC research, wallet, and assistant behavior must remain backward compatible.
- `clearUserWorkspace` and its UI copy must include all new recap records and template data.
- Any assistant access to recap data must use deterministic selectors; workbook binary and free-form notes remain excluded from model context.

## 14. Error and Edge-Case Behavior

| Scenario | Required behavior |
|---|---|
| No snapshots | Overview and Monthly show setup empty states; no fabricated zero-growth claim. |
| Total snapshot is zero | Allocation is zero/unavailable; charts show empty state. |
| Same date/month | Warn and allow; allocate deterministic sequence. |
| Missing crypto price | Mark field incomplete and list symbols; require review before save. |
| Missing FX | Allow manual IDR snapshot entry, but mark USD export value unavailable unless user supplies a positive rate. |
| Missing gold valuation | Gold prefill is unavailable; user can create valuation or override Gold value. |
| Edit invalidates later gold sale | Reject entire mutation and identify first failing date. |
| Pinned annual snapshot deleted | Clear pin and fall back to latest snapshot in that year. |
| One annual point | CAGR unavailable with explanation. |
| Negative/nonpositive CAGR endpoint | CAGR unavailable, not `NaN` or infinity. |
| Upload interrupted | Retriable chunks remain until one-hour expiry. |
| Duplicate chunk retry | Accept only when size/checksum match; otherwise `409`. |
| Malformed or macro workbook | Reject before preview with safe validation message. |
| Workbook has unresolved conflicts | Confirmation returns `422`; no financial records change. |
| Import transaction fails | Roll back financial rows and template activation; retain or mark audit/staging as failed for diagnosis. |
| No active template | Export returns `409 WORKBOOK_TEMPLATE_REQUIRED`. |
| Export generation failure | Return safe error, retain prior template, and do not return a partial XLSX. |
| Concurrent export and new import | Export uses one consistent active template/data read; new template activates atomically afterward. |

## 15. Security, Privacy, and Operations

- Add the repository-root personal workbook path `/Portofolio.xlsx` to `.gitignore` without overwriting existing user changes. Do not ignore every `.xlsx` file, because sanitized workbook fixtures must remain committable.
- Before deployment, rotate any database password previously shared in chat or logs. Store it only in deployment environment variables.
- Never put a database URL, password, workbook checksum tied to public identity, or personal cell value into source code, fixtures, snapshots, logs, error telemetry, or prompts.
- Build test fixtures from a fully sanitized workbook with fictional values and no personal hyperlinks or metadata.
- Enforce authentication before creating an upload token/session or accepting a chunk.
- Validate ownership on every batch, upload, chunk, template, snapshot, gold, annual, and export operation.
- Apply private/no-store caching to financial and workbook responses.
- Bound decompression, XML parsing, row counts, and generated workbook size to prevent memory abuse.
- Do not fetch or execute external workbook links or formulas during import/export.
- TiDB migrations must be checked in and applied before application code requiring the new schema is deployed.
- Cleanup expired upload sessions and chunks safely and idempotently.

## 16. Testing and Verification

### 16.1 Unit tests

Test at minimum:

- Snapshot group totals, total, allocation, increase, and previous-total percentage denominator.
- Multiple snapshots on the same date and deterministic previous/latest ordering.
- Prefill carry-forward, BTC/ETH/Altcoin grouping, IDR conversion, missing asset prices, and gold prefill.
- Frozen values remaining unchanged after provider data changes.
- Gold BUY/SELL moving-average calculations, partial sale, full sale, realized/unrealized P/L, and gross totals.
- Rejection when a create/edit/delete causes chronological gold overdraw.
- Annual default and pinned closing snapshots, deleted pin fallback, partial year, average monthly change, YoY, and CAGR.
- CAGR unavailable cases: one point, zero/negative endpoint, and zero elapsed time.
- Validation schemas for decimal strings, dates, years, notes, and ownership-sensitive identifiers.

### 16.2 Import tests

Use a sanitized structural XLSX fixture containing all 11 sheets and five charts.

Test:

- Valid chunk assembly, retry idempotency, full checksum, expiry, and size boundaries.
- ZIP bomb, path traversal, macro content, malformed relationships, missing sheets, and invalid headers.
- Excel serial dates, `dd/mm/yyyy` strings, formulas with caches, formulas without caches, and invalid dates.
- Income History accepted, duplicate, conflict, invalid, and placeholder classification.
- Gold BUY/SELL parsing, ignored totals, placeholder rows, missing type warning, and overdraw.
- Annual formula-to-snapshot mapping and fallback warning.
- Every conflict resolution and refusal of unresolved conflicts.
- Transaction rollback and active-template replacement.
- Existing CSV imports remain unaffected.

### 16.3 Export and round-trip tests

Test:

- XLSX can be unzipped and passes package/relationship validation.
- All 11 sheet names and states remain present; `Temp` stays hidden.
- Five chart parts and their drawing relationships remain present.
- Chart ranges and caches match current database data and dynamic last row.
- Managed formulas and cached values match deterministic calculations.
- Unmanaged worksheet and unrelated entry bytes match the active template.
- Notes beginning with `=`, `+`, `-`, or `@` are exported as strings, not formulas.
- Generated XLSX can be re-imported and produces equivalent managed data.
- Export response streams with correct headers and filename.

### 16.4 API and authorization tests

- Unauthenticated requests fail.
- User A cannot read or mutate User B's identifiers, chunks, imports, records, template, or export.
- CRUD success and validation responses.
- Workbook rate limiting and chunk ownership.
- Clear-personal-data removes all new records and binary data.
- Bootstrap excludes workbook bytes and includes only the latest recap summary.

### 16.5 UI and visual tests

- Monthly create, prefill, override, same-month warning, edit, and delete.
- Gold transaction, valuation, historical-edit rejection, and summaries.
- Annual salary/closing selection and CAGR explanation.
- Backup upload progress, preview filters, conflict resolution, confirm, and download.
- Overview primary recap value, separate ledger metric, five charts, empty states, loading states, and responsive layout.
- Keyboard navigation, dialog focus, labels, chart alternatives, color contrast, and screen-reader names.
- Render the exported workbook in at least one production-compatible spreadsheet engine and visually inspect all managed sheets and charts.

### 16.6 Required final commands

An implementation agent must run and report:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:generate
```

It must inspect the generated migration before applying it, then verify migration against the intended local/test database and run authenticated route smoke tests. Live provider audit tests are optional unless their credentials are configured; existing skipped-test behavior must not be weakened.

At PRD creation time, the baseline was 88 passing tests, one skipped test, and a passing typecheck. New work must not reduce existing coverage or silently delete tests.

## 17. Implementation Sequence

An AI implementation agent should use this order so each stage can be independently verified:

1. **Protect user data and inspect baseline**
   - Confirm branch/status, preserve unrelated changes, ignore the personal workbook, and ensure no secret is introduced.
   - Run baseline typecheck and tests.
2. **Schema and shared contracts**
   - Add tables, enum changes, migrations, public types, validators, mappers, and clear-workspace coverage.
   - Review generated SQL before applying it.
3. **Pure calculations**
   - Implement snapshot, prefill grouping, gold accounting, annual rows, and CAGR with unit tests.
4. **Recap persistence and CRUD APIs**
   - Implement user-scoped services and route handlers with authorization and integration tests.
5. **Portfolio Recap UI**
   - Implement navigation, tabs, Monthly, Gold, and Annual flows before workbook complexity.
6. **Overview integration**
   - Add latest recap summary and five charts while preserving the ledger as a separate metric.
7. **Chunked workbook upload and parser**
   - Add staging, validation, preview, fingerprints, conflicts, and transactional confirmation.
8. **OOXML export**
   - Patch managed sheets and charts, stream output, add round-trip and package-preservation tests.
9. **Backup UI and audit integration**
   - Complete upload progress, conflict-resolution UX, template state, export, and Settings audit counts.
10. **Final verification**
    - Run all checks, inspect workbook visually, smoke-test production build routes, and review git diff for secrets, unrelated edits, generated artifacts, or personal data.

Do not push or deploy a partially passing implementation. Database migration deployment must precede application deployment.

## 18. Definition of Done

The implementation is done when:

- Every functional requirement PR-FR-01 through PR-FR-28 is demonstrably satisfied.
- Existing workbook history imports into the authenticated account through preview and confirmation.
- The user can perform future monthly, gold, and annual updates entirely in the app.
- Overview accurately reflects the latest frozen recap and clearly separates ledger holdings.
- A generated backup contains current managed data and preserves all original workbook structure required by this PRD.
- Structural, round-trip, visual, calculation, authorization, migration, typecheck, test, lint, build, and route checks pass.
- Personal workbook content and credentials are absent from git history and implementation output.
- The final handoff reports migrations, new dependencies, API surfaces, verification evidence, known limitations, and any operational cleanup requirement.

## 19. Implementation Guardrails for AI Agents

- Read this entire PRD and inspect the current repository before editing.
- Treat existing uncommitted changes as user-owned; do not reset, discard, or overwrite them.
- Use `apply_patch` for intentional source edits and review each generated migration.
- Reuse existing UI, API, ownership, validation, decimal, import-audit, and testing conventions.
- Keep financial calculations deterministic and outside language-model generation.
- Never paste or echo secrets in commands, logs, tests, comments, documentation, commits, or final responses.
- Never commit the real `Portofolio.xlsx`; use only a sanitized fixture for tests.
- Do not replace full-template OOXML handling with a library path that drops charts or hidden workbook parts.
- Do not broaden scope into custom categories, live gold pricing, account aggregation, or investment advice.
- If implementation reality conflicts with this PRD, stop and report the exact conflict instead of silently changing product behavior.
