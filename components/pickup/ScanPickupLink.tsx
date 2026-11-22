import type { ComponentProps } from "react";

export function ScanPickupLink(props: Omit<ComponentProps<"a">, "href">) {
  // Load a new document so the scanner receives its camera Permissions-Policy.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a {...props} href="/owner/scan" />;
}
