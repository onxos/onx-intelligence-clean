import type { JsonRecord } from '../../connectors.types';
import type { ParsedPatient } from '../../connectors.types';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse a KanTime EMR record (flat field naming) into a ParsedPatient. */
export function parseKanTime(raw: JsonRecord): ParsedPatient {
  return {
    externalId: str(raw.PatientID) ?? str(raw.patientId) ?? str(raw.id) ?? 'unknown',
    name: str(raw.PatientName) ?? str(raw.name) ?? 'Unknown',
    species: str(raw.Species) ?? str(raw.species),
    diagnosisCode: str(raw.DiagnosisCode) ?? str(raw.icd),
    treatmentDate: str(raw.ServiceDate) ?? str(raw.treatmentDate),
    veterinarianId: str(raw.ProviderID) ?? str(raw.clinicianId),
    raw,
  };
}
