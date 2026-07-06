import { useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { trpc } from "../lib/trpc";

export function Ask() {
  const [prompt, setPrompt] = useState("");
  const mutation = trpc["ai-brain"].think.useMutation();
  const titans = trpc["titan-bridge"].listTitans.useQuery();

  return (
    <div className="shell space-y-5" dir="rtl">
      <h2 className="text-2xl font-bold text-amber-900">Titan Bridge / جسر العمالقة</h2>
      <Card>
        <CardHeader>اسأل النظام</CardHeader>
        <CardContent className="space-y-3">
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="اكتب سؤالك الاستراتيجي..." />
          <Button onClick={() => mutation.mutate({ prompt })} disabled={!prompt.trim() || mutation.isPending}>
            {mutation.isPending ? "جاري التحليل..." : "إرسال"}
          </Button>
          {mutation.data && <p className="text-sm text-gray-700">{mutation.data.insight}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>العمالقة الخمسة</CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-700">
            {(titans.data ?? []).map((t) => (
              <li key={t.id}>{t.name} - {t.role}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
