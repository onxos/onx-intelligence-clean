import { useEffect } from "react";

export function useDirection(direction: "rtl" | "ltr" = "rtl") {
  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = direction === "rtl" ? "ar" : "en";
  }, [direction]);
}
