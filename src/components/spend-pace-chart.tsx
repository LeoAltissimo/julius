"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useI18n } from "@/i18n/client";

export type PacePoint = {
  day: number;
  current: number | null;
  previous: number | null;
};

/**
 * Running spend, day by day, against the same stretch of the previous month.
 * The point is not the final number but the shape: being above last month's
 * line on the 12th is a warning you can still act on.
 */
export function SpendPaceChart({
  data,
  currentLabel,
  previousLabel,
}: {
  data: PacePoint[];
  currentLabel: string;
  previousLabel: string;
}) {
  const { t, fmt } = useI18n();

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => fmt.axisAmount(value)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--text)",
            }}
            labelFormatter={(day) => t.charts.day(Number(day))}
            formatter={(value, name) => [
              typeof value === "number" ? fmt.money(value) : t.common.none,
              name,
            ]}
          />
          <Line
            type="monotone"
            dataKey="previous"
            name={previousLabel}
            stroke="var(--text-faint)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
