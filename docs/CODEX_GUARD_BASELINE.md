# Codex Guard — Baseline Debt (ديون الانحراف الموروثة)

> **الميثاق:** الحارس (B1) لا يُكتَم ولا تُحذَف قواعده. الانحرافات الموروثة
> (الموجودة قبل تفعيل الحارس) تُسجَّل هنا كـ**ديون معلومة** وتبقى ظاهرة في كل
> تقرير فحص، لكنها **لا تُفشِل CI**. الكود **الجديد** يُمنع من إدخال أي انحراف
> جديد. تُغلق هذه الديون في **موجة مخصصة لاحقة** (تنظيف التسميات + تحويل
> المؤشرات المزيفة إلى مؤشرات محسوبة من بيانات فعلية).

- **المصدر الآلي:** `docs/codex-guard-baseline.json` (يولَّد بـ`npm run guard:scan -- --emit-baseline`).
- **آلية العمل:** `scanFiles(files, baseline)` يفصل النتائج إلى `new` و`known-legacy`
  ببصمة مستقلة عن رقم السطر: `filename::rule::match`. CI يفشل فقط على `new`.
- **وضع CI (baseline mode):** الـPR يفحص **diff الملفات المتغيّرة فقط**
  (`--base=origin/main`) ويطرح منها الديون المسجّلة هنا.

## الإجمالي: 16 انحرافاً موروثاً

| # | الملف | القاعدة | العيّنة |
|---|-------|---------|---------|
| 1 | `api/advanced-engines-router.ts` | FORBIDDEN_LABEL | `consciousness` |
| 2 | `api/evidence-registry-router.ts` | FORBIDDEN_LABEL | `consciousness` |
| 3 | `api/health-router.ts` | FORBIDDEN_LABEL | `consciousness` |
| 4 | `api/scheduler-router.ts` | FORBIDDEN_LABEL | `consciousness` |
| 5 | `src/App.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 6 | `src/App.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 7 | `src/components/Navigation.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 8 | `src/pages/Consciousness.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 9 | `src/pages/DashboardV2.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 10 | `src/pages/Landing.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 11 | `src/pages/Landing.tsx` | FORBIDDEN_LABEL | `consciousness` |
| 12 | `api/cos-router.ts` | FAKE_LIVE_METRIC | `node.syncHealth = Math.round((0.8 + Math.random() * 0.2) * 100) / 100;` |
| 13 | `api/knowledge-router.ts` | FAKE_LIVE_METRIC | `confidence: Math.round((0.5 + Math.random() * 0.5) * 100) / 100,` |
| 14 | `api/scheduler-router.ts` | FAKE_LIVE_METRIC | `results[task] = { certified: true, score: 0.95 + Math.random() * 0.0... }` |
| 15 | `api/ucr-router.ts` | FAKE_LIVE_METRIC | `score: Math.round((0.5 + Math.random() * 0.5) * 100) / 100,` |
| 16 | `api/ucr-router.ts` | FAKE_LIVE_METRIC | `const score = Math.round((0.5 + Math.random() * 0.5) * 100) / 100;` |

### التوزيع
- **FORBIDDEN_LABEL** (تسمية «consciousness» في كود الإنتاج): **11**
- **FAKE_LIVE_METRIC** (`Math.random()` يُقدَّم كمؤشر حيّ score/health/confidence): **5**

## خطة الإغلاق (موجة تنظيف مخصصة — لاحقة)
1. **التسميات:** استبدال «consciousness» في كود/واجهة الإنتاج بتوصيف صادق
   (`runtime loop` / `civilizational-mind` / اسم الوحدة الفعلي). صفحة
   `Consciousness.tsx` تُعاد تسميتها أو تُعلَّم بـ`codex-guard:allow` مع مبرر.
2. **المؤشرات المزيفة:** تحويل كل `Math.random()` في حقول `score/health/confidence`
   إلى قيمة محسوبة من بيانات فعلية، أو وسمها صراحةً كـ`demo/seed` غير حيّة.
3. بعد كل إصلاح: إعادة توليد `--emit-baseline` حتى يصل الإجمالي إلى **صفر**،
   ثم إزالة هذا الملف.

> حتى إغلاقها، هذه الديون **مرئية ومعلنة** — لا كتمان. هذا هو الفرق بين
> «الحارس يعمل» و«الحارس أُسكِت».
