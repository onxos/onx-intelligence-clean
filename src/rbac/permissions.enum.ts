/**
 * ONX RBAC — Permission Enum
 * Resource-level permissions for all system resources
 */

export enum Permission {
  // Dashboard
  DASHBOARD_VIEW = 'dashboard:view',
  DASHBOARD_EXPORT = 'dashboard:export',

  // Patients
  PATIENT_READ = 'patient:read',
  PATIENT_CREATE = 'patient:create',
  PATIENT_UPDATE = 'patient:update',
  PATIENT_DELETE = 'patient:delete',
  PATIENT_EXPORT = 'patient:export',

  // Appointments
  APPOINTMENT_READ = 'appointment:read',
  APPOINTMENT_CREATE = 'appointment:create',
  APPOINTMENT_UPDATE = 'appointment:update',
  APPOINTMENT_DELETE = 'appointment:delete',
  APPOINTMENT_BULK = 'appointment:bulk',

  // Prescriptions
  PRESCRIPTION_READ = 'prescription:read',
  PRESCRIPTION_CREATE = 'prescription:create',
  PRESCRIPTION_UPDATE = 'prescription:update',
  PRESCRIPTION_DELETE = 'prescription:delete',

  // Lab Results
  LAB_RESULT_READ = 'lab_result:read',
  LAB_RESULT_CREATE = 'lab_result:create',
  LAB_RESULT_UPDATE = 'lab_result:update',
  LAB_RESULT_DELETE = 'lab_result:delete',

  // Billing
  BILLING_READ = 'billing:read',
  BILLING_CREATE = 'billing:create',
  BILLING_UPDATE = 'billing:update',
  BILLING_DELETE = 'billing:delete',
  BILLING_REFUND = 'billing:refund',
  BILLING_EXPORT = 'billing:export',

  // Medical Records
  MEDICAL_RECORD_READ = 'medical_record:read',
  MEDICAL_RECORD_CREATE = 'medical_record:create',
  MEDICAL_RECORD_UPDATE = 'medical_record:update',
  MEDICAL_RECORD_DELETE = 'medical_record:delete',

  // Vaccinations
  VACCINATION_READ = 'vaccination:read',
  VACCINATION_CREATE = 'vaccination:create',
  VACCINATION_UPDATE = 'vaccination:update',
  VACCINATION_DELETE = 'vaccination:delete',

  // Clinical Documents
  DOCUMENT_READ = 'document:read',
  DOCUMENT_CREATE = 'document:create',
  DOCUMENT_UPDATE = 'document:update',
  DOCUMENT_DELETE = 'document:delete',

  // Inventory
  INVENTORY_READ = 'inventory:read',
  INVENTORY_CREATE = 'inventory:create',
  INVENTORY_UPDATE = 'inventory:update',
  INVENTORY_DELETE = 'inventory:delete',

  // Notifications
  NOTIFICATION_READ = 'notification:read',
  NOTIFICATION_CREATE = 'notification:create',
  NOTIFICATION_UPDATE = 'notification:update',
  NOTIFICATION_DELETE = 'notification:delete',

  // Analytics
  ANALYTICS_READ = 'analytics:read',

  // AI Overlay
  AI_DIAGNOSTIC = 'ai:diagnostic',

  // Connector Management
  CONNECTOR_MANAGE = 'connector:manage',
  CONNECTOR_READ = 'connector:read',

  // AI
  AI_CHAT = 'ai:chat',
  AI_CLINICAL = 'ai:clinical',
  AI_ADMIN = 'ai:admin',
  AI_PROVIDER_MANAGE = 'ai:provider:manage',

  // Constitution
  CONSTITUTION_READ = 'constitution:read',
  CONSTITUTION_ADMIN = 'constitution:admin',

  // Connectors
  CONNECTOR_WHATSAPP = 'connector:whatsapp',
  CONNECTOR_EMR = 'connector:emr',
  CONNECTOR_POS = 'connector:pos',
  CONNECTOR_CALENDAR = 'connector:calendar',

  // Reports
  REPORT_READ = 'report:read',
  REPORT_CREATE = 'report:create',
  REPORT_SCHEDULE = 'report:schedule',
  REPORT_DELETE = 'report:delete',

  // Users
  USER_READ = 'user:read',
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_MANAGE_ROLES = 'user:manage_roles',

  // Workspace
  WORKSPACE_READ = 'workspace:read',
  WORKSPACE_UPDATE = 'workspace:update',
  WORKSPACE_DELETE = 'workspace:delete',

  // Settings
  SETTINGS_READ = 'settings:read',
  SETTINGS_UPDATE = 'settings:update',

  // Atlas V7 — Continuous Evolution
  ATLAS_TITAN_TRAIN = 'atlas:titan:train',
  ATLAS_TITAN_INFER = 'atlas:titan:infer',
  ATLAS_CORPUS_INGEST = 'atlas:corpus:ingest',
  ATLAS_CROSS_DOMAIN_READ = 'atlas:cross_domain:read',
  ATLAS_OPTIMIZER_READ = 'atlas:optimizer:read',
  ATLAS_OPTIMIZER_APPLY = 'atlas:optimizer:apply',
  ATLAS_EVOLUTION_READ = 'atlas:evolution:read',
  ATLAS_EVOLUTION_WRITE = 'atlas:evolution:write',
}
