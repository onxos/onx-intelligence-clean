import { EmrService } from './emr.service';
import { parseVetTriage } from './parsers/vettriage.parser';
import { parseKanTime } from './parsers/kantime.parser';

describe('EMR parsers', () => {
  it('parseVetTriage extracts nested fields', () => {
    const p = parseVetTriage({
      id: 'vt-1',
      patient_name: 'Max',
      species: 'canine',
      diagnosis: { code: 'M25.5' },
      treatment: { date: '2026-06-30' },
      vet: { id: 'dvm-14' },
    });
    expect(p).toMatchObject({
      externalId: 'vt-1',
      name: 'Max',
      species: 'canine',
      diagnosisCode: 'M25.5',
      treatmentDate: '2026-06-30',
      veterinarianId: 'dvm-14',
    });
  });

  it('parseVetTriage tolerates missing fields', () => {
    const p = parseVetTriage({ id: 'vt-2' });
    expect(p.externalId).toBe('vt-2');
    expect(p.name).toBe('Unknown');
    expect(p.diagnosisCode).toBeUndefined();
  });

  it('parseKanTime maps flat field names', () => {
    const p = parseKanTime({
      PatientID: 'kt-1',
      PatientName: 'Luna',
      Species: 'feline',
      DiagnosisCode: 'N18.9',
      ServiceDate: '2026-07-01',
      ProviderID: 'dvm-09',
    });
    expect(p).toMatchObject({
      externalId: 'kt-1',
      name: 'Luna',
      diagnosisCode: 'N18.9',
      treatmentDate: '2026-07-01',
      veterinarianId: 'dvm-09',
    });
  });
});

describe('EmrService', () => {
  const makeService = () => {
    const connectors = {
      ingest: jest
        .fn()
        .mockResolvedValue({ logId: 'log-1', status: 'processed', usfipRecordId: 'r-1' }),
      markSync: jest.fn().mockResolvedValue(undefined),
    } as any;
    return { connectors, service: new EmrService(connectors) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('syncs mock records at tier 1 clinical when none supplied', async () => {
    const { service, connectors } = makeService();
    const result = await service.sync('ws-1', {});
    expect(result.ingested).toBe(2);
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: 'emr',
        perception: expect.objectContaining({ domain: 'clinical', tier: 1 }),
      }),
      undefined,
    );
    expect(connectors.markSync).toHaveBeenCalledWith('ws-1', 'emr', 'vettriage');
  });

  it('parses supplied records with the KanTime parser', async () => {
    const { service, connectors } = makeService();
    await service.sync('ws-1', {
      provider: 'kantime',
      records: [{ PatientID: 'kt-9', PatientName: 'Rex' }],
    });
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'kt-9',
        perception: expect.objectContaining({ subject: 'Rex' }),
      }),
      undefined,
    );
  });

  it('ingests every supplied record', async () => {
    const { service, connectors } = makeService();
    await service.sync('ws-1', { records: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    expect(connectors.ingest).toHaveBeenCalledTimes(3);
  });
});
