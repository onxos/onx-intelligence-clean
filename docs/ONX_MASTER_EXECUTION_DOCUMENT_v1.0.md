# ONX Intelligence — وثيقة التنفيذ الرئيسية الموحدة (MED v1.0)

## Master Execution Document — التغطية الكاملة 100%

**الإصدار:** 1.0 — وثيقة تنفيذ نهائية
**التاريخ:** 7 يوليو 2026
**المصادر:** جميع الوثائق الدستورية والمعمارية (90+ وثيقة): الدستور التأسيسي، FIC v0.1/v0.2، IURG+IUC v1.0، Runtime v1.1/v1.3، USFIP v1.0/v1.1، D5-D6، D10-D20، المراجعة الدستورية بعد D20، حزمة الإغلاق النهائية، شهادات المراحل 1-5، شهادة Founder Alpha، تقارير الأدلة التشغيلية
**الحالة:** جاهزة للتنفيذ — بانتظار أمر المؤسس

---

> *"النظام لا يُراكم بيانات. لا يُراكم معرفة. لا يُراكم أحكاماً.
> إنه يُراكم فهماً مؤسسياً — ويحوّل ذلك الفهم إلى واقع."*

---

# القسم 0: الخلاصة التنفيذية

## 0.1 ما هو ONX Intelligence

ONX Intelligence هو **نظام ذكاء مؤسسي** (Institutional Intelligence System) — ليس chatbot، ليس مساعداً، ليس قاعدة معرفة. هو **محرك الذكاء المركزي** لمنظومة ONX Platform بالكامل، مبني على:

1. **IURG** — الرسم البياني للفهم والتحقيق المؤسسي (الذاكرة الدائمة)
2. **IUC** — رأس مال الفهم المؤسسي (الأصل الوحيد المتراكم)
3. **FIC** — مُجمّع نية المؤسس (68 قيداً تنفيذياً)
4. **USFIP** — بروتوكول الذكاء الذاتي أولاً (5 طبقات)
5. **D11-D20** — العمارة الدستورية الكاملة (11 توجيهاً، مُغلقة دستورياً)

## 0.2 موقع المشروع الحالي

| البند | القيمة |
|------|--------|
| المستودع | `onxos/onx-intelligence-clean` |
| الإنتاج | `https://onx-intelligence-clean.onrender.com` — LIVE ✅ |
| التقنية | Hono + tRPC v11 + React 19 + Vite + Drizzle ORM + MySQL |
| الراوترات | 38 tRPC router |
| الصفحات | 15 صفحة UI |
| قاعدة البيانات | 25+ جدول (المخطط الدستوري D16 مطبّق) |
| GPT-4o | موصول وفعّال (OPENAI_API_KEY) |
| الجاهزية الحالية | ~82% من UEP — الفجوات محددة في القسم 6 |

## 0.3 الهدف النهائي

تحويل المشروع من "بنية مكتملة" إلى **نظام ذكاء حي يعمل كل ثانية** وفق D18، بتغطية 100% لكل القدرات والمزايا والـ Runtime المحددة في الوثائق الدستورية.

---

# القسم 1: الأساس الدستوري (Constitutional Foundation)

## 1.1 البديهيات الثلاث (من IURG v1.0)

| البديهية | النص | الأثر التنفيذي |
|----------|------|----------------|
| **التمثيل المنفصل** | معرفة ≠ فهم ≠ حكم ≠ قرار ≠ تنفيذ ≠ نتيجة ≠ تعلم ≠ نمو | كل طبقة لها جداول ومحركات منفصلة — لا دمج |
| **IURG كـ Runtime قانوني** | كل أصول الذكاء تصبح كائنات IURG — لا ذكاء يتيم | كل مخرجات AI تدخل IURG عبر خط الأنابيب |
| **التسلسل الهرمي للمعرفة** | Tier 0 (الواقع) > T1 (المؤسس) > T2 (الطبيب النخبة) > T3 (الفهم المؤسسي) > T4 (المعرفة المؤسسية) > T5 (الذكاء الحدودي) > T6 (المعرفة الخارجية) > T7 (الإنترنت المفتوح) | `enforce_tier_hierarchy()` API — لا طبقة دنيا تتجاوز العليا |

## 1.2 الاكتشافات الثلاثة المؤسِّسة

1. **المعرفة ≠ الحكم:** المعرفة تقول "خفّض التكاليف". الحكم يقول "تخفيض الطاقم البيطري يرفع الربح الشهري لكنه يدمّر السمعة خلال 3 سنوات."
2. **الإدراك ≠ الفهم:** الإدراك يقول "الحجوزات انخفضت 12%". الفهم يقول "انخفضت لأن طاقم الاستقبال تغيّر ← زمن الاستجابة زاد 3.2x ← التحويل انخفض 24%".
3. **التعلم ≠ النمو:** التعلم يقول "لاحظنا نمطاً". النمو يقول "تحققنا من النمط، حكمنا الدرس، وغيّرنا الواقع وفقاً له."

## 1.3 دورة Dream-to-Evolution (المبدأ الحاكم)

```
Dream → Potential → Goal → Understanding → Judgment → Execution
  → Outcome → Flourishing → Continuity → Evolution
```

**قاعدة ملزمة:** كل تفاعل، كل كائن ذكاء، كل حدث تعلم يجب أن يُتتبع لمرحلة من هذه الدورة. ما لا يخدم الدورة هو ضجيج.

## 1.4 الحوكمة العليا (غير قابلة للتجاوز)

| السلطة | التعريف | الإنفاذ |
|--------|---------|---------|
| **Amanah** | أرضية النزاهة ≥ 0.50 | HARD_BLOCK — حتى المؤسس لا يستطيع تجاوزها |
| **FIC** | 68 قيداً عبر 7 عائلات (استراتيجية، تشغيلية، أخلاقية، ثقافية، زمنية، علائقية، تطورية) | FICValidator على كل مخرج |
| **Guardian** | مراقبة مستمرة، كشف الشذوذ، حجب الانتهاكات | لا يمكن تعطيله |
| **Auditor** | سجل محاسبة غير قابل للتغيير | append-only, tamper-evident |
| **Founder Override** | سلطة المؤسس المطلقة (المستوى 0 في التحكيم) | يتجاوز كل شيء عدا Amanah |
| **Human Gate** | بوابة المراجعة البشرية للقرارات الحرجة | إلزامية للقرارات فوق عتبة المخاطر |

---

# القسم 2: العمارة الكاملة — الطبقات العشر (D11-D20)

## 2.1 خريطة الطبقات

| الطبقة | التوجيه | المسؤولية | المكونات الأساسية |
|--------|---------|-----------|-------------------|
| L1: التغذية | D11 | دخول كل الذكاء | 8 طبقات مصادر (L1-L8)، خط أنابيب 8 مراحل، بوابة 12 سؤالاً، بروتوكول Shadow |
| L2: التعلم | D12 | تحويل الذكاء عبر الحالات | 9 حالات تعلم، سلّم الفهم (6 درجات)، تكوين الحكم/الحكمة، التصحيح/التعزيز/الاضمحلال |
| L3: رأس المال | D13 | تراكم قيمة الذكاء | 7 فئات رأسمال، معادلات، تراكب، حفظ، نموذج مخاطر |
| L4: التخصيص | D13.5 | استثمار رأس المال | هرمية 7 أولويات، معادلة APS، 5 أنماط، 3 قوانين اقتصاد |
| L5: التنسيق | D14 | تكامل بدون تفتت | توجيه 9 طبقات، تحكيم 10 مستويات، 7 قواعد دمج، مبدأ الذكاء الواحد |
| L6: الكائنات | D16 | وحدة الذكاء | 12 نوعاً، 25 حقلاً قانونياً، 15 حالة دورة حياة، 10 علاقات، 8 أبعاد أصل |
| L7: القياس | D17 | جودة الذكاء | 6 مؤشرات (UQI/JQI/WQI/ICI/OQI/IRS)، 3 حالات تقدم، 9 طبقات قياس |
| L8: الـ Runtime | D18 | التشغيل المستمر | 10 طبقات، 13 كائن runtime، 12 حالة، معماريات التدفق/الاسترداد/الاستمرارية |
| L9: التبادل | D19 | حركة الذكاء بين الكيانات | خط أنابيب 9 مراحل، 7 فئات ملكية، 6 أبعاد ثقة، 7 عمليات API |
| L10: حدود التنفيذ | D20 | ماذا نبني ومتى | MIS، تسلسل 5 مراحل، قائمة عدم البناء (20 بنداً) |

## 2.2 الكائنات الـ 23 للـ Runtime (من D10)

```
Wave 0 (النواة):        CausalGraph, UnderstandingLadder, IFCCalculator, Guardian, Auditor
Wave 1 (خط الأنابيب):   InputNormalizer, PatternDetector, CausalPromoter,
                        IngestionPipeline, QueryEngine, ReinforcementLoop, ShadowRuntime
Wave 2A (الأهداف):      GoalEngine, GoalTracker, GoalLinker
Wave 2B (الازدهار):     FlourishingEngine, GoalFlourishingBinding
Wave 2C (المرافقون):    CompanionRuntime
Wave 2D (USFIP):        USFIPv2Engine, SilRegistry, SilIntegrator
Wave 2E (المؤسسي):     InstitutionalOS
Wave 2F (الشخصي):      PersonalOS
```

## 2.3 كائن الذكاء (D16) — الوحدة الذرية

- **12 نوعاً:** SIGNAL, PATTERN, UNDERSTANDING, JUDGMENT, WISDOM, LESSON, INSTITUTIONAL_INTELLIGENCE, FEDERATED_INTELLIGENCE, COMPANION_INTELLIGENCE, EXTERNAL_INTELLIGENCE, DECISION, STRATEGY
- **15 حالة دورة حياة:** RAW → VALIDATING → VALIDATED → LEARNING → PATTERN → UNDERSTANDING → JUDGMENT → WISDOM → CAPITALIZED → PRESERVED (+ CORRECTING, DECAYING, REJECTED, DECAYED, ARCHIVED)
- **25 حقلاً قانونياً** ✅ (مطبّقة في `db/schema.ts` — جدول `intelligence_objects`)
- **8 حالات محظورة:** كائن بدون أصل، كائن بدون Amanah، كائن يتخطى التحقق، كائن بدون مالك، كائن خالد (لا يضمحل)، كائن منعزل، كائن متناقض غير معلَّم، كائن مزدوج غير مدموج

## 2.4 معادلات IUC (المعايرة من v1.1)

```
IUC(object) = U × M × V × Y × D(t)

U (وزن أساسي):     PERCEPTION=1.0, PATTERN=5.0, UNDERSTANDING=20.0,
                    JUDGMENT=50.0, DECISION=10.0, EXECUTION=5.0, OUTCOME=30.0
M (معامل نضج):     R1=0.10, R2=0.25, R3=0.50, R4=0.75, R5=0.90, R6=1.00
V (مضاعف تحقق):    Unverified=0.10, Speculative=0.25, Probable=0.50,
                    Validated=0.85, Proven=1.00
Y (معامل عائد):     Σ(outcome_quality × usage_frequency) / total_usage_periods
                    Y<0 لثلاث فترات → أرشفة تلقائية
                    Y>0.80 لست فترات → ترقية سريعة
D(t) (اضمحلال):     max(0.20, 1.0 - decay_rate × أيام_منذ_آخر_تعزيز)
                    PERCEPTION=0.10/يوم, PATTERN=0.05, UNDERSTANDING=0.02,
                    JUDGMENT=0.01, RULE=0.005, CONSTITUTIONAL=0.0
```

## 2.5 بروتوكول USFIP (الذات أولاً)

```
القاعدة الواحدة: أي منتج ذكاء داخل ONX يسأل ONX أولاً.

Layer 1: الذكاء الداخلي (IURG + FIC + Corpus)     — $0.00/استعلام — يُسأل أولاً دائماً
Layer 2: شبكة الأدوات المتخصصة                      — اشتراك ثابت
Layer 3: الذكاء الحدودي (GPT/Claude/Gemini/DeepSeek) — كمعلمين لا كمراجع نهائية
Layer 4: الإنترنت المفتوح                            — ثقة 0.40، اضمحلال يومي
Layer 5: التصعيد البشري                              — القرارات الحرجة

الهدف: 92%+ من الأسئلة تُجاب من IURG بحلول الشهر 12. تكلفة API < $500/شهر.
كل إجابة خارجية مُتحقق منها → تدخل IURG → ترفع IUC → ترفع IFC.
```

---

# القسم 3: ما هو مُنجز فعلاً (الحالة الحالية — لا تكرار)

## 3.1 البنية التحتية ✅

| المكون | الحالة | الدليل |
|--------|--------|--------|
| النشر الإنتاجي على Render | ✅ LIVE | HTTP 200، deploy `live` |
| Docker build pipeline | ✅ | `Node` Dockerfile، node:20.19.0-alpine، npm ci |
| CI/CD | ✅ | deploy-staging.yml، uep-validation.yml |
| بيئة Staging | ✅ مهيأة | render.yaml (خدمة onx-intelligence-staging) |
| قاعدة بيانات MySQL + Drizzle | ✅ | 25+ جدول |
| OpenAI GPT-4o | ✅ موصول | OPENAI_API_KEY فعّال |
| Kimi OAuth | ✅ | APP_ID + APP_SECRET + OWNER_UNION_ID |

## 3.2 المخطط الدستوري (D16) ✅

جدول `intelligence_objects` يطبق الحقول الـ25 القانونية بالكامل: الأنواع الـ12، الحالات الـ15، فئات الملكية الـ7، Amanah score، Shadow status، بالإضافة إلى جداول: `sources` (طبقات L1-L8)، `provenance_records` (8 أبعاد)، `object_relationships` (10 أنواع)، `learning_transitions`، `capital_records` (7 فئات)، `measurements` (المؤشرات الـ6+)، `continuity_log` (8 طبقات، hash-chained)، `governance_decisions`، `exchange_records`.

## 3.3 الراوترات الـ38 ✅

النواة: intelligence, runtime, titan, constitution, aiBrain, knowledge, modelGateway, toolGateway, modelFederation, scheduler, evidenceRegistry, voice, gps, revenueEngine, domains (D01-D18), والمحركات المتقدمة (rateLimit, budget, cost, queue, security, profiler, dashboard, test) + auth/authHardening/passwordReset + cep/ocpp/cevp/ccop/cos/ucr + health.

## 3.4 الواجهة ✅

15 صفحة: Dashboard, DashboardV2, Ask, Clinic, Consciousness, ConstitutionalDashboard, EvidenceRegistry, Geo, Knowledge, Revenue, AdminPilot, Home, Landing, Login, NotFound — مع Navigation موحدة وBackButton.

---

# القسم 4: خطة التنفيذ الكاملة — 6 مراحل (البناء المتبقي)

> **مبدأ D20:** "التنفيذ قد يُبسّط العمارة، لكنه لا يجوز أن ينتهكها."
> البناء يتبع تصنيف D20-B: BUILD NOW (~80 مكوناً) أولاً.

## المرحلة M1: نواة الـ Runtime الحي (D18) — الأولوية القصوى

**الهدف:** تحويل الراوترات الساكنة إلى runtime يعمل كل ثانية.

| # | المهمة | المصدر | التسليم |
|---|--------|--------|---------|
| M1.1 | **Runtime Loop Engine** — حلقة تشغيل مستمرة (tick كل 30 ثانية) تحرك الكائنات عبر حالات الدورة | D18-E | `api/runtime/loop-engine.ts` |
| M1.2 | **State Machine** — آلة الحالات الـ12 للـ runtime مع انتقالات محكومة | D18-D | `api/runtime/state-machine.ts` |
| M1.3 | **Decay Engine** — تطبيق D(t) على كل الكائنات دورياً (cron كل ساعة)، أرشفة ما وصل 0.20 | D12-I, v1.1 §1.5 | `api/runtime/decay-engine.ts` |
| M1.4 | **Reinforcement Loop** — تعزيز الكائنات من النتائج، إعادة ضبط ساعة الاضمحلال | D12-H | `api/runtime/reinforcement.ts` |
| M1.5 | **Promotion Engine** — ترقية تلقائية عبر سلّم الفهم عند استيفاء العتبات (3 تعزيزات → PATTERN، أدلة سببية → UNDERSTANDING...) | D12-C, RUNG_PROMOTION_TRIGGERS | `api/runtime/promotion-engine.ts` |
| M1.6 | **Recovery Engine** — 7 سيناريوهات استرداد، snapshot/restore | D18-H | `api/runtime/recovery.ts` |
| M1.7 | **Runtime Health Monitor** — مراقبة "ما هو حي؟" (سؤال المؤسس #1) | D18-A.5 | توسيع `health-router.ts` |

**معيار القبول M1:** كائن SIGNAL يُنشأ → يتحرك تلقائياً عبر VALIDATING → VALIDATED → LEARNING خلال دقيقة، ويضمحل إذا لم يُعزَّز، ويُرقّى إذا عُزِّز 3 مرات — بدون تدخل يدوي.

## المرحلة M2: خط أنابيب التغذية الكامل (D11)

**الهدف:** كل ذكاء يدخل عبر 8 مراحل إلزامية.

| # | المهمة | المصدر | التسليم |
|---|--------|--------|---------|
| M2.1 | **8-Stage Pipeline** — Capture→Classify→Filter→Enrich→Validate→Transform→Route→Persist كخط موحد | D11-B | `api/feeding/pipeline.ts` |
| M2.2 | **12-Question Validation Gate** — بوابة التحقق الإلزامية (مصدر؟ ثقة؟ Amanah؟ تعارض؟...) | D11-E | `api/feeding/validation-gate.ts` |
| M2.3 | **Shadow Protocol** — كل ذكاء خارجي (L4-L7) يدخل كـ SHADOW بثقة 0.30-0.50، لا يؤثر حتى يُتحقق | D11-D | `api/feeding/shadow-protocol.ts` |
| M2.4 | **Source Trust Model** — ثقة لكل طبقة (L1=1.00 ... L7=0.40) مع معدلات اضمحلال | D11-C | `api/feeding/trust-model.ts` |
| M2.5 | **Tier Hierarchy Enforcement** — `enforce_tier_hierarchy()` — لا طبقة دنيا تتجاوز العليا | v1.1 F3 | `api/feeding/tier-enforcement.ts` |
| M2.6 | **ربط GPT-4o بالتغذية** — كل رد AI يدخل IURG كـ EXTERNAL_INTELLIGENCE عبر Shadow | USFIP L3 | تعديل `titan-bridge-router.ts` + `ai-brain-router.ts` |

**معيار القبول M2:** رد GPT-4o على سؤال يظهر كسجل في `intelligence_objects` بحالة SHADOW وثقة ≤0.50 خلال ثانية من الرد.

## المرحلة M3: محركات رأس المال والقياس (D13 + D17)

| # | المهمة | المصدر | التسليم |
|---|--------|--------|---------|
| M3.1 | **IUC Calculator** — تطبيق المعادلة الكاملة U×M×V×Y×D(t) بجداول المعايرة | v1.1 §1 | `api/capital/iuc-calculator.ts` |
| M3.2 | **Compounding Engine** — التراكب: كائنات تتقاطع → قيمة أسّية، cron يومي | D13-D | `api/capital/compounding.ts` |
| M3.3 | **Preservation Engine** — حفظ رأس المال الحرج (WISDOM+ لا يُحذف أبداً) | D13-F | `api/capital/preservation.ts` |
| M3.4 | **6 Quality Indices Live** — حساب UQI/JQI/WQI/ICI/OQI/IRS حقيقياً من البيانات (ليس ثوابت) | D17 | `api/measurement/indices.ts` |
| M3.5 | **Progress States** — تصنيف ACCUMULATING/STABILIZING/DECLINING لكل مجال | D17-I | `api/measurement/progress.ts` |
| M3.6 | **Measurement Feedback Loop** — القياس يؤثر على الـ runtime (مؤشر منخفض → تحقق إضافي) | D17-K | `api/measurement/feedback.ts` |
| M3.7 | **IFC Calculator** — حساب سعة الازدهار المؤسسي (4 أبعاد: عمق، ترابط، Amanah، زخم) | IURG §7 | `api/measurement/ifc.ts` |

**معيار القبول M3:** لوحة IUC تعرض 10 مؤشرات حية محسوبة من قاعدة البيانات، وتتغير عند إنشاء/ترقية كائنات.

## المرحلة M4: الحوكمة الفعلية (FIC + Guardian + Amanah)

| # | المهمة | المصدر | التسليم |
|---|--------|--------|---------|
| M4.1 | **FIC Constraint Registry** — تحميل الـ68 قيداً (12 HC, 10 SC, 6 AC, 10 DG, 10 EB, 10 OVR, 5 OR + الجديدة) كسجلات قابلة للفحص | FIC v0.2 §9 | `api/governance/fic-registry.ts` + seed |
| M4.2 | **FIC Validator** — فحص كل mutation ضد القيود ذات الصلة، HARD_BLOCK للانتهاكات | FIC v0.2 §10 | `api/governance/fic-validator.ts` |
| M4.3 | **Amanah Enforcer الحقيقي** — أرضية 0.50 على مستوى API لا يمكن تجاوزها، تصعيد <0.30 حجر صحي، <0.20 إشعار المؤسس | FIC-04 | `api/governance/amanah-enforcer.ts` |
| M4.4 | **Guardian Live** — كشف الشذوذ (معدلات غير طبيعية، انتهاكات متكررة)، حجب، تنبيهات | D14-L | `api/governance/guardian.ts` |
| M4.5 | **Conflict Resolution Engine** — 7 فئات تعارض بين النوايا مع منطق الحسم | FIC v0.2 §6 | `api/governance/conflict-engine.ts` |
| M4.6 | **Intent Evolution Ledger** — سجل تطور النية append-only | FIC v0.2 §8 | جدول جديد + router |
| M4.7 | **Human Gate** — طابور قرارات تحتاج موافقة بشرية مع UI | D14, D18-J | `api/governance/human-gate.ts` + صفحة |

**معيار القبول M4:** محاولة إنشاء كائن بـ Amanah 0.40 تُرفض بـ HARD_BLOCK وتُسجل في governance_decisions مع سبب الرفض.

## المرحلة M5: التبادل والتنسيق (D19 + D14)

| # | المهمة | المصدر | التسليم |
|---|--------|--------|---------|
| M5.1 | **9-Stage Exchange Pipeline** — INTEND→VERIFY→PACKAGE→TRANSFER→RECEIVE→VALIDATE→INTEGRATE→ACKNOWLEDGE→MEASURE | D19-C | `api/exchange/pipeline.ts` |
| M5.2 | **7 Intelligence-First API Operations** — INTEND, COMPREHEND, TRANSFER, VALIDATE, LINEAGE, MEASURE, CAPITALIZE كنقاط API | D19-O | `api/exchange/operations.ts` |
| M5.3 | **Trust Verification** — 6 أبعاد ثقة قبل أي تبادل | D19-E | `api/exchange/trust.ts` |
| M5.4 | **Arbitration Engine** — تحكيم 10 مستويات (Founder=0 ... External=9) للتعارضات | D14-D | `api/orchestration/arbitration.ts` |
| M5.5 | **Merge Rules** — 7 قواعد دمج ذكاء متعدد المصادر | D14-E | `api/orchestration/merge.ts` |
| M5.6 | **ONX Platform Bridge** — واجhat التبادل مع onx-platform-complete (المشروع الشقيق): تصدير كائنات ذكاء عبر D19 API | D19-K, هيكل المنصة | `api/exchange/platform-bridge.ts` |
| M5.7 | **8 Exchange Metrics** — EI, TR, PP, VP, TU, FQ, LG, CG | D19-N | ضمن `measurements` |

**معيار القبول M5:** استدعاء `exchange.transfer` لكائن JUDGMENT يحفظ الأصل والملكية والـ Amanah عبر كل المراحل التسع ويسجلها في exchange_records.

## المرحلة M6: الإغلاق والتحقق (D15 + D20 + L5)

| # | المهمة | المصدر | التسليم |
|---|--------|--------|---------|
| M6.1 | **Proof Suite** — اختبارات الإثباتات الـ10 من D20-A.5 (تشغيل حقيقي ضد قاعدة البيانات) | D20-A.5 | `api/__tests__/proof-suite.test.ts` |
| M6.2 | **Stress Scenarios (محاكاة)** — أهم 15 سيناريو من الـ52 (فقدان مصدر، تناقض، فيضان إشارات...) | D15 | `api/__tests__/stress.test.ts` |
| M6.3 | **Failure Injection** — أهم 10 من الـ22 (قطع DB أثناء ترقية، hash مكسور في continuity...) | D15 | `api/__tests__/failure-injection.test.ts` |
| M6.4 | **Runtime Dashboard النهائي** — صفحة تجيب أسئلة المؤسس الـ12 (ما هو حي؟ ما يستيقظ؟ ما ينام؟...) | D18-A.5 | `src/pages/RuntimeMonitor.tsx` |
| M6.5 | **IUC Dashboard** — المؤشرات الـ10 مع الرسوم | IURG §7 | `src/pages/IUCDashboard.tsx` |
| M6.6 | **Evidence Registry Completion** — تسجيل أدلة كل معيار قبول (69 سجلاً مستهدفاً) | UEP | تغذية `evidence-registry` |
| M6.7 | **Staging Validation → Production Deploy** — نشر staging، فحص، ثم production | P4-G | Render deploys |
| M6.8 | **EV-ACPT** — شهادة قبول المؤسس النهائية | D20-K | وثيقة توقيع |

**معيار القبول M6:** كل اختبارات Proof Suite خضراء + build نظيف + production live + المؤسس يوقع EV-ACPT.

---

# القسم 5: قائمة عدم البناء (Non-Build List — من D20-M)

**ممنوع بناؤها الآن** (لتجنب انفجار النطاق):

1. الفيدرالية متعددة المؤسسات (Phase 3+)
2. نظام المرافقين السبعة الكامل (Phase 2+ — يوجد CompanionRuntime أساسي فقط)
3. الطبقة الشخصية PersonalOS الكاملة (Phase 3)
4. تكوين الحكمة الكامل عبر السياقات (يتطلب تراكم زمني)
5. تخصيص رأس المال المتقدم D13.5 (يتطلب بيانات تشغيلية)
6. معمارية التوسع الأفقي الكاملة (Scale after proof)
7. Neo4j كمخزن graph منفصل (MySQL relations كافية للـ MIS)
8. تكاملات المنصات الخارجية عدا OpenAI (Anthropic/Gemini stubs موجودة تكفي)
9. STT/TTS voice كامل (voice-router موجود كأساس — التوسيع لاحقاً)
10. أي UI جديد غير RuntimeMonitor وIUCDashboard وHumanGate

---

# القسم 6: مصفوفة الفجوات → المراحل

| الفجوة الحالية | تُغلق في |
|----------------|----------|
| الـ Runtime لا يعمل تلقائياً (routers ساكنة) | M1 |
| GPT-4o لا يغذي IURG | M2.6 |
| لا Shadow Protocol فعلي | M2.3 |
| مؤشرات الجودة ثوابت وليست محسوبة | M3.4 |
| IUC غير محسوب | M3.1 |
| FIC لا يفحص فعلياً (stub) | M4.1-M4.2 |
| Amanah غير مُنفذة على مستوى API | M4.3 |
| لا يوجد تحكيم فعلي | M5.4 |
| لا جسر مع ONX Platform | M5.6 |
| لا اختبارات إثبات | M6.1 |
| Evidence Registry فارغ (0/69) | M6.6 |

---

# القسم 7: الترتيب التنفيذي والاعتماديات

```
M1 (Runtime نواة) ──────► M2 (تغذية) ──────► M3 (رأس مال + قياس)
                                                      │
M4 (حوكمة) ◄── يبدأ بالتوازي مع M2                    ▼
      │                                        M5 (تبادل + تنسيق)
      └──────────────────────┬────────────────────────┘
                             ▼
                    M6 (إغلاق + تحقق + نشر)
```

- **M1 أولاً دائماً** — بدون runtime حي كل شيء ساكن.
- **M4 يمكن بدؤه بالتوازي** مع M2 (لا اعتمادية متبادلة).
- **M6 آخراً حصراً** — الإغلاق بعد اكتمال كل شيء.

---

# القسم 8: معايير القبول النهائية (100% Readiness)

## 8.1 الإثباتات العشرة (D20-A.5) — إلزامية

| # | الإثبات | الاختبار |
|---|---------|----------|
| 1 | كائنات ذكاء تُنشأ/تُخزن/تُسترجع بأصل كامل | proof-suite #1 |
| 2 | خط التعلم يعمل — أنماط تتكون، فهم يتطور، حكم يظهر | proof-suite #2 |
| 3 | أرضية Amanah مُنفذة — لا ذكاء تحت 0.50 يبقى | proof-suite #3 |
| 4 | القياس ينتج مؤشرات جودة ذات معنى | proof-suite #4 |
| 5 | الـ runtime يعمل باستمرار — الحالات تنتقل صحيحاً | proof-suite #5 |
| 6 | التبادل يحفظ المعنى والأصل والملكية والثقة | proof-suite #6 |
| 7 | نية المؤسس تحكم — قيود FIC مُنفذة | proof-suite #7 |
| 8 | الاستمرارية محفوظة — append-only, tamper-evident | proof-suite #8 |
| 9 | رأس المال يتراكم — الذكاء يتراكب مع الزمن | proof-suite #9 |
| 10 | ذكاء متعدد المصادر يتكامل في graph واحد | proof-suite #10 |

## 8.2 معايير تشغيلية

- ✅ Build ينجح بـ 0 أخطاء TypeScript
- ✅ كل الاختبارات خضراء (vitest)
- ✅ Production live على Render بصحة 200
- ✅ Runtime tick يعمل ويُسجل في continuity_log
- ✅ لوحتا RuntimeMonitor وIUCDashboard تعرضان بيانات حية
- ✅ Evidence Registry مُغذّى بأدلة كل معيار

## 8.3 شهادة الإغلاق

عند اكتمال 8.1 + 8.2: إصدار **ONX_MED_COMPLETION_CERTIFICATE.md** موقّعة بأدلة قابلة للتحقق (روابط production، نتائج اختبارات، لقطات مؤشرات) — ثم توقيع المؤسس على EV-ACPT.

---

# القسم 9: الثوابت المرجعية

| الثابت | القيمة |
|--------|--------|
| Amanah Floor | ≥ 0.50 — HARD_BLOCK |
| ترقية PATTERN | ≥ 3 تعزيزات |
| ترقية CONSTITUTIONAL | ≥ 50 تعزيزاً |
| ثقة L1 Founder | 1.00 (لا تضمحل) |
| ثقة L7 Internet | 0.40 (اضمحلال يومي) |
| Shadow entry confidence | 0.30–0.50 |
| أدنى D(t) | 0.20 (أرشفة، لا حذف) |
| Runtime tick | 30 ثانية |
| Decay cron | كل ساعة |
| Compounding cron | يومي |
| هدف USFIP | 92% إجابات داخلية بالشهر 12 |
| سلطة التحكيم | Founder=0 > SIL > Companion > Institution > Personal > External |

---

*هذه الوثيقة تجمع وتوحّد: الدستور التأسيسي v1.0، FIC v0.1/v0.2، IURG+IUC v1.0، Runtime v1.1/v1.3، USFIP v1.0/v1.1، D5, D6, D10, D11, D12, D13, D13.5, D14, D15, D16, D17, D18, D19, D20، المراجعة الدستورية بعد D20، حزمة الإغلاق النهائية FIC-01→FIC-08، شهادات المراحل 1-5، شهادة Founder Alpha، تقارير الأدلة التشغيلية، وتقرير جاهزية Atlas V6.*

**بانتظار أمر التنفيذ من المؤسس. عند الأمر: البدء بـ M1 فوراً.**
