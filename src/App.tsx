import { Routes, Route, useLocation } from 'react-router'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import DashboardV2 from './pages/DashboardV2'
import Ask from './pages/Ask'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import Clinic from "./pages/Clinic"
import EvidenceRegistry from "./pages/EvidenceRegistry"
import Revenue from "./pages/Revenue"
import Geo from "./pages/Geo"
import Knowledge from "./pages/Knowledge"
import Consciousness from "./pages/Consciousness"
import ConstitutionalDashboard from "./pages/ConstitutionalDashboard"
import Navigation from "./components/Navigation"

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const hideNav = location.pathname === '/login'
  return (
    <>
      {!hideNav && <Navigation />}
      {children}
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><Landing /></Layout>} />
      <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
      <Route path="/v2" element={<Layout><DashboardV2 /></Layout>} />
      <Route path="/ask" element={<Layout><Ask /></Layout>} />
      <Route path="/clinic" element={<Layout><Clinic /></Layout>} />
      <Route path="/evidence" element={<Layout><EvidenceRegistry /></Layout>} />
      <Route path="/revenue" element={<Layout><Revenue /></Layout>} />
      <Route path="/geo" element={<Layout><Geo /></Layout>} />
      <Route path="/knowledge" element={<Layout><Knowledge /></Layout>} />
      <Route path="/consciousness" element={<Layout><Consciousness /></Layout>} />
      <Route path="/constitution" element={<Layout><ConstitutionalDashboard /></Layout>} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Layout><NotFound /></Layout>} />
    </Routes>
  )
}
