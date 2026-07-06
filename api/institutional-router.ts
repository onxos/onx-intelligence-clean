// ============================================================
// INSTITUTIONAL INTELLIGENCE — Day 6: Core Domain Skill
// Multi-tenant institutional management + federation
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

interface Institution {
  id: string;
  name: string;
  nameAr: string;
  type: "VETERINARY" | "RESEARCH" | "EDUCATIONAL" | "COMMERCIAL" | "GOVERNMENT" | "NONPROFIT";
  status: "ACTIVE" | "SUSPENDED" | "PENDING";
  ownerId: string;
  members: Array<{ userId: string; role: string; joinedAt: Date }>;
  permissions: string[];
  createdAt: Date;
  settings: Record<string, string>;
}

// --- Store ---
const institutions: Map<string, Institution> = new Map();

export const institutionalRouter = createRouter({
  // II-01: create — New institution
  create: publicQuery
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().min(1),
      type: z.enum(["VETERINARY", "RESEARCH", "EDUCATIONAL", "COMMERCIAL", "GOVERNMENT", "NONPROFIT"]),
      ownerId: z.string(),
      settings: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(({ input }) => {
      const id = `inst_${Date.now()}`;
      const inst: Institution = {
        id,
        name: input.name,
        nameAr: input.nameAr,
        type: input.type,
        status: "ACTIVE",
        ownerId: input.ownerId,
        members: [{ userId: input.ownerId, role: "founder", joinedAt: new Date() }],
        permissions: ["read", "write", "admin"],
        createdAt: new Date(),
        settings: (input.settings || {}) as Record<string, string>,
      };
      institutions.set(id, inst);
      return { created: true, id, name: input.nameAr };
    }),

  // II-02: get — Institution details
  get: publicQuery
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const inst = institutions.get(input.id);
      if (!inst) throw new Error("INSTITUTION_NOT_FOUND");
      return {
        id: inst.id,
        name: inst.name,
        nameAr: inst.nameAr,
        type: inst.type,
        status: inst.status,
        ownerId: inst.ownerId,
        memberCount: inst.members.length,
        permissions: inst.permissions,
        createdAt: inst.createdAt,
      };
    }),

  // II-03: list — All institutions
  list: publicQuery
    .input(z.object({
      type: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(({ input }) => {
      let list = Array.from(institutions.values());
      if (input?.type) list = list.filter((i) => i.type === input.type);
      if (input?.status) list = list.filter((i) => i.status === input.status);
      return list.map((i) => ({
        id: i.id,
        name: i.name,
        nameAr: i.nameAr,
        type: i.type,
        status: i.status,
        memberCount: i.members.length,
      }));
    }),

  // II-04: addMember — Add member
  addMember: publicQuery
    .input(z.object({
      institutionId: z.string(),
      userId: z.string(),
      role: z.enum(["admin", "operator", "user", "viewer"]),
    }))
    .mutation(({ input }) => {
      const inst = institutions.get(input.institutionId);
      if (!inst) throw new Error("INSTITUTION_NOT_FOUND");
      inst.members.push({ userId: input.userId, role: input.role, joinedAt: new Date() });
      return { added: true, institutionId: input.institutionId, userId: input.userId, role: input.role };
    }),

  // II-05: removeMember — Remove member
  removeMember: publicQuery
    .input(z.object({
      institutionId: z.string(),
      userId: z.string(),
    }))
    .mutation(({ input }) => {
      const inst = institutions.get(input.institutionId);
      if (!inst) throw new Error("INSTITUTION_NOT_FOUND");
      inst.members = inst.members.filter((m) => m.userId !== input.userId);
      return { removed: true };
    }),

  // II-06: updateStatus — Update status
  updateStatus: publicQuery
    .input(z.object({
      id: z.string(),
      status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]),
    }))
    .mutation(({ input }) => {
      const inst = institutions.get(input.id);
      if (!inst) throw new Error("INSTITUTION_NOT_FOUND");
      inst.status = input.status;
      return { updated: true, id: input.id, status: input.status };
    }),

  // II-07: stats — Institutional stats
  stats: publicQuery.query(() => {
    const list = Array.from(institutions.values());
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const i of list) {
      byType[i.type] = (byType[i.type] || 0) + 1;
      byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    }
    return {
      total: list.length,
      byType,
      byStatus,
      totalMembers: list.reduce((s, i) => s + i.members.length, 0),
    };
  }),
});
