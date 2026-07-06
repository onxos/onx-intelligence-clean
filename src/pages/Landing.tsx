// ============================================================
// LANDING PAGE — Day 13: ONX Intelligence Introduction
// First impression for new visitors
// ============================================================
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles, Brain, Shield, Zap, Globe, Users,
  ChevronLeft, Server, BookOpen, Clock, Lock,
  TrendingUp, Layers, Cpu, GitBranch, Activity,
} from "lucide-react";

const FEATURES = [
  { icon: <Brain className="w-6 h-6" />, title: "5 AI Titans", titleAr: "5 أقمار", desc: "Prometheus, Athena, Zeus, Hermes, Apollo — each a specialist in strategy, knowledge, architecture, operations, and governance" },
  { icon: <Shield className="w-6 h-6" />, title: "7 Constitutional Principles", titleAr: "7 مبادئ دستورية", desc: "Amanah, Ihsan, Adl, Rahmah, Hikmah, Itqan, Tawakkul — enforced on every decision" },
  { icon: <Zap className="w-6 h-6" />, title: "18 Intelligence Engines", titleAr: "18 محرك ذكاء", desc: "From CausalGraph to ContinuityEngine, a complete runtime for civilizational-scale AI" },
  { icon: <BookOpen className="w-6 h-6" />, title: "25,000 Knowledge Records", titleAr: "25 ألف سجل", desc: "Across 19 domains from Strategy to Defense, with vector semantic search" },
  { icon: <Layers className="w-6 h-6" />, title: "50 Specialized Skills", titleAr: "50 مهارة", desc: "Marketing, Content, Intelligence, Cloud, and Personal development capabilities" },
  { icon: <Users className="w-6 h-6" />, title: "6 Civilizational Programs", titleAr: "6 برامج حضارية", desc: "CEP, OCPP, CEVP, CCOP, COS, UCR — covering economics, prosperity, evolution, continuity, OS, and constitutional runtime" },
  { icon: <Clock className="w-6 h-6" />, title: "5 Consciousness Rhythms", titleAr: "5 إيقاعات", desc: "Pulse (60s), Breath (5m), Digest (15m), Dream (1h), Renew (24h) — autonomous execution" },
  { icon: <Globe className="w-6 h-6" />, title: "5 AI Providers", titleAr: "5 مزودي AI", desc: "GPT-4o, Claude, Qwen, GLM-5, Gemini with intelligent fallback chains" },
];

const STATS = [
  { icon: <Server className="w-5 h-5" />, value: "30", label: "tRPC Routers" },
  { icon: <Zap className="w-5 h-5" />, value: "230+", label: "API Endpoints" },
  { icon: <Cpu className="w-5 h-5" />, value: "18", label: "Intelligence Engines" },
  { icon: <Activity className="w-5 h-5" />, value: "100%", label: "Build Passing" },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white" dir="rtl">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-sm mb-8 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>ONX Intelligence v1.0 — Civilization-Scale AI Operating System</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            نظام تشغيل ذكاء
            <br />
            <span className="text-amber-400">بحجم حضارة</span>
          </h1>

          <p className="text-xl text-indigo-200 max-w-2xl mx-auto mb-10 leading-relaxed">
            أول نظام ذكاء اصطناعي يُبنى على مبادئ دستورية إسلامية — مع 5 شخصيات AI، 
            18 محرك ذكاء، و50 مهارة متخصصة
          </p>

          <div className="flex gap-4 justify-center">
            <Button
              size="lg"
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-8"
              onClick={() => navigate("/v2")}
            >
              ابدأ الآن
              <ChevronLeft className="w-5 h-5 mr-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 px-8"
              onClick={() => navigate("/ask")}
            >
              تحدث مع Titans
              <Brain className="w-5 h-5 mr-2" />
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 max-w-2xl mx-auto">
            {STATS.map((s, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <div className="flex justify-center mb-2 text-amber-400">{s.icon}</div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-indigo-300">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">القدرات الأساسية</h2>
          <p className="text-gray-500">نظام متكامل للذكاء الاصطناعي على المستوى الحضاري</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <Card key={i} className="border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all group">
              <CardContent className="p-5">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-1">{f.titleAr}</h3>
                <p className="text-xs text-gray-500 mb-2">{f.title}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">الهيكل الطبقي</h2>
          <div className="space-y-3">
            {[
              { layer: "L5", name: "Pilot + Launch", color: "bg-emerald-600", desc: "Deployment, certification, monitoring" },
              { layer: "L4", name: "Autonomy", color: "bg-blue-600", desc: "Consciousness Scheduler, 6 Civilizational Programs" },
              { layer: "L3", name: "Domain Skills", color: "bg-purple-600", desc: "19 Domains, 50 Skills, Veterinary Intelligence" },
              { layer: "L2", name: "Knowledge + Intelligence", color: "bg-indigo-600", desc: "25K records, 5 Titan KBs, vector search" },
              { layer: "L1", name: "Foundation Skills", color: "bg-amber-600", desc: "Constitution, Auth, AI Brain, Titan Bridge" },
              { layer: "L0", name: "Civilization Substrate", color: "bg-rose-600", desc: "18 Engines, USFIPv2, Guardian, Continuity" },
            ].map((l, i) => (
              <div key={i} className={`${l.color} text-white rounded-lg p-4 flex items-center gap-4`}>
                <span className="text-2xl font-bold opacity-50">{l.layer}</span>
                <div className="text-right flex-1">
                  <p className="font-bold">{l.name}</p>
                  <p className="text-sm opacity-80">{l.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 text-center">
        <div className="max-w-xl mx-auto px-6">
          <Lock className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-3">مبني على أسس أخلاقية</h2>
          <p className="text-gray-600 mb-6">
            كل قرار في ONX يمر بفحص دستوري ضد 7 مبادئ: الأمانة، الإحسان، العدل، 
            الرحمة، الحكمة، الاتقان، والتوكل
          </p>
          <Button
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 px-8"
            onClick={() => navigate("/v2")}
          >
            <TrendingUp className="w-5 h-5 mr-2" />
            اذهب إلى لوحة التحكم
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 text-center text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <GitBranch className="w-4 h-4" />
          <span>ONX Intelligence v1.0</span>
          <span>·</span>
          <span>30 Routers</span>
          <span>·</span>
          <span>230+ Endpoints</span>
          <span>·</span>
          <span>7,438 Lines</span>
        </div>
        <p>Civilization-Scale Intelligence Operating System — Built with Amanah</p>
      </footer>
    </div>
  );
}
