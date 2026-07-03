import { Test, TestingModule } from '@nestjs/testing';
import { AiAgentService } from './ai-agent.service';
import { PrismaService } from '../common/prisma.service';
import { AiRouterService } from '../ai-core/ai-router.service';
import { CommandParser } from './command.parser';
import { ReportCommandHandler } from './handlers/report.handler';
import { ReminderCommandHandler } from './handlers/reminder.handler';
import { RbacCommandHandler } from './handlers/rbac.handler';
import { AnalyticsCommandHandler } from './handlers/analytics.handler';

describe('AiAgentService', () => {
  let service: AiAgentService;

  const mockPrisma = { agentLog: { findMany: jest.fn() }, report: { count: jest.fn(), create: jest.fn() }, reminder: { count: jest.fn(), create: jest.fn() }, intelligenceObject: { count: jest.fn() } };
  const mockRouter = { route: jest.fn().mockResolvedValue({ content: 'test' }) };
  const mockParser = { parse: jest.fn() };
  const mockReportHandler = { handle: jest.fn() };
  const mockReminderHandler = { handle: jest.fn() };
  const mockRbacHandler = { handle: jest.fn() };
  const mockAnalyticsHandler = { handle: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiRouterService, useValue: mockRouter },
        { provide: CommandParser, useValue: mockParser },
        { provide: ReportCommandHandler, useValue: mockReportHandler },
        { provide: ReminderCommandHandler, useValue: mockReminderHandler },
        { provide: RbacCommandHandler, useValue: mockRbacHandler },
        { provide: AnalyticsCommandHandler, useValue: mockAnalyticsHandler },
      ],
    }).compile();

    service = module.get<AiAgentService>(AiAgentService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
