import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { MedicalRecordsPage } from './pages/MedicalRecordsPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';
import { LabResultsPage } from './pages/LabResultsPage';
import { BillingPage } from './pages/BillingPage';
import { InventoryPage } from './pages/InventoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAuthStore } from './stores/authStore';

function App() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <LoginPage />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/medical-records" element={<MedicalRecordsPage />} />
        <Route path="/prescriptions" element={<PrescriptionsPage />} />
        <Route path="/lab-results" element={<LabResultsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
