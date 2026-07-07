import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";

interface BackButtonProps {
  href?: string;
  label?: string;
}

export default function BackButton({ href, label = "رجوع" }: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (href) {
      navigate(href);
    } else {
      window.history.back();
    }
  };

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors border border-gray-200"
    >
      <ChevronLeft size={16} />
      {label}
    </button>
  );
}
