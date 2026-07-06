import {
  CIVILIZATIONAL_PROGRAMS,
  CONSCIOUSNESS_RHYTHMS,
  CONSTITUTIONAL_PRINCIPLES,
  SKILL_CATEGORIES,
  TITANS
} from "../../contracts/constants";

export const principles = [...CONSTITUTIONAL_PRINCIPLES];
export const titans = [...TITANS];
export const rhythms = [...CONSCIOUSNESS_RHYTHMS];
export const programs = [...CIVILIZATIONAL_PROGRAMS];

export const skills = SKILL_CATEGORIES.flatMap((category, cIdx) =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `${category.toLowerCase().replace(/\s+/g, "-")}-${i + 1}`,
    title: `${category} Skill ${i + 1}`,
    category,
    level: i < 5 ? "core" : "advanced"
  }))
);

export const knowledgeStats = {
  totalRecords: 22500,
  domains: 19,
  refreshedAt: new Date("2026-07-06T00:00:00.000Z").toISOString()
};
