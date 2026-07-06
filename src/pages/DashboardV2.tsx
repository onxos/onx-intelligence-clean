import { Card, CardContent, CardHeader } from "../components/ui/card";
import { trpc } from "../lib/trpc";

export function DashboardV2() {
  const stats = trpc.knowledge.stats.useQuery();
  const skills = trpc.skills.list.useQuery();
  const programs = ["cep", "ocpp", "cevp", "ccop", "cos", "ucr"] as const;

  return (
    <div className="shell space-y-5" dir="rtl">
      <h2 className="text-2xl font-bold text-amber-900">Command Center / مركز القيادة</h2>

      <section className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader>السجلات المعرفية</CardHeader><CardContent>{stats.data?.totalRecords ?? 0}</CardContent></Card>
        <Card><CardHeader>المجالات</CardHeader><CardContent>{stats.data?.domains ?? 0}</CardContent></Card>
        <Card><CardHeader>المهارات</CardHeader><CardContent>{skills.data?.length ?? 0}</CardContent></Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {programs.map((name) => (
          <Card key={name}>
            <CardHeader>{name.toUpperCase()}</CardHeader>
            <CardContent className="text-sm text-gray-700">برنامج مدني فعال ضمن ONX Intelligence v2.0</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
