import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { trpc } from "../lib/trpc";

export function Home() {
  const health = trpc.health.ping.useQuery();
  const principles = trpc.constitution.principles.useQuery();
  const titans = trpc.titan.listTitans.useQuery();
  const skills = trpc.skills.list.useQuery();
  const knowledge = trpc.knowledge.stats.useQuery();
  const scheduler = trpc.scheduler.status.useQuery();

  return (
    <div className="shell space-y-6" dir="rtl">
      <section className="rounded-3xl bg-gradient-to-l from-amber-100 via-orange-50 to-emerald-50 p-8 shadow-sm text-center">
        <h1 className="text-4xl font-extrabold text-amber-900">ONX Intelligence v2.0</h1>
        <p className="mt-3 text-lg text-gray-700">نظام تشغيل ذكاء بحجم حضارة — أول نظام ذكاء اصطناعي يُبنى على مبادئ دستورية إسلامية</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/ask" className="rounded-xl bg-amber-700 px-6 py-3 text-white font-semibold hover:bg-amber-800 transition">تحدث مع Titans</Link>
          <Link to="/dashboard" className="rounded-xl border-2 border-amber-700 px-6 py-3 text-amber-900 font-semibold hover:bg-amber-100 transition">مركز القيادة</Link>
          <Link to="/login" className="rounded-xl border border-amber-300 px-6 py-3 text-amber-800 hover:bg-amber-50 transition">تسجيل الدخول</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-amber-800">{titans.data?.length ?? 0}</div><div className="text-sm text-gray-600">AI Titans</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-emerald-700">{principles.data?.length ?? 0}</div><div className="text-sm text-gray-600">مبادئ دستورية</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-700">{skills.data?.length ?? 0}</div><div className="text-sm text-gray-600">مهارة متخصصة</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-purple-700">{knowledge.data?.totalRecords?.toLocaleString() ?? 0}</div><div className="text-sm text-gray-600">سجل معرفي</div></CardContent></Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><h3 className="font-bold text-amber-900">Titan Bridge</h3></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">5 شخصيات AI متخصصة: Prometheus, Athena, Zeus, Hermes, Apollo</p>
            <Link to="/ask" className="mt-2 inline-block text-sm text-amber-700 hover:underline">جرب الآن →</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-amber-900">الإطار الدستوري</h3></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">7 مبادئ: الأمانة، الإحسان، العدل، الرحمة، الحكمة، الإتقان، والتوكل</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(principles.data ?? []).map((p: any) => <Badge key={p.key}>{p.ar}</Badge>)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-amber-900">مُجدول الوعي</h3></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">5 إيقاعات: Fajr, Dhuhr, Asr, Maghrib, Isha — تشغيل ذاتي مستمر</p>
            <Badge>{scheduler.data?.active ? "نشط" : "غير نشط"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-amber-900">36 Router + 230+ Endpoint</h3></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">بنية tRPC كاملة — كل endpoint مُكتب بـ TypeScript</p>
            <Badge className="mt-1">{health.data?.pong ? "Online" : "Checking"}</Badge>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
