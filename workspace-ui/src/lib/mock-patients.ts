import type { Patient } from "@/types/onx";

/**
 * TODO(clinical): replace with a real `/patients` endpoint once the clinical
 * service ships. Mock roster used to demonstrate the clinical intelligence view.
 */
export const MOCK_PATIENTS: Patient[] = [
  {
    id: "p-max",
    name: "Max",
    species: "Dog",
    breed: "Golden Retriever",
    ageYears: 4,
    weightKg: 32,
    status: "monitoring",
    presenting: ["hind-leg lameness", "stiffness after rest", "reluctance to jump"],
  },
  {
    id: "p-luna",
    name: "Luna",
    species: "Cat",
    breed: "Domestic Shorthair",
    ageYears: 8,
    weightKg: 4.2,
    status: "critical",
    presenting: ["lethargy", "anorexia", "polydipsia", "weight loss"],
  },
  {
    id: "p-rocky",
    name: "Rocky",
    species: "Dog",
    breed: "Boxer",
    ageYears: 6,
    weightKg: 30,
    status: "stable",
    presenting: ["intermittent cough", "exercise intolerance"],
  },
  {
    id: "p-bella",
    name: "Bella",
    species: "Dog",
    breed: "Beagle",
    ageYears: 2,
    weightKg: 11,
    status: "monitoring",
    presenting: ["acute vomiting", "diarrhea"],
  },
];
