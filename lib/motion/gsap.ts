"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };
export const EASE_OUT = "power3.out";
export const EASE_INOUT = "power2.inOut";
export const MOTION = "(prefers-reduced-motion: no-preference)";
