import type { TrpcContext } from "./context";
import { env } from "./lib/env";

export function assertBridgeAccess(ctx: TrpcContext) {
  if (!env.bridgeEnabled) {
    throw new Error("BRIDGE_DISABLED: Set BRIDGE_ENABLED=true to allow Platform-to-Intelligence bridge traffic");
  }

  if (!env.bridgeSharedSecret) {
    throw new Error("BRIDGE_SECRET_NOT_CONFIGURED: Set BRIDGE_SHARED_SECRET before enabling bridge traffic");
  }

  const key = ctx.req.headers.get("x-onx-bridge-key");
  if (!key || key !== env.bridgeSharedSecret) {
    throw new Error("BRIDGE_UNAUTHORIZED: Missing or invalid x-onx-bridge-key");
  }
}

export function getBridgeState() {
  return {
    enabled: env.bridgeEnabled,
    hasSharedSecret: !!env.bridgeSharedSecret,
  };
}
