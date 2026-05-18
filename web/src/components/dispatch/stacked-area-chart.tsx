"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colorFor } from "@/lib/dispatch-utils";

interface Props {
  data: Record<string, number | string>[];
  carriers: string[];
  height?: number;
}

/**
 * Stacked-area chart of daily generation per carrier.
 *
 * Carriers are stacked in input order (caller sorts by contribution desc),
 * so the biggest carriers anchor the bottom and small ones sit on top —
 * easier to read than the default Recharts behavior.
 */
export function StackedAreaChart({ data, carriers, height = 320 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="snapshot"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)} GWh` : `${v.toFixed(0)}`
          }
          width={70}
        />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          formatter={(value: unknown, name: unknown) => {
            const num = typeof value === "number" ? value : Number(value);
            return [`${(num / 1000).toFixed(2)} GWh`, String(name)];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        {/* Render in reverse so the legend reads big-to-small top-down */}
        {[...carriers].reverse().map((carrier) => (
          <Area
            key={carrier}
            type="monotone"
            dataKey={carrier}
            stackId="1"
            stroke={colorFor(carrier)}
            fill={colorFor(carrier)}
            fillOpacity={0.85}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
