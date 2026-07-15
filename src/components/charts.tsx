"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";
import type { DisplayCurrency, FxRate, Holding, MarketPoint } from "@/lib/types";
import type { BtcBacktestPoint } from "@/lib/btc-backtest";

const colors = ["#f6a723", "#6cb6ff", "#42d5a5", "#a88cff", "#ff7d9d", "#c4ccd8"];

const tooltipStyle = { background: "#10151d", border: "1px solid #273140", borderRadius: 8, fontSize: 11, color: "#eef1f5" };

export function AllocationChart({ holdings, currency, rates }: { holdings: Holding[]; currency: DisplayCurrency; rates: FxRate[] }) {
  const data = holdings.map((item) => ({ name: item.assetSymbol, value: Number(item.currentValueUsd) }));
  if (!data.length) return <EmptyChart label="No holdings yet" />;
  return (
    <div className="h-48 w-full" aria-label="Portfolio allocation chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={3} stroke="transparent">
            {data.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatMoney(Number(value), currency, rates), "Value"]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpendingTrendChart({
  data,
  currency,
  rates,
}: {
  data: Array<{ month: string; income: number; expenses: number }>;
  currency: DisplayCurrency;
  rates: FxRate[];
}) {
  return (
    <div className="h-64 w-full" aria-label="Income and expenses trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#1d2530" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "#7e8998", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#7e8998", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(Number(value), currency, rates, true)} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff08" }} formatter={(value, name) => [formatMoney(Number(value), currency, rates), String(name)]} />
          <Bar dataKey="income" fill="#42d5a5" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" fill="#f6a723" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BtcPriceChart({ data, currency, rates }: { data: MarketPoint[]; currency: DisplayCurrency; rates: FxRate[] }) {
  const normalized = data.map((item) => ({ ...item, close: Number(item.close), ma20: Number(item.ma20), ma50: Number(item.ma50), label: item.date.slice(5) }));
  return (
    <div className="h-[310px] w-full" aria-label="Bitcoin price and moving-average chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={normalized} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
          <defs><linearGradient id="btc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f6a723" stopOpacity={0.22} /><stop offset="95%" stopColor="#f6a723" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#1d2530" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={45} tick={{ fill: "#7e8998", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={["dataMin - 3000", "dataMax + 3000"]} tick={{ fill: "#7e8998", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(Number(value), currency, rates, true)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatMoney(Number(value), currency, rates), String(name).toUpperCase()]} />
          <Area type="monotone" dataKey="close" stroke="#f6a723" strokeWidth={2} fill="url(#btc-fill)" />
          <Line type="monotone" dataKey="ma20" stroke="#6cb6ff" strokeWidth={1.4} dot={false} />
          <Line type="monotone" dataKey="ma50" stroke="#8791a1" strokeWidth={1.2} strokeDasharray="4 4" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BtcBacktestChart({ data, currency, rates }: { data: BtcBacktestPoint[]; currency: DisplayCurrency; rates: FxRate[] }) {
  const normalized = data.map((item) => ({
    ...item,
    strategyUsd: Number(item.strategyUsd),
    buyHoldUsd: Number(item.buyHoldUsd),
    label: item.date.slice(5),
  }));
  return (
    <div className="h-[280px] w-full" aria-label="Backtested strategy equity compared with Bitcoin buy and hold">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={normalized} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
          <defs><linearGradient id="backtest-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#42d5a5" stopOpacity={0.18} /><stop offset="95%" stopColor="#42d5a5" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#1d2530" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={45} tick={{ fill: "#7e8998", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#7e8998", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(Number(value), currency, rates, true)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatMoney(Number(value), currency, rates), name === "strategyUsd" ? "Signal strategy" : "Buy & hold"]} />
          <Area type="monotone" dataKey="strategyUsd" stroke="#42d5a5" strokeWidth={2} fill="url(#backtest-fill)" />
          <Line type="monotone" dataKey="buyHoldUsd" stroke="#f6a723" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">{label}</div>;
}
