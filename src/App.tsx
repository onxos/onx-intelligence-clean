import { Routes, Route } from 'react-router'
import Dashboard from './pages/Dashboard'
import Ask from './pages/Ask'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/ask" element={<Ask />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
