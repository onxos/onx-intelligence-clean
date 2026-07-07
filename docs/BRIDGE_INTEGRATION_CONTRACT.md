# ONX Bridge Integration Contract — v1.0

**عقد تكامل الجسر بين ONX Platform و ONX Intelligence**

> **Status:** ACTIVE (bridge code merged, disabled by default)
> **Scope:** كيف يستهلك مستودع **ONX Platform** (الجسد) خدمات **ONX Intelligence** (العقل) عبر طبقة جسر آمنة، دون دمج المستودعات.
> **Authority:** يخضع هذا العقد للقفل الدستوري V6 — لا يُفتح مرور الجسر إلى الإنتاج إلا بموافقة المؤسس بعد اجتياز بوابة التكامل.

---

## 1. الفلسفة (Why a contract, not a merge)

مشروع ONX مسار واحد بقسمين:

- **ONX Platform** — النظام التشغيلي (ERP، BPM، الهوية، الأتمتة). *الجسد.*
- **ONX Intelligence** (هذا المستودع) — العقل الدستوري (Titans، Knowledge Corpus، Intent/Intelligence Engine، Guardian). *العقل.*

الدمج **تشغيلي وليس Git-merge**: يبقى كل مستودع مستقلاً، ويتواصلان عبر **عقد ثابت + طبقة جسر مؤمّنة + إطلاق تدريجي بأعلام ميزات**. هذا يحافظ على:

1. **العزل الدستوري** — لا يستطيع الجسد الوصول إلى العقل قبل موافقة صريحة (قفل V6).
2. **أقل سطح هجوم** — نكشف دوالّ محدّدة آمنة فقط، لا مستودعات كاملة.
3. **قابلية التراجع** — إطفاء الجسر بعلَم واحد دون إعادة نشر.

---

## 2. البوابة الدستورية (Default-disabled)

الجسر **معطّل افتراضياً**. كل نقاط المرور محميّة بـ `assertBridgeAccess()` التي تفرض ثلاث طبقات:

| الطبقة | الشرط | الخطأ عند الفشل |
|--------|-------|------------------|
| 1. علَم التفعيل | `BRIDGE_ENABLED=true` | `BRIDGE_DISABLED` |
| 2. وجود السر | `BRIDGE_SHARED_SECRET` مضبوط | `BRIDGE_SECRET_NOT_CONFIGURED` |
| 3. المصادقة | ترويسة `x-onx-bridge-key` تطابق السر | `BRIDGE_UNAUTHORIZED` |

نقاط `*.status` و `health.bridge` **لا** تتطلب مصادقة — للمراقبة فقط (تكشف حالة البوابة، لا بيانات).

---

## 3. التهيئة (Configuration)

متغيّرات البيئة في مستودع Intelligence:

```bash
# تفعيل الجسر — يبقى false حتى موافقة بوابة V6
BRIDGE_ENABLED=false
# سرّ مشترك قوي (≥ 32 بايت عشوائي)؛ يُضبط في لوحة الأسرار لا في الكود
BRIDGE_SHARED_SECRET=<random-secret>
```

على مستودع Platform: احفظ نفس `BRIDGE_SHARED_SECRET` كسرّ، وأرسله في كل طلب جسر عبر ترويسة `x-onx-bridge-key`.

---

## 4. النقل (Transport — tRPC over HTTP)

جميع النقاط tRPC v11 مع محوّل `superjson`. المسار الأساسي:

```
BASE = https://<intelligence-host>/api/trpc
```

- **Query** (قراءة): `GET {BASE}/{router}.{procedure}?input=<urlencoded>` حيث `<urlencoded>` هو ترميز URL لـ `{"json": <input>}`.
- **Mutation** (كتابة/تنفيذ): `POST {BASE}/{router}.{procedure}` بجسم `{"json": <input>}` وترويسة `Content-Type: application/json`.

كل طلبات الجسر المحميّة تتطلب الترويسة:

```
x-onx-bridge-key: <BRIDGE_SHARED_SECRET>
```

---

## 5. مرجع النقاط (Endpoint Reference)

### 5.1 `health.bridge` — حالة البوابة (بدون مصادقة)

```
GET {BASE}/health.bridge
```

```jsonc
// response.result.data.json
{
  "enabled": false,
  "hasSharedSecret": false,
  "mode": "SAFE_DISABLED",        // أو "ACTIVE"
  "ready": true,
  "message": "Bridge disabled by default. Set BRIDGE_ENABLED=true after V6 gate approval.",
  "timestamp": "2026-07-07T16:00:00.000Z"
}
```

### 5.2 `titan.bridgeStatus` — حالة جسر Titan (بدون مصادقة)

```
GET {BASE}/titan.bridgeStatus
```

```jsonc
{ "enabled": false, "hasSharedSecret": false, "bridge": "titanBridge",
  "mode": "SAFE_DISABLED", "message": "..." }
```

### 5.3 `titan.consult` — استشارة أحد الـ Titans الخمسة (محميّ · Mutation)

```
POST {BASE}/titan.consult
x-onx-bridge-key: <secret>
```

```jsonc
// body.json
{
  "titanId": "apollo",              // prometheus | athena | zeus | hermes | apollo
  "message": "هل يمتثل هذا القرار للمبادئ السبعة؟",
  "sessionId": "optional-session",  // اختياري — لاستمرارية المحادثة
  "workspaceId": "platform-tenant-1",
  "source": "platform",             // معرّف النظام المستدعي
  "correlationId": "req-uuid"       // اختياري — لتتبّع الطلب عبر النظامين
}
```

```jsonc
// response.result.data.json
{
  "bridge": "titanBridge",
  "source": "platform",
  "correlationId": "req-uuid",
  "titan": { "id": "apollo", "name": "Apollo", "nameAr": "أبولو", "domain": "governance" },
  "response": "...",
  "sessionId": "...",
  "tokensUsed": 512,
  "latencyMs": 840,
  "cost": 0.00256,
  "rateLimit": { "remaining": 99, "resetAt": "..." },
  "budget": { "remaining": 9.97 },
  "constitutionalStatus": "COMPLIANT"
}
```

**الـ Titans الخمسة:** `prometheus` (الاستراتيجية) · `athena` (المعرفة) · `zeus` (المعمارية) · `hermes` (العمليات) · `apollo` (الحوكمة/الامتثال — يملك حق النقض VETO).

### 5.4 `corpusQuery.*` — استعلام مكتبة المعرفة

| Proc | نوع | مصادقة | الوصف |
|------|-----|--------|-------|
| `corpusQuery.status` | Query | لا | حالة البوابة |
| `corpusQuery.domains` | Query | نعم | قائمة مجالات المعرفة + الأعداد |
| `corpusQuery.search` | Query | نعم | بحث دلالي في المكتبة |

```jsonc
// corpusQuery.search — input.json
{ "query": "amanah governance", "domain": "STRATEGY", "tier": "L1",
  "limit": 10, "useVector": true }
```

### 5.5 `intentEngine.*` — محرّك النيّة والتوجيه

| Proc | نوع | مصادقة | الوصف |
|------|-----|--------|-------|
| `intentEngine.status` | Query | لا | حالة البوابة |
| `intentEngine.governance` | Query | نعم | حالة الحوكمة الدستورية |
| `intentEngine.analyze` | Mutation | نعم | ابتلاع نيّة من المنصة → توجيه دستوري |

```jsonc
// intentEngine.analyze — input.json
{
  "content": "طلب موافقة على صرف ميزانية Q3",
  "source": "platform",
  "targetContext": "INSTITUTIONAL",   // PERSONAL | INSTITUTIONAL | STRATEGIC | OPERATIONAL
  "priority": "HIGH",                  // LOW | NORMAL | HIGH | CRITICAL
  "amanahScore": 0.85                  // 0..1 — أقل من 0.5 يُرفَض دستورياً
}
```

```jsonc
// response.result.data.json
{
  "bridge": "intentEngine",
  "objectId": "uuid",
  "routing": { "allowed": true, "targetContext": "INSTITUTIONAL", "privacyFilter": "INSTITUTIONAL", ... },
  "governance": { "amanah": "PASSED", "fic": "PASSED" },
  "continuity": { "logged": true },
  "metrics": { "OQI": 0.73 }
}
```

> يمرّ كل استدعاء `analyze` عبر بوابة **Amanah Floor 0.5**: أي `amanahScore < 0.5` يُرفَض بخطأ `AMANAH_FLOOR_VIOLATION` (فرض دستوري غير قابل للتجاوز إلا لنيّة المؤسس L1).

---

## 6. رموز الأخطاء (Error Codes)

| الرمز | المعنى | إجراء المنصة |
|-------|--------|---------------|
| `BRIDGE_DISABLED` | الجسر معطّل | انتظر موافقة بوابة V6؛ لا تُعِد المحاولة |
| `BRIDGE_SECRET_NOT_CONFIGURED` | لا سرّ مضبوط على Intelligence | خطأ تهيئة — بلّغ العمليات |
| `BRIDGE_UNAUTHORIZED` | ترويسة مفقودة/خاطئة | تحقّق من `x-onx-bridge-key` |
| `RATE_LIMIT_EXCEEDED` | تجاوز 100 طلب/دقيقة | تراجع أُسّي حتى `resetAt` |
| `BUDGET_EXHAUSTED` | نفاد ميزانية اليوم | أوقف الاستدعاءات المكلفة |
| `AMANAH_FLOOR_VIOLATION` | درجة الأمانة < 0.5 | ارفع الجودة/المصدر وأعد الإرسال |
| `OBJECT_NOT_FOUND` | كائن غير موجود | تحقّق من `objectId` |

---

## 7. التتبّع والمراقبة (Observability)

- مرّر `correlationId` فريداً لكل طلب جسر؛ يُعاد في الاستجابة ويُسجَّل في سجل الاستمرارية (Continuity Log).
- راقب `health.bridge` و `titan.bridgeStatus` من نظام مراقبة المنصة (لا تحتاج مصادقة).
- كل استدعاء محميّ يمرّ بـ Guardian + USFIPv2 (تدقيق دستوري) ويُسجَّل في `governanceDecisions`.

---

## 8. الإصدار وإدارة التغيير (Versioning)

- هذا العقد **v1.0**. أي تغيير كاسر (حذف نقطة، تغيير مخطط إدخال) يرفع النسخة الكبرى ويتطلب إشعار فريق المنصة.
- الإضافات المتوافقة رجعياً (نقاط/حقول اختيارية جديدة) ترفع النسخة الصغرى.
- المصدر الأوثق للمخططات: `api/bridge-guard.ts`, `api/titan-bridge-router.ts`, `api/corpus-query-router.ts`, `api/intent-engine-router.ts`.

---

## 9. قائمة تحقّق تفعيل الإنتاج (V6 Gate Checklist)

- [ ] موافقة المؤسس على فتح الجسر (رفع القفل V6).
- [ ] ضبط `BRIDGE_SHARED_SECRET` كسرّ قوي على Intelligence + Platform.
- [ ] ضبط `BRIDGE_ENABLED=true` على بيئة Intelligence.
- [ ] تأكيد `health.bridge` يعيد `mode: ACTIVE, ready: true`.
- [ ] اختبار دخان: `titan.consult` + `corpusQuery.search` + `intentEngine.analyze` بترويسة صحيحة → 200.
- [ ] اختبار سلبي: نفس النقاط بدون ترويسة → `BRIDGE_UNAUTHORIZED`.
- [ ] تفعيل لوحة مراقبة معدّل الأخطاء + الميزانية + زمن الاستجابة.
