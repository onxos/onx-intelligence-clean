import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";

/**
 * Ops Router — temporary operational bridge.
 *
 * The founder's automation agent runs from a sandbox whose egress to
 * api.render.com is blocked. Services INSIDE the Render network can reach
 * it fine, so this bridge-secret-authenticated endpoint relays a deploy
 * trigger. The Render API key is supplied per-call (never stored here).
 */
export const opsRouter = createRouter({
  triggerDeploy: protectedQuery
    .input(z.object({
      serviceId: z.string().min(1).max(64),
      renderApiKey: z.string().min(10).max(128),
    }))
    .mutation(async ({ input }) => {
      try {
        const res = await fetch(`https://api.render.com/v1/services/${input.serviceId}/deploys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.renderApiKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: res.ok, status: res.status, deployId: (body as { id?: string }).id ?? null };
      } catch (err) {
        return { ok: false, status: 0, deployId: null, reason: (err as Error).message };
      }
    }),

  deployStatus: protectedQuery
    .input(z.object({
      serviceId: z.string().min(1).max(64),
      renderApiKey: z.string().min(10).max(128),
    }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`https://api.render.com/v1/services/${input.serviceId}/deploys?limit=1`, {
          headers: { Authorization: `Bearer ${input.renderApiKey}` },
        });
        const body = (await res.json().catch(() => [])) as Array<{ deploy?: { id?: string; status?: string; commit?: { id?: string } } }>;
        const d = body?.[0]?.deploy;
        return { ok: res.ok, status: res.status, deployId: d?.id ?? null, deployStatus: d?.status ?? null, commit: d?.commit?.id ?? null };
      } catch (err) {
        return { ok: false, status: 0, deployId: null, deployStatus: null, commit: null, reason: (err as Error).message };
      }
    }),

  deployLog: protectedQuery
    .input(z.object({
      serviceId: z.string().min(1).max(64),
      deployId: z.string().min(1).max(64),
      renderApiKey: z.string().min(10).max(128),
    }))
    .query(async ({ input }) => {
      const headers = { Authorization: `Bearer ${input.renderApiKey}` };
      try {
        const svcRes = await fetch(`https://api.render.com/v1/services/${input.serviceId}`, { headers });
        const svc = (await svcRes.json().catch(() => ({}))) as Record<string, unknown>;
        const ownerId = (svc as { ownerId?: string }).ownerId
          ?? ((svc as { service?: { ownerId?: string } }).service?.ownerId)
          ?? null;

        const depRes = await fetch(`https://api.render.com/v1/services/${input.serviceId}/deploys/${input.deployId}`, { headers });
        const dep = (await depRes.json().catch(() => ({}))) as Record<string, unknown>;

        let logLines: string[] = [];
        if (ownerId) {
          const logsRes = await fetch(
            `https://api.render.com/v1/logs?ownerId=${ownerId}&resource=${input.serviceId}&limit=300&direction=backward`,
            { headers },
          );
          const logs = (await logsRes.json().catch(() => ({}))) as { logs?: Array<{ message?: string }> };
          logLines = (logs.logs ?? []).map((l) => l.message ?? "").filter(Boolean).slice(0, 300);
        }
        return { ok: true, ownerId, deploy: dep, logLines };
      } catch (err) {
        return { ok: false, ownerId: null, deploy: null, logLines: [], reason: (err as Error).message };
      }
    }),

  setEnvVar: protectedQuery
    .input(z.object({
      serviceId: z.string().min(1).max(64),
      renderApiKey: z.string().min(10).max(128),
      key: z.string().min(1).max(64),
      value: z.string().min(1).max(4000),
    }))
    .mutation(async ({ input }) => {
      try {
        const res = await fetch(`https://api.render.com/v1/services/${input.serviceId}/env-vars/${input.key}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${input.renderApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ value: input.value }),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, status: 0, reason: (err as Error).message };
      }
    }),
});
