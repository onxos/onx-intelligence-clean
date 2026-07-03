export enum Permission {
  WORKSPACE_READ = 'workspace.read',
  WORKSPACE_UPDATE = 'workspace.update',
  WORKSPACE_DELETE = 'workspace.delete',
  WORKSPACE_SETTINGS = 'workspace.settings',

  USER_READ = 'user.read',
  USER_INVITE = 'user.invite',
  USER_UPDATE = 'user.update',
  USER_REMOVE = 'user.remove',
  USER_MANAGE_ROLES = 'user.manage_roles',

  PROJECT_READ = 'project.read',
  PROJECT_CREATE = 'project.create',
  PROJECT_UPDATE = 'project.update',
  PROJECT_DELETE = 'project.delete',

  KNOWLEDGE_READ = 'knowledge.read',
  KNOWLEDGE_CREATE = 'knowledge.create',
  KNOWLEDGE_UPDATE = 'knowledge.update',
  KNOWLEDGE_DELETE = 'knowledge.delete',

  EVIDENCE_READ = 'evidence.read',
  EVIDENCE_CREATE = 'evidence.create',
  EVIDENCE_UPDATE = 'evidence.update',
  EVIDENCE_DELETE = 'evidence.delete',

  AI_QUERY = 'ai.query',
  AI_PROVIDER_MANAGE = 'ai.provider.manage',
  AGENT_READ = 'agent.read',
  AGENT_CREATE = 'agent.create',
  AGENT_UPDATE = 'agent.update',
  AGENT_DELETE = 'agent.delete',

  CAPITAL_READ = 'capital.read',
  CAPITAL_ALLOCATE = 'capital.allocate',
  CAPITAL_APPROVE = 'capital.approve',

  BILLING_READ = 'billing.read',
  BILLING_CREATE = 'billing.create',
  BILLING_UPDATE = 'billing.update',
  BILLING_DELETE = 'billing.delete',
  BILLING_REFUND = 'billing.refund',

  SECURITY_READ = 'security.read',
  SECURITY_AUDIT = 'security.audit',
  SECURITY_POLICY_WRITE = 'security.policy.write',

  AUDIT_READ = 'audit.read',
  COMMIT_READ = 'commit.read',
  COMMIT_CREATE = 'commit.create',

  INTEGRATION_READ = 'integration.read',
  INTEGRATION_WRITE = 'integration.write',

  RUNTIME_READ = 'runtime.read',
  RUNTIME_EXECUTE = 'runtime.execute',

  MEASUREMENT_READ = 'measurement.read',
  MEASUREMENT_WRITE = 'measurement.write',

  ADMIN_PANEL = 'admin.panel',
  SYSTEM_CONFIG_WRITE = 'system.config.write',
}
