import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  Brain,
  LayoutDashboard,
  MessageSquare,
  Menu,
  X,
  ChevronLeft,
  Zap,
} from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "الرئيسية", labelEn: "Home" },
  { href: "/v2", label: "مركز القيادة", labelEn: "Command Center" },
  { href: "/ask", label: "اسأل الأبطال", labelEn: "Ask Titans" },
  { href: "/clinic", label: "العيادة الذكية", labelEn: "Smart Clinic" },
  { href: "/revenue", label: "الإيرادات", labelEn: "Revenue" },
  { href: "/geo", label: "الذكاء الجغرافي", labelEn: "Geo" },
  { href: "/knowledge", label: "قاعدة المعرفة", labelEn: "Knowledge" },
  { href: "/consciousness", label: "الوعي الذاتي", labelEn: "Consciousness" },
  { href: "/constitution", label: "الدستور", labelEn: "Constitution" },
  { href: "/evidence", label: "سجل الأدلة", labelEn: "Evidence" },
];

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (href: string) =>
    href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link
          to="/dashboard"
          className="flex items-center gap-2 font-bold text-gray-900 hover:text-indigo-600 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Zap size={16} />
          </div>
          <span className="hidden sm:block text-sm tracking-wide">ONX Intelligence</span>
        </Link>

        {/* Back button (shows only when not on root pages) */}
        {location.pathname !== "/" && location.pathname !== "/dashboard" && (
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">رجوع</span>
          </button>
        )}

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Profile badge */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
            F
          </div>
          <span className="text-xs text-gray-500">Founder</span>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-100 bg-white px-4 pb-4 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-medium mt-1 transition-colors ${
                isActive(link.href)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {link.label} <span className="text-gray-400 text-xs">— {link.labelEn}</span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
