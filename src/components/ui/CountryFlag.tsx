import { Globe2 } from "lucide-react";
import { useState } from "react";

export interface CountryFlagProps {
  className?: string;
  code?: string | null;
  label?: string | null;
  size?: "small" | "medium" | "large";
}

export function CountryFlag({ className, code, label, size = "medium" }: CountryFlagProps) {
  const flagCode = normalizeCountryCode(code);
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const showFlag = flagCode !== null && failedCode !== flagCode;
  const accessibleLabel = label?.trim() || code?.trim() || "Country unavailable";

  return (
    <span
      className={["cjs-country-flag", className].filter(Boolean).join(" ")}
      data-fallback={!showFlag || undefined}
      data-size={size}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {showFlag ? (
        <img
          src={`/country-flags/${flagCode}.svg`}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
          onError={() => setFailedCode(flagCode)}
        />
      ) : (
        <Globe2 aria-hidden="true" />
      )}
    </span>
  );
}

function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalizedCode = code.trim().toLocaleUpperCase() === "UK" ? "GB" : code.trim();
  return /^[A-Za-z]{2}$/.test(normalizedCode) ? normalizedCode.toLocaleLowerCase() : null;
}
