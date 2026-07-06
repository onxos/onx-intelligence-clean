import { Routes, Route } from 'react-router'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import DashboardV2 from './pages/DashboardV2'
import Ask from './pages/Ask'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/v2" element={<DashboardV2 />} />
      <Route path="/ask" element={<Ask />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
