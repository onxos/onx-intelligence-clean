import { Permission } from './permissions.enum';

export enum WorkspaceRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  ANALYST = 'ANALYST',
  CONTRIBUTOR = 'CONTRIBUTOR',
  VIEWER = 'VIEWER',
}

export const ROLE_ORDER: WorkspaceRole[] = [
  WorkspaceRole.OWNER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.MANAGER,
  WorkspaceRole.ANALYST,
  WorkspaceRole.CONTRIBUTOR,
  WorkspaceRole.VIEWER,
];

const ALL_PERMISSIONS = Object.values(Permission);

export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  [WorkspaceRole.OWNER]: [...ALL_PERMISSIONS],
  [WorkspaceRole.ADMIN]: ALL_PERMISSIONS.filter(
    (p) => p !== Permission.SYSTEM_CONFIG_WRITE,
  ),
  [WorkspaceRole.MANAGER]: [
    Permission.WORKSPACE_READ,
    Permission.WORKSPACE_UPDATE,
    Permission.WORKSPACE_SETTINGS,
    Permission.USER_READ,
    Permission.USER_INVITE,
    Permission.USER_UPDATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.KNOWLEDGE_READ,
    Permission.KNOWLEDGE_CREATE,
    Permission.KNOWLEDGE_UPDATE,
    Permission.EVIDENCE_READ,
    Permission.EVIDENCE_CREATE,
    Permission.EVIDENCE_UPDATE,
    Permission.AI_QUERY,
    Permission.AGENT_READ,
    Permission.AGENT_CREATE,
    Permission.AGENT_UPDATE,
    Permission.CAPITAL_READ,
    Permission.SECURITY_READ,
    Permission.AUDIT_READ,
    Permission.COMMIT_READ,
    Permission.COMMIT_CREATE,
    Permission.INTEGRATION_READ,
    Permission.RUNTIME_READ,
    Permission.RUNTIME_EXECUTE,
    Permission.MEASUREMENT_READ,
    Permission.MEASUREMENT_WRITE,
  ],
  [WorkspaceRole.ANALYST]: [
    Permission.WORKSPACE_READ,
    Permission.USER_READ,
    Permission.PROJECT_READ,
    Permission.KNOWLEDGE_READ,
    Permission.KNOWLEDGE_CREATE,
    Permission.EVIDENCE_READ,
    Permission.EVIDENCE_CREATE,
    Permission.AI_QUERY,
    Permission.AGENT_READ,
    Permission.CAPITAL_READ,
    Permission.SECURITY_READ,
    Permission.AUDIT_READ,
    Permission.COMMIT_READ,
    Permission.INTEGRATION_READ,
    Permission.RUNTIME_READ,
    Permission.MEASUREMENT_READ,
  ],
  [WorkspaceRole.CONTRIBUTOR]: [
    Permission.WORKSPACE_READ,
    Permission.PROJECT_READ,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.KNOWLEDGE_READ,
    Permission.KNOWLEDGE_CREATE,
    Permission.KNOWLEDGE_UPDATE,
    Permission.EVIDENCE_READ,
    Permission.EVIDENCE_CREATE,
    Permission.EVIDENCE_UPDATE,
    Permission.AI_QUERY,
    Permission.AGENT_READ,
    Permission.COMMIT_READ,
    Permission.COMMIT_CREATE,
    Permission.RUNTIME_READ,
    Permission.RUNTIME_EXECUTE,
    Permission.MEASUREMENT_READ,
  ],
  [WorkspaceRole.VIEWER]: [
    Permission.WORKSPACE_READ,
    Permission.USER_READ,
    Permission.PROJECT_READ,
    Permission.KNOWLEDGE_READ,
    Permission.EVIDENCE_READ,
    Permission.AGENT_READ,
    Permission.CAPITAL_READ,
    Permission.SECURITY_READ,
    Permission.AUDIT_READ,
    Permission.COMMIT_READ,
    Permission.INTEGRATION_READ,
    Permission.RUNTIME_READ,
    Permission.MEASUREMENT_READ,
  ],
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  [WorkspaceRole.OWNER]: 'Workspace Owner',
  [WorkspaceRole.ADMIN]: 'Workspace Administrator',
  [WorkspaceRole.MANAGER]: 'Team Manager',
  [WorkspaceRole.ANALYST]: 'Intelligence Analyst',
  [WorkspaceRole.CONTRIBUTOR]: 'Contributor',
  [WorkspaceRole.VIEWER]: 'Viewer',
};

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (Object.values(WorkspaceRole) as string[]).includes(value);
}
