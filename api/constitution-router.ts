import { Guardian, USFIPv2Engine } from "./lib/runtime-stubs";

// Compatibility entrypoint retained for deployment checks expecting this file path.
export const constitutionRuntimeGuard = {
  guardian: new Guardian(),
  engine: new USFIPv2Engine()
};
