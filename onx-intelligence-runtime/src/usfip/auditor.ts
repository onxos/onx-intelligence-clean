export class Auditor {
  private logs: any[] = [];

  constructor(private capacity: number) {}

  log(event: any): void {
    this.logs.push({ ...event, timestamp: new Date() });
  }

  getLogs(): any[] {
    return this.logs;
  }
}
