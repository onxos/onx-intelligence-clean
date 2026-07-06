export class ShadowRuntime {
  constructor(private graph: any, private guardian: any) {}

  async processShadow(object: any): Promise<any> {
    return { ...object, shadowStatus: 'GRADUATED' };
  }
}
