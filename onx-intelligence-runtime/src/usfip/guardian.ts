import { GuardianDecision } from '../types';

export interface GuardianConfig {
  constraints: string[];
  version: string;
  families: string[];
}

export class Guardian {
  private config: GuardianConfig;
  private decisions: GuardianDecision[] = [];

  constructor(config: GuardianConfig) {
    this.config = config;
  }

  async check(context: {
    intent: string;
    [key: string]: any;
  }): Promise<GuardianDecision> {
    // Amanah floor check
    const amanahScore = context.amanahScore || 0.5;
    const approved = amanahScore >= 0.5;

    const decision: GuardianDecision = {
      allowed: approved,
      reason: approved ? 'Amanah floor satisfied' : 'Amanah floor breached',
      score: amanahScore,
      principlesUpheld: approved ? ['Amanah', 'Adl'] : [],
      principlesViolated: approved ? [] : ['Amanah'],
    };

    this.decisions.push(decision);
    return decision;
  }

  async verifySkill(skillId: string): Promise<GuardianDecision> {
    return this.check({ intent: 'verify_skill', skillId });
  }

  getDecisions(): GuardianDecision[] {
    return this.decisions;
  }

  getStats(): { total: number; allowed: number; blocked: number } {
    return {
      total: this.decisions.length,
      allowed: this.decisions.filter(d => d.allowed).length,
      blocked: this.decisions.filter(d => !d.allowed).length,
    };
  }
}
