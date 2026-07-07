# وثيقة التنفيذ الرئيسية الموحدة — ONX Intelligence
# MASTER EXECUTION DOCUMENT (MED) v2.0

> ⚠️ **SUPERSEDED BY v3.0** — هذه الوثيقة لم تعد المرجع الحاكم. المرجع النافذ: `ONX_MASTER_EXECUTION_DOCUMENT_v3.0.md` (يغطي المنصة + الذكاء + الجسر). تبقى v2.0 نافذة **كمواصفة تفصيلية للخط I (الذكاء)** فقط، بإحالة صريحة من القسم 6 في v3.0. (وفق HC-04: لا حذف — إحلال موثّق)

> **الحالة:** SUPERSEDES v1.0 (وفق مبدأ HC-04: لا حذف — إحلال موثّق فقط)
> **التاريخ:** 2026-07-07
> **المصدر:** قراءة كاملة لـ 90+ وثيقة دستورية ومعمارية وبحثية وتشغيلية + كود Runtime v3.0 + سجلات الاعتماد
> **الغرض:** الوثيقة الواحدة التي تغطي 100% من القدرات والمزايا والـ Runtime — المرجع الوحيد للتنفيذ

---

## القسم 0 — خريطة الحقيقة: ثلاث منظومات، مصير واحد

| المنظومة | الحالة | المحتوى |
|---|---|---|
| **1. المنظومة المعتمَدة (v8)** — NestJS على `onx-intelligence-v8.onrender.com` | ✅ LIVE ومُعتمدة | 50/50 برهان بناء (5 مراحل × 10)، Founder Alpha 9/9، 79 endpoint، 21 نموذج DB، 168 ملف، MO-025 يأذن بـ Atlas V6 |
| **2. Runtime v3.0** — `zlzrp2.ts` (1,468 سطر) | ✅ كود كامل جاهز للدمج | Multi-Provider AI (GPT-4o/Claude/Gemini + fallback)، Rate Limit 100 RPM، Budget $10/يوم، Bull Queue، Cron، Behavioral Profiler، Adaptive Dashboard، 30 اختبار Gherkin، 40+ tRPC endpoint |
| **3. هذا المستودع (clean)** — Hono+tRPC+React على `onx-intelligence-clean.onrender.com` | ✅ LIVE — قيد البناء | 38 راوتر، 15 صفحة، مخطط D16 كامل (25 حقلاً)، GPT-4o موصول، سجل استمرارية hash-chained |

**قرار معماري ملزم:** هذا المستودع (clean) هو **جسم التنفيذ الموحد** الذي تُنقل إليه قدرات المنظومتين 1 و2 تدريجياً، ويُبنى فيه ما لم يُبنَ بعد — **بدون إعادة بناء ما ثبت (No-Duplication Principle)**.

---

## القسم 1 — الهوية الدستورية

### 1.1 ما هو ONX Intelligence (وما ليس هو)

ONX = **نظام ذكاء مؤسسي** يراكم **رأس مال الفهم المؤسسي (IUC)** عبر رسم بياني سببي معتمد (IURG).
**ليس:** chatbot، copilot، agent framework، RAG tool، vector DB، KM system، enterprise AI، decision support (البيان 31: التقارب مع هذه الفئات = فشل معماري — EB-09).

**ONX Platform ≠ ONX Intelligence** — المنصة: ERP/CRM/EMR/POS/HR/Finance/Inventory/Mobile/Telemedicine/Academy. الذكاء: Perception, Understanding, Judgment, Learning, Memory, Constitutional Reasoning, Founder Alignment, IUC, Reality Realization.

### 1.2 البديهيات الثلاث (Axioms)

1. **التمثيل المنفصل:** معرفة ≠ فهم ≠ حُكم ≠ قرار ≠ تنفيذ ≠ نتيجة ≠ تعلّم ≠ نمو — كل منها كائن مستقل.
2. **IURG هو الـ Runtime القانوني:** كل أصل ذكاء = كائن IURG. لا مخازن موازية. لا ذكاء يتيم. (HC-12: عقل واحد موحد)
3. **هرمية المعرفة الثمانية:** T0 الواقع > T1 الـFounder > T2 Elite Vet > T3 الفهم المؤسسي > T4 المعرفة المؤسسية > T5 Frontier AI > T6 خارجي > T7 إنترنت — **الأدنى لا يتجاوز الأعلى أبداً**.

### 1.3 الاكتشافات الثلاثة غير القابلة للنقض (HC-10)

`Knowledge ≠ Judgment` • `Perception ≠ Understanding` • `Learning ≠ Growth`

### 1.4 المبادئ الدستورية السبعة (MO-029/030)

**أمانة (Amanah)** — أرضية صلبة ≥ 0.50 HARD_BLOCK لا يتجاوزها حتى الـFounder • **عدل (Adl)** • **إحسان (Ihsan)** • **حكمة (Hikmah)** • **رحمة (Rahmah)** • **إتقان (Itqan)** • **توكل (Tawakkul)**

### 1.5 Founder Intent Compiler — FIC v0.2 (النسخة النافذة)

**47 بيان مؤسِّس** → **38 كائن نية قانوني** (FI-2026-0001..0038) في **15 فئة** (مبادئ، قرارات، مقايضات، إخفاقات، نجاحات، استثناءات، أزمات، نمو، رحمة، سمعة، تجاري، طبي، أشخاص، توسع، غير قابل للتفاوض) → **68 قيداً تنفيذياً**:

| النوع | العدد | الطبيعة |
|---|---|---|
| HC (صلب) | 12 | انتهاك = رفض تلقائي (لا تحديث أوزان حي، لا قرار طبي/توظيف ذاتي، لا حقائق بلا دليل، لا حذف تدميري، لا تقارب سلعي، Frontier AI إلزامي، Corpus إلزامي، سيادة نية المؤسس، معرفة مهيكلة، الاكتشافات الثلاثة، لا بدء من صفر، عقل واحد) |
| SC (مرن) | 12 | افتراضات قوية قابلة للتجاوز الموثق (تعلم 3 درجات، Shadow Learning، 3 تكرارات للنمط، تحقق فرعين، مصدران للفهم، تحقق زمني، شفافية أزمات SC-11، تطوير قبل استبدال SC-12) |
| AC (استشاري) | 6 | RAG+KG قبل fine-tuning، IUC كمؤشر أساسي، أولوية أدلة Elite Vet، ازدهار طويل > ربح قصير |
| DG (بوابات قرار) | 12 | طبي/موظفون/استراتيجي/خصم>30%/نشر نموذج/تعديل دستوري/Playbook/حساس جديد/ترقية حكم DG-09/مأسسة قاعدة DG-10/علامة تجارية DG-11/رحمة DG-12 |
| EB (حجب تنفيذ) | 12 | ربح-فوق-رعاية، خفض طاقم إكلينيكي، ادعاء بلا دليل، بدء فارغ، عقل موازٍ، تحديث أوزان حي، كتابة تدميرية، انزياح نطاق، Corpus مفقود، خصم يجذب شرائح خاطئة EB-11، رد آلي على مراجعات سلبية EB-12 |
| OVR (تحقق نتائج) | 10 | جودة رعاية 30 يوم، نزاهة إيراد، احتفاظ، رضا، سمعة، أمانة 90 يوم، مساهمة IUC شهرية، امتثال FIC، كفاءة تكلفة API، أداء نموذج |
| OR (تجاوزات) | 5 | طوارئ طبية (إخطار خلال ساعة)، تجاوز مؤسس مباشر، طاقة طارئة، أمن، طوارئ دستورية |

### 1.6 محرك حل التعارضات — 7 فئات + هرمية أولويات 8 مستويات

C1 نمو/رعاية • C2 سرعة/جودة • C3 ربح/رحمة • C4 أتمتة/ثقة • C5 توسع/استقرار • C6 كفاءة/سمعة • C7 مؤسس/دليل
الهرمية: طوارئ/سلامة > قانوني > ركائز دستورية > غير قابل للتفاوض > نية مؤسس نشطة > حكم مؤسسي > تجريبي > استشاري.
C7 لا يُحل تلقائياً أبداً — **الأدلة تُعلم، والمؤسس يقرر**.

### 1.7 المراجعة الدستورية + سجل تطور النية

- مساران: **عادي** (14-30 يوم: أدلة 3 أيام → لجنة 7 → مؤسس 5 → قرار 2 → تنفيذ 3-14) و**طارئ** (4-72 ساعة، نية مؤقتة صلاحية 14 يوماً).
- **Intent Evolution Ledger:** append-only، سلسلة hash، 11 نوع حدث (creation…violation_detected)، لا UPDATE/DELETE أبداً، نافذة تراجع 90 يوماً.
- الإصدار الدلالي MAJOR.MINOR.PATCH + 6 حالات دورة حياة (DRAFT/ACTIVE/SUPERSEDED/DEPRECATED/UNDER_REVIEW/EXPERIMENTAL).

---

## القسم 2 — نواة الذكاء: IURG + IUC

### 2.1 IURG — 16 نوع كائن

**7 أساسية (السلسلة السببية):** PERCEPTION → PATTERN → UNDERSTANDING → JUDGMENT → DECISION → EXECUTION → OUTCOME
**2 طبقة قيود:** FOUNDER_INTENT (FI-2026-NNNN) + CONSTITUTIONAL_CONSTRAINT
**7 داعمة:** EVIDENCE، REVIEW، AMENDMENT، CONFLICT، OVERRIDE، VALIDATION، LEARNING_EVENT
**الحواف (10+):** detected_in, leads_to, informs, guides, triggers, produces, validates/refutes/refines (حلقة التغذية الراجعة), derives, constrains, supported_by, conflicts_with, supersedes

### 2.2 سلّم الفهم — قواعد ترقية تنفيذية

| الترقية | العتبة | البوابة البشرية |
|---|---|---|
| R1→R2 نمط | 3 تكرارات + مصدران + ثقة ≥0.60 | لا (فوري آلي) |
| R2→R3 فهم | سببية + سياق + توافق FIC + ثقة ≥0.75 | لا (1-7 أيام) |
| R3→R4 حكم | فرعان + دورتان زمنيتان + ثقة ≥0.85 | **DG-09 مدير عمليات** |
| R4→R5 قاعدة مؤسسية | سنة + 3 سياقات + ثقة ≥0.92 + صفر تجاوزات 6 أشهر | **DG-10 المؤسس** |
| R5→R6 مبدأ دستوري | 3 سنوات + جوهري للهوية + ثقة ≥0.95 + صفر تجاوزات مدى الحياة | **إجماع الفريق المؤسس** |

+ 5 مسارات تراجع (rollback) معاكسة + 4 إحصاءات سلّم (velocity/quality/coverage/risk).

### 2.3 معادلة IUC والمعايرة

```
IUC(t) = Σ[U×C×M×V×Y×D(t)] − Σ[جزاءات مخاطر/تجاوزات] + Σ[مكافآت استقرار]
```

| المكوّن | القيم المعايَرة |
|---|---|
| U (وزن النوع) | PERCEPTION=1، PATTERN=5، UNDERSTANDING=20، JUDGMENT=50، DECISION=10، EXECUTION=5، OUTCOME=30 |
| M (نضج بالدرجة) | R1=0.10 → R6=1.00 |
| V (تحقق) | Unverified=0.10 → Proven=1.00 |
| D(t) (اضمحلال يومي) | PERCEPTION 0.10 … CONSTITUTIONAL 0.0 — حد أدنى D=0.20 |
| تراكم | α=1.0 ولادة، β=0.3 تعزيز، γ=0.05 اضمحلال، δ=0.8 نقل |
| تركيب | compound_bonus = weight(V) × overlap × 0.25 |
| نقل | quality = base × context_similarity × 0.85؛ <0.60 مراجعة بشرية؛ <0.40 حجب |
| مخاطر | URS = 0.25·decay + 0.25·concentration + 0.30·drift + 0.20·catastrophe |

**7 بوابات تحقق (VG):** ثقة ≥0.60 • مصدران+ • دليل Probable+ • توافق FIC • سقف اضمحلال 0.30 • نقل ≥0.60 • مخاطر <0.60

### 2.4 لوحة IUC — 11 مؤشراً بمعادلات تنفيذية

TUC (رأس المال الكلي) • UGR (نمو ≥3%/شهر) • UY (عائد >0.60) • URS (مخاطر <0.30) • UC (تركيز <0.40) • UCV (تغطية >0.80) • UT (قابلية نقل >0.70) • UM (نضج >3.0) • UVR (تحقق >0.85) • CAS (توافق دستوري >0.95) • FAS (توافق مؤسس >0.95)

### 2.5 النموذج المعرفي للمؤسس (Founder Cognitive Model)

- **8 أبعاد تفضيل:** مقايضة (رعاية/ربح 0.85)، مخاطرة (طبي≈صفر)، أفق زمني (استرداد 18 شهراً)، نمو (عضوي/جودة أولاً)، جودة (طبي غير قابل للتفاوض)، ثقة (AI أداة لا كاهن)، رعاية (الحيوان أولوية مطلقة)، دليل (مصدران+، Proven/Probable فقط)
- **10 أنماط قرار** (FDP-001..010): سؤال الرعاية أولاً 0.95، السمعة ثانياً، الأشخاص ثالثاً، الدليل رابعاً…
- **5 سلوكيات تجاوز** (FOB-001..005) + ملف تعلّم + ملف تصعيد (طبي=دقائق، استراتيجي=24-48 ساعة) + ملف تواصل

### 2.6 Purpose Compiler — سلسلة الغاية التساعية

`أمانة → حياة → إمكانات → فاعلية → تنفيذ → تحقيق → ازدهار → استمرارية → تطور`
كل كائن IURG يعبر **بوابة الغاية** (7 أسئلة): أي "لا" → علم للمراجعة؛ ≥3 "لا" → حجب وتصعيد للمؤسس.

### 2.7 حزمة التنفيذ الجاهزة (من الوثيقة القانونية)

- **PostgreSQL:** iuc_snapshots، iurg_objects، intent_evolution_ledger (hash chain)، iurg_audit_log، founder_cognitive_model، purpose_alignment
- **8 خدمات Runtime:** IURG Core، IUC Calculator، Understanding Engine، FIC Enforcer، Purpose Compiler، Dashboard API، Event Processor، Ledger Writer
- **6 مواضيع أحداث:** iurg.object.created/promoted/decayed، iurg.conflict.detected، iurg.fic.enforcement، iuc.snapshot.daily
- **8 بوابات CI/CD** (CG-1..8) + **20 اختباراً قانونياً** (T-001..T-020)

---

## القسم 3 — طبقات المعمارية D11 → D20

| التوجيه | الجوهر | المكونات المفتاحية |
|---|---|---|
| **D11 التغذية** | إدخال الإشارات | طبقات مصادر L1-L8، استخراج إشارة، إثراء سياقي → كائنات SIGNAL |
| **D12 التعلم** | تحويل الإشارة لفهم | endpoints: reinforce / decay / correct / unlearn / transfer؛ دورة: دليل→بصيرة→رأسمال→تعزيز |
| **D13 رأس المال** | تراكم جودة الحكم | 7 فئات رأسمال (Understanding, Judgment, Wisdom, Relationship, Institutional, Reality, Flourishing) |
| **D13.5 التخصيص** | أين يذهب جهد الذكاء | **APS بـ6 أبعاد** (FI, RC, WL, CM, CS, FA) • **7 أولويات P1-P7** (P1 = تجاوز الاستمرارية) • **5 أوضاع** (Preservation/Reinforcement/Expansion/Transfer/Evolution) • **7 مسارات تحويل** • **3 قوانين اقتصاد** • **9 أهداف تخصيص** • **7 أنماط فشل** (Hoarding, Fragmentation, Concentration, Fashion, Drift, False Compounding, Paralysis) |
| **D14 التنسيق** | توجيه متعدد السياقات | selectSource / route / perspectives / arbitrate؛ حدود مؤسسية + خصوصية شخصية |
| **D15 البرهان/الإجهاد** | التحقق القاسي | **8 معايير برهان** • **52 سيناريو إجهاد** • **22 حقن فشل** (كشف/احتواء/تعافٍ 100%) • **6 اختبارات تناقض** (مصدر/مصدر، حكمة/واقع، مؤسس/مؤسسة، رفيق/رفيق، مجال/مجال، شخصي/مؤسسي) |
| **D16 الكائن** | التمثيل القانوني | 12 نوعاً، **25 حقلاً**، 15 حالة، 10 علاقات، 8 أبعاد provenance، 8 حالات محرمة — ✅ **منفذ بالكامل في مخطط هذا المستودع** |
| **D17 القياس** | ضمان الجودة | 6 مؤشرات: OQI, ICI, JQI, WQI (معايير برلين الخمسة), UQI, IRS |
| **D18 الـRuntime** | "ما يحدث كل ثانية" | 8-10 طبقات تشغيل، 13 كائن runtime، 12 حالة، أسئلة المؤسس الاثنا عشر (ما الحي؟ ما يستيقظ؟ ما يضمحل؟…) |
| **D19 التبادل** | مشاركة عبر مؤسسات | FEDERATED_INTELLIGENCE، سجلات اتحاد، حدود خصوصية، تراكم رأسمال مشترك (Elite Vet ↔ Pawz ↔ Vets Van) |
| **D20 حد التنفيذ** | ما يُبنى الآن | MIS: 4 أنواع كائن، مؤسسة واحدة، API-only، 5 مراحل، ~80 مكوناً BUILD NOW، قائمة عدم بناء 20 بنداً |

---

## القسم 4 — برنامج الذكاء الحدودي (Frontier Intelligence Program)

### 4.1 عشرة مسارات بحث تغذي المعمارية

| المسار | يغذي |
|---|---|
| T01 ذكاء بشري | D16 (مطابقة أنماط الخبراء) |
| T02 ذكاء تعلم | D12 (منحنيات نسيان، تكرار متباعد) |
| T03 ذكاء عاطفي | D14 (سياق عاطفي في ثالوث طبيب-حيوان-مالك) |
| T04 ذكاء سلوكي | D12 (كشف إرهاق، أنماط قرار) |
| T05 ذكاء حيواني | العمق البيطري — **الميزة الفاصلة عن كل المنافسين** (إدراك كلبي، تعلق، إجهاد HPA، مقاييس ألم) |
| T06 ذكاء جمعي | D19 (تعلم حلقة مزدوجة، نقل مع ترجمة سياق) |
| T07 ذكاء حكمة | D13 (نموذج برلين 5 معايير، WISDOM capital) |
| T08 ذكاء حضاري | D20 + FIC (ذاكرة 6 مستويات: فرد→فريق→مؤسسة→ثقافة→اتحاد→حضارة) |
| T09 ذكاء ازدهار | D13 (VanderWeele 6 أبعاد + PERMA، FLOURISHING capital) |
| T10 سيادة الذكاء | **أساس D11-D20 كلها** (ISMF، Shadow Protocol، حلقة سيادة) |

### 4.2 القدرات الثلاثون

**20 أساسية:** تمييز أنماط سلوكية، استدلال حالة عاطفية، تحليل إجهاد صوتي، قراءة لغة جسد، كشف تردد، إشارات ثقة، كشف احتراق وظيفي، ديناميكا الثالوث، تقييم رابطة مربّي-حيوان، جودة تواصل طبيب-عميل، كشف مخاطر تشغيلية خفية، أنماط قرار الملاك، تفسير سلوك حيواني، دمج سياق سريري متعدد الوسائط، مولدات رعاية وقائية، أداء طاقم (ببوابة خصوصية)، تكيف ثقافي، مسارات صحية طولية، تكامل مخزون-عمليات-عيادة، علوم تعلم.
**10 مستقبلية:** microexpressions، مقياس تكشيرة ألم آلي، prosody صوتي، مناخ موعد لحظي، فعالية تدخلات وقائية، كفاءة حفظ معرفة الطاقم، جودة تزامن الثالوث، تنبؤ امتثال المالك، تحسين أشجار قرار سريرية، نقل أفضل الممارسات عبر العيادات.

### 4.3 سجل الأصول — 120 أصلاً

50 حدودية + 30 عالمية + 15 Alpha + 12 تنفيذية + 10 حوكمة + 10 فرضيات بحث؛ مصنفة P1/P2/P3؛ **10 للتحقق الآن، 6 لمزيد بحث، 4 مؤجلة، 5 محظورة** (خط زمني 12 أسبوعاً).

### 4.4 المحظورات المطلقة (5) والمؤمّنة (10)

🚫 **محظور نهائياً:** قراءة عقول • استغلال عاطفي • أنماط مظلمة (dark patterns) • قرارات سريرية ذاتية • ادعاءات يقين عن حالات خفية.
🔒 **مؤمّن بضوابط أخلاقية (15 ضابطاً):** كشف الاحتراق (بموافقة)، الاستدلال العاطفي (إطار موافقة)، تحليل أداء الطاقم (بوابة خصوصية)…

### 4.5 ما أثبتته دورات Alpha الست (سجل تشغيلي حقيقي)

83 كائن ذكاء (32 PATTERN، 19 UNDERSTANDING، 8 WISDOM) • رأسمال 344.2250 • KSR 97.59% • PDR 2.41% • KRR 50.6% • JQI 0.7842→**0.9858** • 6/6 تحقق FIC • **صفر انتهاك أمانة** • 14 قوة حصرية مقابل 20 فجوة في أنظمة AI العالمية (35+ نظاماً حُلل).

---

## القسم 5 — طبقة أنظمة التشغيل: 25 كائن Runtime

### 5.1 الدورة الدستورية (11 مرحلة)

`Dream → Potential → Goal → Understanding → Judgment → Execution → Outcome → Flourishing → Continuity → Evolution → Dream Renewal`
(10 صريحة + تجديد الحلم كآلية عرضية) — جاهزية D10-R1: **93/100**، اختبارات **177/177** ✅

### 5.2 الكائنات الخمسة والعشرون (Waves 0 → CCP)

| الموجة | الكائنات |
|---|---|
| Wave 0 | CausalGraph، UnderstandingLadder، IFCCalculator، Guardian، Auditor |
| Wave 1 | InputNormalizer، PatternDetector، CausalPromoter، IngestionPipeline، QueryEngine، ReinforcementLoop، ShadowRuntime |
| Wave 2A-2F | GoalEngine/Tracker/Linker، FlourishingEngine، GoalFlourishingBinding، CompanionRuntime، USFIPv2Engine، SilRegistry، SilIntegrator، InstitutionalOS، PersonalOS |
| **CCP-A** | **InstitutionalDecisionEngine** — دورة قرار DRAFT→REVIEW→APPROVED/REJECTED→EXECUTE + **7 أسئلة دستورية** (أي حلم؟ أي إمكانات؟ أي هدف؟ أي فهم؟ أي مخاطر؟ أثر الازدهار؟ أثر IFC؟) + جودة قرار = متوسط توافقي |
| **CCP-B** | **ContinuityEngine** — 7 فئات عناصر (معرفة/ممارسة/علاقة/مبدأ/قدرة/ثقافة/تاريخ) + لقطات 7 أسئلة + survivalScore + تنبؤ 30/90 يوماً + تتبع التحولات |

### 5.3 D05 Personal OS و D06 Institutional OS

- **شخصي:** 9 طبقات، **5 ركائز دستورية** (Agency, Privacy, Amanah, Context Ownership, Flourishing)، 13 مؤشر ازدهار شخصي، أحلام PRIVATE افتراضياً، `exportContext()` للاستمرارية.
- **مؤسسي:** 7 طبقات، 9 مؤشرات، قاعدة عدم الاختزال، يفوّض الحكم لـ InstitutionalDecisionEngine.
- **حدود نظيفة مثبتة:** PrivacyEnforcer + BoundaryGuard — لا مسارات تسريب.

### 5.4 الرفقاء السبعة — 7 تجليات، ذكاء واحد

| الرفيق | السلطة | السياق |
|---|---|---|
| Founder | SUPREME | رؤيوي — كل البيانات — بوابة 7 |
| Executive | HIGH | استراتيجي |
| Operator / Builder | MEDIUM | تكتيكي / مشاريع |
| Analyst | MEDIUM | استعلامات فهم عميقة |
| Clinic | MEDIUM | مرضى وسريري |
| Personal | MEDIUM | شخصي فقط |

المصدر واحد (IURG نفسه)، الحوكمة واحدة (Guardian+Auditor)، الاختلاف فقط في السلطة/السياق/الرؤية.
**تدقيق انهيار الفئات:** 8 فئات (chatbot/assistant/ERP/workflow/productivity/goal-tracker/BI/agent-framework) — **صفر انهيار**.

---

## القسم 6 — طبقة المنصة والتجربة (P5 + P6)

### 6.1 P5 — 11 طبقة منصة (L0-L10)

L0 Shell/Navigation/Session/Theme → L1 تطبيقات → L2 تجربة الرفيق → L3 تجربة Dream-to-Evolution → L4 هوية وربط رفيق → L5 صلاحيات/أدوار/خصوصية/أمانة → L6 عزل مستأجرين → L7 ذاكرة (وصول IURG) → L8 بيانات (استمرارية/رسم/كاش) → L9 تكامل (APIs/SIL bridge) → L10 نشر/تحجيم.

### 6.2 التجارب العشر و7 أنواع مستخدمين

Founder Workspace • Companion Workspace • Personal Workspace • Institutional Workspace • Dream Management • Potential Discovery • Goal Realization • Flourishing • Continuity • Evolution.
المستخدمون: Founder، Executive، Manager، Staff، Personal User، Partner، External.

### 6.3 P6 — دستور التجربة

دورة حياة الرفيق (أول لقاء → تعارف → عمق) • **8 مراسم** (Ceremonies) • **10 ثوابت تجربة** (Invariants) • بناء الثقة تدريجياً — P6-RX حدد 6 مراسم إلزامية للتجربة المعاشة.

### 6.4 P4 — التقوية والأمن والنشر (مثبت بالاختبارات)

- **تقوية:** 5 محركات، 214/214 اختباراً، أوضاع فشل موثقة
- **أمن وخصوصية:** 3 محركات إنفاذ، 37/37، مصفوفة تحكم وصول
- **نشر:** متعدد المستأجرين، إستراتيجية تحجيم، SLA 99.9%

---

## القسم 7 — السيادة: USFIP v1.0 + v1.1

### 7.1 بروتوكول الذات أولاً (Self-First)

`L1: IURG الداخلي ($0) → L2: أدوات → L3: Frontier AI (كمعلمين — مخرجاتهم تدخل كادعاءات بثقة 0.30-0.50) → L4: إنترنت → L5: بشر`
الهدف: **92% إجابات داخلية بحلول الشهر 12**. GPT ≠ ONX — الذكاء الخارجي يصبح ONX فقط بعد التحقق والدمج في IURG.

### 7.2 امتدادات v1.1 الأربعة (مثبتة 63/63)

| الامتداد | الآلية |
|---|---|
| **EXT-01 ISES** | تقييم كل مصدر بـ**12 بعداً** (ملاءمة مجال، مخاطر، أداء تاريخي، جودة دليل، جودة حكم، مقاومة هلوسة، امتثال حوكمة، كفاءة تكلفة، زمن استجابة، موثوقية، نجاح نتائج، توافق ملكية) → تصنيف Tier |
| **EXT-02 Provider Capital** | ملف رأسمال **11 بعداً** لكل مزود يتطور من النتائج (OpenAI 90.34، Qwen 89.69، OpenAI-Fallback 87.28، DeepSeek 82.94، Llama 81.75) — قاعدة التطور: Intent→IO→Judgment→Outcome→Learning→Capital Update |
| **EXT-03 Sovereignty Loop** | **5 أسئلة قبل كل استدعاء خارجي:** أنعرف هذا؟ أنملكه؟ أنملك حكماً قابلاً لإعادة الاستخدام؟ أنملك حكمة؟ هل الخارجي ضروري فعلاً؟ |
| **EXT-04 ISMF** | **6 مقاييس:** KSR >70% • PDR <30% • KRR >50% • KOR >60% • SCG متنامٍ • SAI موجب |

### 7.3 الحالة عند التصديق + خطة KRR

KSR 95% ✓ • PDR 5% ✓ • KOR 92.5% ✓ • SCG 344.23 ✓ • SAI 18 ✓ • **KRR 27.5% ⚠ تحت الهدف**
**خطة 4 أسابيع (نشطة):** تحويل 10 SIGNAL→PATTERN (أسبوع 1-2) + حقن 5 أنماط جديدة (2-3) + كشف أنماط آلي من سجلات رأس المال (3-4) → KRR 53.3% ✓ — **وقد حققت دورات Alpha لاحقاً 50.6% فعلياً**.

---

## القسم 8 — سجل ما بُني واعتُمد (الحقيقة التشغيلية)

### 8.1 المعتمد نهائياً (المنظومة v8 — NestJS)

| الاعتماد | النتيجة |
|---|---|
| المراحل 1-5 (أساس، تعلم، تعدد سياقات، تبادل سيادي، رأسمال وقياس) | **50/50 برهاناً** ✅ |
| Founder Alpha (3 دورات تشغيلية حقيقية) | 9/9 + نشر 17/17 ✅ رأسمال 105 → 344.2250 |
| النشر NestJS | LIVE — 42 مسار Swagger، JWT حقيقي، 16/16 endpoint، 4 أخطاء حرجة أصلحت |
| قاعدة البيانات | 26 جدولاً (Prisma على Render PostgreSQL)، 19 enum، RBAC، تدقيق، موافقات |
| MO-025 | **Atlas V6 مأذون** — خط أساس 168 ملفاً، 21 نموذجاً، 79 endpoint، 11 module، 8 معالم AV6-01..08، قدرتان مؤجلتان (Capital Allocation + Founder Intent Compiler) |
| MO-027..031 | إعادة بناء دستورية موحدة، تدقيق عميق، Canon قانوني، Master Canon، ACE (خرائط مبدأ→كود) |
| جاهزية Atlas V6 | **87.5/100 — READY WITH CONDITIONS** |

**شروط التقارب المتبقية (غير حاجبة):** KRR >50% (تحقق لاحقاً) • WebSocket بث لحظي • طبقة إخفاء هوية لذاكرة الحضارة • 5 أنواع D16 + 7 حالات تُفعّل عند الطلب • دفع GitHub remote.

### 8.2 Runtime v3.0 (zlzrp2.ts — 1,468 سطراً، 16 قسماً)

MultiProviderEngine (GPT-4o أساسي + Claude + Gemini بسلسلة fallback) • Rate Limiting 100 RPM/workspace • Budget Control $10/يوم • تتبع تكلفة لحظي • Bull Queue + Cron • Behavioral Profiler • Adaptive Dashboard • طبقة أمان مدخلات • 30 سيناريو Gherkin • اختبارات Intelligence/Civilization Flow • 40+ tRPC endpoint (titan.ask/council، provider.rankings، rateLimit.check، budget.get، cost.realtime، queue.add، profiler.track، dashboard.layout، test.*، security.validate).

### 8.3 هذا المستودع (clean) — ما هو موجود الآن

✅ 38 راوتر tRPC (intelligence، runtime، titan، constitution، aiBrain، modelGateway، modelFederation، scheduler، evidenceRegistry، voice، gps، revenueEngine، domains + 8 محركات متقدمة…)
✅ 15 صفحة UI • ✅ مخطط D16 كامل (intelligence_objects 25 حقلاً + sources L1-L8 + provenance 8 أبعاد + relationships 10 + learning_transitions + capital_records 7 فئات + measurements + continuity_log hash-chained + governance_decisions + exchange_records)
✅ GPT-4o موصول فعلياً • ✅ منشور LIVE على Render (Docker)

---

## القسم 9 — مصفوفة الفجوات النهائية (هذا المستودع مقابل 100% من الوثائق)

| # | القدرة | الحالة هنا | المصدر القانوني |
|---|---|---|---|
| 1 | حلقة حية (scheduler يعمل كل ثانية/دقيقة) | ❌ راوترات ساكنة | D18 |
| 2 | محرك اضمحلال + محرك ترقية سلّم R1→R6 | ❌ | IURG §4 |
| 3 | حاسبة IUC بالمعادلات الكاملة + 11 مؤشراً | ⚠️ جزئي | IUC §7 |
| 4 | إنفاذ FIC فعلي: 68 قيداً + Amanah 0.50 HARD_BLOCK + بوابات DG-01..12 | ⚠️ هيكل فقط (7 مبادئ) | FIC v0.2 |
| 5 | محرك تعارضات 7 فئات + مراجعة دستورية + Intent Evolution Ledger | ❌ | FIC §6-8 |
| 6 | Founder Cognitive Model + Purpose Compiler | ❌ | IURG §5-6 |
| 7 | حلقة سيادة USFIP + ISES 12 + Provider Capital 11 + ISMF 6 | ⚠️ modelFederation جزئي | USFIP v1.1 |
| 8 | محرك تخصيص D13.5 (APS/أولويات/أوضاع) | ❌ | D13.5 |
| 9 | حزمة برهان D15 (8 معايير + إجهاد + حقن فشل) | ❌ | D15 |
| 10 | كائنات OS الـ25 (InstitutionalOS/PersonalOS/رفقاء 7/DecisionEngine/ContinuityEngine/Flourishing…) | ❌ | D05/D06/D10-R1 |
| 11 | تجارب P5 العشر + مراسم P6 | ⚠️ 15 صفحة أساسية | P5/P6 |
| 12 | Runtime v3.0 (rate limit/budget/queue/profiler) | ❌ الكود جاهز في zlzrp2.ts | v3.0 |
| 13 | خط تبادل D19 حي | ⚠️ schema فقط | D19 |
| 14 | صوت عربي STT/TTS | ❌ راوتر voice هيكلي | P0-09 |
| 15 | بحث دلالي/vector | ❌ | D12 |

---

## القسم 10 — خطة التنفيذ M1 → M8

> **مبدأ حاكم:** كل معلم يُبنى في هذا المستودع فوق مخطط D16 الموجود، مع نقل كود v3.0 الجاهز بدل إعادة كتابته، واحترام قائمة عدم البناء (القسم 11).

### M1 — النواة الحية (The Living Loop)
- `runtime/loop.ts`: مجدول دوري (dev: كل دقيقة؛ prod: إيقاعات 5) يحرك: decay → promotion-check → snapshot
- محرك اضمحلال بمعدلات المعايرة (حد أدنى D=0.20) + كائنات LEARNING_EVENT لكل تغيير
- محرك ترقية R1→R2→R3 آلي + طوابير DG-09/DG-10 للبوابات البشرية + مسارات تراجع
- **قبول:** تشغيل 24 ساعة متواصلة، أحداث decay/promotion مسجلة في continuity_log

### M2 — الإدراك والتغذية (Perception Bus)
- InputNormalizer + PatternDetector (3 تكرارات/مصدران/0.60) + IngestionPipeline
- كل استدعاء GPT-4o (titan/aiBrain) يكتب ادعاء T5 بثقة 0.30-0.50 في IURG — **لا ذكاء يتيم**
- ShadowRuntime (تعلم ظل بلا إنتاج) — EB-07
- **قبول:** إدخال 100 إشارة → أنماط تتكون آلياً → ترقية R3 موثقة

### M3 — رأس المال والقياس
- IUC Calculator كامل (تراكم/تركيب/نقل/مخاطر + VG-1..7) + iuc_snapshots يومية
- لوحة 11 مؤشراً (TUC…FAS) + 6 مؤشرات D17 (OQI…IRS) + IFC
- **قبول:** T-007/T-008/T-009 تمر؛ لوحة حية تعرض TUC متحركاً

### M4 — الحوكمة المنفِّذة
- سجل 68 قيداً قابلاً للتنفيذ + Amanah Enforcer (≥0.50 HARD_BLOCK غير قابل للتعطيل)
- Guardian (فحص قبل الحكم/القرار/التنفيذ/بعد النتيجة — SECH sequence) + Auditor append-only
- محرك تعارضات C1-C7 + هرمية 8 + مسارا مراجعة دستورية + Intent Evolution Ledger (hash chain)
- تحميل 38 كائن نية (FI-2026-0001..0038) كبذرة قانونية
- **قبول:** اختبار الرفض (اقتراح خفض طاقم → EB-02/EB-03 يحجب + اقتراح مضاد) واختبار الموافقة واختبار OR-01 — الثلاثة من FIC v0.1 §C

### M5 — السيادة
- Sovereignty Loop (5 أسئلة قبل كل استدعاء خارجي) + ISES 12 بعداً + Provider Capital 11 بعداً (بذرة: OpenAI 90.34…)
- ISMF: حساب KSR/PDR/KRR/KOR/SCG/SAI لحظياً + endpoint `intelligence.sovereigntyReport`
- تنفيذ خطة KRR (تحويل SIGNAL→PATTERN آلياً من سجلات رأس المال)
- **قبول:** تقرير سيادة حي؛ استدعاء خارجي يُسجل advisory عند كفاية المعرفة الداخلية

### M6 — Runtime v3.0 + التخصيص + البرهان
- نقل zlzrp2.ts: MultiProviderEngine (fallback chain) + Rate Limit + Budget + تكلفة لحظية + Queue/Cron + Profiler + Adaptive Dashboard
- محرك D13.5: APS (6 أبعاد) + أولويات P1-P7 (P1 استمرارية فوق الكل) + 5 أوضاع + كشف أنماط الفشل السبعة
- حزمة D15: 8 معايير برهان + أهم 12 سيناريو إجهاد + 6 اختبارات تناقض + حقن فشل أساسية
- **قبول:** 30 سيناريو Gherkin تمر + معايير البرهان الثمانية خضراء

### M7 — أنظمة التشغيل والتجربة
- الكائنات الـ25: GoalEngine/FlourishingEngine/CompanionRuntime (7 رفقاء) /InstitutionalDecisionEngine (7 أسئلة)/ContinuityEngine (7 فئات + تنبؤ 30/90)/PersonalOS (5 ركائز)/InstitutionalOS
- تجارب P5: Founder Workspace + Dream→Evolution + Flourishing + Continuity (فوق الـ15 صفحة الحالية)
- مراسم P6 الست الإلزامية + الثوابت العشرة
- **قبول:** دورة 11 مرحلة كاملة end-to-end (حلم مؤسسي → … → حلم متجدد) — اختبار التكامل الشامل الذي أوصى به D10

### M8 — التبادل والتقارب والإطلاق
- خط D19 حي (تبادل مع إخفاء هوية) + WebSocket بث لحظي
- جسر Atlas V6 (عقود tRPC كما في MO-025) + معالم AV6-01..08
- صوت عربي (Whisper STT + TTS) — P0-09
- شهادة EV-ACPT للمؤسس + تقرير برهان نهائي (10 براهين)
- **قبول:** المنظومة الموحدة live، كل بوابات CG-1..8 خضراء، توقيع المؤسس

---

## القسم 11 — قائمة عدم البناء (Non-Build List)

من D20 + MO-025 (ملزمة — بناء أي منها الآن = انزياح نطاق EB-09):
1. فدرالية متعددة المؤسسات كاملة (D19 يبقى تبادلاً ثنائياً محدوداً)
2. رفقاء كاملون بذواكر مستقلة (7 تجليات لذكاء واحد فقط)
3. PersonalOS تجاري كامل للجمهور
4. تحديث أوزان نماذج حي (HC-01 — سنة أولى)
5. قرارات سريرية/توظيف ذاتية (HC-02 — أبداً)
6. الأصول المحظورة الخمسة (قسم 4.4 — أبداً)
7. Multi-tenant SaaS عام قبل إثبات المؤسسة الواحدة
8. أتمتة ردود المراجعات السلبية (EB-12)
9. عقول موازية — أي حساس جديد خارج الـBus الموحد (EB-06)
10. بدء من صفر لأي مكون معرفي (EB-05/HC-11)

---

## القسم 12 — البراهين النهائية ومعايير القبول (10 براهين)

| # | البرهان | الدليل المطلوب |
|---|---|---|
| 1 | الحلقة حية | 7 أيام تشغيل متصل، أحداث decay/promotion يومية |
| 2 | لا ذكاء يتيم | 100% من مخرجات GPT-4o لها كائنات IURG |
| 3 | السلّم يعمل | ≥1 ترقية R3→R4 عبر DG-09 حقيقية |
| 4 | IUC يتراكم | TUC متزايد أسبوعياً + snapshot يومي |
| 5 | الحوكمة تحكم | اختبارات الرفض/الموافقة/التجاوز الثلاثة تمر |
| 6 | الأمانة أرضية | محاولة انتهاك <0.50 → HARD_BLOCK مسجل |
| 7 | السيادة تُقاس | ISMF لحظي + KRR ≥50% |
| 8 | التجربة مكتملة | دورة 11 مرحلة end-to-end |
| 9 | البرهان القاسي | 8 معايير D15 + 30 Gherkin خضراء |
| 10 | ختم المؤسس | توقيع EV-ACPT |

---

## القسم 13 — الثوابت المرجعية

```
AMANAH_FLOOR            = 0.50   (HARD_BLOCK — غير قابل للتعطيل)
CONF_PATTERN            = 0.60 | CONF_UNDERSTANDING = 0.75 | CONF_JUDGMENT = 0.85
CONF_INSTITUTIONAL      = 0.92 | CONF_CONSTITUTIONAL = 0.95
DECAY_MIN_D             = 0.20 | DECAY_CEILING_VG5 = 0.30
TRANSFER_REVIEW         = 0.60 | TRANSFER_BLOCK = 0.40
EXTERNAL_AI_CONFIDENCE  = 0.30–0.50 (T5 claims)
RISK_WEIGHTS            = 0.25/0.25/0.30/0.20
ACCUMULATION            = α1.0 β0.3 γ0.05 δ0.8 | COMPOUND_FACTOR = 0.25
RATE_LIMIT              = 100 RPM | BUDGET = $10/day/workspace
KSR>70% PDR<30% KRR>50% KOR>60%
INTERNAL_ANSWER_TARGET  = 92% بحلول الشهر 12
U_WEIGHTS               = P1/PT5/U20/J50/D10/E5/O30
TIERS                   = T0..T7 | RUNGS = R1..R6 | CYCLE = 11 مرحلة
CONSTRAINTS             = 68 (12HC/12SC/6AC/12DG/12EB/10OVR/5OR)
INTENTS                 = FI-2026-0001..0038 | CONFLICTS = C1..C7
RUNTIME_OBJECTS         = 25 | COMPANIONS = 7 | EXPERIENCES = 10 | PLATFORM_LAYERS = 11
PROOFS                  = 50/50 + 9/9 + 17/17 + 177/177 + 214/214 + 37/37
```

---

> *"المعمارية ليست خطة. إنها قرار. كل ما عداها تنفيذ."*

**نهاية MED v2.0 — بانتظار أمر التنفيذ من المؤسس**
