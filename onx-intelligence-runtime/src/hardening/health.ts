export class HealthMonitor {
  private checks: Array<{ name: string; status: boolean; timestamp: Date }> = [];

  check(): boolean {
    const allHealthy = this.checks.every(c => c.status);
    this.checks.push({
      name: 'system_health',
      status: allHealthy,
      timestamp: new Date(),
    });
    return allHealthy;
  }

  recordCheck(name: string, status: boolean): void {
    this.checks.push({ name, status, timestamp: new Date() });
  }

  getChecks(): Array<{ name: string; status: boolean; timestamp: Date }> {
    return this.checks;
  }
}
