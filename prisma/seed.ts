import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'Administrator with full access' },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: { name: 'USER', description: 'Standard user access' },
  });

  // Seed tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'tnt_onx001' },
    update: {},
    create: { id: 'tnt_onx001', name: 'ONX Founding Tenant' },
  });

  // Seed workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: 'ws_alpha001' },
    update: {},
    create: {
      id: 'ws_alpha001',
      name: 'Founder Alpha Workspace',
      description: 'Primary workspace for ONX Intelligence',
    },
  });

  // Seed permissions
  const permissions = [
    { resource: 'intelligence', action: 'create' },
    { resource: 'intelligence', action: 'read' },
    { resource: 'intelligence', action: 'update' },
    { resource: 'intelligence', action: 'delete' },
    { resource: 'provider', action: 'evaluate' },
    { resource: 'governance', action: 'decide' },
    { resource: 'evidence', action: 'create' },
    { resource: 'evidence', action: 'read' },
    { resource: 'user', action: 'manage' },
    { resource: 'admin', action: 'full' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { resource_action: perm },
      update: {},
      create: perm,
    });
  }

  // Link permissions to ADMIN role
  const allPerms = await prisma.permission.findMany();
  await prisma.role.update({
    where: { id: adminRole.id },
    data: { permissions: { connect: allPerms.map((p) => ({ id: p.id })) } },
  });

  // Seed provider profiles
  const providers = [
    {
      providerId: 'openai',
      providerName: 'OpenAI',
      status: 'ACTIVE' as const,
      priority: 1,
      domainFitness: 90, riskFitness: 95, historicalPerformance: 99,
      evidenceQuality: 95, judgmentQuality: 90, hallucinationResistance: 85,
      governanceCompliance: 100, costEfficiency: 50, latency: 55,
      reliability: 99, outcomeSuccess: 94, ownershipCompatibility: 95,
      iseScore: 88.48, totalCapital: 90.34,
      models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      costPer1kTokens: 0.005, latencyMs: 450, successRate: 0.99,
      workspaceId: workspace.id,
    },
    {
      providerId: 'openai_fallback',
      providerName: 'OpenAI Fallback Pool',
      status: 'ACTIVE' as const,
      priority: 2,
      domainFitness: 95, riskFitness: 97, historicalPerformance: 99.5,
      evidenceQuality: 97, judgmentQuality: 92, hallucinationResistance: 90,
      governanceCompliance: 100, costEfficiency: 95, latency: 70,
      reliability: 99.5, outcomeSuccess: 96, ownershipCompatibility: 90,
      iseScore: 84.8, totalCapital: 87.28,
      models: ['gpt-4o-mini'],
      costPer1kTokens: 0.0006, latencyMs: 300, successRate: 0.995,
      workspaceId: workspace.id,
    },
    {
      providerId: 'qwen',
      providerName: 'Qwen',
      status: 'EXPERIMENTAL' as const,
      priority: 3,
      domainFitness: 88, riskFitness: 90, historicalPerformance: 97,
      evidenceQuality: 92, judgmentQuality: 85, hallucinationResistance: 80,
      governanceCompliance: 100, costEfficiency: 85, latency: 62,
      reliability: 97, outcomeSuccess: 92, ownershipCompatibility: 88,
      iseScore: 89.2, totalCapital: 89.69,
      models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      costPer1kTokens: 0.001, latencyMs: 380, successRate: 0.97,
      workspaceId: workspace.id,
    },
  ];

  for (const p of providers) {
    await prisma.providerProfile.upsert({
      where: { providerId: p.providerId },
      update: {},
      create: p,
    });
  }

  // Seed tool profiles
  const tools = [
    { toolId: 'analytics_dashboard', toolName: 'Analytics Dashboard', category: 'ANALYTICS' as const, capabilities: ['metrics_collection', 'reporting', 'alerting'], costPerCall: 0.01, totalCapital: 87, workspaceId: workspace.id },
    { toolId: 'automation_engine', toolName: 'Automation Engine', category: 'AUTOMATION' as const, capabilities: ['workflow_orchestration', 'task_scheduling'], costPerCall: 0.02, totalCapital: 85, workspaceId: workspace.id },
    { toolId: 'communication_hub', toolName: 'Communication Hub', category: 'COMMUNICATION' as const, capabilities: ['messaging', 'notification', 'collaboration'], costPerCall: 0.005, totalCapital: 86, workspaceId: workspace.id },
    { toolId: 'knowledge_base', toolName: 'Knowledge Base', category: 'KNOWLEDGE' as const, capabilities: ['document_store', 'semantic_query'], costPerCall: 0.005, totalCapital: 90, workspaceId: workspace.id },
    { toolId: 'search_system', toolName: 'Search System', category: 'SEARCH' as const, capabilities: ['web_search', 'semantic_search'], costPerCall: 0.01, totalCapital: 87, workspaceId: workspace.id },
    { toolId: 'runway_media', toolName: 'Runway Media', category: 'MEDIA' as const, capabilities: ['video_generation', 'image_editing'], costPerCall: 0.05, totalCapital: 82, workspaceId: workspace.id },
  ];

  for (const t of tools) {
    await prisma.toolProfile.upsert({
      where: { toolId: t.toolId },
      update: {},
      create: t,
    });
  }

  console.log('Seed complete:');
  console.log(`  Roles: ${(await prisma.role.count())}`);
  console.log(`  Tenants: ${(await prisma.tenant.count())}`);
  console.log(`  Workspaces: ${(await prisma.workspace.count())}`);
  console.log(`  Providers: ${(await prisma.providerProfile.count())}`);
  console.log(`  Tools: ${(await prisma.toolProfile.count())}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
