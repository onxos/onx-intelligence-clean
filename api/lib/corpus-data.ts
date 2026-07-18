// ============================================================
// CORPUS DATA — curated, provenance-valid veterinary knowledge
// ------------------------------------------------------------
// Each record is an AUTHORED, standard-of-care statement cited to a REAL
// governing authority (AAHA, WSAVA, AAFP, CAPC, ACVIM, IRIS, WHO/WOAH, AVMA,
// Merck Veterinary Manual). Statements are kept at guideline / standard-of-care
// level — no fabricated dosages, page numbers or DOIs. These are the honest
// provenance-valid seed; the count is deliberately modest and real, NOT inflated.
// ============================================================
import type { CorpusSeed } from "./corpus";
import type { IurgObjectType, VerificationLevel } from "../iuc-engine";

function authored(
  contentText: string,
  sourceAuthority: string,
  citation: string,
  opts: {
    type?: IurgObjectType;
    domainTag?: string;
    verification?: VerificationLevel;
    sources?: number;
    trust?: number;
  } = {},
): CorpusSeed {
  return {
    contentText,
    type: opts.type ?? "PERCEPTION",
    verification: opts.verification ?? "CONFIRMED",
    provenance: { type: "AUTHORED", citation, sourceAuthority },
    sources: opts.sources ?? 3,
    trust: opts.trust ?? 0.85,
    domainTag: opts.domainTag ?? "MEDICINE",
  };
}

/** Curated, provenance-valid veterinary corpus (authored + cited). */
export const CURATED_VET_CORPUS: CorpusSeed[] = [
  // ---- Vaccination & preventive care (AAHA / WSAVA / AAFP) ----
  authored(
    "Core canine vaccines are canine distemper virus, canine adenovirus, and canine parvovirus, plus rabies where legally required; they are recommended for every dog regardless of lifestyle.",
    "AAHA", "AAHA Canine Vaccination Guidelines",
    { type: "UNDERSTANDING", verification: "PROVEN", trust: 0.95, sources: 4 },
  ),
  authored(
    "Core feline vaccines are feline panleukopenia, feline herpesvirus-1 and feline calicivirus, plus rabies; kitten series begins around 6-8 weeks with boosters every 3-4 weeks until about 16 weeks of age.",
    "AAFP", "AAFP Feline Vaccination Advisory Panel Report",
    { type: "UNDERSTANDING", verification: "PROVEN", trust: 0.93, sources: 4 },
  ),
  authored(
    "Vaccines are classified as core (recommended for all animals) or non-core (given based on individual risk assessment of lifestyle and geography).",
    "WSAVA", "WSAVA Vaccination Guidelines for the Owners and Breeders of Dogs and Cats",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.9 },
  ),
  authored(
    "A puppy primary vaccination series should extend to 16 weeks of age or older to overcome interference from maternally derived antibodies.",
    "WSAVA", "WSAVA Vaccination Guidelines Group",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.88 },
  ),
  authored(
    "Annual wellness visits should include weight and body condition scoring, dental assessment, parasite-prevention review, and a lifestyle-based vaccination review.",
    "AAHA", "AAHA Canine Life Stage Guidelines",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.86 },
  ),

  // ---- Nutrition & body condition (WSAVA) ----
  authored(
    "Body condition score should be assessed and recorded at every clinical examination as the fifth vital assessment, alongside temperature, pulse, respiration and pain.",
    "WSAVA", "WSAVA Global Nutrition Guidelines",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.9, sources: 3 },
  ),
  authored(
    "A nutritional assessment and diet history are recommended for every patient at every visit to detect obesity, muscle loss and diet-related risk early.",
    "WSAVA", "WSAVA Global Nutrition Committee Toolkit",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.85 },
  ),
  authored(
    "Obesity is a common, preventable disease in companion animals that shortens lifespan and worsens osteoarthritis, requiring measured feeding and weight-loss planning.",
    "AAHA", "AAHA Weight Management Guidelines",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.87 },
  ),

  // ---- Parasite control (CAPC) ----
  authored(
    "Year-round broad-spectrum parasite control is recommended for dogs and cats to protect animal and human health from intestinal and vector-borne parasites.",
    "CAPC", "CAPC General Guidelines for Dogs and Cats",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.88, sources: 3 },
  ),
  authored(
    "Year-round heartworm prevention with annual antigen testing is recommended for dogs; heartworm disease is transmitted by mosquitoes and is far cheaper to prevent than to treat.",
    "CAPC", "CAPC Heartworm Guidelines",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.88 },
  ),
  authored(
    "Puppies and kittens should be dewormed early and repeatedly in the first months of life because of high prevalence of roundworms and hookworms, several of which are zoonotic.",
    "CAPC", "CAPC Intestinal Parasite Guidelines",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.86 },
  ),
  authored(
    "Prompt, complete tick removal and year-round tick control reduce transmission of tick-borne diseases such as Lyme borreliosis, anaplasmosis and ehrlichiosis.",
    "CAPC", "CAPC Tick-Borne Disease Guidelines",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.85 },
  ),

  // ---- Infectious disease (Merck / ACVIM / WOAH) ----
  authored(
    "Canine parvovirus causes acute hemorrhagic gastroenteritis with vomiting, bloody diarrhea, lethargy, fever and profound leukopenia in unvaccinated puppies, and requires urgent isolation and supportive care.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Canine Parvovirus",
    { type: "PERCEPTION", verification: "CONFIRMED", trust: 0.87 },
  ),
  authored(
    "Canine infectious respiratory disease (kennel cough) commonly presents as a harsh, dry, hacking cough in recently co-housed dogs; most cases are self-limiting but progression to pneumonia warrants escalation.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Canine Infectious Respiratory Disease Complex",
    { type: "PATTERN", verification: "PROBABLE", trust: 0.8 },
  ),
  authored(
    "Rabies is an almost invariably fatal zoonotic encephalitis; mass canine vaccination is the most cost-effective intervention to prevent human rabies deaths.",
    "WHO/WOAH", "WHO Expert Consultation on Rabies; WOAH Terrestrial Animal Health Code",
    { type: "UNDERSTANDING", verification: "PROVEN", trust: 0.95, sources: 4 },
  ),
  authored(
    "Leptospirosis is a zoonotic bacterial disease that can cause acute kidney and liver injury in dogs; vaccination is recommended for at-risk dogs and handling requires zoonotic precautions.",
    "ACVIM", "ACVIM Consensus Statement on Leptospirosis in Dogs",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.86 },
  ),
  authored(
    "In non-endemic regions, testing and vaccination decisions for canine Lyme disease should follow regional risk; most seropositive dogs are subclinical.",
    "ACVIM", "ACVIM Consensus Update on Lyme Borreliosis in Dogs and Cats",
    { type: "UNDERSTANDING", verification: "PROBABLE", trust: 0.82 },
  ),

  // ---- Chronic disease (IRIS / ACVIM / AAFP) ----
  authored(
    "Chronic kidney disease in cats and dogs is staged by the IRIS system using stable blood creatinine and SDMA, with substaging by proteinuria and blood pressure to guide treatment.",
    "IRIS", "IRIS Staging of Chronic Kidney Disease",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.9, sources: 3 },
  ),
  authored(
    "Early signs of feline chronic kidney disease include increased thirst and urination, weight loss and reduced appetite; hydration support and phosphorus control are central to management.",
    "AAFP", "AAFP/ISFM Consensus on Feline Chronic Kidney Disease",
    { type: "PERCEPTION", verification: "PROBABLE", trust: 0.83 },
  ),
  authored(
    "Systemic hypertension in cats and dogs can cause ocular, renal, cardiac and neurological damage; blood pressure should be measured in at-risk and older patients.",
    "ACVIM", "ACVIM Consensus Statement on Systemic Hypertension in Dogs and Cats",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.85 },
  ),
  authored(
    "Myxomatous mitral valve disease is the most common acquired heart disease in dogs and is often first detected as a left apical systolic heart murmur before clinical signs appear.",
    "ACVIM", "ACVIM Consensus Guidelines for Diagnosis and Treatment of Myxomatous Mitral Valve Disease",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.86 },
  ),
  authored(
    "Feline diabetes mellitus management relies on consistent insulin dosing, dietary control and home monitoring; owners must be counseled to recognize signs of hypoglycemia.",
    "AAHA", "AAHA Diabetes Management Guidelines for Dogs and Cats",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.84 },
  ),

  // ---- Pain, anesthesia & surgery (AAHA / WSAVA / AAFP) ----
  authored(
    "Pain should be assessed and documented as the fourth vital sign using a validated pain scale, and treated proactively with a multimodal analgesia plan.",
    "WSAVA", "WSAVA Global Pain Council Guidelines",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.88, sources: 3 },
  ),
  authored(
    "Osteoarthritis is a chronic painful disease managed with multimodal care: weight control, controlled exercise, and analgesia such as NSAIDs when tolerated and monitored.",
    "AAHA", "AAHA/AAFP Pain Management Guidelines for Dogs and Cats",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.85 },
  ),
  authored(
    "Every anesthetic patient should receive an individualized plan with pre-anesthetic assessment, continuous monitoring, and active recovery support to reduce anesthetic risk.",
    "AAHA", "AAHA Anesthesia and Monitoring Guidelines for Dogs and Cats",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.86 },
  ),
  authored(
    "Post-operative incision monitoring should watch for swelling, redness, discharge, pain and self-trauma; activity restriction and an e-collar reduce dehiscence risk.",
    "AAHA", "AAHA/AAFP Perioperative Care Recommendations",
    { type: "PERCEPTION", verification: "PROBABLE", trust: 0.8 },
  ),

  // ---- Dental (AAHA / WSAVA) ----
  authored(
    "Periodontal disease is the most common clinical condition in adult dogs and cats and requires anesthetized oral examination with dental radiographs for accurate assessment.",
    "AAHA", "AAHA Dental Care Guidelines for Dogs and Cats",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.87 },
  ),
  authored(
    "Daily tooth brushing is the gold standard for home dental care and slows accumulation of plaque and calculus between professional cleanings.",
    "WSAVA", "WSAVA Global Dental Guidelines",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.83 },
  ),

  // ---- Feline-specific handling & wellness (AAFP) ----
  authored(
    "Feline-friendly, low-stress handling reduces fear and improves the safety and accuracy of examinations; forceful restraint should be minimized.",
    "AAFP", "AAFP/ISFM Feline-Friendly Handling Guidelines",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.84 },
  ),
  authored(
    "Providing for the five pillars of a healthy feline environment (safe space, multiple key resources, play/predatory outlets, positive human interaction, and respect for smell) reduces stress-related disease.",
    "AAFP", "AAFP/ISFM Feline Environmental Needs Guidelines",
    { type: "UNDERSTANDING", verification: "PROBABLE", trust: 0.82 },
  ),
  authored(
    "Feline lower urinary tract signs include straining, frequent small urinations and inappropriate urination; a male cat unable to urinate is a life-threatening obstruction emergency.",
    "AAFP", "AAFP/ISFM Guidelines on Feline Lower Urinary Tract Disease",
    { type: "PERCEPTION", verification: "CONFIRMED", trust: 0.86 },
  ),
  authored(
    "Senior cats benefit from more frequent wellness screening, including weight trends, blood pressure, and bloodwork, to detect kidney disease, hyperthyroidism and diabetes early.",
    "AAFP", "AAFP Senior Care Guidelines for Cats",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.84 },
  ),

  // ---- Emergency & first aid (Merck / AAHA) ----
  authored(
    "Brachycephalic dogs are prone to heat stress and airway compromise; panting that does not resolve, collapse or cyanosis require emergency cooling and airway support.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Brachycephalic Obstructive Airway Syndrome",
    { type: "PERCEPTION", verification: "PROBABLE", trust: 0.8 },
  ),
  authored(
    "Gastric dilatation-volvulus is an acute life-threatening emergency in large, deep-chested dogs presenting with a distended abdomen, non-productive retching and distress.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Gastric Dilatation-Volvulus",
    { type: "PERCEPTION", verification: "CONFIRMED", trust: 0.85 },
  ),
  authored(
    "Rabbit gastrointestinal stasis is an emergency indicated by reduced or absent fecal output and appetite; it requires prompt analgesia, hydration and motility support.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Gastrointestinal Stasis in Rabbits",
    { type: "PERCEPTION", verification: "PROBABLE", trust: 0.79, domainTag: "MEDICINE" },
  ),
  authored(
    "Any animal bite wound should be cleaned and lavaged, assessed for deep-tissue damage, and evaluated for rabies exposure risk and appropriate antimicrobial and analgesic care.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Bite Wounds and Wound Management",
    { type: "PATTERN", verification: "PROBABLE", trust: 0.8 },
  ),

  // ---- Behavior & welfare (AVMA / AAHA) ----
  authored(
    "Early, positive puppy and kitten socialization during the sensitive period reduces later fear and aggression and should be balanced against infectious-disease precautions.",
    "AAHA", "AAHA Canine and Feline Behavior Management Guidelines",
    { type: "UNDERSTANDING", verification: "PROBABLE", trust: 0.82 },
  ),
  authored(
    "Animal welfare is grounded in the Five Freedoms / Five Domains, which frame nutrition, environment, health, behavior and mental state as the basis of humane care.",
    "AVMA", "AVMA Animal Welfare Principles",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.85, domainTag: "SOCIAL" },
  ),
  authored(
    "One Health recognizes that human, animal and environmental health are interconnected; veterinarians play a central role in zoonotic disease surveillance and antimicrobial stewardship.",
    "AVMA", "AVMA One Health Initiative",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.86, domainTag: "SCIENCE" },
  ),

  // ---- Antimicrobial stewardship (AAHA / WSAVA) ----
  authored(
    "Antimicrobial stewardship requires using antibiotics only when indicated, choosing the narrowest effective agent, and completing culture and susceptibility testing for complicated or recurrent infections.",
    "AAHA", "AAHA Antimicrobial Stewardship Recommendations",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.87 },
  ),
  authored(
    "Superficial bacterial folliculitis in dogs is frequently secondary to an underlying cause such as allergy or endocrinopathy, which must be addressed to prevent recurrent infection.",
    "WSAVA", "WSAVA / Companion Animal Dermatology Guidance",
    { type: "PATTERN", verification: "PROBABLE", trust: 0.8 },
  ),
  authored(
    "Canine otitis externa is usually a secondary problem; effective management identifies and treats primary and perpetuating factors and uses cytology to guide therapy.",
    "WSAVA", "WSAVA / Companion Animal Otitis Guidance",
    { type: "PATTERN", verification: "PROBABLE", trust: 0.8 },
  ),

  // ---- Reproduction & life stage (AAHA / AAFP) ----
  authored(
    "Spay/neuter timing should be individualized by species, breed size and risk, balancing population control and health outcomes rather than a single fixed age for all patients.",
    "AAHA", "AAHA Canine Life Stage Guidelines (Sterilization)",
    { type: "UNDERSTANDING", verification: "PROBABLE", trust: 0.81 },
  ),
  authored(
    "Life-stage-based care recognizes that puppies, adults and seniors have different screening and preventive needs, so wellness plans should be tailored to life stage.",
    "AAFP", "AAFP Feline Life Stage Guidelines",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.84 },
  ),

  // ---- Diagnostics & monitoring (ACVIM / Merck) ----
  authored(
    "Minimum database bloodwork (complete blood count, serum chemistry and urinalysis) supports safe anesthesia and early detection of subclinical disease in older patients.",
    "AAHA", "AAHA Preventive Diagnostic Recommendations",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.84 },
  ),
  authored(
    "Proteinuria of renal origin is a marker of kidney injury and a therapeutic target; persistent proteinuria should be confirmed and quantified with a urine protein-to-creatinine ratio.",
    "ACVIM", "ACVIM Consensus Statement on Proteinuria in Dogs and Cats",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.85 },
  ),
  authored(
    "Hyperthyroidism is a common endocrine disease of older cats presenting with weight loss despite a good appetite, and is screened with total thyroxine measurement.",
    "Merck Veterinary Manual", "Merck Veterinary Manual: Feline Hyperthyroidism",
    { type: "PATTERN", verification: "CONFIRMED", trust: 0.85 },
  ),

  // ---- Livestock / production (WOAH) ----
  authored(
    "Biosecurity — controlling movement of animals, people and equipment — is the foundation of preventing introduction and spread of infectious disease in animal populations.",
    "WOAH", "WOAH Terrestrial Animal Health Code: Biosecurity",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.85, domainTag: "AGRICULTURE" },
  ),
  authored(
    "Prudent use of antimicrobials in food-producing animals, with veterinary oversight and withdrawal-period compliance, is essential to limit antimicrobial resistance.",
    "WOAH", "WOAH Standards on Responsible and Prudent Use of Antimicrobial Agents",
    { type: "UNDERSTANDING", verification: "CONFIRMED", trust: 0.85, domainTag: "AGRICULTURE" },
  ),
];
