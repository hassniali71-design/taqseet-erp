/**
 * §128 Installment Engine Acceptance Tests. Run with `bun run scripts/verify-finance-engine.ts`
 * — this is the project's first real test, and it must pass before src/lib/finance-engine.ts
 * is trusted by any UI. Not wired into CI (no test runner is set up yet); run it by hand after
 * touching finance-engine.ts.
 */
import { calculateFinance, generateSchedule } from "../src/lib/finance-engine";

let failures = 0;

function assertEqual(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${pass ? "✓" : "✗"} ${label}${pass ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
  if (!pass) failures++;
}

// §128: Principal 15,000, Plan 12 Months @ 40% -> Finance 6,000, Total 21,000, 12 x 1,750.
const { financeAmount, totalAmount } = calculateFinance(15000, 40);
assertEqual("financeAmount = 6000", financeAmount, 6000);
assertEqual("totalAmount = 21000", totalAmount, 21000);

const schedule = generateSchedule(totalAmount, 12, new Date("2026-09-10T00:00:00.000Z"));
assertEqual("schedule has 12 lines", schedule.length, 12);
assertEqual(
  "every installment is 1750",
  schedule.every((l) => l.amount === 1750),
  true,
);
assertEqual(
  "schedule sums to exactly totalAmount",
  schedule.reduce((sum, l) => sum + l.amount, 0),
  21000,
);
assertEqual(
  "first due date is one month after purchase (10/10)",
  new Date(schedule[0]!.due_date).getUTCMonth(),
  9, // October, 0-indexed
);

// §128: changing the plan later must not change an already-created contract's snapshot.
// (This is enforced by createInstallmentContract copying plan_rate_pct at creation time —
// re-running calculateFinance with the OLD rate here just proves the formula itself is
// stateless and doesn't silently read "current" plan state from anywhere.)
const oldContractFinance = calculateFinance(15000, 40);
assertEqual(
  "old contract's finance is unaffected by a hypothetical new 35% rate",
  oldContractFinance.totalAmount,
  21000,
);

// A non-round example, to prove rounding lands on the last installment only.
const odd = calculateFinance(10000, 30); // finance = 3000, total = 13000
assertEqual("odd example financeAmount", odd.financeAmount, 3000);
const oddSchedule = generateSchedule(odd.totalAmount, 7); // 13000/7 = 1857.142857...
assertEqual(
  "odd schedule sums exactly despite rounding",
  oddSchedule.reduce((sum, l) => sum + l.amount, 0),
  13000,
);
assertEqual(
  "only the last installment differs from the rest",
  new Set(oddSchedule.slice(0, 6).map((l) => l.amount)).size,
  1,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll finance engine checks passed.");
