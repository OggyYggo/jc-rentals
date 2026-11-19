import type { ComponentProps } from "react";
import { Reveal } from "./Reveal";

export function HeroIntro(props: ComponentProps<typeof Reveal>) {
  return <Reveal {...props} intro />;
}
