import Image from "next/image";
import { BASE_PATH } from "@/lib/constants";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
  lightText?: boolean;
};

export default function BrandLogo({ compact = false, className = "", lightText = false }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src={`${BASE_PATH}/OmniGrosslogo2.png`}
        alt="OGClient"
        width={100}
        height={40}
        className={compact ? "h-9 w-auto flex-shrink-0" : "h-10 w-auto flex-shrink-0"}
      />
      <span
        className={`text-lg font-extrabold tracking-tight whitespace-nowrap transition-opacity hover:opacity-85 ${
          lightText
            ? "bg-gradient-to-r from-teal-300 via-cyan-200 to-blue-300 bg-clip-text text-transparent drop-shadow-[0_1px_8px_rgba(75,195,196,0.4)]"
            : "bg-gradient-to-r from-[#4BC3C4] via-teal-500 to-blue-600 bg-clip-text text-transparent drop-shadow-[0_1px_6px_rgba(75,195,196,0.3)]"
        }`}
      >
        OGClient
      </span>
    </div>
  );
}
