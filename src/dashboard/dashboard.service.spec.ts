import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../common/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      patient: { count: jest.fn().mockResolvedValue(50), groupBy: jest.fn().mockResolvedValue([{ species: 'Dog', _count: { species: 30 } }]) },
      appointment: { count: jest.fn().mockResolvedValue(120), groupBy: jest.fn().mockResolvedValue([{ status: 'COMPLETED', _count: { status: 80 } }]), findMany: jest.fn().mockResolvedValue([]) },
      invoice: { count: jest.fn().mockResolvedValue(5), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }), findMany: jest.fn().mockResolvedValue([]) },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 15000 } }) },
      inventoryTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalCost: 3000 } }) },
      product: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([
          { quantityOnHand: 2, reorderLevel: 10 },
          { quantityOnHand: 2, reorderLevel: 5 },
          { quantityOnHand: 1, reorderLevel: 20 },
          { quantityOnHand: 100, reorderLevel: 10 },
        ]),
      },
      notification: { count: jest.fn().mockResolvedValue(7) },
      labResult: { findMany: jest.fn().mockResolvedValue([]) },
      vaccinationRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({ providers: [DashboardService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  it('should get KPI summary', async () => {
    const r = await service.getKpiSummary('ws_1');
    expect(r).toHaveProperty('totalPatients', 50);
    expect(r).toHaveProperty('overdueInvoices', 5);
    expect(r).toHaveProperty('totalRevenueThisMonth', 15000);
    expect(r).toHaveProperty('lowStockProducts', 3);
    expect(r).toHaveProperty('unreadNotifications', 7);
  });

  it('should get monthly revenue', async () => {
    const r = await service.getMonthlyRevenue('ws_1', 3);
    expect(r).toHaveLength(3);
    expect(r[0]).toHaveProperty('month');
    expect(r[0]).toHaveProperty('revenue', 15000);
    expect(r[0]).toHaveProperty('expenses', 3000);
  });

  it('should get appointment stats', async () => {
    const r = await service.getAppointmentStats('ws_1');
    expect(r).toHaveProperty('total', 120);
    expect(r.byStatus).toHaveLength(1);
  });

  it('should get patient stats', async () => {
    const r = await service.getPatientStats('ws_1');
    expect(r).toHaveProperty('total', 50);
    expect(r.bySpecies[0].species).toBe('Dog');
  });

  it('should get recent activity', async () => {
    const r = await service.getRecentActivity('ws_1', 5);
    expect(r).toHaveProperty('recentAppointments');
    expect(r).toHaveProperty('recentInvoices');
    expect(r).toHaveProperty('recentLabResults');
  });

  it('should get overdue vaccinations', async () => {
    const r = await service.getOverdueVaccinations('ws_1');
    expect(Array.isArray(r)).toBe(true);
  });

  it('should get pending lab results', async () => {
    const r = await service.getPendingLabResults('ws_1');
    expect(Array.isArray(r)).toBe(true);
  });
});
