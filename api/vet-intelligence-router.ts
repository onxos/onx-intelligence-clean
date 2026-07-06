// ============================================================
// VETERINARY INTELLIGENCE — Day 6: Core Domain Skill
// Specialized AI assistance for veterinary medicine
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

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
    };
  }),
});
