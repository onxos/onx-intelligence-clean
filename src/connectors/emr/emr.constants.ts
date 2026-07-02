/** EMR connector constants. */

export const EMR_PROVIDERS = ['vettriage', 'kantime', 'fhir'] as const;
export type EmrProvider = (typeof EMR_PROVIDERS)[number];

export const EMR_DOMAIN = 'clinical';
export const EMR_TIER = 1;

/** Built-in mock roster used when no live EMR credentials/records are supplied. */
export const EMR_MOCK_RECORDS: Record<string, unknown>[] = [
  {
    id: 'vt-1001',
    patient_name: 'Max',
    species: 'canine',
    diagnosis: { code: 'M25.5', label: 'hind-leg lameness' },
    treatment: { date: '2026-06-30' },
    vet: { id: 'dvm-14' },
  },
  {
    id: 'vt-1002',
    patient_name: 'Luna',
    species: 'feline',
    diagnosis: { code: 'N18.9', label: 'chronic kidney disease' },
    treatment: { date: '2026-07-01' },
    vet: { id: 'dvm-09' },
  },
];
