# دليل مشغّل الذكاء وإجراءات الاسترداد — ONX Intelligence Operations Runbook

> **STE-01 الموجة 8 (STE-P-03)** — دليل ثنائي اللغة (عربي أولاً) يمكّن المشغّل/المؤسس من تنفيذ
> مهام الاسترداد المفتوحة بنفسه خطوة بخطوة، بلا معرفة مسبقة بالكود.
>
> **مبدأ الدليل — الصدق التشغيلي**: كل أمر هنا يستند إلى كود فعلي بمرجع `ملف:سطر`.
> لا يَعِد هذا الدليل بأي قدرة غير موجودة في الكود.

---

## المحتويات

- [أ) النشر على Render — مهمة الاسترداد REC-04](#أ-النشر-على-render--rec-04)
- [ب) إدارة مفاتيح الجسر (Bridge)](#ب-إدارة-مفاتيح-الجسر-bridge)
- [ج) تركيب مفاتيح المزودين والتحقق الحي — REC-03](#ج-تركيب-مفاتيح-المزودين--rec-03)
- [د) استيعاب أرشيف 19,012 — REC-06](#د-استيعاب-أرشيف-19012--rec-06)
- [هـ) verify:self وعدّة OSVA + كتيبات الطوارئ](#هـ-verifyself-وعدة-osva)
- [English condensed mirror](#english-condensed-mirror)
- [و) توطيد المشغّل + مسح حقيقة البيئة — STE-K-12](#و-توطيد-المشغل--مسح-حقيقة-البيئة--ste-k-12)

> **ملاحظة تقنية عامة (تنطبق على كل أمثلة curl أدناه)**: واجهة tRPC تستخدم محوّل
> `superjson` (`api/middleware.ts:12`) على المسار `/api/trpc` (`api/boot.ts:59`)، لذا:
> - **الاستعلامات (query)** = طلب GET مع `?input={"json":{...}}` (مرمّز URL).
> - **الطفرات (mutation)** = طلب POST بجسم `{"json":{...}}`.

---

## أ) النشر على Render — REC-04

المخطط الكامل في `render.yaml` (جذر المستودع). ثلاث خدمات معرّفة:

### 1. الخدمة الرئيسية `onx-intelligence-clean` — `render.yaml:14-115`

| البند | القيمة | المرجع |
|---|---|---|
| النوع/التشغيل | `web` / Node.js | `render.yaml:14-16` |
| الخطة/المنطقة | `standard` / `frankfurt` | `render.yaml:17-18` |
| الفرع | `main` (نشر تلقائي من GitHub) | `render.yaml:19` |
| أمر البناء | `npm ci && npm run build` | `render.yaml:21` |
| أمر التشغيل | `NODE_ENV=production npm start` | `render.yaml:22` |
| فحص الصحة | `/api/trpc/health.ping` | `render.yaml:24` |
| قرص دائم | `onx-data` على `/app/db` بحجم 5GB | `render.yaml:25-28` |

### 2. خدمة staging `onx-intelligence-staging` — `render.yaml:118-171`

نفس البناء على خطة `starter`، فرعها `main` (أُصلح المؤشر القديم في الموجة 2 — `render.yaml:123-125`).

### 3. العامل الخلفي `onx-scheduler` — `render.yaml:174-196`

worker يشغّل `node dist/scheduler-worker.js`، يرث `DATABASE_URL` و`OPENAI_API_KEY` من
الخدمة الرئيسية عبر `fromService` (`render.yaml:186-195`)، و`autoDeploy: false` — تشغيله
اليدوي قرارك.

### خطوات النشر خطوة بخطوة

1. من لوحة Render: **New → Blueprint** ثم اختر مستودع `onxos/onx-intelligence-clean`.
   Render يقرأ `render.yaml` وينشئ الخدمات الثلاث.
2. **قاعدة البيانات**: أنشئ Render Postgres (قرار المنسق المصدّق: الإنتاج = Postgres —
   `render.yaml:34-38`) وانسخ Internal URL بصيغة `postgres://...`.
3. **أدخل المتغيرات اليدوية** (المعلنة `sync: false` — لا تُخزن في الريبو أبداً):

   | المتغير | إلزامي؟ | من يقرؤه فعلاً | المرجع |
   |---|---|---|---|
   | `DATABASE_URL` | نعم | مخازن pg الثلاثة + كوربوس pg | `render.yaml:39-40`، `api/lib/corpus-pg-store.ts:17` |
   | `PLATFORM_INBOX_DATABASE_URL` | اختياري (يسقط إلى DATABASE_URL) | صندوق وارد المنصة | `render.yaml:43-44` |
   | `OPENAI_API_KEY` | لقدرات LLM فقط | مزود openai | `render.yaml:48-49`، `api/lib/provider-registry.ts:42` |
   | `OWNER_UNION_ID` / `APP_ID` / `APP_SECRET` / `VITE_APP_ID` | للمصادقة | طبقة الجلسات | `render.yaml:50-62` |
   | `BRIDGE_SHARED_SECRET` | فقط عند تفعيل الجسر | حارس الجسر | `render.yaml:114-115`، القسم (ب) |

   إدخالها: صفحة الخدمة → **Environment** → **Add Environment Variable** → أدخل الاسم
   والقيمة → **Save Changes** (يعيد النشر تلقائياً).
4. **تنبيه صدق**: كل متغير معلَّم في `render.yaml` بـ`# DOCUMENTED-ONLY: not read by code yet`
   (مثل `JWT_SECRET`، `EMAIL_PROVIDER`، أعلام `FEATURE_*` — `render.yaml:45-110`) **لا يقرؤه
   الكود بعد** — أُبقي بقرار منع تقليص النطاق وسيُربط في موجات لاحقة. لا تتوقع منه أثراً الآن.

### التحقق بعد النشر (إلزامي)

```bash
# 1) نبض الحياة — api/boot.ts:38
curl -s https://onx-intelligence-clean.onrender.com/health
# متوقع: {"status":"ok",...}

# 2) إثبات النسخة المنشورة — api/boot.ts:48
curl -s https://onx-intelligence-clean.onrender.com/commit
# متوقع: sha الـcommit — طابقه مع git ls-remote origin main

# 3) الفحوصات الحية الصادقة (db/knowledge/scheduler/constitution/titan/runtime)
curl -s https://onx-intelligence-clean.onrender.com/api/trpc/health.status
# fail-honest: مورد غائب يظهر UNAVAILABLE — لا ادعاء (الموجة 2، api/health-router.ts:211)

# 4) التحقق الذاتي OSVA الكامل — api/onx-router.ts (عام، بلا أسرار)
curl -s https://onx-intelligence-clean.onrender.com/api/trpc/onx.selfVerify
# متوقع: claimsAsserted=0 — انظر القسم (هـ)
```

محلياً قبل النشر: `npm run verify:self` (رمز خروج 0 = كل الادعاءات مقاسة — `scripts/self-verify.ts`).

---

## ب) إدارة مفاتيح الجسر (Bridge)

الجسر Platform↔Intelligence **مقفل افتراضياً (fail-closed)**. الحارس في
`api/bridge-guard.ts:4-16` يفرض ثلاثة شروط معاً:

1. `BRIDGE_ENABLED=true` — وإلا خطأ `BRIDGE_DISABLED` (`api/bridge-guard.ts:6`)
2. `BRIDGE_SHARED_SECRET` مضبوط — وإلا `BRIDGE_SECRET_NOT_CONFIGURED` (`api/bridge-guard.ts:10`)
3. ترويسة `x-onx-bridge-key` مطابقة للسر — وإلا `BRIDGE_UNAUTHORIZED` (`api/bridge-guard.ts:13-15`)

### التفعيل

1. ولّد سراً قوياً: `openssl rand -hex 32` (أو PowerShell:
   `-join ((1..64) | %{ '{0:x}' -f (Get-Random -Max 16) })`).
2. في Render → Environment: اضبط `BRIDGE_SHARED_SECRET` بالقيمة، وغيّر `BRIDGE_ENABLED`
   إلى `true` (افتراضيه `"false"` — `render.yaml:112-113`).
3. أعطِ السر نفسه للمنصة المستهلكة لترسله في ترويسة `x-onx-bridge-key`.

### التدوير الآمن (rotation)

1. ولّد سراً جديداً.
2. حدّث `BRIDGE_SHARED_SECRET` في Render أولاً (إعادة نشر تلقائية) — نافذة انقطاع قصيرة
   للجسر فقط، النقاط العامة لا تتأثر.
3. حدّث السر لدى المنصة المستهلكة فوراً بعده.
4. تحقق (اختبار fail-closed):

```bash
# مفتاح خاطئ → يجب أن يفشل بـ BRIDGE_UNAUTHORIZED (إن نجح فهناك خلل جسيم!)
curl -s -X POST 'https://<HOST>/api/trpc/providers.liveValidate' \
  -H 'content-type: application/json' -H 'x-onx-bridge-key: WRONG' -d '{"json":{}}'

# المفتاح الجديد → يجب أن ينجح
curl -s -X POST 'https://<HOST>/api/trpc/providers.liveValidate' \
  -H 'content-type: application/json' -H 'x-onx-bridge-key: <NEW_SECRET>' -d '{"json":{}}'
```

### الإيقاف الطارئ

اضبط `BRIDGE_ENABLED=false` — كل نقاط الجسر (`corpusQuery.search/domains/ingest`،
`providers.liveValidate`، `intentEngine`، `titanBridge`) ترفض فوراً بـ`BRIDGE_DISABLED`.
سلوك fail-closed مثبت اختبارياً في `api/__tests__/bridge-contract.test.ts:57-62`.

---

## ج) تركيب مفاتيح المزودين — REC-03

سجل المزودين الثمانية في `api/lib/provider-registry.ts:41-50`. أسماء متغيرات البيئة
**الدقيقة** (عند وجود اسمين، الأول له الأولوية):

| المزود | متغير(ات) البيئة | المرجع |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `provider-registry.ts:42` |
| Anthropic | `ANTHROPIC_API_KEY` | `provider-registry.ts:43` |
| Google Gemini | `GEMINI_API_KEY` أو `GOOGLE_API_KEY` | `provider-registry.ts:44` |
| Groq | `GROQ_API_KEY` | `provider-registry.ts:45` |
| DeepSeek | `DEEPSEEK_API_KEY` | `provider-registry.ts:46` |
| Qwen (DashScope) | `QWEN_API_KEY` أو `DASHSCOPE_API_KEY` | `provider-registry.ts:47` |
| Llama (Together) | `TOGETHER_API_KEY` أو `LLAMA_API_KEY` | `provider-registry.ts:48` |
| Kimi (Moonshot) | `KIMI_API_KEY` أو `MOONSHOT_API_KEY` | `provider-registry.ts:49` |

### فهم الحالة الثلاثية الصادقة

- **MISSING_KEY**: لا مفتاح في البيئة.
- **CONFIGURED_UNPROBED**: مفتاح موجود لكن **لم يُفحص حياً** — لا يُدّعى «متصل».
- **VALIDATED**: فحص حي حقيقي نجح (قائمة نماذج فعلية) بتاريخ وزمن استجابة —
  **الطريقة الوحيدة** لبلوغ هذه الحالة هي `providers.liveValidate` (`provider-registry.ts:52-53`:
  النتيجة تعيش في الذاكرة فقط؛ إعادة التشغيل تعيدها بصدق إلى CONFIGURED_UNPROBED).

### الخطوات

1. أدخل المفاتيح المتوفرة في Render → Environment بالأسماء أعلاه (Save = إعادة نشر).
2. اقرأ الحالة (نقطة **عامة** — تكشف أول 4 أحرف من المفتاح فقط، أبداً لا القيمة):

```bash
curl -s 'https://<HOST>/api/trpc/providers.status'
# متوقع بعد إدخال مفتاح وقبل الفحص: "status":"CONFIGURED_UNPROBED"
```

3. شغّل التحقق الحي (خلف الجسر — يتطلب القسم (ب) مفعّلاً):

```bash
curl -s -X POST 'https://<HOST>/api/trpc/providers.liveValidate' \
  -H 'content-type: application/json' \
  -H 'x-onx-bridge-key: <BRIDGE_SHARED_SECRET>' \
  -d '{"json":{}}'
```

4. **تفسير الترقية**: `liveValidate` ينفذ طلب قائمة نماذج حقيقياً لكل مزود ذي مفتاح
   (`provider-registry.ts:96-130`، مهلة 8 ثوانٍ). نجاح فعلي → `VALIDATED` مع `latencyMs`
   و`modelCount` و`validatedAt`. فشل → يبقى `CONFIGURED_UNPROBED` مع نص الخطأ (لا ترقية
   كاذبة). بلا أي مفاتيح → القائمة تعود كلها `MISSING_KEY` بصدق.
5. أعد قراءة `providers.status` للتأكد من الترقية.

---

## د) استيعاب أرشيف 19,012 — REC-06

> **الحقيقة الحالية** (تقرير `docs/CORPUS_GAP_REPORT.md`): الأرشيف الأصيل (19,012 مقالة)
> **غير موجود في هذا المستودع** — الموجود 22,500 وحدة قالبية مولّدة (Demo). الأنبوب أدناه
> جاهز ومختبر لاستقباله فور استرداده.

نقطة الاستيعاب: `corpusQuery.ingest` (`api/corpus-query-router.ts` — خلف الجسر fail-closed)،
تقبل حتى **500 وحدة بالدفعة** بشكل `{domain,title,body,source}`، وتنفذ:
تطبيع → بصمة SHA-256 (`api/knowledge-router.ts` — `fingerprintKnowledge`) → إزالة تكرار داخل
الدفعة وعبرها → إدراج، وتعيد `{accepted, duplicates, total, persistence}`.

- مع `DATABASE_URL` postgres: ثبات حقيقي في جدول `onx_knowledge_corpus` بقيد
  `fingerprint UNIQUE` و`ON CONFLICT DO NOTHING` (`api/lib/corpus-pg-store.ts:40-48,77-79`)
  → `persistence: "POSTGRES"`.
- بلا قاعدة: ذاكرة فقط وتصريح صادق `persistence: "UNPERSISTED"` (يضيع عند إعادة التشغيل).

### سكربت دفعات مثال (يقرأ ملف JSON ويرسل بالتتابع مع العدّ)

احفظه محلياً باسم `ingest-archive.mjs` (ليس جزءاً من الريبو — أداة مشغّل):

```js
// node ingest-archive.mjs <archive.json> — عناصر بشكل {domain,title,body,source}
import { readFileSync } from "node:fs";

const HOST = process.env.ONX_HOST;          // مثال: https://onx-intelligence-clean.onrender.com
const KEY  = process.env.ONX_BRIDGE_KEY;    // قيمة BRIDGE_SHARED_SECRET
const units = JSON.parse(readFileSync(process.argv[2], "utf8"));

let accepted = 0, duplicates = 0;
for (let i = 0; i < units.length; i += 500) {           // حد الدفعة في المخطط: 500
  const batch = units.slice(i, i + 500);
  const res = await fetch(`${HOST}/api/trpc/corpusQuery.ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-onx-bridge-key": KEY },
    body: JSON.stringify({ json: { units: batch } }),   // superjson envelope
  });
  if (!res.ok) throw new Error(`batch ${i / 500}: HTTP ${res.status} ${await res.text()}`);
  const out = (await res.json()).result.data.json;
  accepted += out.accepted; duplicates += out.duplicates;
  console.log(`batch ${i / 500 + 1}: accepted=${out.accepted} duplicates=${out.duplicates} persistence=${out.persistence}`);
}
console.log(`TOTAL: accepted=${accepted} duplicates=${duplicates} of ${units.length}`);
```

التشغيل:

```bash
ONX_HOST=https://<HOST> ONX_BRIDGE_KEY=<SECRET> node ingest-archive.mjs archive.json
```

### التحقق النهائي بعد الاستيعاب

1. **العدّ الصادق**: `npm run corpus:manifest` محلياً، أو راجع بند الكوربوس في
   `onx.selfVerify` — قارن `rawTotal/uniqueCount` بالمتوقع (19,012 فريداً مضافاً).
2. **الاسترجاع الفعلي**: ابحث عن عنوان تعرفه من الأرشيف عبر النقطة العامة
   (الموجة 7 — BM25 حتمي، الفهرس يُبطَل تلقائياً بعد كل ingest فيظهر الجديد فوراً):

```bash
curl -s 'https://<HOST>/api/trpc/corpusQuery.rankedSearch?input=%7B%22json%22%3A%7B%22query%22%3A%22<كلمات من عنوان معروف>%22%7D%7D'
# متوقع: hits تتضمن الوثيقة مع snippet مميز بعلامات « »
```

---

## هـ) verify:self وعدّة OSVA

### ما هو

`buildSelfVerification()` (`api/lib/self-verify.ts`) يجمع **19 بنداً مقاساً** في تقرير واحد:
6 فحوصات health حية + بند الكوربوس + 8 حالات مزودين + 3 جسور + runtime.

### لغة الحقيقة الخماسية (لكل بند `verdict`)

| الحكم | معناه |
|---|---|
| `IMPLEMENTED_PROVEN` | منفّذ ومثبت بقياس حي ناجح |
| `PARTIAL` | يعمل جزئياً أو مهيأ بلا فحص حي (مثل مزود CONFIGURED_UNPROBED) |
| `DOCUMENTED_ONLY` | موثق ولا يقرؤه الكود / معطّل (مثل جسر مقفل) |
| `DEMO` | يعمل لكن بمحتوى قالبي — **الكوربوس الحالي دائماً DEMO** حتى استرداد الأرشيف |
| `MISSING` | غائب (مفتاح مفقود، مورد UNAVAILABLE) |

### العدّادان والبصمة

- `claimsMeasured` مقابل `claimsAsserted`: المقاس بقياس حي مقابل المُدّعى بلا قياس.
  **الحالة الصحية: `claimsAsserted = 0`**.
- `fingerprint`: SHA-256 لنسخة مطبّعة من التقرير (تستبعد الحقول المتقلبة كالطوابع
  الزمنية) — نفس الحقائق = نفس البصمة؛ تغيّرها يعني تغيّر حقيقة فعلياً.

### التشغيل

```bash
npm run verify:self          # محلياً — رمز خروج 0 = صحي، 1 = يوجد ادعاء غير مقاس
curl -s https://<HOST>/api/trpc/onx.selfVerify   # منشوراً — نقطة عامة بلا أسرار
```

### متى يقلق المشغّل؟

1. **رمز خروج 1 أو `claimsAsserted > 0`** — ظهر ادعاء غير مقاس. لا تنشر قبل الفهم.
2. **بند health انقلب إلى `MISSING`** — مورد كان حياً صار UNAVAILABLE (انظر الطوارئ أدناه).
3. **بصمة تغيّرت بلا تغيير مقصود** — حقيقة تبدلت خلف ظهرك؛ قارن التقريرين بنداً بنداً.
4. **مزود عاد من VALIDATED إلى CONFIGURED_UNPROBED بعد إعادة تشغيل** — هذا **طبيعي
   وصادق** (الفحص الحي لا يُورَّث)؛ أعد `liveValidate` فقط.

### كتيبات الطوارئ

#### 1. قاعدة البيانات مفقودة/ساقطة

- **الأعراض**: بند db في `health.status` = `UNAVAILABLE`؛ `corpus.ingest` يعيد
  `persistence:"UNPERSISTED"` رغم أنك تتوقع POSTGRES.
- **الفحص**: هل `DATABASE_URL` مضبوط ويبدأ بـ`postgres`؟ (`api/lib/corpus-pg-store.ts:16-19`
  يفحص البادئة حرفياً)؛ حالة قاعدة Render من لوحتها؛ هل انتهت صلاحية الخطة المجانية؟
- **الإجراء**: صحّح URL في Environment → Save (إعادة نشر) → تحقق بـ`health.status` ثم
  `onx.selfVerify`. **ملاحظة صدق**: الخدمة لا تنهار بلا DB — تصرّح UNAVAILABLE/UNPERSISTED
  بصدق وتواصل ما يمكنها (تصميم fail-honest للموجة 2).

#### 2. الجسر مقفل والمنصة تفشل

- **الأعراض**: المنصة تتلقى `BRIDGE_DISABLED` أو `BRIDGE_SECRET_NOT_CONFIGURED` أو
  `BRIDGE_UNAUTHORIZED`.
- **الفحص**: نص الخطأ يحدد السبب بدقة (`api/bridge-guard.ts:6,10,15`): الأول =
  `BRIDGE_ENABLED` ليس true؛ الثاني = السر غير مضبوط في الخادم؛ الثالث = ترويسة
  `x-onx-bridge-key` غائبة أو غير مطابقة (سر المنصة ≠ سر الخادم — الأرجح بعد تدوير ناقص).
- **الإجراء**: طابق الشرطين في Render ثم السر لدى المنصة، واختبر بزوج curl «خاطئ ثم صحيح»
  من القسم (ب). تذكّر: الرفض بلا سر صحيح **سلوك مقصود** وليس عطلاً.

#### 3. مزود فاشل

- **الأعراض**: بعد `liveValidate` بقي المزود `CONFIGURED_UNPROBED` مع حقل خطأ.
- **الفحص**: اقرأ نص الخطأ في نتيجة liveValidate (HTTP 401 = مفتاح غير صالح؛ 429 =
  حصة منتهية؛ timeout بعد 8 ثوانٍ = شبكة/حجب إقليمي)؛ تأكد أن اسم المتغير مطابق حرفياً
  لجدول القسم (ج) وأن القيمة بلا مسافات/أسطر زائدة.
- **الإجراء**: صحّح المفتاح → Save → أعد `liveValidate` → تأكد من `VALIDATED` في
  `providers.status`. مزود واحد فاشل **لا يعطّل** البقية — كل مزود يُفحص مستقلاً.

---

## English condensed mirror

Bilingual operator runbook for ONX Intelligence (STE-01 Wave 8, STE-P-03). Every command
references real code (`file:line`); the runbook promises nothing the code doesn't do.

### A) Deploy on Render (REC-04)

`render.yaml` defines 3 services: web `onx-intelligence-clean` (standard/frankfurt, branch
`main`, `npm ci && npm run build`, health check `/api/trpc/health.ping`, 5GB disk —
lines 14-115), web `onx-intelligence-staging` (starter — lines 118-171), worker
`onx-scheduler` (`node dist/scheduler-worker.js`, inherits `DATABASE_URL`/`OPENAI_API_KEY`
via `fromService`, `autoDeploy: false` — lines 174-196).

Steps: New → Blueprint → pick the repo; create a Render Postgres (production DB =
Postgres, coordinator-ratified); set the `sync: false` vars manually in Environment:
`DATABASE_URL`, `PLATFORM_INBOX_DATABASE_URL` (optional), `OPENAI_API_KEY`,
`OWNER_UNION_ID`, `APP_ID`, `APP_SECRET`, `VITE_APP_ID`, `BRIDGE_SHARED_SECRET`.
Vars marked `# DOCUMENTED-ONLY` in render.yaml are **not read by code yet** — kept by
no-scope-reduction ruling; expect no effect from them.

Post-deploy verification: `GET /health` (`api/boot.ts:38`), `GET /commit`
(`api/boot.ts:48`, match against `git ls-remote origin main`),
`GET /api/trpc/health.status` (fail-honest live checks, `api/health-router.ts:211`),
`GET /api/trpc/onx.selfVerify`
(expect `claimsAsserted=0`). Locally: `npm run verify:self` (exit 0).

### B) Bridge key management

Fail-closed guard (`api/bridge-guard.ts:4-16`) requires all of: `BRIDGE_ENABLED=true`,
`BRIDGE_SHARED_SECRET` set, and a matching `x-onx-bridge-key` header — else
`BRIDGE_DISABLED` / `BRIDGE_SECRET_NOT_CONFIGURED` / `BRIDGE_UNAUTHORIZED`. Rotation:
generate (`openssl rand -hex 32`) → update server first → update consumer → test with a
wrong-key curl (must fail) then the new key (must pass). Emergency: set
`BRIDGE_ENABLED=false` — all bridge endpoints reject immediately (proven in
`api/__tests__/bridge-contract.test.ts:57-62`).

### C) Provider keys + live validation (REC-03)

Exact env names (`api/lib/provider-registry.ts:41-50`): `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`|`GOOGLE_API_KEY`, `GROQ_API_KEY`,
`DEEPSEEK_API_KEY`, `QWEN_API_KEY`|`DASHSCOPE_API_KEY`,
`TOGETHER_API_KEY`|`LLAMA_API_KEY`, `KIMI_API_KEY`|`MOONSHOT_API_KEY`.

Honest tri-state: `MISSING_KEY` → `CONFIGURED_UNPROBED` (key present, unprobed — never
claimed "connected") → `VALIDATED` (only via a real models-list probe, 8s timeout, with
`latencyMs`/`modelCount`/`validatedAt`; in-memory only, honestly reset on restart).

```bash
curl -s 'https://<HOST>/api/trpc/providers.status'   # public; keyPrefix (4 chars) only
curl -s -X POST 'https://<HOST>/api/trpc/providers.liveValidate' \
  -H 'content-type: application/json' -H 'x-onx-bridge-key: <SECRET>' -d '{"json":{}}'
```

### D) Ingesting the 19,012 archive (REC-06)

Current truth (`docs/CORPUS_GAP_REPORT.md`): the authentic archive is **not in this
repo**; the 22,500 in-memory units are generated templates (Demo). The pipeline is ready:
`corpusQuery.ingest` (bridge-guarded, ≤500 units/batch of `{domain,title,body,source}`)
normalizes → SHA-256 fingerprints → dedups in-batch and across → inserts. With a postgres
`DATABASE_URL`: persisted in `onx_knowledge_corpus` with `fingerprint UNIQUE` +
`ON CONFLICT DO NOTHING` (`api/lib/corpus-pg-store.ts:40-48,77-79`) →
`persistence:"POSTGRES"`; without: honest `"UNPERSISTED"`. Use the batch script above
(superjson envelope `{"json":{...}}`); verify with `npm run corpus:manifest`, the corpus
item in `onx.selfVerify`, and a known-title query via public
`corpusQuery.rankedSearch` (BM25; index auto-invalidated after ingest).

### E) verify:self / OSVA + emergencies

19 measured items (6 health + corpus + 8 providers + 3 bridges + runtime), five-state
verdicts (`IMPLEMENTED_PROVEN`/`PARTIAL`/`DOCUMENTED_ONLY`/`DEMO`/`MISSING` — corpus is
always `DEMO` until the real archive lands), `claimsMeasured` vs `claimsAsserted`
(healthy = 0 asserted), normalized SHA-256 fingerprint (volatile fields excluded — same
facts = same fingerprint). Run `npm run verify:self` (exit 1 on any asserted claim) or
`GET /api/trpc/onx.selfVerify`.

Worry when: exit 1 / `claimsAsserted>0`; a health item flips to `MISSING`; the
fingerprint changes without an intended change. A provider dropping from `VALIDATED` to
`CONFIGURED_UNPROBED` after a restart is **normal honesty** — just re-run liveValidate.

Emergencies: **DB down** — check `DATABASE_URL` starts with `postgres`
(`corpus-pg-store.ts:16-19`) and the Render DB status; the service never fakes it —
declares `UNAVAILABLE`/`UNPERSISTED` and keeps serving what it can. **Bridge locked** —
the error text pinpoints the failing condition (`bridge-guard.ts:6,10,15`); rejection
without a valid secret is by design. **Provider failing** — read the liveValidate error
(401 bad key, 429 quota, 8s timeout = network); one failing provider never blocks the
rest.

---

## ترقية الذخيرة: من DEMO إلى كوربوس حقيقي (STE-K-10)

النظام **يقيس** حقيقة ذخيرته ولا يدّعيها. كل وحدة بذرة قالبية تحمل الوسم
`Source: ONX Knowledge Base v1.0`. عقد `corpus-manifest.json` يقيس كم وحدة ما زالت
تحمل هذا الوسم ويشتق الإفصاح آلياً:

- كل الوحدات قالبية → `provenance=TEMPLATED_SEED` → `disclosure=DEMO`
- لا وحدة قالبية → `provenance=AUTHENTIC_INGEST` → `disclosure=REAL`
- مختلطة → `provenance=MIXED` → `disclosure=DEMO` (تحفّظ صادق)

**الإفصاح ينقلب بالقياس لا باليد**: لا يوجد نص DEMO ثابت يُحرَّر — `self-verify` و
`answer-composer` وسطح `corpusQuery.manifest` كلها تقرأ الإفصاح المقاس.

### خطوات المشغّل لاستبدال DEMO بكوربوس حقيقي

1. **جهّز المفتاح**: `BRIDGE_ENABLED=true` + `BRIDGE_SHARED_SECRET` (القسم B). بلا مفتاح
   يبقى `corpusQuery.ingest` مقفلاً (401 fail-closed).
2. **أودِع الوثائق الأصيلة** عبر `corpusQuery.ingest` دفعات ≤500 برأس `x-onx-bridge-key`
   (القسم D). **مهم**: حقل `source` لكل وحدة أصيلة يجب ألا يساوي
   `ONX Knowledge Base v1.0` وألا يتضمن ذلك الوسم في `body` — وإلا ستُحسب قالبية.
3. **استبدل البذرة القالبية**: أزل وحدات البذرة (kn_*) أو أعِد الإيداع لقاعدة جديدة حتى
   يصبح عدد الوحدات القالبية = 0. المقياس هو الحَكَم.
4. **أعِد توليد العقد**: `npm run verify:corpus -- --write` يُعيد كتابة
   `corpus-manifest.json` عند القياس الجديد (sha256/docCount/provenance/disclosure).
5. **تحقق من الانقلاب**: `npm run verify:corpus` (يجب أن يخضرّ) ثم افحص
   `GET /api/trpc/corpusQuery.manifest` — يجب أن يظهر `disclosure:"REAL"`،
   و`onx.selfVerify` يرفع بند corpus إلى `IMPLEMENTED_PROVEN` تلقائياً.
6. **ارتكب** `corpus-manifest.json` الجديد في نفس commit استبدال الذخيرة. البوابة السادسة
   (`verify:corpus`) في Truth Gates ستمنع أي عبث لاحق (add/remove/relabel يغيّر sha256).

> الأمان: `corpus-manifest.json` عقدٌ عام بلا أسرار (عدّ + بصمة هوية فقط، لا محتوى وثائق).
> بوابة `verify:corpus` keyless — لا تحتاج DB ولا مفاتيح؛ تقيس البذرة المشحونة فقط.

---

## Corpus upgrade: DEMO → authentic corpus (STE-K-10) [EN]

The system **measures** its corpus truth rather than claiming it. Every templated seed
unit carries the marker `Source: ONX Knowledge Base v1.0`. The `corpus-manifest.json`
contract counts how many units still bear that marker and derives the disclosure
automatically (all templated → DEMO; none → REAL; mixed → DEMO). The disclosure flips
**by measurement, not by hand** — `self-verify`, `answer-composer` and the
`corpusQuery.manifest` surface all read the measured value.

**Operator steps:** (1) enable the bridge key (section B); (2) ingest authentic docs via
`corpusQuery.ingest` in batches ≤500 with `x-onx-bridge-key` — each unit's `source` must
NOT be `ONX Knowledge Base v1.0` and must not embed that marker in `body`; (3) remove the
templated seed (kn_*) so the templated count reaches 0 — the measurement is the judge;
(4) regenerate: `npm run verify:corpus -- --write`; (5) verify the flip: `npm run
verify:corpus` green + `corpusQuery.manifest` shows `disclosure:"REAL"` + `onx.selfVerify`
raises the corpus item to `IMPLEMENTED_PROVEN`; (6) commit the new `corpus-manifest.json`
in the same commit — the sixth Truth Gate (`verify:corpus`) then blocks any later tamper.

---

## و) توطيد المشغّل + مسح حقيقة البيئة — STE-K-12

> **مبدأ هذا القسم**: كل رقم وشكل أدناه **مقاس** من الكود (`ملف:سطر`) أو من نداء حي فعلي
> ضد `https://onx-intelligence-clean.onrender.com` وقت كتابة الموجة 20 (الخدمة على
> `commit 87c66e2`). لا عبارة متمناة واحدة.

### و.1) خارطة الخدمة الحية (مقاسة)

| العنصر | القيمة | المرجع |
| --- | --- | --- |
| الرابط الحي | `https://onx-intelligence-clean.onrender.com` | `api/lib/smoke-contracts.ts:342` (`DEFAULT_BASE_URL`) |
| الفرع الموجَّه | `onxos-ste01-deploy-readiness` | Render service → branch |
| `/health` (HTTP مباشر) | `{status,uptime,bootTime,commit,env,timestamp}` | `api/boot.ts:38-47` |
| `/commit` (HTTP مباشر) | `{commit,service,bootTime,timestamp}` | `api/boot.ts:48-55` |
| مصدر حقل `commit` | `RENDER_GIT_COMMIT \|\| COMMIT_SHA \|\| GIT_SHA \|\| "unknown"` (ليس سراً) | `api/boot.ts:25-32` |
| مسار tRPC | `/api/trpc/*` بمحوّل `superjson` | `api/boot.ts:57-64` + `api/middleware.ts:12` |

**مخرج `/health` حي مقاس** (الموجة 20):
```json
{"status":"ALIVE","uptime":437.4,"bootTime":"2026-07-13T18:45:31.662Z",
 "commit":"87c66e2a38c0b2ad2ec7b8262ddd54633bd2a90d","env":"production", ...}
```

**شكل مغلف tRPC/superjson المقاس** (يجب أن يعرفه المشغّل لفكّ أي سطح عام):
- **query** = `GET /api/trpc/<proc>?input=<url-encoded {"json":<value|null>}>`
- **نجاح** = `{"result":{"data":{"json":<value>}}}`
- **خطأ** = `{"error":{"json":{"message":..,"data":{"httpStatus":..}}}}`

الأسطح العامة الحية المقاسة: `providers.status`، `onx.selfVerify`، `corpusQuery.manifest`،
`ask.onx`، `health.ready/status/*` (كلها `publicQuery` — `api/health-router.ts:189-320`).

### و.2) تشغيل الدخان الحي — العقود الثمانية (`npm run smoke:live`)

المُشغّل: `scripts/smoke-live.ts` (خارج CI عمداً — يحتاج شبكة وبيئة حية، ملاحظة في رأس
الملف `scripts/smoke-live.ts:1-6`). المنطق النقي في `api/lib/smoke-contracts.ts`، المُشغّل
`runSmoke` (`api/lib/smoke-contracts.ts:370-477`). البيئة: `BASE_URL` (افتراضي الرابط أعلاه،
`scripts/smoke-live.ts:31`)، و`EXPECT_COMMIT` أو `EXPECTED_SHA` (`scripts/smoke-live.ts:34`).

| # | العقد | ماذا يثبت | ماذا يعني فشله للمشغّل | المرجع |
| --- | --- | --- | --- | --- |
| 1 | `health_live` | الخدمة حية (`ALIVE`) وحقل `commit` موجود؛ ومع `EXPECT_COMMIT` = تطابق النشر | الخدمة ساقطة أو نشرت commit غير متوقع | `smoke-contracts.ts:192-215` |
| 2 | `honest_status_selfverify` | OSVA: بنود بأحكام خماسية، بصمة sha256، و`claimsAsserted=0` | ادّعاء غير مقاس تسلّل — تحقيق فوري | `smoke-contracts.ts:217-243` |
| 3 | `rate_limit_disclosure` | سطح قراءة عام يصرّح `rateLimit.persistence="PER_INSTANCE_UNPERSISTED"` | غياب تصريح الحدّ = انحراف صدق | `smoke-contracts.ts:245-260` |
| 4 | `ask_onx_honest_refusal` | سؤال خارج الذخيرة → `INSUFFICIENT_EVIDENCE`، `answer=null`، صفر استشهاد، `DEMO` | تلفيق/حشو بلا دليل — كسر عقيدة | `smoke-contracts.ts:262-282` |
| 5 | `ask_onx_cited_answer` | سؤال داخل الذخيرة → `ANSWERED` باستشهادات + إفصاح `DEMO` | إجابة بلا استشهاد أو بلا إفصاح | `smoke-contracts.ts:284-307` |
| 6 | `corpus_manifest_truth` | بصمة الكوربوس المنشور == المرتكب في `corpus-manifest.json` | محتوى معرفي منشور يخالف العقد المرتكب | `smoke-contracts.ts:137-190` |
| 7 | `bridge_fail_closed` | طفرة جسر بلا مفتاح مرفوضة (401/403 + علامة `BRIDGE_`) ولم تُنفَّذ | الجسر مفتوح بلا مفتاح — ثغرة حرجة | `smoke-contracts.ts:316-338` |
| 8 | `no_key_leak` | لا مفتاح مزوّد كامل في أي استجابة | تسريب سرّ — إيقاف وتدوير فوري | `smoke-contracts.ts:458-463` |
| 9 | `truth_ledger_read` | سطح `onx.truthHistory` سليم البنية؛ سجل فارغ = حالة صادقة مُبلَّغة؛ لقطات مأهولة تحمل بصمة+drift | بنية سجل مشوّهة أو بصمة غير sha256 | `smoke-contracts.ts` (`checkTruthLedgerRead`) |

**دلالات الطزاجة (`EXPECT_COMMIT` / PENDING) — درس K-08** (`smoke-contracts.ts:169-189`, `:384`):
- بنية العقد 6 (disclosure/provenance/docCount/domainCount) تُطابق **دائماً**.
- `sha256` يُطابق **strict** فقط عند `deployFresh` (health.commit == `EXPECT_COMMIT`).
- بلا طزاجة مؤكدة واختلاف sha → **PENDING pass** يبلّغ **البصمتين معاً** (لا تمرير بالتمني، لا فشل غامض)؛ أعد التشغيل بـ`EXPECT_COMMIT` بعد أن يعيد Render النشر.
- مع `EXPECT_COMMIT` مطابق + sha مختلف = **خرق حقيقي** (فشل).

### و.3) مسح حقيقة البيئة (مرآة C-07§3) — كل قراءة `process.env` في كود الإنتاج

المصدر المركزي `api/lib/env.ts:11-22`. التصنيف: **إلزامي** (منتج بلا افتراضي)،
**اختياري/بافتراضي**، **بيئي منصّة**.

| المتغير | الحالة | الافتراضي/السلوك عند الغياب | القراءة (`ملف:سطر`) |
| --- | --- | --- | --- |
| `NODE_ENV` | بيئي | `"development"`؛ `=production` يفعّل شبكة الأمان | `env.ts:14`، `boot.ts:44,69`، `boot.ts:71` |
| `PORT` | بيئي | `"3000"` | `boot.ts:121` |
| `RENDER_GIT_COMMIT`/`COMMIT_SHA`/`GIT_SHA` | بيئي (Render يحقنه) | `"unknown"` (حقل commit فقط) | `boot.ts:27-29` |
| `APP_ID` / `APP_SECRET` | إلزامي إنتاج | تحذير `[env]` بلا إيقاف | `env.ts:12-13` |
| `DATABASE_URL` | اختياري-حرج | `sqlite:///app/db/onx-pilot.db`؛ غير-postgres → مخازن pg تُبلّغ `UNAVAILABLE`/`UNPERSISTED` | `env.ts:17`، `health-router.ts:59,126`، `knowledge-router.ts:212`، `corpus-pg-store.ts:17,23`، `iurg-pg-store.ts:21`، `iurg-store.ts:46`، `truth-ledger.ts:47,53`، `persistent-memory.ts:368,425`، `drizzle.config.ts:4` |
| `PLATFORM_INBOX_DATABASE_URL` | اختياري | يسقط إلى `DATABASE_URL` | `platform-inbox-store.ts:13` |
| `BRIDGE_ENABLED` | اختياري (أمان) | `"false"` → الجسر مقفل | `env.ts:15` |
| `BRIDGE_SHARED_SECRET` | اختياري (أمان) | `""` → الجسر fail-closed | `env.ts:16` |
| `OPENAI_API_KEY` | اختياري | `""` → مزوّد `MISSING_KEY`/`gpt4oEnabled=false` | `env.ts:21`، `health-router.ts:106`، `knowledge-router.ts:470`، `ai-brain-router.ts:14,345`، `titan-bridge-router.ts:38`، `voice-router.ts:14`، `vet-intelligence-router.ts:15,286` |
| `ANTHROPIC/GEMINI/GOOGLE/GROQ/DEEPSEEK/QWEN/DASHSCOPE/TOGETHER/LLAMA/KIMI/MOONSHOT_API_KEY` | اختياري | `MISSING_KEY` في `providers.status` | سجلّ المزودين (مقاس حياً في `providers.status.envKeys`) |
| `KIMI_AUTH_URL` / `KIMI_OPEN_URL` | اختياري | نقاط Kimi الافتراضية | `env.ts:18-19` |
| `OWNER_UNION_ID` | اختياري | `""` | `env.ts:20` |
| `APP_URL` | اختياري | `http://localhost:3000` (روابط إعادة التعيين) | `password-reset-router.ts:102,179` |

**هل `DATABASE_URL` مستخدم فعلاً؟ — نعم، مقاس حياً**: نداء `health.ready` الحي يعيد مكوّن
`{"name":"Database","status":"HEALTHY"}` — و`checkDatabase` ينفّذ `SELECT 1` حقيقياً ضد
Postgres ويعيد `UNAVAILABLE` لو لم يكن postgres (`health-router.ts:57-72`). إذًا قاعدة
`onx_intelligence` على Render مضبوطة ومتصلة فعلاً — لا ادعاء.

### و.4) عمليات مفتاح الجسر (`BRIDGE_SHARED_SECRET`)

التفاصيل الكاملة (تفعيل/تدوير/إيقاف طارئ) في **القسم (ب)** أعلاه — لا تكرار. الحقيقة المقاسة
الموجة 20: `providers.status` الحي يعيد `"enabled":true,"hasSharedSecret":true` — أي الجسر
**مفعّل ومزوّد بسرّ على الإنتاج**، والعقد الحي `bridge_fail_closed` يثبت أن طفرة بلا مفتاح
تُرفض 401 (`api/bridge-guard.ts` يرمي `TRPCError code:"UNAUTHORIZED"`). دلالات الرموز:
`401 BRIDGE_UNAUTHORIZED` (مفتاح خاطئ)، `BRIDGE_DISABLED` (معطّل)،
`BRIDGE_SECRET_NOT_CONFIGURED` (بلا سرّ) — `api/bridge-guard.ts:6,10,13-15`.

### و.5) حقيقة rate-limit — تبعات `PER_INSTANCE_UNPERSISTED` للمشغّل

الحدّ: `PUBLIC_READ_LIMIT=60` طلب / `PUBLIC_READ_WINDOW_SEC=60` ثانية
(`api/lib/rate-limiter.ts:24-28`)، والثابت `RATE_LIMIT_PERSISTENCE="PER_INSTANCE_UNPERSISTED"`
(`rate-limiter.ts:31`) يُصرَّح في **كل** استجابة عامة (مقاس: `rateLimit.persistence` في
`providers.status`). تبعات للمشغّل:
- العدّاد **في ذاكرة كل نسخة (instance)**، **يتصفّر عند كل إقلاع/إعادة نشر**، ولا يُشارَك بين نسخ متعددة.
- ليس حماية أمنية موزّعة — هو ضبط إساءة أساسي per-instance. للحماية الجادّة أضف طبقة حافة (WAF/بوابة) — موثّق بصدق كحدّ لا كوعد.
- `/health` و`/commit` **معفيان** (فحوصات Render)؛ مسارات الجسر محمية بالمفتاح لا بالحدّ.

### و.6) عمليات manifest الكوربوس — معنى انحراف sha256

العقد المرتكب `corpus-manifest.json` (الجذر): `sha256=6fc2bed8…372f08`، `docCount=22500`،
19 نطاقاً، `disclosure="DEMO"`، `provenance="TEMPLATED_SEED"` (مقاس حياً من
`corpusQuery.manifest`). البصمة فوق أسطر الهوية المرتّبة `id\u0000domain\u0000title` فقط
(الجسم العشوائي مستبعَد) — حتمية عبر الإقلاع لكنها تكشف add/remove/relabel.

**عند اختلاف sha256:**
- **مقصود** (استوعبت/عدّلت الذخيرة): أعد التوليد `npm run verify:corpus -- --write` وارتكب
  الـmanifest الجديد في **نفس commit** التغيير — البوابة السادسة `verify:corpus` تحرسه بعدها.
- **غير مقصود** (لم تلمس الذخيرة وتغيّرت البصمة): **تحقيق فوري** — عبث محتمل أو انحراف بذرة.
- **الربط الحي**: العقد الثامن `corpus_manifest_truth` (`npm run smoke:live`) يقارن البصمة
  **المنشورة** بالمرتكبة؛ اختلاف على نشر طازج مؤكّد (`EXPECT_COMMIT` مطابق) = خرق حقيقي؛
  اختلاف بلا طزاجة = PENDING يبلّغ البصمتين (أعد بعد إعادة نشر Render).

### و.7) أساسيات الحوادث

1. **honest-status أولاً**: عند أي شكّ ابدأ بـ`onx.selfVerify` و`health.ready/status` —
   لا مكوّن يدّعي صحة غير مقاسة (`claimsAsserted=0` عقد حي).
2. **أرضيات golden سلك تعثّر لا يُخفَض أبداً**: `api/fixtures/eval-floors.json` =
   `intentAccuracy=1.0`، `refusalHonesty=1.0`، `retrievalHitAtK=1.0`. أي هبوط تحتها →
   `eval:golden` exit 1 (البوابة الخامسة في `.github/workflows/truth-gates.yml`). **ممنوع
   خفض الأرضية لتمرير رن** — الأرضية تُرفَع بالقياس الصادق فقط (سقاطة لا سقف).
3. **كتيبات الطوارئ التفصيلية**: انظر القسم (هـ) — «متى يقلق المشغّل» + كتيبات OSVA.

### و.8) عمليات سجل الحقيقة (Truth Ledger) — الحالة الحية المقاسة (STE-K-13 → K-14)

سجل الحقيقة (`api/lib/truth-ledger.ts`) يخزّن لقطات OSVA زمنياً ليصبح انحراف الحقيقة
قابلاً للكشف عبر الزمن.

**تاريخ الفجوة (STE-K-13، جرد صادق):** قبل الموجة 22 كان السجل **فارغاً على الإنتاج** لأن
المُسجّل الوحيد كان العامل المستقل `scheduler-worker.ts:60` (خدمة `onx-scheduler`، `branch: main`
+ **`autoDeploy: false`** — `render.yaml:179,196`) **غير المنشور حياً**؛ وكرون الويب لم يكن يلتقط.

**الإغلاق (STE-K-14 — الالتقاط الحي من كرون الويب):** بدل نشر خدمة منفصلة، وُصِل الالتقاط
بكرون خدمة الويب القائم:
- `api/boot.ts:83-110` (كرون `*/5 * * * *`) يستدعي الآن `maybeRecordTruthSnapshot()` كل tick.
- **الإيقاع ساعي** (`TRUTH_SNAPSHOT_INTERVAL_MS = 3600000`، `truth-snapshot-cron.ts:31`) —
  **مبرّر**: انحراف الحقيقة يتتبّع النشر/تغيّر القدرات لا الدقائق؛ الالتقاط كل 5 دقائق يكتب
  ~288 صفاً شبه متطابق يومياً ويُنمّي سجل Postgres بلا إشارة. بوابة ساعية (24/يوم) تلتقط بصدق وبكلفة زهيدة.
- **غير قاتل** (`truth-snapshot-cron.ts:52-64`): فشل الالتقاط يُسجَّل server-side و**لا يرمي أبداً** —
  الحلقة والخدمة تنجوان من أي كتابة سجل فاسدة (نمط cron الصادق S-10). عند الفشل لا تتقدّم البوابة
  → يُعاد المحاولة في الـtick التالي بدل ابتلاع ساعة كاملة.
- **المسار اليدوي باقٍ**: طفرة `onx.truthSnapshot` (`api/onx-router.ts:19-22`) خلف الجسر fail-closed.
- **الازدواج آمن بلا حارس** (`truth-snapshot-cron.ts:20-25`): إن نُشر `onx-scheduler` لاحقاً يلتقط أيضاً —
  كل لقطة صف مستقل بمعرّفه وطابعه الزمني (لا مفتاح فريد يُنتهك)، وراية `drift` تبقى صحيحة
  (بصمتان متطابقتان → `drift:false`).

**القياس الحي (نداء واحد لـ`onx.truthHistory` بعد دورة كرون واحدة على الإنتاج):**
```json
{"persistence":"POSTGRES","count":1,"snapshots":[{"id":..,"fingerprint":"<sha256>","claimsMeasured":19,"claimsAsserted":0,"drift":false}]}
```
أول لقطة حقيقية في تاريخ الإنتاج — مدعومة بـPostgres، ببصمة sha256 وراية drift. (يُحدَّث الرقم مع تراكم اللقطات.)

**العقد التاسع `truth_ledger_read`** (`api/lib/smoke-contracts.ts` — نداء واحد لـ`onx.truthHistory`):
يؤكد بنية السطح (`persistence` ∈ {POSTGRES, UNPERSISTED}، تطابق `count` مع طول `snapshots`،
وكل لقطة تحمل بصمة sha256 + عدّادين رقميين + راية `drift` منطقية). السجل الفارغ يبقى حالة صادقة
مقبولة (قبل أول دورة كرون)، والمأهول يُبلَّغ بعدد لقطاته وراياته.

**دلالات راية `drift` للمشغّل** (`truth-ledger.ts:138-146`) — نفس منطق انحراف الكوربوس (و.6):
- `drift: true` يعني بصمة اللقطة اختلفت عن سابقتها المباشرة زمنياً — **تغيّرت الحقيقة المقاسة**.
- **مقصود** (نشر قدرة جديدة رفعت حكماً في OSVA): أساس جديد — سجّله وامضِ.
- **غير مقصود** (لا نشر وتغيّرت البصمة): **تحقيق فوري** — انحدار حقيقة محتمل. ابدأ بـ`onx.selfVerify`
  لمقارنة الأحكام البند-ببند (و.7).

> **English mirror (STE-K-12):** This section is measured, not wished. Live map (و.1):
> service `onx-intelligence-clean.onrender.com`, branch `onxos-ste01-deploy-readiness`,
> `/health` shape at `api/boot.ts:38-47`, tRPC/superjson envelope at `api/boot.ts:57-64`.
> Nine live smoke contracts (و.2) in `api/lib/smoke-contracts.ts` with per-contract
> proof/failure meaning + `EXPECT_COMMIT`/PENDING freshness semantics (`:169-189,:384`).
> Environment truth scan (و.3): every `process.env` read from `api/lib/env.ts:11-22` and
> callers, classified required/optional/default. **`DATABASE_URL` is genuinely used** —
> live `health.ready` returns `Database: HEALTHY` (real `SELECT 1`, `health-router.ts:57-72`).
> Bridge ops (و.4) → section B; live `hasSharedSecret:true`. Rate-limit truth (و.5):
> `PER_INSTANCE_UNPERSISTED`, 60/60s, resets on boot, not distributed. Corpus sha256 drift
> (و.6): intended → `verify:corpus --write` + commit; unintended → investigate; tied to the
> live `corpus_manifest_truth` contract. Incidents (و.7): honest-status first; golden floors
> 1.0×3 are a tripwire that is never lowered.
>
> **STE-K-13/K-14 (و.8):** Truth-ledger ops. K-13 found the live ledger EMPTY (the recorder
> worker `onx-scheduler` was `autoDeploy:false`/`branch:main`, render.yaml:179,196; the web cron
> didn't snapshot) — an honest C-08 discovery. K-14 closes it: the live web cron
> (`boot.ts:83-110`) now calls `maybeRecordTruthSnapshot()` each tick, hourly-gated
> (`truth-snapshot-cron.ts:31`, justified: drift tracks deploys not minutes) and NON-FATAL
> (`:52-64`, never throws — S-10 survival). Double-capture with `onx-scheduler` is safe (rows
> independent by id+timestamp). Ninth live contract `truth_ledger_read` accepts an empty ledger
> and validates snapshot/fingerprint/drift structure when populated. Drift semantics mirror و.6.
