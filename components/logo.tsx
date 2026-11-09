import Image from "next/image";
import logo from "@/img/Logo.png";

export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return <Image src={logo} alt="Kuyog Bohol" width={size} height={size} className={`shrink-0 object-contain ${className}`} />;
}
