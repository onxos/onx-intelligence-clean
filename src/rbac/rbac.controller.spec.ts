import { Test, TestingModule } from '@nestjs/testing';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RbacGuard } from './rbac.guard';
import { Permission } from './permissions.enum';
import { Role } from './roles.config';

describe('RbacController', () => {
  let controller: RbacController;

  const mockRbacService = {
    getAllRoles: jest.fn().mockReturnValue([{ role: Role.ADMIN, permissions: [] }]),
    suggestRole: jest.fn().mockReturnValue([{ role: Role.VETERINARIAN, confidence: 0.95, reason: '' }]),
    assignRole: jest.fn().mockResolvedValue(undefined),
    getWorkspaceMembers: jest.fn().mockResolvedValue([]),
    removeMember: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RbacController],
      providers: [
        { provide: RbacService, useValue: mockRbacService },
      ],
    }).compile();

    controller = module.get<RbacController>(RbacController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /rbac/roles', () => {
    it('should return all roles', () => {
      const result = controller.getAllRoles();
      expect(result).toHaveLength(1);
      expect(mockRbacService.getAllRoles).toHaveBeenCalled();
    });
  });

  describe('GET /rbac/roles/suggest', () => {
    it('should suggest role for job function', () => {
      const result = controller.suggestRole('veterinarian');
      expect(result[0].role).toBe(Role.VETERINARIAN);
    });
  });
});
