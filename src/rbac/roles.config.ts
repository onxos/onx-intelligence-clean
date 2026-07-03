/**
 * ONX RBAC — Role Definitions
 * Pre-configured roles with permission sets
 */

import { Permission } from './permissions.enum';

export enum Role {
  FOUNDER = 'FOUNDER',
  ADMIN = 'ADMIN',
  VETERINARIAN = 'VETERINARIAN',
  TECHNICIAN = 'TECHNICIAN',
  RECEPTIONIST = 'RECEPTIONIST',
  VIEWER = 'VIEWER',
}

export const RolePermissions: Record<Role, Permission[]> = {
  [Role.FOUNDER]: Object.values(Permission),

  [Role.ADMIN]: [
    Permission.DASHBOARD_VIEW, Permission.DASHBOARD_EXPORT,
    Permission.PATIENT_READ, Permission.PATIENT_CREATE, Permission.PATIENT_UPDATE,
    Permission.APPOINTMENT_READ, Permission.APPOINTMENT_CREATE, Permission.APPOINTMENT_UPDATE, Permission.APPOINTMENT_DELETE, Permission.APPOINTMENT_BULK,
    Permission.PRESCRIPTION_READ, Permission.PRESCRIPTION_CREATE, Permission.PRESCRIPTION_UPDATE, Permission.PRESCRIPTION_DELETE,
    Permission.LAB_RESULT_READ, Permission.LAB_RESULT_CREATE, Permission.LAB_RESULT_UPDATE, Permission.LAB_RESULT_DELETE,
    Permission.BILLING_READ, Permission.BILLING_CREATE, Permission.BILLING_UPDATE, Permission.BILLING_REFUND, Permission.BILLING_EXPORT,
    Permission.AI_CHAT, Permission.AI_CLINICAL, Permission.AI_ADMIN, Permission.AI_PROVIDER_MANAGE,
    Permission.CONSTITUTION_READ, Permission.CONSTITUTION_ADMIN,
    Permission.CONNECTOR_WHATSAPP, Permission.CONNECTOR_EMR, Permission.CONNECTOR_POS, Permission.CONNECTOR_CALENDAR,
    Permission.REPORT_READ, Permission.REPORT_CREATE, Permission.REPORT_SCHEDULE, Permission.REPORT_DELETE,
    Permission.USER_READ, Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_DELETE, Permission.USER_MANAGE_ROLES,
    Permission.WORKSPACE_READ, Permission.WORKSPACE_UPDATE,
    Permission.SETTINGS_READ, Permission.SETTINGS_UPDATE,
  ],

  [Role.VETERINARIAN]: [
    Permission.DASHBOARD_VIEW,
    Permission.PATIENT_READ, Permission.PATIENT_CREATE, Permission.PATIENT_UPDATE,
    Permission.APPOINTMENT_READ, Permission.APPOINTMENT_CREATE, Permission.APPOINTMENT_UPDATE,
    Permission.PRESCRIPTION_READ, Permission.PRESCRIPTION_CREATE, Permission.PRESCRIPTION_UPDATE, Permission.PRESCRIPTION_DELETE,
    Permission.LAB_RESULT_READ, Permission.LAB_RESULT_CREATE, Permission.LAB_RESULT_UPDATE,
    Permission.BILLING_READ, Permission.BILLING_CREATE,
    Permission.AI_CHAT, Permission.AI_CLINICAL,
    Permission.CONNECTOR_WHATSAPP, Permission.CONNECTOR_EMR, Permission.CONNECTOR_CALENDAR,
    Permission.REPORT_READ, Permission.REPORT_CREATE,
    Permission.WORKSPACE_READ,
    Permission.SETTINGS_READ,
  ],

  [Role.TECHNICIAN]: [
    Permission.DASHBOARD_VIEW,
    Permission.PATIENT_READ, Permission.PATIENT_UPDATE,
    Permission.APPOINTMENT_READ,
    Permission.LAB_RESULT_READ, Permission.LAB_RESULT_CREATE, Permission.LAB_RESULT_UPDATE,
    Permission.AI_CHAT,
    Permission.WORKSPACE_READ,
    Permission.SETTINGS_READ,
  ],

  [Role.RECEPTIONIST]: [
    Permission.DASHBOARD_VIEW,
    Permission.PATIENT_READ, Permission.PATIENT_CREATE, Permission.PATIENT_UPDATE,
    Permission.APPOINTMENT_READ, Permission.APPOINTMENT_CREATE, Permission.APPOINTMENT_UPDATE, Permission.APPOINTMENT_DELETE, Permission.APPOINTMENT_BULK,
    Permission.BILLING_READ, Permission.BILLING_CREATE,
    Permission.CONNECTOR_WHATSAPP, Permission.CONNECTOR_CALENDAR,
    Permission.REPORT_READ,
    Permission.WORKSPACE_READ,
    Permission.SETTINGS_READ,
  ],

  [Role.VIEWER]: [
    Permission.DASHBOARD_VIEW,
    Permission.PATIENT_READ,
    Permission.APPOINTMENT_READ,
    Permission.REPORT_READ,
    Permission.WORKSPACE_READ,
    Permission.SETTINGS_READ,
  ],
};

/**
 * Permission descriptions for the UI
 */
export const PermissionDescriptions: Record<Permission, string> = {
  [Permission.DASHBOARD_VIEW]: 'View dashboard',
  [Permission.DASHBOARD_EXPORT]: 'Export dashboard data',
  [Permission.PATIENT_READ]: 'View patients',
  [Permission.PATIENT_CREATE]: 'Create patients',
  [Permission.PATIENT_UPDATE]: 'Edit patients',
  [Permission.PATIENT_DELETE]: 'Delete patients',
  [Permission.PATIENT_EXPORT]: 'Export patient data',
  [Permission.APPOINTMENT_READ]: 'View appointments',
  [Permission.APPOINTMENT_CREATE]: 'Create appointments',
  [Permission.APPOINTMENT_UPDATE]: 'Edit appointments',
  [Permission.APPOINTMENT_DELETE]: 'Delete appointments',
  [Permission.APPOINTMENT_BULK]: 'Bulk appointment operations',
  [Permission.PRESCRIPTION_READ]: 'View prescriptions',
  [Permission.PRESCRIPTION_CREATE]: 'Create prescriptions',
  [Permission.PRESCRIPTION_UPDATE]: 'Edit prescriptions',
  [Permission.PRESCRIPTION_DELETE]: 'Delete prescriptions',
  [Permission.LAB_RESULT_READ]: 'View lab results',
  [Permission.LAB_RESULT_CREATE]: 'Create lab results',
  [Permission.LAB_RESULT_UPDATE]: 'Edit lab results',
  [Permission.LAB_RESULT_DELETE]: 'Delete lab results',
  [Permission.BILLING_READ]: 'View billing',
  [Permission.BILLING_CREATE]: 'Create invoices',
  [Permission.BILLING_UPDATE]: 'Edit billing',
  [Permission.BILLING_REFUND]: 'Process refunds',
  [Permission.BILLING_EXPORT]: 'Export billing data',
  [Permission.AI_CHAT]: 'Use AI chat',
  [Permission.AI_CLINICAL]: 'Use clinical AI',
  [Permission.AI_ADMIN]: 'Administer AI settings',
  [Permission.AI_PROVIDER_MANAGE]: 'Manage AI providers',
  [Permission.CONSTITUTION_READ]: 'Read constitution',
  [Permission.CONSTITUTION_ADMIN]: 'Administer constitution',
  [Permission.CONNECTOR_WHATSAPP]: 'Use WhatsApp connector',
  [Permission.CONNECTOR_EMR]: 'Use EMR connector',
  [Permission.CONNECTOR_POS]: 'Use POS connector',
  [Permission.CONNECTOR_CALENDAR]: 'Use Calendar connector',
  [Permission.REPORT_READ]: 'View reports',
  [Permission.REPORT_CREATE]: 'Create reports',
  [Permission.REPORT_SCHEDULE]: 'Schedule reports',
  [Permission.REPORT_DELETE]: 'Delete reports',
  [Permission.USER_READ]: 'View users',
  [Permission.USER_CREATE]: 'Create users',
  [Permission.USER_UPDATE]: 'Edit users',
  [Permission.USER_DELETE]: 'Delete users',
  [Permission.USER_MANAGE_ROLES]: 'Manage user roles',
  [Permission.WORKSPACE_READ]: 'View workspace',
  [Permission.WORKSPACE_UPDATE]: 'Edit workspace',
  [Permission.WORKSPACE_DELETE]: 'Delete workspace',
  [Permission.SETTINGS_READ]: 'View settings',
  [Permission.SETTINGS_UPDATE]: 'Edit settings',
};
