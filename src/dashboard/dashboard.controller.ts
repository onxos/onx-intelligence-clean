import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpi') @RequirePermissions(Permission.ANALYTICS_READ) async getKpi(@Query('workspaceId') w: string) { return this.dashboardService.getKpiSummary(w); }
  @Get('revenue') @RequirePermissions(Permission.ANALYTICS_READ) async getRevenue(@Query('workspaceId') w: string, @Query('months') m: string) { return this.dashboardService.getMonthlyRevenue(w, m ? parseInt(m, 10) : 12); }
  @Get('appointments') @RequirePermissions(Permission.ANALYTICS_READ) async getApptStats(@Query('workspaceId') w: string) { return this.dashboardService.getAppointmentStats(w); }
  @Get('patients') @RequirePermissions(Permission.ANALYTICS_READ) async getPatientStats(@Query('workspaceId') w: string) { return this.dashboardService.getPatientStats(w); }
  @Get('activity') @RequirePermissions(Permission.ANALYTICS_READ) async getActivity(@Query('workspaceId') w: string, @Query('limit') l: string) { return this.dashboardService.getRecentActivity(w, l ? parseInt(l, 10) : 20); }
  @Get('overdue-vaccinations') @RequirePermissions(Permission.ANALYTICS_READ) async getOverdueVax(@Query('workspaceId') w: string) { return this.dashboardService.getOverdueVaccinations(w); }
  @Get('pending-labs') @RequirePermissions(Permission.ANALYTICS_READ) async getPendingLabs(@Query('workspaceId') w: string) { return this.dashboardService.getPendingLabResults(w); }
}
