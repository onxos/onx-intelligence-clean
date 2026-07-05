import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed AI Models
  await prisma.aiModelRegistry.createMany({
    data: [
      {
        provider_name: 'OPENAI',
        model_name: 'gpt-4o',
        model_version: 'latest',
        active: true,
        cost_per_1k_input_usd: 0.005,
        cost_per_1k_output_usd: 0.015,
      },
      {
        provider_name: 'ANTHROPIC',
        model_name: 'claude-sonnet-4',
        model_version: 'latest',
        active: true,
        cost_per_1k_input_usd: 0.003,
        cost_per_1k_output_usd: 0.015,
      },
      {
        provider_name: 'GOOGLE',
        model_name: 'gemini-2.5-pro',
        model_version: 'latest',
        active: true,
        cost_per_1k_input_usd: 0.00125,
        cost_per_1k_output_usd: 0.01,
      },
    ],
    skipDuplicates: true,
  });

  // Seed AI Agents
  await prisma.aiAgentRegistry.createMany({
    data: [
      {
        agent_name: 'ONX_VA',
        description: 'General-purpose ONX assistant',
        enabled: true,
      },
      {
        agent_name: 'MEDICAL_ADVISOR',
        description: 'Veterinary medical diagnosis advisor',
        enabled: true,
      },
      {
        agent_name: 'EXPANSION_ANALYST',
        description: 'Market expansion and feasibility analyst',
        enabled: true,
      },
      {
        agent_name: 'CONSTITUTIONAL_GUARDIAN',
        description: 'Enforces the 7 Constitutional Principles',
        enabled: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log('ONX Intelligence seed complete: models and agents created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
