import { Test, TestingModule } from '@nestjs/testing';
import { PluginRegistryService } from './plugin-registry.service';
import { PrismaService } from '../common/prisma.service';
import { PluginManifest } from './plugin.interface';

describe('PluginRegistryService', () => {
  let service: PluginRegistryService;

  const mockPrisma = {
    plugin: {
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginRegistryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PluginRegistryService>(PluginRegistryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should store plugin in database', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        type: 'TOOL',
        author: 'ONX',
        description: 'Test',
        requiredEnvVars: [],
        configSchema: [],
        permissions: [],
        entryPoint: './test',
      };

      mockPrisma.plugin.upsert.mockResolvedValue({ id: 'test-plugin' });
      await service.register(manifest);
      expect(mockPrisma.plugin.upsert).toHaveBeenCalled();
    });
  });
});
