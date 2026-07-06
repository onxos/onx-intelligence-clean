import { useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { trpc } from "../lib/trpc";

const TITAN_PERSONAS = [
  { id: "prometheus", name: "Prometheus", nameAr: "بروميثيوس", role: "Strategic Foresight", color: "bg-amber-600", icon: "🔥" },
  { id: "athena", name: "Athena", nameAr: "أثينا", role: "Policy Intelligence", color: "bg-blue-600", icon: "🦉" },
  { id: "zeus", name: "Zeus", nameAr: "زيوس", role: "Executive Coordination", color: "bg-purple-600", icon: "⚡" },
  { id: "hermes", name: "Hermes", nameAr: "هيرميس", role: "Communication Network", color: "bg-emerald-600", icon: "📡" },
  { id: "apollo", name: "Apollo", nameAr: "أبولو", role: "Insight and Analytics", color: "bg-orange-600", icon: "☀️" },
];

const QUICK_PROMPTS = [
  "ما هي رؤية ONX Intelligence؟",
  "كيف أبني نظام ذكاء اصطناعي موثوق؟",
  "ما هي البنية التحتية المثلى؟",
  "كيف أحسن عمليات التنفيذ؟",
];

export function Ask() {
  const [prompt, setPrompt] = useState("");
  const [selectedTitan, setSelectedTitan] = useState("prometheus");
  const [councilMode, setCouncilMode] = useState(false);
  const [messages, setMessages] = useState<Array<{role: string; content: string; titan?: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const mutation = trpc["ai-brain"].think.useMutation();

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: "user", content: prompt }]);
    try {
      const result = await mutation.mutateAsync({ prompt });
      const titanName = councilMode ? "Council" : TITAN_PERSONAS.find(t => t.id === selectedTitan)?.nameAr || selectedTitan;
      setMessages(prev => [...prev, { role: "assistant", content: result.insight, titan: titanName }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "عذراً، حدث خطأ في معالجة طلبك. حاول مرة أخرى.", titan: "System" }]);
    }
    setIsLoading(false);
    setPrompt("");
  };

  return (
    <div className="shell space-y-4" dir="rtl">
      <h2 className="text-2xl font-bold text-amber-900">Titan Bridge / جسر العمالقة</h2>

      <div className="flex flex-wrap gap-2">
        {TITAN_PERSONAS.map(titan => (
          <button
            key={titan.id}
            onClick={() => { setSelectedTitan(titan.id); setCouncilMode(false); }}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              selectedTitan === titan.id && !councilMode
                ? `${titan.color} text-white`
                : "bg-white/70 text-gray-700 hover:bg-white border border-amber-200"
            }`}
          >
            {titan.icon} {titan.nameAr}
          </button>
        ))}
        <button
          onClick={() => setCouncilMode(true)}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            councilMode ? "bg-gray-800 text-white" : "bg-white/70 text-gray-700 hover:bg-white border border-amber-200"
          }`}
        >
          🏛️ وضع المجلس (5 Titans)
        </button>
      </div>

      <Card className="min-h-[400px]">
        <CardContent className="p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">{councilMode ? "🏛️" : TITAN_PERSONAS.find(t => t.id === selectedTitan)?.icon}</div>
              <p>اطرح سؤالك على {councilMode ? "المجلس" : TITAN_PERSONAS.find(t => t.id === selectedTitan)?.nameAr}</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {QUICK_PROMPTS.map((q, i) => (
                  <button key={i} onClick={() => setPrompt(q)} className="rounded-lg bg-amber-50 px-3 py-1 text-sm text-amber-800 hover:bg-amber-100 transition">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                msg.role === "user" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-gray-800"
              }`}>
                {msg.titan && <div className="text-xs font-bold text-amber-700 mb-1">{msg.titan}</div>}
                <div className="text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-end">
              <div className="rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500 animate-pulse">جاري التفكير...</div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={`تحدث مع ${councilMode ? "المجلس" : TITAN_PERSONAS.find(t => t.id === selectedTitan)?.nameAr}...`}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!prompt.trim() || isLoading}>
          {isLoading ? "..." : "إرسال"}
        </Button>
      </div>
      <p className="text-xs text-center text-gray-500">جميع الردود تخضع لمراجعة Apollo الدستورية</p>
    </div>
  );
}
