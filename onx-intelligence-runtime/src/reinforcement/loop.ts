export class ReinforcementLoop {
  constructor(private graph: any, private auditor: any) {}

  async reinforce(outcome: any): Promise<any> {
    return { promotions: [], ifcDelta: 0, reinforcesEdges: 0 };
  }
}
