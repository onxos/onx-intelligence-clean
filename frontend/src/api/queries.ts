import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const WS = 'ws_1'; // TODO: from user context

// ===== Dashboard =====
export const useKpi = () => useQuery({ queryKey: ['kpi'], queryFn: () => api(`/dashboard/kpi?workspaceId=${WS}`) });
export const useRevenue = (months = 12) => useQuery({ queryKey: ['revenue', months], queryFn: () => api(`/dashboard/revenue?workspaceId=${WS}&months=${months}`) });
export const useApptStats = () => useQuery({ queryKey: ['apptStats'], queryFn: () => api(`/dashboard/appointments?workspaceId=${WS}`) });
export const usePatientStats = () => useQuery({ queryKey: ['patientStats'], queryFn: () => api(`/dashboard/patients?workspaceId=${WS}`) });

// ===== Patients =====
export const usePatients = () => useQuery({ queryKey: ['patients'], queryFn: () => api(`/patients?workspaceId=${WS}`) });
export const usePatient = (id: string) => useQuery({ queryKey: ['patient', id], queryFn: () => api(`/patients/${id}?workspaceId=${WS}`), enabled: !!id });
export const useCreatePatient = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => api('/patients', { method: 'POST', body: JSON.stringify({ ...data, workspaceId: WS }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }) });
};

// ===== Appointments =====
export const useAppointments = () => useQuery({ queryKey: ['appointments'], queryFn: () => api(`/appointments?workspaceId=${WS}`) });

// ===== Medical Records =====
export const useMedicalRecords = () => useQuery({ queryKey: ['medicalRecords'], queryFn: () => api(`/medical-records?workspaceId=${WS}`) });

// ===== Prescriptions =====
export const usePrescriptions = () => useQuery({ queryKey: ['prescriptions'], queryFn: () => api(`/prescriptions?workspaceId=${WS}`) });

// ===== Lab Results =====
export const useLabResults = () => useQuery({ queryKey: ['labResults'], queryFn: () => api(`/lab-results?workspaceId=${WS}`) });

// ===== Billing =====
export const useInvoices = () => useQuery({ queryKey: ['invoices'], queryFn: () => api(`/invoices?workspaceId=${WS}`) });

// ===== Inventory =====
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api(`/products?workspaceId=${WS}`) });
