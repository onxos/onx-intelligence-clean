export type ConstitutionalPrinciple = {
  key: string;
  name: string;
  ar: string;
  description: string;
};

export type Titan = {
  id: string;
  name: string;
  role: string;
};

export type Skill = {
  id: string;
  title: string;
  category: string;
  level: "core" | "advanced";
};

export type CivilizationalProgram = {
  code: string;
  title: string;
};
