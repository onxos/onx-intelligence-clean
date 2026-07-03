import { Test, TestingModule } from '@nestjs/testing';
import { RbacService } from './rbac.service';
import { PrismaService } from '../common/prisma.service';
import { Permission } from './permissions.enum';
import { Role } from './roles.config';

describe('RbacService', () => {
  let service: RbacService;
  let prisma: PrismaService;

  const mockPrisma = {
    workspaceMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllRoles', () => {
    it('should return all 6 roles', () => {
      const roles = service.getAllRoles();
      expect(roles).toHaveLength(6);
      expect(roles.map(r => r.role)).toContain(Role.FOUNDER);
      expect(roles.map(r => r.role)).toContain(Role.ADMIN);
      expect(roles.map(r => r.role)).toContain(Role.VETERINARIAN);
    });
  });

  describe('suggestRole', () => {
    it('should suggest VETERINARIAN for "veterinarian"', () => {
      const result = service.suggestRole('veterinarian');
      expect(result[0].role).toBe(Role.VETERINARIAN);
      expect(result[0].confidence).toBeGreaterThan(0.9);
    });

    it('should suggest RECEPTIONIST for "receptionist"', () => {
      const result = service.suggestRole('receptionist');
      expect(result[0].role).toBe(Role.RECEPTIONIST);
    });

    it('should default to VIEWER for unknown roles', () => {
      const result = service.suggestRole('xyz_unknown');
      expect(result[0].role).toBe(Role.VIEWER);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for FOUNDER', () => {
      const perms = service.getRolePermissions(Role.FOUNDER);
      expect(perms.length).toBe(Object.values(Permission).length);
    });

    it('should return limited permissions for VIEWER', () => {
      const perms = service.getRolePermissions(Role.VIEWER);
      expect(perms.length).toBeLessThan(10);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({ role: 'ADMIN' });
      const result = await service.hasPermission('user1', Permission.PATIENT_READ, 'ws1');
      expect(result).toBe(true);
    });

    it('should return false when user lacks permission', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
      const result = await service.hasPermission('user1', Permission.PATIENT_DELETE, 'ws1');
      expect(result).toBe(false);
    });

    it('should return false when user not in workspace', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
      const result = await service.hasPermission('user1', Permission.PATIENT_READ, 'ws1');
      expect(result).toBe(false);
    });
  });

  describe('assignRole', () => {
    it('should upsert workspace member', async () => {
      mockPrisma.workspaceMember.upsert.mockResolvedValue({});
      await service.assignRole('user1', 'ws1', Role.VETERINARIAN, 'admin1');
      expect(mockPrisma.workspaceMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_userId: { workspaceId: 'ws1', userId: 'user1' } },
          update: { role: 'VETERINARIAN' },
          create: expect.objectContaining({ role: 'VETERINARIAN' }),
        }),
      );
    });
  });
});
