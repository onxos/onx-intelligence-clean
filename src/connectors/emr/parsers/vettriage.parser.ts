import type { JsonRecord } from '../../connectors.types';
import type { ParsedPatient } from '../../connectors.types';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse a VetTriage EMR patient record into the canonical ParsedPatient. */
export function parseVetTriage(raw: JsonRecord): ParsedPatient {
  const diagnosis = (raw.diagnosis ?? {}) as JsonRecord;
  const treatment = (raw.treatment ?? {}) as JsonRecord;
  const vet = (raw.vet ?? {}) as JsonRecord;
  return {
    externalId: str(raw.id) ?? str(raw.patient_id) ?? 'unknown',
    name: str(raw.patient_name) ?? str(raw.name) ?? 'Unknown',
    species: str(raw.species),
    diagnosisCode: str(diagnosis.code),
    treatmentDate: str(treatment.date),
    veterinarianId: str(vet.id),
    raw,
  };
}
