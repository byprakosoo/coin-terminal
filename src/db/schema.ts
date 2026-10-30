import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const id = (name = "id") => char(name, { length: 36 });
const timestamp = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const money = (name: string) => decimal(name, { precision: 30, scale: 8 });
const quantity = (name: string) => decimal(name, { precision: 38, scale: 18 });
const score = (name: string) => decimal(name, { precision: 8, scale: 4 });

export const users = mysqlTable(
  "users",
  {
    id: id().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    displayCurrency: mysqlEnum("display_currency", ["USD", "IDR", "EUR"])
      .notNull()
      .default("IDR"),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    disclaimerAccepted: boolean("disclaimer_accepted").notNull().default(false),
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    workspaceSeededAt: timestamp("workspace_seeded_at"),
    smartMoneyWalletsSeededAt: timestamp("smart_money_wallets_seeded_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const aiModelConfigs = mysqlTable(
  "ai_model_configs",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    provider: mysqlEnum("provider", ["OPENAI", "OPENAI_CODEX", "ANTHROPIC", "KIMI", "OPENAI_COMPATIBLE"]).notNull(),
    model: varchar("model", { length: 180 }).notNull(),
    endpointUrl: varchar("endpoint_url", { length: 500 }).notNull(),
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    apiKeyHint: varchar("api_key_hint", { length: 12 }).notNull(),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_model_configs_user_updated_idx").on(table.userId, table.updatedAt),
    index("ai_model_configs_user_active_idx").on(table.userId, table.active),
  ],
);

export const aiOauthDeviceLogins = mysqlTable(
  "ai_oauth_device_logins",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: mysqlEnum("provider", ["OPENAI_CODEX"]).notNull(),
    deviceAuthId: varchar("device_auth_id", { length: 255 }).notNull(),
    userCode: varchar("user_code", { length: 80 }).notNull(),
    status: mysqlEnum("status", ["PENDING", "COMPLETED", "FAILED", "EXPIRED"])
      .notNull()
      .default("PENDING"),
    expiresAt: timestamp("expires_at").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    index("ai_oauth_device_logins_user_created_idx").on(table.userId, table.createdAt),
    index("ai_oauth_device_logins_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: id().primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const accounts = mysqlTable(
  "accounts",
  {
    id: id().primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 120 }).notNull(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
  ],
);

export const verifications = mysqlTable(
  "verifications",
  {
    id: id().primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const authRateLimits = mysqlTable(
  "auth_rate_limits",
  {
    id: id().primaryKey(),
    key: varchar("rate_key", { length: 255 }).notNull(),
    count: int("request_count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("auth_rate_limits_key_unique").on(table.key)],
);

export const importBatches = mysqlTable(
  "import_batches",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: mysqlEnum("source", ["MONEY_LOVER", "PORTFOLIO_CSV"]).notNull(),
    status: mysqlEnum("status", ["PREVIEW", "CONFIRMED", "FAILED", "CANCELLED"])
      .notNull()
      .default("PREVIEW"),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    checksum: char("checksum", { length: 64 }).notNull(),
    reportMonth: char("report_month", { length: 7 }),
    mapping: json("mapping").$type<Record<string, string>>(),
    acceptedRows: int("accepted_rows").notNull().default(0),
    duplicateRows: int("duplicate_rows").notNull().default(0),
    invalidRows: int("invalid_rows").notNull().default(0),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    confirmedAt: timestamp("confirmed_at"),
  },
  (table) => [
    index("import_batches_user_created_idx").on(table.userId, table.createdAt),
    index("import_batches_user_checksum_idx").on(table.userId, table.source, table.checksum),
  ],
);

export const importRows = mysqlTable(
  "import_rows",
  {
    id: id().primaryKey(),
    batchId: id("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: int("row_number").notNull(),
    status: mysqlEnum("status", ["ACCEPTED", "DUPLICATE", "INVALID"]).notNull(),
    fingerprint: char("fingerprint", { length: 64 }),
    normalized: json("normalized").$type<Record<string, unknown>>(),
    issues: json("issues").$type<string[]>().notNull(),
  },
  (table) => [
    uniqueIndex("import_rows_batch_row_unique").on(table.batchId, table.rowNumber),
    index("import_rows_batch_status_idx").on(table.batchId, table.status),
  ],
);

export const portfolioTransactions = mysqlTable(
  "portfolio_transactions",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importBatchId: id("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    assetSymbol: varchar("asset_symbol", { length: 20 }).notNull(),
    transactionType: mysqlEnum("transaction_type", [
      "BUY",
      "SELL",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "REWARD",
      "AIRDROP",
      "FEE",
    ]).notNull(),
    quantity: quantity("quantity").notNull(),
    unitPriceUsd: money("unit_price_usd").notNull(),
    totalValueUsd: money("total_value_usd").notNull(),
    feeUsd: money("fee_usd").notNull().default("0"),
    venue: varchar("venue", { length: 160 }).notNull().default("Manual"),
    note: text("note"),
    executedAt: timestamp("executed_at").notNull(),
    fingerprint: char("fingerprint", { length: 64 }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("portfolio_transactions_user_executed_idx").on(table.userId, table.executedAt),
    uniqueIndex("portfolio_transactions_user_fingerprint_unique").on(
      table.userId,
      table.fingerprint,
    ),
  ],
);

export const spendingTransactions = mysqlTable(
  "spending_transactions",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importBatchId: id("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    reportMonth: char("report_month", { length: 7 }).notNull(),
    amount: money("amount").notNull(),
    currency: mysqlEnum("currency", ["USD", "IDR", "EUR"]).notNull(),
    direction: mysqlEnum("direction", ["INCOME", "EXPENSE"]).notNull(),
    category: varchar("category", { length: 160 }).notNull().default("Uncategorized"),
    account: varchar("account", { length: 160 }).notNull().default("Imported"),
    note: text("note"),
    fingerprint: char("fingerprint", { length: 64 }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("spending_transactions_user_date_idx").on(table.userId, table.occurredOn),
    index("spending_transactions_user_report_month_idx").on(table.userId, table.reportMonth),
    uniqueIndex("spending_transactions_user_fingerprint_unique").on(
      table.userId,
      table.fingerprint,
    ),
  ],
);

export const spendingCarryovers = mysqlTable(
  "spending_carryovers",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportMonth: char("report_month", { length: 7 }).notNull(),
    amountUsd: money("amount_usd").notNull(),
    direction: mysqlEnum("direction", ["INCOME", "EXPENSE"]).notNull(),
    status: mysqlEnum("status", ["ACTIVE", "DELETED"]).notNull().default("ACTIVE"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("spending_carryovers_user_month_unique").on(table.userId, table.reportMonth),
  ],
);

/** Immutable, user-owned Income History / month-end allocation records. */
export const portfolioRecapSnapshots = mysqlTable(
  "portfolio_recap_snapshots",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    sequence: int("sequence").notNull(),
    bankIdr: money("bank_idr").notNull().default("0"),
    rdpuIdr: money("rdpu_idr").notNull().default("0"),
    ihsgIdr: money("ihsg_idr").notNull().default("0"),
    sp500Idr: money("sp500_idr").notNull().default("0"),
    btcIdr: money("btc_idr").notNull().default("0"),
    ethIdr: money("eth_idr").notNull().default("0"),
    altcoinIdr: money("altcoin_idr").notNull().default("0"),
    goldIdr: money("gold_idr").notNull().default("0"),
    idrPerUsd: money("idr_per_usd"),
    source: mysqlEnum("source", ["MANUAL", "HYBRID_PREFILL", "XLSX_IMPORT"])
      .notNull()
      .default("MANUAL"),
    prefillMetadata: json("prefill_metadata").$type<Record<string, unknown>>(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("portfolio_recap_snapshots_user_date_sequence_unique").on(
      table.userId,
      table.asOfDate,
      table.sequence,
    ),
    index("portfolio_recap_snapshots_user_date_idx").on(table.userId, table.asOfDate),
  ],
);

export const portfolioBtcBalances = mysqlTable("portfolio_btc_balances", {
  userId: id("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date()),
});

export const goldTransactions = mysqlTable(
  "gold_transactions",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionType: mysqlEnum("transaction_type", ["BUY", "SELL"]).notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    goldType: varchar("gold_type", { length: 120 }).notNull(),
    grams: quantity("grams").notNull(),
    unitPriceIdr: money("unit_price_idr").notNull(),
    venue: varchar("venue", { length: 160 }),
    note: text("note"),
    fingerprint: char("fingerprint", { length: 64 }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("gold_transactions_user_date_idx").on(table.userId, table.occurredOn),
    uniqueIndex("gold_transactions_user_fingerprint_unique").on(table.userId, table.fingerprint),
  ],
);

export const goldValuations = mysqlTable(
  "gold_valuations",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    pricePerGramIdr: money("price_per_gram_idr").notNull(),
    source: mysqlEnum("source", ["MANUAL", "XLSX_IMPORT"]).notNull().default("MANUAL"),
    note: text("note"),
    fingerprint: char("fingerprint", { length: 64 }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("gold_valuations_user_date_idx").on(table.userId, table.asOfDate),
    uniqueIndex("gold_valuations_user_fingerprint_unique").on(table.userId, table.fingerprint),
  ],
);

export const annualRecapSettings = mysqlTable(
  "annual_recap_settings",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    year: int("year").notNull(),
    monthlySalaryIdr: money("monthly_salary_idr"),
    closingSnapshotId: id("closing_snapshot_id").references(() => portfolioRecapSnapshots.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("annual_recap_settings_user_year_unique").on(table.userId, table.year),
    index("annual_recap_settings_closing_snapshot_idx").on(table.closingSnapshotId),
  ],
);

export const dataSources = mysqlTable(
  "data_sources",
  {
    id: id().primaryKey(),
    provider: varchar("provider", { length: 80 }).notNull(),
    sourceUrl: varchar("source_url", { length: 1000 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [uniqueIndex("data_sources_provider_unique").on(table.provider)],
);

export const marketSnapshots = mysqlTable(
  "market_snapshots",
  {
    id: id().primaryKey(),
    dataSourceId: id("data_source_id")
      .notNull()
      .references(() => dataSources.id),
    instrument: varchar("instrument", { length: 40 }).notNull(),
    snapshotType: mysqlEnum("snapshot_type", ["TICKER", "DAILY_CANDLE", "DEX_PAIR", "FX"])
      .notNull(),
    observedAt: timestamp("observed_at").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    freshnessStatus: mysqlEnum("freshness_status", ["FRESH", "DELAYED", "STALE", "MISSING"])
      .notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: char("payload_hash", { length: 64 }).notNull(),
  },
  (table) => [
    index("market_snapshots_instrument_observed_idx").on(table.instrument, table.observedAt),
    uniqueIndex("market_snapshots_source_hash_unique").on(
      table.dataSourceId,
      table.snapshotType,
      table.payloadHash,
    ),
  ],
);

export const marketCandles = mysqlTable(
  "market_candles",
  {
    id: id().primaryKey(),
    dataSourceId: id("data_source_id")
      .notNull()
      .references(() => dataSources.id),
    instrument: varchar("instrument", { length: 40 }).notNull(),
    interval: mysqlEnum("candle_interval", ["1D", "1H"]).notNull(),
    open: money("open_price").notNull(),
    high: money("high_price").notNull(),
    low: money("low_price").notNull(),
    close: money("close_price").notNull(),
    volume: quantity("volume").notNull(),
    openedAt: timestamp("opened_at").notNull(),
    closedAt: timestamp("closed_at").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    finalized: boolean("finalized").notNull().default(true),
    checksum: char("checksum", { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex("market_candles_source_instrument_interval_open_unique").on(
      table.dataSourceId,
      table.instrument,
      table.interval,
      table.openedAt,
    ),
    index("market_candles_instrument_interval_open_idx").on(
      table.instrument,
      table.interval,
      table.openedAt,
    ),
  ],
);

export const signalRuleVersions = mysqlTable(
  "signal_rule_versions",
  {
    id: id().primaryKey(),
    version: varchar("version", { length: 80 }).notNull(),
    configuration: json("configuration").$type<Record<string, unknown>>().notNull(),
    active: boolean("active").notNull().default(false),
    lifecycleStatus: mysqlEnum("lifecycle_status", [
      "CANDIDATE",
      "SHADOW",
      "VALIDATED",
      "DEGRADED",
      "REJECTED",
      "RETIRED",
    ])
      .notNull()
      .default("CANDIDATE"),
    ruleHash: char("rule_hash", { length: 64 }),
    validatedAt: timestamp("validated_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [uniqueIndex("signal_rule_versions_version_unique").on(table.version)],
);

export const signals = mysqlTable(
  "signals",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ruleVersionId: id("rule_version_id")
      .notNull()
      .references(() => signalRuleVersions.id),
    instrument: varchar("instrument", { length: 40 }).notNull(),
    action: mysqlEnum("action", ["BUY", "SELL", "WATCH"]).notNull(),
    compositeScore: score("composite_score").notNull(),
    confidence: score("confidence").notNull(),
    freshnessStatus: mysqlEnum("freshness_status", ["FRESH", "DELAYED", "STALE", "MISSING"])
      .notNull(),
    summary: text("summary").notNull(),
    priceUsd: money("price_usd").notNull(),
    change24hPct: score("change_24h_pct").notNull(),
    mode: mysqlEnum("mode", ["RESEARCH", "SHADOW", "VALIDATED"]).notNull().default("RESEARCH"),
    availability: mysqlEnum("availability", ["READY", "HALTED"]).notNull().default("READY"),
    agreementPct: score("agreement_pct").notNull().default("0"),
    targetAllocationPct: score("target_allocation_pct").notNull().default("0"),
    deltaAllocationPct: score("delta_allocation_pct").notNull().default("0"),
    recommendedUsd: money("recommended_usd").notNull().default("0"),
    recommendedBtc: quantity("recommended_btc").notNull().default("0"),
    hardExit: boolean("hard_exit").notNull().default(false),
    inputHash: char("input_hash", { length: 64 }),
    evaluatedAt: timestamp("evaluated_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    index("signals_user_instrument_evaluated_idx").on(
      table.userId,
      table.instrument,
      table.evaluatedAt,
    ),
    uniqueIndex("signals_user_instrument_rule_evaluated_unique").on(
      table.userId,
      table.instrument,
      table.ruleVersionId,
      table.evaluatedAt,
    ),
  ],
);

export const btcStrategyProfiles = mysqlTable(
  "btc_strategy_profiles",
  {
    userId: id("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    activeRuleVersionId: id("active_rule_version_id").references(() => signalRuleVersions.id),
    sleeveBudgetUsd: money("sleeve_budget_usd"),
    cashBalanceUsd: money("cash_balance_usd").notNull().default("0"),
    btcQuantity: quantity("btc_quantity").notNull().default("0"),
    modelAllocationPct: score("model_allocation_pct").notNull().default("0"),
    lifecycleStatus: mysqlEnum("lifecycle_status", [
      "CANDIDATE",
      "SHADOW",
      "VALIDATED",
      "DEGRADED",
      "REJECTED",
      "PAUSED",
    ])
      .notNull()
      .default("CANDIDATE"),
    shadowStartedAt: timestamp("shadow_started_at"),
    lastModelChangeAt: timestamp("last_model_change_at"),
    recoveringFromHardExit: boolean("recovering_from_hard_exit").notNull().default(false),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index("btc_strategy_profiles_rule_idx").on(table.activeRuleVersionId)],
);

export const strategyValidationRuns = mysqlTable(
  "strategy_validation_runs",
  {
    id: id().primaryKey(),
    ruleVersionId: id("rule_version_id")
      .notNull()
      .references(() => signalRuleVersions.id),
    status: mysqlEnum("status", ["RUNNING", "PASSED", "FAILED"]).notNull(),
    datasetStartedOn: date("dataset_started_on", { mode: "string" }),
    datasetEndedOn: date("dataset_ended_on", { mode: "string" }),
    ruleHash: char("rule_hash", { length: 64 }).notNull(),
    dataHash: char("data_hash", { length: 64 }),
    metrics: json("metrics").$type<Record<string, unknown>>().notNull(),
    failureReasons: json("failure_reasons").$type<string[]>().notNull(),
    startedAt: timestamp("started_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    completedAt: timestamp("completed_at"),
  },
  (table) => [index("strategy_validation_runs_rule_started_idx").on(table.ruleVersionId, table.startedAt)],
);

export const signalAcknowledgements = mysqlTable(
  "signal_acknowledgements",
  {
    id: id().primaryKey(),
    signalId: id("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["EXECUTED", "SKIPPED", "EXPIRED"]).notNull(),
    actualPriceUsd: money("actual_price_usd"),
    actualQuantityBtc: quantity("actual_quantity_btc"),
    actualFeeUsd: money("actual_fee_usd"),
    executedAt: timestamp("executed_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex("signal_acknowledgements_signal_unique").on(table.signalId),
    index("signal_acknowledgements_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const signalEvidence = mysqlTable(
  "signal_evidence",
  {
    id: id().primaryKey(),
    signalId: id("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    marketSnapshotId: id("market_snapshot_id").references(() => marketSnapshots.id),
    groupName: varchar("group_name", { length: 120 }).notNull(),
    ruleName: varchar("rule_name", { length: 180 }).notNull(),
    weightPct: score("weight_pct").notNull(),
    score: score("score").notNull(),
    value: varchar("value", { length: 255 }).notNull(),
    interpretation: text("interpretation").notNull(),
    sourceLabel: varchar("source_label", { length: 255 }).notNull(),
    sourceUrl: varchar("source_url", { length: 1000 }).notNull(),
    observedAt: timestamp("observed_at").notNull(),
    evidenceKind: mysqlEnum("evidence_kind", [
      "OBSERVED",
      "CALCULATED",
      "INFERRED",
      "UNVERIFIED",
      "STALE",
      "WEB_PUBLIC",
    ]).notNull(),
    details: json("details").$type<Record<string, unknown>>(),
  },
  (table) => [index("signal_evidence_signal_idx").on(table.signalId)],
);

export const watchlistWallets = mysqlTable(
  "watchlist_wallets",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chain: mysqlEnum("chain", ["Bitcoin", "Ethereum", "Solana", "Base", "Arbitrum"]).notNull(),
    address: varchar("address", { length: 128 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    classification: mysqlEnum("classification", [
      "USER_VERIFIED",
      "PUBLICLY_ATTRIBUTED",
      "HIGH_PERFORMANCE_PROXY",
      "UNVERIFIED_WHALE",
      "EXCLUDED",
    ]).notNull(),
    qualityScore: score("quality_score").notNull().default("0"),
    winRatePct: score("win_rate_pct"),
    closedPositions: int("closed_positions"),
    medianHoldingMinutes: int("median_holding_minutes"),
    enabled: boolean("enabled").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("watchlist_wallets_user_chain_address_unique").on(
      table.userId,
      table.chain,
      table.address,
    ),
    index("watchlist_wallets_user_enabled_idx").on(table.userId, table.enabled),
  ],
);

export const walletEvents = mysqlTable(
  "wallet_events",
  {
    id: id().primaryKey(),
    watchlistWalletId: id("watchlist_wallet_id")
      .notNull()
      .references(() => watchlistWallets.id, { onDelete: "cascade" }),
    chain: varchar("chain", { length: 40 }).notNull(),
    transactionHash: varchar("transaction_hash", { length: 128 }).notNull(),
    eventType: mysqlEnum("event_type", ["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT"])
      .notNull(),
    tokenAddress: varchar("token_address", { length: 128 }).notNull(),
    tokenSymbol: varchar("token_symbol", { length: 40 }).notNull(),
    tokenQuantity: quantity("token_quantity").notNull(),
    valueUsd: money("value_usd").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    sourceUrl: varchar("source_url", { length: 1000 }).notNull(),
    rawPayload: json("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex("wallet_events_wallet_tx_token_unique").on(
      table.watchlistWalletId,
      table.transactionHash,
      table.tokenAddress,
    ),
    index("wallet_events_wallet_occurred_idx").on(table.watchlistWalletId, table.occurredAt),
  ],
);

export const tokenFlowEvents = mysqlTable(
  "token_flow_events",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chain: varchar("chain", { length: 40 }).notNull(),
    tokenAddress: varchar("token_address", { length: 128 }).notNull(),
    tokenSymbol: varchar("token_symbol", { length: 40 }).notNull(),
    tokenName: varchar("token_name", { length: 160 }).notNull(),
    dexPair: varchar("dex_pair", { length: 160 }).notNull(),
    entryStatus: mysqlEnum("entry_status", ["EARLY", "CONFIRMED", "EXTENDED", "AVOID"])
      .notNull(),
    smartMoneyScore: score("smart_money_score").notNull(),
    qualifiedWalletCount: int("qualified_wallet_count").notNull(),
    netBuyUsd: money("net_buy_usd").notNull(),
    priceChangeSinceFirstBuy: score("price_change_since_first_buy").notNull(),
    liquidityUsd: money("liquidity_usd").notNull(),
    volume24hUsd: money("volume_24h_usd").notNull(),
    firstDetectedAt: timestamp("first_detected_at").notNull(),
    evaluatedAt: timestamp("evaluated_at").notNull(),
    riskFactors: json("risk_factors").$type<string[]>().notNull(),
    sourceLinks: json("source_links")
      .$type<Array<{ label: string; url: string }>>()
      .notNull(),
    evidence: json("evidence").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    index("token_flow_events_user_evaluated_idx").on(table.userId, table.evaluatedAt),
    uniqueIndex("token_flow_events_user_token_evaluated_unique").on(
      table.userId,
      table.chain,
      table.tokenAddress,
      table.evaluatedAt,
    ),
  ],
);

export const tokenFlowEventWallets = mysqlTable(
  "token_flow_event_wallets",
  {
    tokenFlowEventId: id("token_flow_event_id")
      .notNull()
      .references(() => tokenFlowEvents.id, { onDelete: "cascade" }),
    watchlistWalletId: id("watchlist_wallet_id")
      .notNull()
      .references(() => watchlistWallets.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.tokenFlowEventId, table.watchlistWalletId] }),
    index("token_flow_event_wallets_wallet_idx").on(table.watchlistWalletId),
  ],
);

export const alerts = mysqlTable(
  "alerts",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenFlowEventId: id("token_flow_event_id").references(() => tokenFlowEvents.id, {
      onDelete: "cascade",
    }),
    alertType: varchar("alert_type", { length: 80 }).notNull(),
    severity: mysqlEnum("severity", ["INFO", "WARNING", "HIGH_RISK"]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: mysqlEnum("status", ["UNREAD", "READ"]).notNull().default("UNREAD"),
    cooldownKey: varchar("cooldown_key", { length: 255 }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    readAt: timestamp("read_at"),
  },
  (table) => [
    index("alerts_user_created_idx").on(table.userId, table.createdAt),
    index("alerts_user_cooldown_idx").on(table.userId, table.cooldownKey, table.createdAt),
  ],
);

export const aiConversations = mysqlTable(
  "ai_conversations",
  {
    id: id().primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
    contextState: json("context_state").$type<{
      summary: string;
      activeAssets: string[];
      activePeriod?: string;
      cashMention?: string;
      assumptions: string[];
      unresolvedReferences: string[];
      updatedAt: string;
    }>(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("ai_conversations_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const aiMessages = mysqlTable(
  "ai_messages",
  {
    id: id().primaryKey(),
    conversationId: id("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["USER", "ASSISTANT"]).notNull(),
    content: text("content").notNull(),
    sourceSummary: json("source_summary").$type<Array<Record<string, unknown>>>(),
    investmentRelated: boolean("investment_related").notNull().default(false),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [index("ai_messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const aiToolCalls = mysqlTable(
  "ai_tool_calls",
  {
    id: id().primaryKey(),
    aiMessageId: id("ai_message_id")
      .notNull()
      .references(() => aiMessages.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 120 }).notNull(),
    status: mysqlEnum("status", ["STARTED", "SUCCEEDED", "FAILED", "DENIED"]).notNull(),
    requestSummary: json("request_summary").$type<Record<string, unknown>>().notNull(),
    resultSummary: json("result_summary").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [index("ai_tool_calls_message_idx").on(table.aiMessageId)],
);

export const jobRuns = mysqlTable(
  "job_runs",
  {
    id: id().primaryKey(),
    jobName: varchar("job_name", { length: 120 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["RUNNING", "SUCCEEDED", "FAILED"]).notNull(),
    startedAt: timestamp("started_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    completedAt: timestamp("completed_at"),
    resultSummary: json("result_summary").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
  },
  (table) => [
    uniqueIndex("job_runs_name_idempotency_unique").on(table.jobName, table.idempotencyKey),
  ],
);

export const apiRateLimits = mysqlTable(
  "api_rate_limits",
  {
    rateKey: varchar("rate_key", { length: 255 }).notNull(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    requestCount: int("request_count").notNull().default(1),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.rateKey, table.windowStartedAt] }),
    index("api_rate_limits_expires_idx").on(table.expiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type PortfolioTransactionRow = typeof portfolioTransactions.$inferSelect;
export type SpendingTransactionRow = typeof spendingTransactions.$inferSelect;
