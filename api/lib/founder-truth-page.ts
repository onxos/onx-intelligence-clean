// ============================================================
// FOUNDER TRUTH PAGE — Phase 4
// Self-contained Arabic RTL HTML. Fetches the live aggregate from
// runtime.founderTruth.summary and auto-refreshes. No build step,
// no login wall — the founder opens /truth and sees everything.
// ============================================================
export function founderTruthPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ONX — صفحة حقيقة المؤسس</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; background: #0b0f14; color: #e6edf3; padding: 24px; max-width: 980px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #8b98a5; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
  .card { background: #12181f; border: 1px solid #22303c; border-radius: 12px; padding: 16px; }
  .card h2 { font-size: 15px; margin-bottom: 12px; color: #9ec5fe; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; border-bottom: 1px dashed #1c2833; }
  .row:last-child { border-bottom: none; }
  .ok { color: #3fb950; font-weight: 700; }
  .bad { color: #f85149; font-weight: 700; }
  .num { font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; background: #1a2430; border-radius: 999px; padding: 3px 10px; font-size: 12px; margin: 2px; }
  #ts { color: #8b98a5; font-size: 12px; margin-top: 16px; text-align: center; }
  .big { font-size: 26px; font-weight: 800; color: #f0c674; }
</style>
</head>
<body>
<h1>🧠 صفحة حقيقة المؤسس — ONX</h1>
<div class="sub">تتحدث تلقائيًا كل 30 ثانية · كل رقم هنا مقاس من النظام الحي، لا ادعاء</div>
<div class="grid" id="app">جارِ التحميل…</div>
<div id="ts"></div>
<script>
const TRPC = "/api/trpc/runtime.founderTruth.summary?batch=1&input=" + encodeURIComponent("{}");
function pill(ok, yes, no) { return '<span class="' + (ok ? "ok" : "bad") + '">' + (ok ? yes : no) + "</span>"; }
function row(k, v) { return '<div class="row"><span>' + k + '</span><span class="num">' + v + "</span></div>"; }
async function load() {
  try {
    const res = await fetch(TRPC);
    const json = await res.json();
    const d = json[0].result.data.json;
    const m = d.mind, L = d.learning, b = d.body;
    const patterns = L.patterns.length
      ? L.patterns.map(p => '<span class="pill">' + p.eventType + " ×" + p.occurrences + "</span>").join("")
      : '<span class="sub">لا أنماط مكتشفة بعد — تحتاج 3 تكرارات لكل حدث</span>';
    document.getElementById("app").innerHTML =
      '<div class="card"><h2>العقل — الحالة</h2>' +
      row("الذاكرة الدائمة", pill(m.persistenceConfigured && m.hydrated, "تعمل", "متوقفة")) +
      row("سجل الاستمرارية", m.continuity.totalRecords + (m.continuity.integrity ? " ✅ سلسلة سليمة" : " ❌")) +
      row("العقد السببية", m.graph.nodes + " / حواف " + m.graph.edges) +
      row("تنبيهات الحارس", m.guardian.alerts) +
      row("إدخالات التدقيق", m.auditor) +
      row("الأحداث المُعالجة", m.ingestion.processed + " من " + m.ingestion.sources + " مصادر") +
      "</div>" +
      '<div class="card"><h2>التعلم — D12</h2>' +
      row("سلّم الفهم", "الدرجة " + L.ladderRung + " — " + L.ladderName) +
      row("رصيد IUC", '<span class="big">' + L.iucTotal + "</span>") +
      '<div style="margin-top:10px">' + patterns + "</div>" +
      "</div>" +
      '<div class="card"><h2>الجسد — الماركتينج</h2>' +
      row("الوصول", pill(b.marketing.reachable, "متصل", "غير متصل")) +
      (b.marketing.database ? row("قاعدة البيانات", pill(b.marketing.database === "up", "تعمل", "متوقفة")) : "") +
      "</div>" +
      '<div class="card"><h2>الدستور — USFIPv2</h2>' +
      row("نشط", pill(m.usfipv2.active, "نعم", "لا")) +
      row("الدستور", m.usfipv2.constitution) +
      row("أرضية الأمانة", m.usfipv2.amanahFloor) +
      "</div>";
    document.getElementById("ts").textContent = "آخر قياس: " + new Date(d.timestamp).toLocaleString("ar-SA");
  } catch (e) {
    document.getElementById("app").innerHTML = '<div class="card bad">تعذر جلب الحقيقة: ' + e.message + "</div>";
  }
}
load();
setInterval(load, 30000);
</script>
</body>
</html>`;
}
