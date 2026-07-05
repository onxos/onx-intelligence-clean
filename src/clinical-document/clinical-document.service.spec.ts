import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalDocumentService } from './clinical-document.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ClinicalDocumentService', () => {
  let service: ClinicalDocumentService;
  let prisma: any;

  const mockDoc = {
    id: 'doc_1',
    patientId: 'pat_1',
    medicalRecordId: 'mr_1',
    title: 'X-Ray Left Hind',
    documentType: 'X_RAY',
    fileUrl: 'https://storage.onx.dev/xray-001.jpg',
    fileSize: 2048000,
    mimeType: 'image/jpeg',
    description: 'X-ray showing hock joint',
    uploadedBy: 'Dr. Smith',
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'pat_1', name: 'Buddy', species: 'Dog' },
    medicalRecord: { id: 'mr_1', chiefComplaint: 'Limping' },
  };

  beforeEach(async () => {
    prisma = {
      clinicalDocument: {
        create: jest.fn().mockResolvedValue(mockDoc),
        findMany: jest.fn().mockResolvedValue([mockDoc]),
        findFirst: jest.fn().mockResolvedValue(mockDoc),
        update: jest.fn().mockResolvedValue(mockDoc),
        delete: jest.fn().mockResolvedValue(mockDoc),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalDocumentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ClinicalDocumentService>(ClinicalDocumentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a clinical document', async () => {
      const result = await service.create({
        title: 'X-Ray',
        fileUrl: 'https://storage.onx.dev/xray.jpg',
        uploadedBy: 'Dr. Smith',
        patient: { connect: { id: 'pat_1' } },
        workspaceId: 'ws_1',
      } as any);
      expect(result).toEqual(mockDoc);
    });
  });

  describe('findAll', () => {
    it('should return all documents', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockDoc]);
    });
  });

  describe('findOne', () => {
    it('should return a document', async () => {
      const result = await service.findOne('doc_1', 'ws_1');
      expect(result).toEqual(mockDoc);
    });

    it('should throw NotFoundException', async () => {
      prisma.clinicalDocument.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('doc_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPatient', () => {
    it('should return documents for patient', async () => {
      const result = await service.findByPatient('pat_1', 'ws_1');
      expect(result).toEqual([mockDoc]);
    });
  });

  describe('findByMedicalRecord', () => {
    it('should return documents for medical record', async () => {
      const result = await service.findByMedicalRecord('mr_1', 'ws_1');
      expect(result).toEqual([mockDoc]);
    });
  });

  describe('findByType', () => {
    it('should filter by document type', async () => {
      const result = await service.findByType('ws_1', 'X_RAY');
      expect(result).toEqual([mockDoc]);
    });
  });

  describe('update', () => {
    it('should update a document', async () => {
      const result = await service.update('doc_1', 'ws_1', { title: 'Updated' });
      expect(result).toEqual(mockDoc);
    });
  });

  describe('remove', () => {
    it('should delete a document', async () => {
      const result = await service.remove('doc_1', 'ws_1');
      expect(result).toEqual(mockDoc);
    });
  });
});
