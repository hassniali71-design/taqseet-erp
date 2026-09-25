# محرك التقسيط - المعادلة المرجعية §37, §128

```
Finance Amount = Principal × Plan Rate   (مرة واحدة، غير مركب شهريا)
Total = Principal + Finance Amount
```

Acceptance Test: Principal=15,000، خطة 12 شهر @40% -> Finance=6,000 -> Total=21,000 -> 12 قسط × 1,750. تغيير الخطة لاحقا لـ35% لا يغير عقودا قديمة استخدمت 40%.

الملفات:
- src/lib/finance-engine.ts - دالتان نقيتان: calculateFinance + generateSchedule (القسط الاخير يمتص فرق التقريب)
- scripts/verify-finance-engine.ts - bun run scripts/verify-finance-engine.ts
