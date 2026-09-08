import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** شارت مبيعات بألوان هوية "حسبة" (ذهبي/تركواز) — يُستخدم في لوحة التحكم وغرفة تحكم المنصة. */
export function SalesTrendChart({ data }: { data: Array<{ label: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fontWeight: 700, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--color-accent)" }}
          contentStyle={{
            borderRadius: 12,
            border: "2px solid var(--color-border)",
            fontWeight: 700,
            fontSize: 12,
          }}
          formatter={(value: number) => [`${value.toLocaleString("ar-EG")} ج.م`, "المبيعات"]}
        />
        <Bar dataKey="value" fill="#D4AA17" radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
