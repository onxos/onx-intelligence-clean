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

## ترقية الذخيرة كأداة عاملة مرتكبة (STE-K-16)

الموجة K-10 وثّقت المسار؛ الموجة K-16 حوّلته إلى **كود عامل مرتكب مختبَر**. لا يعاد بناء
منطق K-10 المقاس — يُستدعى كما هو.

- **النواة النقية** `api/lib/corpus-upgrade.ts`: بلا شبكة/DB/أسرار.
  - `validateAuthenticDocs(docs)` — بوابة بنية + provenance حقيقي: يرفض domain/title/body/source
    الفارغ، و`source` يساوي وسم البذرة، و`body` يتضمن الوسم (كي لا تُحسب أصيلة زوراً).
  - `toAuthenticSearchDocs(docs)` — يوسم كل وثيقة **غير-قالبية** ويلحق `Source: <source>` إن
    غاب، فيبقى provenance مرئياً لكل وثيقة.
  - `previewUpgrade(current, authentic)` — يقيس البصمة قبل/بعد ويعيد
    `{before, after, flipped, reachedReal, addedAuthentic, remainingTemplated, shaChanged}`.
- **أداة المشغّل** `scripts/ingest-corpus.ts` عبر `npm run ingest:corpus -- <docs.json>`:
  - **وضع المعاينة (افتراضي، keyless، حتمي)**: يتحقق ويقيس الإفصاح المنفرد للوثائق الأصيلة
    (يثبت أنها تقرأ `REAL` وحدها) ويطبع خطوات إعادة التثبيت (re-pin) بلا تخزين.
  - **وضع `--persist`**: يودع عبر جسر `corpusQuery.ingest` المصرّح فقط (يتطلب
    `ONX_HOST` + `ONX_BRIDGE_KEY` من المشغّل — لا يُخزَّن في الريبو أبداً)، دفعات ≤500.
  - `docs.json` = مصفوفة `{ id?, domain, title, body, source }`.
- **إعادة التثبيت جزء من المسار لا التفاف عليه**: الاستيعاب الأصيل يغيّر sha256 المانيفست
  شرعياً = أساس جديد مقصود. الخطوة 3 (`verify:corpus -- --write`) والخطوة 6 (ارتكاب المانيفست
  في نفس commit) من قسم K-10 هي إجراء re-pin المعتمد، والبوابة السادسة تمنع أي عبث بعده.
- **صدق الحالة الحية (بند و في K-16)**: السطح المنشور يبقى `disclosure:"DEMO"` بصدق حتى يوفّر
  المؤسس أرشيف REC-06 الأصيل (19,012 وثيقة) ويستبدل البذرة القالبية فعلاً. هذه الأداة **لا
  تلفّق** الانقلاب — تقيسه. المختلط يبقى `DEMO` تحفّظاً (لا REAL كاذب).

## Corpus upgrade as working committed code (STE-K-16) [EN]

K-10 documented the path; K-16 turns it into **working, committed, tested code** without
rebuilding the measured K-10 logic. Pure core `api/lib/corpus-upgrade.ts` (no network/DB/
secrets): `validateAuthenticDocs` (rejects empty fields, `source` equal to the seed marker,
or `body` embedding the marker), `toAuthenticSearchDocs` (tags every doc non-templated and
appends `Source: <source>` so provenance stays visible), and `previewUpgrade(current,
authentic)` returning `{before, after, flipped, reachedReal, remainingTemplated,
shaChanged}`. Operator tool `scripts/ingest-corpus.ts` via `npm run ingest:corpus --
<docs.json>`: preview mode (default, keyless, deterministic) validates + MEASURES the
authentic set's standalone disclosure (proves it reads `REAL`) and prints the exact re-pin
steps, storing nothing; `--persist` ingests through the authorized fail-closed
`corpusQuery.ingest` bridge (requires operator-provided `ONX_HOST` + `ONX_BRIDGE_KEY`,
never in the repo), batches ≤500. Re-pin is part of the path, not a workaround: authentic
ingest legitimately changes the manifest sha256 (intended new baseline); `verify:corpus --
--write` + committing the manifest in the same commit is the sanctioned re-pin, and the
sixth Truth Gate blocks tampering afterward. **Honest live state:** the deployed surface
stays `disclosure:"DEMO"` until the founder-provided REC-06 archive (19,012 docs) actually
replaces the templated seed — the tool measures the flip, it never fabricates it; mixed
stays conservatively `DEMO`.

---

## صفحة الحقيقة العامة القابلة للقراءة (STE-K-17)

مسار `/truth` (`src/pages/Truth.tsx`، مُوجَّه في `src/App.tsx`) نافذة **قراءة-فقط** بلغة
بشرية على صدق النظام المقاس — مرآة W25/C-13. لا يحمل أي قيمة صلبة: كل حقل يُقرأ حيًّا من
الأسطح الصادقة القائمة عبر النواة النقية `buildTruthPageModel` في `api/lib/truth-page-model.ts`.

**الأسطح الثلاثة المقروءة** (نداءات tRPC قائمة، لا سطح جديد):
- `onx.selfVerify` → ادعاءات مقاسة/مُدّعاة + البصمة + الجسور fail-closed + `truthLedgerSummary`.
- `corpusQuery.manifest` → إفصاح الذخيرة (شارة DEMO/REAL) + `sha256` مختصر + عدد الوثائق/النطاقات.
- `providers.status` → إفصاح حدّ المعدّل (وضع مقاس: `POSTGRES_PERSISTED` حياً أو ارتداد `PER_INSTANCE_UNPERSISTED`).

**حالات القسم الصادقة** (`api/lib/truth-page-model.ts`):
- `OK` — السطح أجاب بالبيانات.
- `EMPTY` — أجاب لكن المورد فارغ بصدق (سجل حقيقة بلا لقطات = `state:"EMPTY"`)، لا تاريخ مُلفّق.
- `FETCH_FAILED` — تعذّر جلب السطح؛ الصفحة تُظهر فشلاً صريحاً **لا صفراً زائفاً**. القيم تبقى
  `null` (غياب صادق) لا `0`. سطح ميت لا يُسمّم البقية (كل مصدر مستقل).

**RTL عربي أولاً** مع تسميات إنجليزية مرافقة لكل حقل وشارة.

**توسيع عقد `no_key_leak`** (`api/lib/smoke-contracts.ts`، الفحص التاسع في `runSmoke`): بعد
العقود الثمانية يُجلب `/truth` بنداء واحد ويُمرَّر عبر `assertNoKeyLeak` — فبايتات الصفحة نفسها
لا يجوز أن تُظهر مفتاح مزود كاملاً (لا يضيف عقداً؛ يغذّي حارس التسريب القائم).

> **الحالة الحية الصادقة**: الصفحة تعرض ما تقيسه الأسطح — الذخيرة تبقى `DEMO` حتى أرشيف REC-06،
> وسجل الحقيقة يُظهر عدده الفعلي أو `EMPTY`. لا ادعاء يسبق القياس.

## Public human-readable Truth page (STE-K-17) [EN]

The `/truth` route (`src/pages/Truth.tsx`, wired in `src/App.tsx`) is a **read-only**,
plain-language window onto the system's MEASURED honesty (mirror of W25/C-13). It hard-codes
nothing: every field is read live from the existing honest surfaces via the pure
`buildTruthPageModel` core in `api/lib/truth-page-model.ts`. Three existing tRPC reads feed
it: `onx.selfVerify` (measured/asserted claims + fingerprint + fail-closed bridges +
`truthLedgerSummary`), `corpusQuery.manifest` (DEMO/REAL disclosure badge + short `sha256` +
doc/domain counts), `providers.status` (rate-limit disclosure — measured `POSTGRES_PERSISTED` or honest `PER_INSTANCE_UNPERSISTED` fallback).
Honest section states: `OK` (surface answered), `EMPTY` (answered but the resource is
honestly empty — an unpopulated ledger reports `state:"EMPTY"`, never fabricated history),
and `FETCH_FAILED` (surface unreachable → an explicit failure, **never a fake zero**; values
stay `null`, and one dead surface never poisons the others). Arabic-first RTL with English
labels. The `no_key_leak` contract (`api/lib/smoke-contracts.ts`, the 9th fetch in
`runSmoke`) additionally GETs `/truth` once and runs its HTML through `assertNoKeyLeak` — the
page's own bytes must never echo a full provider key (no new contract; it feeds the existing
leak guard).

---

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

### و.2) تشغيل الدخان الحي — العقود التسعة (`npm run smoke:live`)

المُشغّل: `scripts/smoke-live.ts` (يحتاج شبكة وبيئة حية — ملاحظة في رأس الملف
`scripts/smoke-live.ts:1-6`). المنطق النقي في `api/lib/smoke-contracts.ts`، المُشغّل
`runSmoke` (`api/lib/smoke-contracts.ts:370-477`). البيئة: `BASE_URL` (افتراضي الرابط أعلاه،
`scripts/smoke-live.ts:31`)، و`EXPECT_COMMIT` أو `EXPECTED_SHA` (`scripts/smoke-live.ts:34`).
ملاحظة STE-K-29/30: الرقيب موجود في `.github/workflows/live-truth.yml` (كل 6 ساعات +
`workflow_dispatch`) لكنّه **خامل على الفرع المحكوم** حتى يتوفر الملف على default branch.

| # | العقد | ماذا يثبت | ماذا يعني فشله للمشغّل | المرجع |
| --- | --- | --- | --- | --- |
| 1 | `health_live` | الخدمة حية (`ALIVE`) وحقل `commit` موجود؛ ومع `EXPECT_COMMIT` = تطابق النشر | الخدمة ساقطة أو نشرت commit غير متوقع | `smoke-contracts.ts:192-215` |
| 2 | `honest_status_selfverify` | OSVA: بنود بأحكام خماسية، بصمة sha256، و`claimsAsserted=0` | ادّعاء غير مقاس تسلّل — تحقيق فوري | `smoke-contracts.ts:217-243` |
| 3 | `rate_limit_disclosure` | سطح قراءة عام يصرّح `rateLimit.persistence` بوضع مقاس صادق (`POSTGRES_PERSISTED` أو ارتداد `PER_INSTANCE_UNPERSISTED`)؛ `EXPECT_RL_PERSISTENCE` يؤكد الوضع | غياب التصريح أو تسمية غير معروفة أو عدم تطابق الوضع المتوقَّع = انحراف صدق | `smoke-contracts.ts:245-272` |
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

### و.5) حقيقة rate-limit — إصرار مقاس `POSTGRES_PERSISTED` / ارتداد صادق `PER_INSTANCE_UNPERSISTED` (STE-K-19)

الحدّ: `PUBLIC_READ_LIMIT=60` طلب / `PUBLIC_READ_WINDOW_SEC=60` ثانية
(`api/lib/rate-limiter.ts:35-42`). **الإفصاح مقاس لكل نافذة، لا مُدّعى** — كل قرار يحمل مخزن
الدعم الذي خدمه فعلاً (`RateDecision.persistence`، مقاس حياً في `rateLimit.persistence` على
`providers.status`):
- **`POSTGRES_PERSISTED`**: حالة الدلو قُرئت وكُتبت في Postgres داخل معاملة
  `SELECT … FOR UPDATE` (`rate-limiter.ts` — `postgresStore.step`، جدول `onx_rate_limit_buckets`
  عبر `ensureSchema` كمرآة truth-ledger). مُشترك بين النسخ، يصمد عبر إعادة النشر.
- **`PER_INSTANCE_UNPERSISTED`**: ارتداد صادق — يُخدَم من ذاكرة النسخة فقط، **يتصفّر عند الإقلاع**،
  غير مُشارك. ينقلب إليه الإفصاح تلقائياً حين يغيب `DATABASE_URL` **أو** حين يفشل نداء Postgres
  (`decideRateLimit` يلتقط الخطأ، يسجّله server-side عبر `getLastRateLimitFallback`، ويخدم من الذاكرة).
  **غير قاتل**: فشل مخزن الحدّ لا يُسقط السطح العام أبداً.

تبعات للمشغّل:
- الوضع المقاس **يعكس الواقع تلك اللحظة**، لا وعداً. `POSTGRES_PERSISTED` = حدّ يصمد عبر النسخ/النشر؛
  `PER_INSTANCE_UNPERSISTED` = حدّ per-instance يتصفّر (راجع سجل `getLastRateLimitFallback` لسبب التدهور).
- **البرهان الحي**: العقد الثالث `rate_limit_disclosure` (`npm run smoke:live`) يقبل الوضعين الصادقين
  ويرفض أي تسمية أخرى؛ اضبط `EXPECT_RL_PERSISTENCE=POSTGRES_PERSISTED` لتأكيد أن النشر المدعوم بقاعدة
  يقيس فعلاً الإصرار — عدم تطابق الوضع المقاس مع المتوقَّع = خرق حقيقي.
- ليس حماية أمنية موزّعة كاملة — للحماية الجادّة أضف طبقة حافة (WAF/بوابة). موثّق بصدق كحدّ لا كوعد.
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
   - **تحديث STE-K-33 (مقاس نهائي):** مجموعة `GOLDEN_SET` تعمّقت من **49 → 57**
     حالة (تعميق +8، لا تغيير أسطح) بستة أصناف تشغيلية/معرفية واضحة:
     (أ) نوايا التشغيل السبعة (EMERGENCY..INFO) مع رفض صادق على كوربوس DEMO،
     (ب) رفض خارج-المعرفة طقس/سياسة/طبخ (ar/en)، (ج) Anti-overfit حجوزات
     «غداً/tomorrow» التي تبقى BOOKING بصدق، (د) استرجاع معرفي قائم 8 نطاقات،
     (هـ) استرجاع K-33 المضاف 6 نطاقات (LEGAL/MEDICINE/EDUCATION/FINANCE/
     ENVIRONMENT/TRANSPORTATION)، (و) رفض خارج-المعرفة رياضة (ar/en). الراتشيت
     يبقى 1.0×3 ويُقاس على العدد الجديد بلا خفض.
   - **سابقة منهجية (STE-K-33):** القياس كشف صياغة استرجاع نقل ضعيفة أعطت
     `retrievalHitAtK=0.9286` (13/14)؛ صُحّحت الصياغة إلى مصطلحات نطاقية
     أدق ثم عاد القياس إلى `1.0`. القاعدة: إذا كشف القياس ضعف صياغة فتصحيح
     الصياغة واجب قبل الالتزام، لا خفض للأرضية.
   - **STE-K-34 (توثيق/تثبيت):** موجة توثيق بحتة — لا منطق جديد، لا حالات golden
     جديدة، ولا عقود smoke جديدة (الإجمالي يبقى 9).
3. **كتيبات الطوارئ التفصيلية**: انظر القسم (هـ) — «متى يقلق المشغّل» + كتيبات OSVA.

### و.8) عمليات سجل الحقيقة (Truth Ledger) — الحالة الحية المقاسة (STE-K-13 → K-15)

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

**تحديث الحالة المقاسة (STE-K-38، قياس قبل الكتابة عند commit `d7eba7e`):** السجل **ينمو ساعياً** من كرون الويب —
القياس الحي الأحدث عبر أصل البوابة الرسمية أكّد دلالة العدّ: `onx.truthHistory.count` = **حجم نافذة
الاستجابة** لا إجمالي الجدول. القياس المباشر: `limit=20 => count=20` (الافتراضي)، `limit=100 => count=34`،
والإجمالي المستقل يظهر في `onx.selfVerify.truthLedgerSummary.count=34` (`persistence=POSTGRES`).
**احتفاظ السجل مُفصَح حياً** (STE-K-22): `retention={keep:168, oldestRetainedId:1, oldestRetainedIsGenesis:true}`
— النافذة (168 = 7 أيام ساعية) لم تُبلَغ بعد فالأصل محفوظ بصدق؛ التقليم المقاس يبدأ بعد تجاوز 168.
سطح `/health` المقاس عبر أصل البوابة يخدم `commit=d7eba7ed0f3c…` (متقارب مع `d7eba7e`). حد المعدل **`POSTGRES_PERSISTED` مقاس حياً**
(STE-K-19، و.5). صفحة `/truth` العامة **حية** (HTTP 200، مبنية كلياً من الأسطح الصادقة، صفر تسريب
مفاتيح) وتعرض الآن **بطاقتين حيّتين**: (STE-K-23) **بطاقة احتفاظ** (keep/oldestRetainedId/شارة حافة
genesis-retained مقابل older-pruned) + (STE-K-27) **بطاقة طزاجة النشر** (الإصدار المخدوم + وقت الإقلاع
مقاسان من سطح `/commit`، بلا buildTime مُلفّق، و`null`-صادق عند الغياب). وتعرض أيضاً **شارة إصرار حد
المعدل مقاسة** — واستُبدل التعليق الصلب البائت «per-instance in-memory» الذي كان يناقض مخزن K-19
المقاس بتعليق يتبع الشارة الحية. و**برهان الرسم مُفصَح** (STE-K-25): الفحص التاسع `no_key_leak` يُثبت
أن الصفحة المخدومة هي قشرة SPA المبنية الحقيقية بعلامات مقاسة (`id="root"` +
`<script type="module" src="/assets/…">`) — البرهان الحي `RENDER_PROVEN=true`. كل الأسطح التسعة تُقاس
**عبر الرابط الواحد** `…/intelligence` بنتيجة 9/9 (STE-K-20، و.9). الكوربوس يبقى `disclosure=DEMO`
مقاساً (22500 بذرة قالبية، sha256 `6fc2bed87d86…`) **بانتظار أرشيف REC-06 الأصيل** (19,012 وثيقة)
لينقلب REAL **بالقياس لا باليد**.

**العقد التاسع `truth_ledger_read`** (`api/lib/smoke-contracts.ts` — نداء واحد لـ`onx.truthHistory`):
يؤكد بنية السطح (`persistence` ∈ {POSTGRES, UNPERSISTED}، تطابق `count` مع طول `snapshots`،
وكل لقطة تحمل بصمة sha256 + عدّادين رقميين + راية `drift` منطقية). السجل الفارغ يبقى حالة صادقة
مقبولة (قبل أول دورة كرون)، والمأهول يُبلَّغ بعدد لقطاته وراياته.

**برهان رسم صفحة `/truth` في `no_key_leak` (STE-K-25):** الفحص التاسع (`no_key_leak`) لا يكتفي
الآن بمسح تسريب المفاتيح على بايتات `/truth` — بل **يُثبت أن الصفحة مرسومة فعلاً**. الدافع: قشرة
`200 OK` فارغة كانت ستمرّ فحص التسريب دون إثبات أي رسم. `assertTruthPageRendered`
(`api/lib/smoke-contracts.ts`) يتحقّق **من علامات مقاسة من index.html المبني الحي**: جذر SPA
(`id="root"`) + حزمة الوحدة المبنية (`<script type="module" ... src="/assets/…">`). قشرة عارية
(لا جذر أو لا حزمة) أو حالة غير 200 → **تفشل بصدق** بدل التنكّر كصفحة حية. **تعميق لا عقد جديد**:
النتيجة مطوية في نفس عقد `no_key_leak` (المجموع يبقى 9)؛ التفصيل الناجح يقرأ
«… /truth render-proven (SPA root + built bundle)».

**عقيدة برهان الرسم — ثلاثية الريبو (معلم #116):** برهان أن السطح العام **مرسوم** فعلاً لا مجرد
`200` فارغ اكتمل الآن عبر الريبوهات الثلاثة: التسويق (S-34) + الذكاء (STE-K-25) + المنصة (C-25،
`cab2c0a`). العقيدة واحدة: القياس على البايتات المخدومة الحقيقية، والفشل الصادق حين تغيب علامات
الرسم — لا ادعاء حياة لقشرة ميتة.

**حكم معماري STE-K-35 — حدود برهان العرض في SPA (مقاس أولاً):**
- القياس الحي لصفحة `/truth` عبر أصل البوابة الرسمية (`…/intelligence/truth`) أعطى:
  `len=400`, `hasRoot=true`, `hasModule=true`, `hasFreshnessTextInRawHtml=false`,
  `hasLedgerTextInRawHtml=false`.
- النتيجة الصادقة: HTML الخام في SPA يثبت **قشرة العرض فقط** (root + module bundle)،
  ولا يمكنه قياس ظهور بطاقة الطزاجة أو جدول السجل لأنها تُرسم client-side بعد تحميل
  الحزمة. لذلك أي «marker ثابت» في index.html لا يثبت وجود الجدول/البطاقة فعلياً ويُرفض
  كمسرحة قياس.
- البديل الصادق القائم (بدون عقود جديدة): حراسة طبقة البيانات عبر الأسطح المقاسة أصلاً
  ضمن العقود التسعة — `onx.truthHistory`/`truth-ledger` لبيانات السجل، و`/commit` لطزاجة
  النشر، مع استمرار `no_key_leak` في إثبات قشرة SPA الحية فقط. **عدّ صادق: الإجمالي يبقى 9**.

**تفعيل الحكم عمليًا (STE-K-36) — حارس طبقة البيانات لأسطح جدول /truth:**
- القياس قبل التعميق على `truth_ledger_read` أظهر أنه كان يثبت البنية العامة
  (count/persistence/fingerprint/drift/retention/order) لكنه لا يُلزم كل حقول الصف
  التي يستهلكها جدول K-31 بشروط نوعية صريحة (`id` و`createdAt` الإلزاميان لكل صف،
  `predecessorPruned` boolean حين الحضور، وقيد genesis عندما `id=1`).
- التعميق (لا عقد جديد): نفس العقد التاسع صار يثبت **بنية الصفوف الدلالية** مباشرة من
  الاستجابة الحية: `id` عدد صحيح موجب، `createdAt` طابع زمني صالح، `fingerprint` sha256،
  `drift` boolean، وحواف `predecessorPruned` + `genesis` حيث تنطبق.
- اختبارات حتمية محقونة: `smoke-live` أضيف لها **+4** حالات صفّية صريحة
  (id مفقود/invalid، `createdAt` مفقود/invalid، `predecessorPruned` غير-boolean،
  genesis موسوم خطأ) — وعدّاد suite الكلي ارتفع **1084 → 1088** دون إضافة عقود.
- النتيجة: حراسة واجهة /truth البشرية تبقى صادقة عبر **طبقة البيانات** (truthHistory/ledger
  + /commit) مع بقاء برهان HTML مقتصرًا على shell SPA فقط. **العدّ يبقى 9 (تعميق لا إضافة)**.

**STE-K-37 — توطيد دائم لعقيدة SPA (حكم → تفعيل):**
- السلسلة المكتملة الآن مرجع تشغيلي واحد: **K-35 حكم معماري صادق** (raw HTML غير قابل لقياس
  حضور محتوى client-side) ثم **K-36 تفعيل عملي** (إلزام حقول صفوف `truthHistory` الدلالية
  في العقد التاسع).
- قاعدة العمل: في SPA تُحرس **قشرة العرض** من HTML الخام فقط (`root + module bundle`)،
  بينما تُحرس **البطاقات/الجدول البشرية** من طبقة البيانات (`/commit` + `truthHistory`/`truth-ledger`)
  داخل العقود التسعة نفسها، بلا مسرحة markers ثابتة.
- **Last measured live run (K-37 pre-write):** `npm run smoke:live` عبر
  `GATEWAY_ORIGIN=https://onx-gateway.onrender.com` مع
  `EXPECT_COMMIT=425cc05` و`EXPECT_RL_PERSISTENCE=POSTGRES_PERSISTED` →
  **9/9 PASS**.
- **Environment truth scan (post K-36, changed files grep):** لا قراءات env تشغيلية جديدة؛
  ظهور `process.env` في الملفات المتغيرة وثائقي/أمثلة فقط.

**STE-K-38 (مرآة C-41) — حكم مقاس لدلالة `truthHistory.count`:**
- القياس من الكود (لا افتراض): `truthHistory` يمرّر `limit` افتراضياً `20` (`api/onx-router.ts:33-37`)
  إلى `getTruthHistory(limit)`، وهذه الدالة تُقيّد القيمة (`api/lib/truth-ledger.ts:300-301`) ثم تُعيد
  `count: flagged.length` بعد `slice(0, capped)` (`truth-ledger.ts:327-330,334-337`)؛ أي عدّ النافذة
  الظاهرة فقط.
- يوجد سطح مستقل للإجمالي المحفوظ: `getTruthLedgerCount()` ينفّذ `SELECT COUNT(*)` حقيقياً
  (`truth-ledger.ts:241-247`) ويُضخّ في `summarizeTruthLedger().count` (`truth-ledger.ts:270-273,288-291`)
  الذي يُعرض عبر `onx.selfVerify.truthLedgerSummary` (`api/onx-router.ts:19-23`).
- التفسير الصادق لـ`27 → 20`: ليس pruning عند 20 ولا انحرافاً؛ الفرق ناتج عن **دلالة العدّ**
  بين قياس قرأ نافذة أكبر/حجم متاح أكبر وقتها، وقياس K-37 الذي قرأ النافذة الافتراضية (20).
  القياس الحالي يثبت ذلك مباشرة: `truthHistory(limit=20)=20` مقابل `truthHistory(limit=100)=34`
  مع `truthLedgerSummary.count=34`.
- لا فجوة سطح هنا: الإجمالي المحفوظ متاح فعلاً على selfVerify؛ المطلوب تسمية الدلالة بدقة
  (window count مقابل total count) دون اختلاق anomaly.

**بطاقة طزاجة النشر على `/truth` (STE-K-27):** الصفحة العامة تعرض الآن **الإصدار المخدوم + وقت
الإقلاع** مقاسين من سطح `/commit` القائم (`api/boot.ts` — نفس السطح الذي تثبته عقود `health`/`commit`
الحية) عبر نمط `SourceOutcome` القائم: سطح يجيب بلا `commit` → حالة `EMPTY` مسماة (لا بصمة ملفّقة)؛
سطح متعذّر → `FETCH_FAILED` مميز (لا صفر زائف)؛ `bootTime` يمرّ `null`-صادقاً حين يغيب. **عدّ صادق —
تعميق لا إضافة:** `/truth` ممسوحة أصلاً في `no_key_leak` (K-17/K-25) وسطح `/commit` من العقود التسعة،
فالمجموع يبقى 9. حزمة المتصفح تبقى نظيفة (type-only imports، 1950 module بلا زيادة).

**جدول سجل الحقيقة على `/truth` (STE-K-31):** الصفحة العامة تعرض الآن صفوف `truthHistory` البشرية
كما هي من السطح القائم (`onx.truthHistory`): `id` + `capturedAt` + بصمة مختصرة + `drift` +
`predecessorPruned`، مع شارة `GENESIS` عندما `id=1`. صدق الحافة صار مرئياً صفاً-بصف: عند
`predecessorPruned=true` تُعرض شارة كهرمانية «سابقه مُقلَّم» مع تفسير «الانحراف غير قابل للقياس».
وإذا غاب أي حقل يظهر `null`-صادق (`—`) بلا قيم مُختلَقة. **عدّ صادق — تعميق لا إضافة:** هذا ليس
سطحاً جديداً (truthHistory ضمن العقود التسعة أصلاً)، و`/truth` ممسوحة مسبقاً في `no_key_leak`، لذا
المجموع يبقى 9.

**معلم #119 — الرابط الواحد لحقيقة الـAPI (ثلاثي الريبو):** اكتمل الآن عبر الريبوهات الثلاثة.
في هذا المستودع تظل الحقيقة مقاسة عبر أصل البوابة الواحد `…/intelligence` للعقود التسعة دون
تغيير عدّها؛ واجهة تسويق الويب مستثناة بقرار معماري #118 كما هو.

**دلالات راية `drift` للمشغّل** (`truth-ledger.ts:138-146`) — نفس منطق انحراف الكوربوس (و.6):
- `drift: true` يعني بصمة اللقطة اختلفت عن سابقتها المباشرة زمنياً — **تغيّرت الحقيقة المقاسة**.
- **مقصود** (نشر قدرة جديدة رفعت حكماً في OSVA): أساس جديد — سجّله وامضِ.
- **غير مقصود** (لا نشر وتغيّرت البصمة): **تحقيق فوري** — انحدار حقيقة محتمل. ابدأ بـ`onx.selfVerify`
  لمقارنة الأحكام البند-ببند (و.7).

**إظهار الانحراف على السطح الصادق (STE-K-15):**
- `onx.selfVerify` يُرجع الآن حقلاً مقاساً `truthLedgerSummary`
  (`api/onx-router.ts:16-24` → `summarizeTruthLedger`، `truth-ledger.ts`):
  `{state, count, latestFingerprint, capturedAt, claimsMeasured, claimsAsserted, drift}`.
  **مقاس من السجل لا مُدّعى**: `buildSelfVerification` يبقى نقياً (بصمته ثابتة)، والملخص حقل شقيق
  فلا تتلوّث اللقطات المخزّنة. راية `drift` الأخيرة حقيقية (`getTruthHistory(1)` يجلب صفاً إضافياً
  لمقارنة صادقة). سجل فارغ → `state:"EMPTY"` (حالة مسماة صادقة، لا تلفيق تاريخ).
- **تصليب عقد `truth_ledger_read` (سلامة الانحراف عبر الزمن)**: عند `count ≥ 2` يتحقق العقد
  (`smoke-contracts.ts checkTruthLedgerRead`) من: (1) ترتيب newest-first فعلي (`id` تنازلي +
  `createdAt` غير متزايد) — سجل خارج الترتيب = تلفيق؛ (2) **سلامة راية drift**: لكل لقطة لها سابق
  مرئي يجب أن تساوي `drift` نتيجة `fp[i] !== fp[i+1]` — راية تناقض مقارنة البصمة الفعلية = **خرق تلفيق**.
  اللقطة الأقدم المرئية سابقها مُقتطَع (يُجلب `limit+1` ثم يُقتطع) فتُستثنى بصدق من الفحص.

> **English mirror (STE-K-12):** This section is measured, not wished. Live map (و.1):
> service `onx-intelligence-clean.onrender.com`, branch `onxos-ste01-deploy-readiness`,
> `/health` shape at `api/boot.ts:38-47`, tRPC/superjson envelope at `api/boot.ts:57-64`.
> Nine live smoke contracts (و.2) in `api/lib/smoke-contracts.ts` with per-contract
> proof/failure meaning + `EXPECT_COMMIT`/PENDING freshness semantics (`:169-189,:384`).
> Environment truth scan (و.3): every `process.env` read from `api/lib/env.ts:11-22` and
> callers, classified required/optional/default. **`DATABASE_URL` is genuinely used** —
> live `health.ready` returns `Database: HEALTHY` (real `SELECT 1`, `health-router.ts:57-72`).
> Bridge ops (و.4) → section B; live `hasSharedSecret:true`. Rate-limit truth (و.5, STE-K-19):
> MEASURED per window — `POSTGRES_PERSISTED` (bucket state in `onx_rate_limit_buckets` via a
> `SELECT … FOR UPDATE` transaction, survives redeploy) or honest `PER_INSTANCE_UNPERSISTED`
> fallback (memory, resets on boot) when the DB is absent/unreachable — non-fatal, never claimed
> ahead of measurement; 60/60s; `EXPECT_RL_PERSISTENCE` asserts the deployment's backing store.
> Corpus sha256 drift
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
>
> **STE-K-15 (و.8):** Drift on the honest surface. `onx.selfVerify` now returns a MEASURED
> `truthLedgerSummary` (`onx-router.ts:16-24` → `summarizeTruthLedger`): `{state, count,
> latestFingerprint, capturedAt, claimsMeasured, claimsAsserted, drift}`; empty ledger →
> `state:"EMPTY"` (named honest state, no fabricated history). `buildSelfVerification` stays
> pure/fingerprint-stable — the summary is a sibling field, so stored snapshots stay pure. The
> `truth_ledger_read` contract is hardened for drift-over-time: with ≥2 snapshots it verifies
> newest-first order (id + createdAt) and drift-flag INTEGRITY (drift must equal
> `fp[i]!==fp[i+1]`); a flag contradicting the fingerprint comparison is a fabrication breach.

**احتفاظ محدود بإفصاح مقاس (STE-K-22):** السجل يُلتقط ساعياً (و.8) وكان سينمو بلا حدّ في جدول
إنتاجي. الآن يُحتفظ فقط بأحدث **N=168 لقطة** (= 7 أيام × 24 ساعة بالإيقاع الساعي — نافذة أسبوعية
لرصد الانحراف مع إبقاء الجدول محدوداً). التقليم **ذرّي وقت الالتقاط**: في Postgres يجري ضمن نفس
معاملة الإدراج (`truth-ledger.ts:119-153` — `BEGIN`/`INSERT`/`DELETE … OFFSET $1`/`COMMIT` عبر
`p.connect()`؛ `ROLLBACK` عند الخطأ) فلا يرى قارئٌ متزامنٌ تقليماً نصف-مطبَّق؛ في مسار الذاكرة
حلقة `shift()` مقيّدة بـ`LEDGER_RETENTION_KEEP` (`:164-168`). **لا حذف صامت — إفصاح على السطح**:
`onx.truthHistory` و`truthLedgerSummary` يُرجعان `retention:{keep, oldestRetainedId (min id مقاس),
oldestRetainedIsGenesis}` (`truth-ledger.ts:180-196,214-236`). **صدق حافة النافذة (مرآة S-31):** حين
تبلغ الصفحة قاع النافذة والأقدم المرئي `id>1` (سابقه مُقلَّم)، يُوسَم `predecessorPruned:true` بدل
ادّعاء `drift:false` كمقارنة مقاسة — الانحراف غير قابل للقياس بعد تقليم السابق فيُسمّى صراحةً لا
يُلمّح. العقد التاسع `truth_ledger_read` عُمّق (لا عقد جديد — الإجمالي يبقى 9): يقبل الإفصاح
tolerant-when-present، ويرفض `keep` غير الموجب، أو صفحة تتجاوز النافذة، أو `predecessorPruned` على
غير-الأقدم، أو `predecessorPruned` مع `drift=true` (خرق). **الحالة الحية:** النافذة 168 لم تُبلَغ بعد
(السجل ينمو نحوها) — `oldestRetainedIsGenesis` يبقى `true` (البصمة الأصل محفوظة) حتى تتجاوز اللقطات
168 فيبدأ التقليم بصدق مقاس.

> **STE-K-22 (و.8):** Bounded retention with MEASURED disclosure. The hourly ledger would grow
> unbounded; now only the newest **N=168** snapshots are kept (7 days × 24h at the hourly cadence —
> a week-scale drift window, bounded table). Pruning is ATOMIC at capture time: on Postgres inside
> the same insert transaction (`truth-ledger.ts:119-153`, `BEGIN`/`INSERT`/`DELETE … OFFSET $1`/
> `COMMIT` via `p.connect()`, `ROLLBACK` on error) so no concurrent reader sees a half-applied trim;
> in memory a `shift()` loop bounded by `LEDGER_RETENTION_KEEP`. NOT a silent delete — the read
> surface DISCLOSES `retention:{keep, oldestRetainedId (measured min id), oldestRetainedIsGenesis}`
> on `onx.truthHistory` and `truthLedgerSummary`. Edge honesty (mirror S-31): when the page reaches
> the bottom of the window and the oldest visible `id>1` (its predecessor was pruned), it is NAMED
> `predecessorPruned:true` instead of asserting `drift:false` as a measured comparison — drift is
> not measurable once the predecessor is gone, so it is named, not implied. The 9th contract
> `truth_ledger_read` is DEEPENED (not a new contract; total stays 9): tolerant-when-present, it
> rejects a non-positive `keep`, a page exceeding the window, `predecessorPruned` on a non-oldest
> snapshot, or `predecessorPruned` with a fabricated `drift=true`. Live state: the 168 window is not
> yet reached (the ledger is still growing toward it) so `oldestRetainedIsGenesis` stays `true`
> until snapshots exceed 168 and honest measured pruning begins. — قياس الحقيقة عبر أصل البوابة الرسمية (STE-K-20)

**السياق المقاس:** `main` تقاعد كلياً من الخدمة الحية؛ كل الأسطح تُبلغ عبر البوابة الرسمية
`https://onx-gateway.onrender.com`. البوابة تركّب خدمة الذكاء بمسارين مختلفين في إعادة الكتابة —
والحقيقة **مقاسة لا مفترضة**:

| المسار عبر البوابة | القياس الحي | إعادة الكتابة للـupstream |
|---|---|---|
| `/api/intelligence/v1/health` | **404** | المسار المفترض خاطئ |
| `/api/intelligence/health` | 404 | مُركّب `/api/*` → upstream `/api/health` (غير موجود) |
| `/api/intelligence/trpc/<proc>` | 200 | مُركّب `/api/*` → upstream `/api/trpc/<proc>` ✓ |
| `/intelligence/health` | **200** | full-app بلا إعادة كتابة → upstream `/health` ✓ |
| `/intelligence/commit` | **200** | full-app → `/commit` ✓ |
| `/intelligence/truth` | **200** | full-app → `/truth` ✓ |
| `/intelligence/api/trpc/<proc>` | **200** | full-app → `/api/trpc/<proc>` ✓ |

**الأصل الواحد الذي يخدم كل الأسطح التسعة** هو التركيب full-app `…/intelligence` — يحفظ مسارات
الـupstream حرفياً، فـ`{base}/health` و`{base}/commit` و`{base}/api/trpc/<proc>` و`{base}/truth` كلها
تُحلّ. لذلك **العقود التسعة نفسها تعمل بلا تغيير** عبر هذا الأصل — **تعميق لا إضافة** (نفس العقيدة،
أصل ثانٍ رسمي مبرهَن الوصول).

**التشغيل:** عيّن `GATEWAY_ORIGIN` فيُشتقّ الأساس تلقائياً من التركيب المقاس (`gatewayBaseUrl` في
`api/lib/smoke-contracts.ts` → `DEFAULT_GATEWAY_ORIGIN` + `GATEWAY_APP_MOUNT="/intelligence"`).
`BASE_URL` الصريح يتقدّم دائماً إن وُجد.

```bash
GATEWAY_ORIGIN=https://onx-gateway.onrender.com EXPECT_COMMIT=<sha> \
  EXPECT_RL_PERSISTENCE=POSTGRES_PERSISTED npm run smoke:live
# → 9/9، baseUrl=https://onx-gateway.onrender.com/intelligence (gateway origin)
```

**البرهان الحي (commit `82d713f`):** 9/9 عبر الأصل الواحد، exit 0 — health ALIVE،
selfVerify 19/0، rate-limit `POSTGRES_PERSISTED` مقاس، ask رفض+استشهاد، الجسر 401 fail-closed،
corpus sha `6fc2bed8` مطابق (DEMO)، truth-ledger 12 لقطة، صفر تسريب مفاتيح.

> **English mirror (STE-K-20 — و.9):** `main` has retired from live service; every surface is
> reached through the official gateway `https://onx-gateway.onrender.com`. MEASURED, not assumed:
> the sibling `/api/intelligence/*` mount rewrites to upstream `/api/*` (serves tRPC at
> `/api/intelligence/trpc/<proc>` but NOT `/health` or `/commit`, which live at the app root),
> while the full-app mount `/intelligence/*` preserves upstream paths exactly and is therefore the
> ONE base serving all nine doctrine surfaces. Set `GATEWAY_ORIGIN` and `smoke:live` derives the
> base via `gatewayBaseUrl()` (`smoke-contracts.ts`). This is a DEEPENING (same 9 contracts, second
> official origin), not new contracts. Live proof @`82d713f`: 9/9 through
> `…/intelligence`, exit 0, `persistence=POSTGRES_PERSISTED`, 12 ledger snapshots, zero key leak.

### و.10) رقيب الحقيقة الحية المجدول (STE-K-29) — قياس دوري بين الموجات

**الملف:** `.github/workflows/live-truth.yml`

**متى يعمل؟**
- **على الفرع المحكوم (غير default): خامل بالكامل**.
- قيد GitHub Actions المقاس: `workflow_dispatch` و`schedule` كلاهما default-branch-only لملف
  workflow؛ لذلك وجود `live-truth.yml` على فرع STE وحده لا ينتج تشغيلات فعلية.
- على default branch يعمل وفق الضبط (`cron: 17 */6 * * *`) + تشغيل يدوي.

**ماذا يقيس؟**
- نفس `npm run smoke:live` بعقوده التسعة القائمة، عبر أصل البوابة الرسمي
  `GATEWAY_ORIGIN=https://onx-gateway.onrender.com`.
- لا عقد جديد: **تعميق تشغيل** للعقود القائمة (المجموع يبقى 9).

**دلالات الصدق (مقصودة):**
- لا نضبط `EXPECT_COMMIT` في الرقيب المجدول؛ الهدف قياس ما يخدمه الإنتاج فعلياً الآن، لا ربط
  الرن بـSHA متوقَّع قد يصبح قديماً بعد نشر طبيعي.
- أي خرق عقد → فشل الرن (إشارة حمراء مرئية) بصدق.

**الأسرار:**
- لا أسرار جديدة. هذا الرقيب يستدعي أسطح قراءة عامة فقط؛ `smoke:live` يعمل بلا مفاتيح مزوّد/جسر.
- متغير `GATEWAY_ORIGIN` في workflow متغير تشغيل CI فقط، وليس قراءة جديدة في كود السيرفر.

**REC-07 (تصحيح صادق):**
- القيد لا يخص `workflow_dispatch` فقط؛ يشمل `schedule` أيضاً ما دام الملف خارج default branch.
- الخيارات التشغيلية الصادقة:
  1) استثناء ضيّق معتمد من المؤسس لملف workflow واحد إلى `main` (#117).
  2) قبول الخمول حتى الدمج النهائي إلى default branch.
  3) تشغيل مجدول خارجي مستقل (scheduler خارج GitHub Actions).
