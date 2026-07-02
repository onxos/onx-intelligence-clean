import { Injectable } from '@nestjs/common';
import { ConnectorsService } from '../connectors.service';
import { EMR_DOMAIN, EMR_MOCK_RECORDS, EMR_TIER } from './emr.constants';
import { parseVetTriage } from './parsers/vettriage.parser';
import { parseKanTime } from './parsers/kantime.parser';
import type { JsonRecord, ParsedPatient } from '../connectors.types';
import type { SyncConnectorDto } from '../dto/connector.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const REQUESTER = 'system-emr';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Generic HL7 FHIR-ish fallback parser. */
function parseFhir(raw: JsonRecord): ParsedPatient {
  const name = Array.isArray(raw.name) ? (raw.name[0] as JsonRecord) : undefined;
  return {
    externalId: str(raw.id) ?? 'unknown',
    name: str(name?.text) ?? str(raw.name) ?? 'Unknown',
    species: str(raw.species),
    diagnosisCode: undefined,
    treatmentDate: str(raw.date),
    veterinarianId: undefined,
    raw,
  };
}

@Injectable()
export class EmrService {
  constructor(private readonly connectors: ConnectorsService) {}

  private parse(provider: string, raw: JsonRecord): ParsedPatient {
    switch (provider) {
      case 'kantime':
        return parseKanTime(raw);
      case 'fhir':
        return parseFhir(raw);
      case 'vettriage':
      default:
        return parseVetTriage(raw);
    }
  }

  /**
   * Pull patient records from the EMR and route each into the USFIP bus at
   * tier 1 (Elite Vet operational data). When no live records are supplied the
   * built-in mock roster is used so the pipeline is exercisable end-to-end.
   *
   * TODO(emr): replace the mock source with an authenticated VetTriage/KanTime
   * REST fetch driven by the stored connector credentials.
   */
  async sync(workspaceId: string, dto: SyncConnectorDto, ctx?: MutationAuditContext) {
    const provider = (dto.provider ?? 'vettriage').toLowerCase();
    const records = dto.records?.length ? dto.records : EMR_MOCK_RECORDS;

    const results = [];
    for (const raw of records) {
      const patient = this.parse(provider, raw as JsonRecord);
      const result = await this.connectors.ingest(
        {
          workspaceId,
          connector: 'emr',
          provider,
          eventType: 'sync',
          externalId: patient.externalId,
          requesterId: REQUESTER,
          perception: {
            sourceId: patient.externalId,
            domain: EMR_DOMAIN,
            tier: EMR_TIER,
            subject: patient.name,
            summary: patient.diagnosisCode
              ? `${patient.name}: ${patient.diagnosisCode}`
              : patient.name,
            payload: {
              ...patient.raw,
              parsed: {
                externalId: patient.externalId,
                name: patient.name,
                species: patient.species,
                diagnosisCode: patient.diagnosisCode,
                treatmentDate: patient.treatmentDate,
                veterinarianId: patient.veterinarianId,
              },
            } as JsonRecord,
          },
        },
        ctx,
      );
      results.push({ externalId: patient.externalId, ...result });
    }

    await this.connectors.markSync(workspaceId, 'emr', provider);
    return { connector: 'emr', provider, ingested: results.length, results };
  }
}
