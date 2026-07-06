export class SilRegistry {
  private domains: string[] = [];

  registerDomain(domain: string): void {
    this.domains.push(domain);
  }

  getDomains(): string[] {
    return this.domains;
  }
}
