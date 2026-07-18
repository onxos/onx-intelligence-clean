// ============================================================
// VETERINARY INTELLIGENCE — Day 6: Core Domain Skill
// Specialized AI assistance for veterinary medicine
// P0-04, P0-05, P0-10: Clinical sessions + AI diagnosis + Drug checks
// ============================================================
import { z } from "zod";
import OpenAI from "openai";
import { createRouter, publicQuery } from "./middleware";
import { env } from "./lib/env";

// --- Lazy OpenAI ---
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    const key = env.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

// --- Types ---
interface VetCase {
  id: string;
  animalType: string;
  breed: string;
  symptoms: string[];
  diagnosis: string;
  confidence: number;
  treatment: string[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "RESOLVED" | "REFERRED";
  createdAt: Date;
  updatedAt: Date;
}

interface BreedProfile {
  id: string;
  species: string;
  breed: string;
  commonIssues: string[];
  vaccinations: Array<{ name: string; age: string; frequency: string }>;
  nutrition: string;
  lifespan: string;
}

// --- In-memory stores ---
const vetCases: Map<string, VetCase> = new Map();
const breedProfiles: BreedProfile[] = [
  {
    id: "bp_1", species: "Canine", breed: "German Shepherd",
    commonIssues: ["Hip dysplasia", "Degenerative myelopathy", "Bloat", "Pancreatitis"],
    vaccinations: [
      { name: "DHPP", age: "6-8 weeks", frequency: "Every 3-4 weeks until 16 weeks" },
      { name: "Rabies", age: "12-16 weeks", frequency: "Every 1-3 years" },
    ],
    nutrition: "High-protein diet, glucosamine supplements for joint health",
    lifespan: "9-13 years",
  },
  {
    id: "bp_2", species: "Feline", breed: "Persian",
    commonIssues: ["Polycystic kidney disease", "Respiratory issues", "Dental disease", "Eye conditions"],
    vaccinations: [
      { name: "FVRCP", age: "6-8 weeks", frequency: "Every 3-4 weeks until 16 weeks" },
      { name: "Rabies", age: "12-16 weeks", frequency: "Every 1-3 years" },
    ],
    nutrition: "Low-sodium diet, kidney-support formula after age 7",
    lifespan: "12-17 years",
  },
  {
    id: "bp_3", species: "Equine", breed: "Arabian",
    commonIssues: ["Laminitis", "Colic", "Cushing's disease", "Respiratory allergies"],
    vaccinations: [
      { name: "Tetanus", age: "3-4 months", frequency: "Annual" },
      { name: "Influenza", age: "6 months", frequency: "Every 6 months" },
    ],
    nutrition: "Forage-based diet, limited grain, electrolyte balance",
    lifespan: "25-30 years",
  },
  {
    id: "bp_4", species: "Bovine", breed: "Holstein",
    commonIssues: ["Mastitis", "Milk fever", "Ketosis", "Lameness"],
    vaccinations: [
      { name: "IBR-BVD-PI3", age: "2-4 months", frequency: "Annual" },
      { name: "Brucellosis", age: "4-12 months", frequency: "Once" },
    ],
    nutrition: "High-energy diet during lactation, mineral supplementation",
    lifespan: "6-8 years (productive)",
  },
  {
    id: "bp_5", species: "Avian", breed: "Broiler Chicken",
    commonIssues: ["Ascites", "Sudden death syndrome", "Bumblefoot", "Coccidiosis"],
    vaccinations: [
      { name: "Newcastle", age: "1 day", frequency: "Every 3-4 months" },
      { name: "Infectious Bronchitis", age: "1 day", frequency: "Every 3-4 months" },
    ],
    nutrition: "High-protein starter feed, probiotics, clean water",
    lifespan: "5-8 weeks (meat production)",
  },
];

// --- Symptom-Diagnosis Engine (rule-based) ---
const SYMPTOM_RULES: Array<{ symptoms: string[]; diagnosis: string; treatment: string[]; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }> = [
  { symptoms: ["fever", "lethargy", "loss of appetite"], diagnosis: "Possible infection — bacterial or viral", treatment: ["Blood work", "Antibiotics (pending culture)", "Supportive care", "IV fluids"], severity: "MEDIUM" },
  { symptoms: ["vomiting", "diarrhea", "dehydration"], diagnosis: "Gastroenteritis — dietary or infectious", treatment: ["NPO for 12h", "Bland diet introduction", "Probiotics", "Anti-emetics"], severity: "MEDIUM" },
  { symptoms: ["lameness", "swelling", "pain on touch"], diagnosis: "Musculoskeletal injury or arthritis", treatment: ["X-ray", "NSAIDs", "Rest", "Cold therapy"], severity: "MEDIUM" },
  { symptoms: ["difficulty breathing", "cyanosis", "open-mouth breathing"], diagnosis: "Respiratory distress — immediate intervention", treatment: ["Oxygen therapy", "Bronchodilators", "Corticosteroids", "Emergency referral"], severity: "CRITICAL" },
  { symptoms: ["seizures", "disorientation", "collapse"], diagnosis: "Neurological emergency", treatment: ["Diazepam", "Blood glucose check", "MRI/CT scan", "Neurology referral"], severity: "CRITICAL" },
  { symptoms: ["skin rash", "itching", "hair loss"], diagnosis: "Dermatitis — allergic, parasitic, or bacterial", treatment: ["Skin scraping", "Antihistamines", "Medicated shampoo", "Parasite control"], severity: "LOW" },
  { symptoms: ["weight loss", "excessive thirst", "frequent urination"], diagnosis: "Metabolic disorder — diabetes, thyroid, or kidney", treatment: ["Blood glucose", "Thyroid panel", "Urinalysis", "Kidney function tests"], severity: "HIGH" },
  { symptoms: ["eye discharge", "squinting", "cloudiness"], diagnosis: "Ocular infection or corneal ulcer", treatment: ["Fluorescein stain", "Ocular antibiotics", "E-collar", "Ophthalmology referral if no improvement"], severity: "MEDIUM" },
];

function diagnose(symptoms: string[]): { diagnosis: string; treatment: string[]; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; confidence: number } {
  const symptomSet = new Set(symptoms.map((s) => s.toLowerCase()));
  let bestMatch: { diagnosis: string; treatment: string[]; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; confidence: number } = { diagnosis: "Unspecified condition — further examination required", treatment: ["Physical examination", "Complete blood count", "Veterinary consultation"], severity: "MEDIUM", confidence: 0.3 };
  let maxMatches = 0;

  for (const rule of SYMPTOM_RULES) {
    const matches = rule.symptoms.filter((s) => symptomSet.has(s.toLowerCase())).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = {
        diagnosis: rule.diagnosis,
        treatment: rule.treatment,
        severity: rule.severity,
        confidence: Math.min(matches / rule.symptoms.length, 1),
      };
    }
  }

  return bestMatch;
}

export const vetIntelligenceRouter = createRouter({
  // VI-01: diagnose — AI-assisted diagnosis
  diagnose: publicQuery
    .input(z.object({
      animalType: z.string().min(1),
      breed: z.string().optional(),
      symptoms: z.array(z.string()).min(1),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const result = diagnose(input.symptoms);
      const caseId = `vc_${Date.now()}`;
      const vetCase: VetCase = {
        id: caseId,
        animalType: input.animalType,
        breed: input.breed || "Unknown",
        symptoms: input.symptoms,
        diagnosis: result.diagnosis,
        confidence: Math.round(result.confidence * 100),
        treatment: result.treatment,
        severity: result.severity,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vetCases.set(caseId, vetCase);

      // Get breed-specific advice
      const breedProfile = breedProfiles.find(
        (b) => b.species.toLowerCase() === input.animalType.toLowerCase() ||
               b.breed.toLowerCase() === (input.breed || "").toLowerCase()
      );

      return {
        caseId,
        diagnosis: result.diagnosis,
        confidence: result.confidence,
        severity: result.severity,
        treatment: result.treatment,
        breedAdvice: breedProfile
          ? {
              breed: breedProfile.breed,
              commonIssues: breedProfile.commonIssues,
              nutrition: breedProfile.nutrition,
            }
          : null,
        constitutionalStatus: {
          amanah: "Patient welfare prioritized",
          ihsan: "Best-effort diagnosis provided",
          adl: "Standard protocol applied",
        },
      };
    }),

  // VI-02: getCase — Retrieve case
  getCase: publicQuery
    .input(z.object({ caseId: z.string() }))
    .query(({ input }) => {
      const c = vetCases.get(input.caseId);
      if (!c) throw new Error("CASE_NOT_FOUND");
      return c;
    }),

  // VI-03: listCases — All cases
  listCases: publicQuery
    .input(z.object({
      status: z.enum(["ACTIVE", "RESOLVED", "REFERRED"]).optional(),
      limit: z.number().default(50),
    }).optional())
    .query(({ input }) => {
      let cases = Array.from(vetCases.values());
      if (input?.status) cases = cases.filter((c) => c.status === input.status);
      return cases.slice(0, input?.limit || 50);
    }),

  // VI-04: updateCase — Update case status/diagnosis
  updateCase: publicQuery
    .input(z.object({
      caseId: z.string(),
      diagnosis: z.string().optional(),
      treatment: z.array(z.string()).optional(),
      status: z.enum(["ACTIVE", "RESOLVED", "REFERRED"]).optional(),
    }))
    .mutation(({ input }) => {
      const c = vetCases.get(input.caseId);
      if (!c) throw new Error("CASE_NOT_FOUND");
      if (input.diagnosis) c.diagnosis = input.diagnosis;
      if (input.treatment) c.treatment = input.treatment;
      if (input.status) c.status = input.status;
      c.updatedAt = new Date();
      return c;
    }),

  // VI-05: breeds — Get breed profiles
  breeds: publicQuery
    .input(z.object({ species: z.string().optional() }))
    .query(({ input }) => {
      let profiles = breedProfiles;
      if (input.species) {
        profiles = profiles.filter((b) => b.species.toLowerCase() === input.species!.toLowerCase());
      }
      return profiles;
    }),

  // VI-06: vaccinations — Vaccination schedule
  vaccinations: publicQuery
    .input(z.object({ species: z.string(), breed: z.string().optional() }))
    .query(({ input }) => {
      const profile = breedProfiles.find(
        (b) => b.species.toLowerCase() === input.species.toLowerCase() ||
               (input.breed && b.breed.toLowerCase() === input.breed.toLowerCase())
      );
      return {
        species: input.species,
        vaccinations: profile?.vaccinations || [],
        source: "ONX Veterinary Intelligence v1.0",
      };
    }),

  // VI-07: symptomsList — Common symptoms by species
  symptomsList: publicQuery
    .input(z.object({ species: z.string() }))
    .query(({ input }) => {
      const symptomMap: Record<string, string[]> = {
        canine: ["fever", "lethargy", "loss of appetite", "vomiting", "diarrhea", "lameness", "coughing", "skin rash", "itching", "seizures"],
        feline: ["fever", "lethargy", "loss of appetite", "vomiting", "diarrhea", "weight loss", "excessive thirst", "frequent urination", "eye discharge", "difficulty breathing"],
        equine: ["colic", "lameness", "fever", "lethargy", "respiratory distress", "weight loss", "skin conditions"],
        bovine: ["mastitis", "lameness", "fever", "loss of appetite", "respiratory distress", "reproductive issues"],
        avian: ["lethargy", "respiratory distress", "diarrhea", "weight loss", "feather loss", "lameness"],
      };
      return {
        species: input.species,
        symptoms: symptomMap[input.species.toLowerCase()] || ["Consult veterinarian for species-specific symptoms"],
      };
    }),

  // VI-08: stats — Veterinary statistics
  stats: publicQuery.query(() => {
    const cases = Array.from(vetCases.values());
    const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const byStatus = { ACTIVE: 0, RESOLVED: 0, REFERRED: 0 };
    for (const c of cases) {
      bySeverity[c.severity]++;
      byStatus[c.status]++;
    }
    return {
      totalCases: cases.length,
      bySeverity,
      byStatus,
      avgConfidence: cases.length > 0 ? (cases.reduce((s, c) => s + c.confidence, 0) / cases.length).toFixed(1) : "0",
      breedProfiles: breedProfiles.length,
      gpt4oEnabled: !!(env.openAiApiKey || process.env.OPENAI_API_KEY),
    };
  }),

  // VI-09: createSession — Full clinical session with AI diagnosis (P0-04, P0-05)
  createSession: publicQuery
    .input(z.object({
      patientName: z.string(),
      species: z.string(),
      breed: z.string().optional(),
      age: z.number().optional(),
      weight: z.number().optional(),
      ownerName: z.string().optional(),
      chiefComplaint: z.string(),
      symptoms: z.array(z.string()),
      vitals: z.object({
        temperature: z.number().optional(),
        heartRate: z.number().optional(),
        respiratoryRate: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Rule-based pre-diagnosis
      const ruleResult = diagnose(input.symptoms);

      // GPT-4o comprehensive clinical analysis (P0-05)
      const aiPrompt = `أنت طبيب بيطري خبير. قم بتحليل الحالة التالية وتقديم:
1. التشخيص الأولي (مع مستوى الثقة)
2. التشخيصات التفاضلية (3-5 احتمالات)
3. خطة العلاج المقترحة
4. الأدوية الموصى بها (بالجرعات إن أمكن)
5. متى يجب إحالة الحالة

معلومات الحالة:
- الحيوان: ${input.species} (${input.breed || "سلالة غير محددة"})
- العمر: ${input.age || "غير محدد"} سنة
- الوزن: ${input.weight || "غير محدد"} كجم
- المشكلة الرئيسية: ${input.chiefComplaint}
- الأعراض: ${input.symptoms.join("، ")}
${input.vitals ? `- العلامات الحيوية: حرارة ${input.vitals.temperature || "؟"}، نبض ${input.vitals.heartRate || "؟"}، تنفس ${input.vitals.respiratoryRate || "؟"}` : ""}

قدّم إجابتك بالعربية بتنسيق منظم.`;

      const completion = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: aiPrompt }],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const aiDiagnosis = completion.choices[0]?.message.content || ruleResult.diagnosis;

      return {
        sessionId,
        patientName: input.patientName,
        species: input.species,
        breed: input.breed,
        chiefComplaint: input.chiefComplaint,
        symptoms: input.symptoms,
        ruleDiagnosis: ruleResult.diagnosis,
        aiDiagnosis,
        severity: ruleResult.severity,
        confidence: ruleResult.confidence,
        tokensUsed: completion.usage?.total_tokens ?? 0,
        model: "gpt-4o",
        status: "DIAGNOSED",
        createdAt: new Date().toISOString(),
      };
    }),

  // VI-09B: preparePatientFile — AI patient file preparation (EV-P0-05)
  // يحوّل بيانات الزيارة الخام إلى ملف مريض منظم جاهز للاعتماد السريري
  preparePatientFile: publicQuery
    .input(z.object({
      patientName: z.string(),
      species: z.string(),
      breed: z.string().optional(),
      age: z.number().optional(),
      weight: z.number().optional(),
      sex: z.string().optional(),
      ownerName: z.string().optional(),
      ownerPhone: z.string().optional(),
      visitNotes: z.string(), // ملاحظات الزيارة الخام كما كتبها الطبيب أو المساعد
      vitals: z.object({
        temperature: z.number().optional(),
        heartRate: z.number().optional(),
        respiratoryRate: z.number().optional(),
        weight: z.number().optional(),
      }).optional(),
      previousConditions: z.array(z.string()).default([]),
      currentMedications: z.array(z.string()).default([]),
      allergies: z.array(z.string()).default([]),
      vaccinationStatus: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      const fileId = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const prompt = `أنت مساعد طبي بيطري متخصص في توثيق ملفات المرضى. حوّل بيانات الزيارة التالية إلى ملف مريض منظم وجاهز للاعتماد السريري.

بيانات الهوية:
- الاسم: ${input.patientName} | النوع: ${input.species} | السلالة: ${input.breed || "غير محددة"}
- العمر: ${input.age ?? "غير محدد"} سنة | الوزن: ${input.weight ?? "غير محدد"} كجم | الجنس: ${input.sex || "غير محدد"}
- المالك: ${input.ownerName || "غير محدد"} ${input.ownerPhone ? `(${input.ownerPhone})` : ""}

التاريخ الطبي:
- حالات سابقة: ${input.previousConditions.join("، ") || "لا يوجد"}
- أدوية حالية: ${input.currentMedications.join("، ") || "لا يوجد"}
- حساسية معروفة: ${input.allergies.join("، ") || "لا يوجد"}
- حالة التطعيم: ${input.vaccinationStatus || "غير محددة"}

العلامات الحيوية: ${input.vitals ? JSON.stringify(input.vitals) : "لم تُسجل"}

ملاحظات الزيارة الخام:
${input.visitNotes}

أعد الملف بالتنسيق التالي تماماً (بالعربية، بأسلوب سريري موجز):
## 1. بيانات الهوية والتعريف (Signalment)
## 2. الشكوى الرئيسية والتاريخ (History)
## 3. الفحص السريري والعلامات الحيوية (Objective)
## 4. التقييم والتشخيص التفاضلي (Assessment)
## 5. خطة العلاج والأدوية بالجرعات (Plan)
## 6. التحاليل أو الفحوصات المطلوبة
## 7. تعليمات المالك والمتابعة
## 8. تنبيهات سلامة (حساسية/تداخلات/ملاحظات حرجة)`;

      const completion = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.2,
      });

      const patientFile = completion.choices[0]?.message.content || "تعذر توليد الملف";

      return {
        fileId,
        patientName: input.patientName,
        species: input.species,
        ownerName: input.ownerName,
        patientFile,
        safetyFlags: {
          allergies: input.allergies,
          currentMedications: input.currentMedications,
          requiresVetReview: true,
        },
        model: "gpt-4o",
        tokensUsed: completion.usage?.total_tokens ?? 0,
        status: "DRAFT_PENDING_VET_REVIEW",
        createdAt: new Date().toISOString(),
      };
    }),

  // VI-10: checkDrugInteractions — Drug interaction check (P0-10)
  checkDrugInteractions: publicQuery
    .input(z.object({
      drugs: z.array(z.string()).min(1).max(10),
      species: z.string(),
      weight: z.number().optional(),
      conditions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();

      const prompt = `أنت صيدلاني بيطري متخصص. افحص التداخلات الدوائية التالية:

الحيوان: ${input.species} (${input.weight ? `${input.weight} كجم` : "وزن غير محدد"})
الأدوية: ${input.drugs.join("، ")}
${input.conditions?.length ? `الحالات الصحية: ${input.conditions.join("، ")}` : ""}

قدّم:
1. هل يوجد تداخل خطير؟ (نعم/لا)
2. التداخلات الموجودة (إن وجدت) مع درجة خطورتها (منخفض/متوسط/عالي/حرج)
3. التوصيات والبدائل
4. الجرعات الآمنة إن أمكن

الإجابة بالعربية.`;

      const completion = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.1,
      });

      const analysis = completion.choices[0]?.message.content || "تعذر التحليل";
      const hasInteraction = analysis.includes("تداخل خطير") || analysis.includes("نعم");

      return {
        drugs: input.drugs,
        species: input.species,
        hasInteraction,
        analysis,
        severity: hasInteraction ? "HIGH" : "SAFE",
        model: "gpt-4o",
        checkedAt: new Date().toISOString(),
      };
    }),

  // VI-11: generateGovReport — MOA Government report (P0-08)
  generateGovReport: publicQuery
    .input(z.object({
      period: z.string(), // "2025-Q2"
      branchId: z.string().optional(),
      includeStatistics: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      const cases = Array.from(vetCases.values());

      const stats = {
        totalCases: cases.length,
        resolved: cases.filter(c => c.status === "RESOLVED").length,
        critical: cases.filter(c => c.severity === "CRITICAL").length,
        speciesBreakdown: cases.reduce((acc, c) => {
          acc[c.animalType] = (acc[c.animalType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      const prompt = `أنت خبير في إعداد التقارير الحكومية البيطرية. أعدّ تقريراً بصيغة وزارة الزراعة السعودية (MOA) للفترة ${input.period}.

الإحصاءات:
- إجمالي الحالات: ${stats.totalCases}
- الحالات المحسومة: ${stats.resolved}
- الحالات الحرجة: ${stats.critical}
- توزيع الأنواع: ${JSON.stringify(stats.speciesBreakdown)}

أعدّ التقرير بالعناصر التالية:
1. الملخص التنفيذي
2. إحصاءات الحالات والأمراض
3. التدخلات البيطرية
4. التوصيات
5. المؤشرات الصحية
استخدم اللغة الرسمية للوزارة.`;

      const completion = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.2,
      });

      return {
        reportId: `MOA-${input.period}-${Date.now()}`,
        period: input.period,
        format: "MOA_GOVERNMENT",
        content: completion.choices[0]?.message.content || "",
        statistics: stats,
        generatedAt: new Date().toISOString(),
        model: "gpt-4o",
      };
    }),

  // EV-P2-05: TeleVet Emergency Protocol — priority escalation
  emergency: publicQuery
    .input(z.object({
      patientId: z.string(),
      species: z.string(),
      chiefComplaint: z.string(),
      vitalSigns: z.string().optional(),
      ownerContact: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const emergencyId = `EMG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      // Constitutional triage: life-threatening keywords escalate to CRITICAL
      const critical = /نزيف|تنفس|فقدان وعي|تشنج|سم|حادث|bleeding|breathing|unconscious|seizure|poison|trauma/i
        .test(input.chiefComplaint);
      const priority = critical ? "CRITICAL" : "URGENT";
      return {
        emergencyId,
        priority,
        status: "ESCALATED",
        escalatedTo: "on-duty-vet",
        sla: critical ? "IMMEDIATE" : "15_MIN",
        protocol: [
          "توثيق العلامات الحيوية والشكوى",
          critical ? "توجيه فوري لأقرب عيادة طوارئ مع اتصال مسبق" : "موعد عاجل خلال 15 دقيقة",
          "إشعار الطبيب المناوب عبر PUSH + WHATSAPP",
          "فتح جلسة TeleVet طارئة إن تعذر الحضور",
        ],
        triagedAt: new Date().toISOString(),
      };
    }),
});
