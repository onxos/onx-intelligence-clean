import { Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Ask } from "./pages/Ask";
import { DashboardV2 } from "./pages/DashboardV2";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ask" element={<Ask />} />
      <Route path="/dashboard" element={<DashboardV2 />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
