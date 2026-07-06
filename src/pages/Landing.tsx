import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { trpc } from "../lib/trpc";

export function Landing() {
  const health = trpc.health.ping.useQuery();
  const principles = trpc.constitution.principles.useQuery();

  return (
    <div className="shell space-y-5" dir="rtl">
      <section className="rounded-3xl bg-gradient-to-l from-amber-100 via-orange-50 to-emerald-50 p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-amber-900">ONX Intelligence v2.0</h1>
        <p className="mt-2 text-gray-700">منصة ذكاء مدني دستورية مع واجهة عربية واتصال tRPC مباشر.</p>
        <div className="mt-4 flex gap-3">
          <Link to="/ask" className="rounded-xl bg-amber-700 px-4 py-2 text-white">صفحة السؤال</Link>
          <Link to="/dashboard" className="rounded-xl border border-amber-300 px-4 py-2 text-amber-900">مركز القيادة</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>الحالة</CardHeader>
          <CardContent>
            <Badge>{health.data?.pong ? "الخدمة تعمل" : "جاري الفحص"}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>المبادئ الدستورية</CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">العدد الحالي: {principles.data?.length ?? 0}</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
