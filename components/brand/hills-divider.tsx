export function HillsDivider({ className = "", back = "#CFE6FB", front = "#FFFFFF" }: { className?: string; back?: string; front?: string }) {
  return <svg viewBox="0 0 1440 140" preserveAspectRatio="none" className={className} aria-hidden="true"><path fill={back} d="M0 140 V95 Q80 25 160 95 Q250 45 340 95 Q430 15 520 95 Q610 50 700 95 Q790 20 880 95 Q970 55 1060 95 Q1150 30 1240 95 Q1340 50 1440 95 V140 Z"/><path fill={front} d="M0 140 V115 Q120 60 240 115 Q360 75 480 115 Q600 55 720 115 Q840 70 960 115 Q1080 60 1200 115 Q1320 75 1440 115 V140 Z"/></svg>;
}
