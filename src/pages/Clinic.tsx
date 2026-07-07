// ============================================================
// Virtual Clinic — P0-04/05: AI-powered veterinary sessions
// ============================================================
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope, Heart, AlertTriangle, CheckCircle,
  PlusCircle, X, FileText, Pill, Shield, Loader2,
} from "lucide-react";
import BackButton from "@/components/BackButton";

const SPECIES = ["كلب (Canine)", "قطة (Feline)", "فرس (Equine)", "بقر (Bovine)", "طيور (Avian)", "أخرى"];

const COMMON_SYMPTOMS: Record<string, string[]> = {
  "كلب (Canine)": ["حمى", "خمول", "فقدان الشهية", "قيء", "إسهال", "عرج", "سعال", "حكة جلدية"],
  "قطة (Feline)": ["حمى", "خمول", "قيء", "إسهال", "فقدان الوزن", "إفراز العين", "صعوبة التنفس"],
  "فرس (Equine)": ["مغص", "عرج", "حمى", "ضائقة تنفسية", "فقدان الوزن"],
  "بقر (Bovine)": ["التهاب الضرع", "عرج", "حمى", "فقدان الشهية"],
  "طيور (Avian)": ["خمول", "ضائقة تنفسية", "إسهال", "فقدان الريش"],
};

const SEVERITY_CONFIG = {
  LOW: { color: "bg-green-100 text-green-800", icon: <CheckCircle className="w-4 h-4" />, label: "منخفض" },
  MEDIUM: { color: "bg-yellow-100 text-yellow-800", icon: <AlertTriangle className="w-4 h-4" />, label: "متوسط" },
  HIGH: { color: "bg-orange-100 text-orange-800", icon: <AlertTriangle className="w-4 h-4" />, label: "عالي" },
  CRITICAL: { color: "bg-red-100 text-red-800", icon: <AlertTriangle className="w-4 h-4" />, label: "حرج" },
};

export default function Clinic() {
  const [patientName, setPatientName] = useState("");
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [drugs, setDrugs] = useState<string[]>([]);
  const [drugInput, setDrugInput] = useState("");
  const [activeTab, setActiveTab] = useState<"session" | "drugs">("session");

  const createSession = trpc.vet.createSession.useMutation();
  const checkDrugs = trpc.vet.checkDrugInteractions.useMutation();
  const vetStats = trpc.vet.stats.useQuery();

  const toggleSymptom = (s: string) => {
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const addDrug = () => {
    if (drugInput.trim() && !drugs.includes(drugInput.trim())) {
      setDrugs(prev => [...prev, drugInput.trim()]);
      setDrugInput("");
    }
  };

  const handleCreateSession = async () => {
    if (!patientName || !species || symptoms.length === 0) return;
    await createSession.mutateAsync({
      patientName,
      species,
      breed: breed || undefined,
      chiefComplaint: chiefComplaint || symptoms.join("، "),
      symptoms,
    });
  };

  const handleDrugCheck = async () => {
    if (drugs.length < 2) return;
    await checkDrugs.mutateAsync({ drugs, species: species || "canine" });
  };

  const speciesKey = species as keyof typeof COMMON_SYMPTOMS;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">العيادة البيطرية الذكية</h1>
              <p className="text-xs text-gray-500">Virtual Clinic — GPT-4o AI Diagnosis · P0-04/05</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs">
              <Heart className="w-3 h-3" /> {vetStats.data?.totalCases || 0} حالة
            </Badge>
            <BackButton href="/dashboard" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["session", "drugs"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"}`}
            >
              {tab === "session" ? "🏥 جلسة تشخيص جديدة" : "💊 فحص تداخل الأدوية (P0-10)"}
            </button>
          ))}
        </div>

        {activeTab === "session" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left — Input Form */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" /> بيانات المريض
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">اسم الحيوان *</label>
                    <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="مثال: ريكي" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">النوع *</label>
                    <select
                      value={species}
                      onChange={e => setSpecies(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">اختر النوع</option>
                      {SPECIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">السلالة</label>
                    <Input value={breed} onChange={e => setBreed(e.target.value)} placeholder="مثال: German Shepherd" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الشكوى الرئيسية</label>
                    <Textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} placeholder="وصف موجز للمشكلة..." rows={2} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" /> الأعراض *
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {speciesKey && COMMON_SYMPTOMS[speciesKey] && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {COMMON_SYMPTOMS[speciesKey].map(s => (
                        <button
                          key={s}
                          onClick={() => toggleSymptom(s)}
                          className={`px-2 py-1 rounded-full text-xs border transition-colors ${symptoms.includes(s) ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}
                        >
                          {symptoms.includes(s) ? "✓ " : ""}{s}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={customSymptom}
                      onChange={e => setCustomSymptom(e.target.value)}
                      placeholder="أضف عرض مخصص..."
                      onKeyDown={e => { if (e.key === "Enter" && customSymptom) { toggleSymptom(customSymptom); setCustomSymptom(""); } }}
                    />
                    <Button variant="outline" size="sm" onClick={() => { if (customSymptom) { toggleSymptom(customSymptom); setCustomSymptom(""); } }}>
                      <PlusCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  {symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {symptoms.map(s => (
                        <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs">
                          {s}
                          <button onClick={() => toggleSymptom(s)}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                onClick={handleCreateSession}
                disabled={createSession.isPending || !patientName || !species || symptoms.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {createSession.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />جاري التشخيص بـ GPT-4o...</> : "🔍 تشخيص بالذكاء الاصطناعي"}
              </Button>
            </div>

            {/* Right — Result */}
            <div>
              {createSession.data ? (
                <Card className="border-emerald-200">
                  <CardHeader className="pb-2 bg-emerald-50 rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-emerald-900">
                        تقرير المريض: {createSession.data.patientName}
                      </CardTitle>
                      <Badge className={SEVERITY_CONFIG[createSession.data.severity as keyof typeof SEVERITY_CONFIG]?.color}>
                        {SEVERITY_CONFIG[createSession.data.severity as keyof typeof SEVERITY_CONFIG]?.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-emerald-600">#{createSession.data.sessionId} · {createSession.data.model}</p>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ScrollArea className="h-80">
                      <div className="space-y-4 pl-2">
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-1">🤖 تحليل GPT-4o</h4>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{createSession.data.aiDiagnosis}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 border-t pt-2">
                          <span>⚡ Tokens: {createSession.data.tokensUsed}</span>
                          <span>📊 ثقة: {(createSession.data.confidence * 100).toFixed(0)}%</span>
                          <Badge variant="outline" className="text-xs">
                            <Shield className="w-3 h-3 ml-1" />{createSession.data.status}
                          </Badge>
                        </div>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              ) : (
                <Card className="h-full flex items-center justify-center border-dashed border-gray-300">
                  <CardContent className="text-center py-16">
                    <Stethoscope className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">أدخل بيانات المريض والأعراض<br />وسيقوم GPT-4o بالتشخيص</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === "drugs" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="w-4 h-4 text-purple-600" /> فحص تداخل الأدوية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">النوع</label>
                  <Input value={species} onChange={e => setSpecies(e.target.value)} placeholder="canine / feline / equine..." />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الأدوية (أضف على الأقل اثنين)</label>
                  <div className="flex gap-2">
                    <Input value={drugInput} onChange={e => setDrugInput(e.target.value)} placeholder="اسم الدواء..." onKeyDown={e => e.key === "Enter" && addDrug()} />
                    <Button variant="outline" size="sm" onClick={addDrug}><PlusCircle className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {drugs.map(d => (
                      <span key={d} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs">
                        {d} <button onClick={() => setDrugs(prev => prev.filter(x => x !== d))}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <Button onClick={handleDrugCheck} disabled={checkDrugs.isPending || drugs.length < 2} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                  {checkDrugs.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />فحص...</> : "🔬 فحص التداخلات"}
                </Button>
              </CardContent>
            </Card>

            {checkDrugs.data && (
              <Card className={checkDrugs.data.hasInteraction ? "border-red-200" : "border-green-200"}>
                <CardHeader className={`pb-2 rounded-t-lg ${checkDrugs.data.hasInteraction ? "bg-red-50" : "bg-green-50"}`}>
                  <div className="flex items-center gap-2">
                    {checkDrugs.data.hasInteraction
                      ? <AlertTriangle className="w-5 h-5 text-red-600" />
                      : <CheckCircle className="w-5 h-5 text-green-600" />}
                    <CardTitle className="text-base">
                      {checkDrugs.data.hasInteraction ? "⚠️ تحذير: يوجد تداخل دوائي" : "✅ آمن: لا يوجد تداخل"}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{checkDrugs.data.analysis}</p>
                  <p className="text-xs text-gray-400 mt-3">Model: {checkDrugs.data.model} · {checkDrugs.data.checkedAt}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
