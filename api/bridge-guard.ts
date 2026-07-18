import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import { env } from "./lib/env";

// Fail-closed bridge gate. Rejections throw a TRPCError so that over
// HTTP they surface as honest auth status codes (UNAUTHORIZED → 401,
// FORBIDDEN → 403) instead of masquerading as a 500 server error. The
// message prefixes (BRIDGE_*) are preserved so existing regex-based
// tests and log forensics keep matching.
export function assertBridgeAccess(ctx: TrpcContext) {
  if (!env.bridgeEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "BRIDGE_DISABLED: Set BRIDGE_ENABLED=true to allow Platform-to-Intelligence bridge traffic",
    });
  }

  if (!env.bridgeSharedSecret) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "BRIDGE_SECRET_NOT_CONFIGURED: Set BRIDGE_SHARED_SECRET before enabling bridge traffic",
    });
  }

  const key = ctx.req.headers.get("x-onx-bridge-key");
  if (!key || key !== env.bridgeSharedSecret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "BRIDGE_UNAUTHORIZED: Missing or invalid x-onx-bridge-key",
    });
  }
}

export function getBridgeState() {
  return {
    enabled: env.bridgeEnabled,
    hasSharedSecret: !!env.bridgeSharedSecret,
  };
}
