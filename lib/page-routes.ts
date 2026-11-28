const tabRoots = new Set([
  "/", "/cars", "/for-owners", "/account", "/account/bookings", "/owner", "/owner/bookings", "/owner/payments",
  "/admin", "/admin/bookings", "/admin/payments", "/admin/owners", "/staff", "/staff/today", "/staff/scan", "/staff/account",
]);

const labels: Record<string, string> = {
  "/": "Home",
  "/account": "Profile",
  "/account/bookings": "Bookings",
  "/account/profile": "Profile",
  "/admin/owners": "Owners",
  "/admin/settings": "Settings",
  "/cars": "Vehicles",
  "/owner/cars": "Vehicles",
  "/owner/credits/top-up": "Top up",
  "/owner/staff": "Staff",
  "/receipt": "Receipt",
  "/p": "Pickup pass",
};

type Parent = { href: string; label: string };
const rules: Array<[RegExp, string, string?]> = [
  [/^\/account\/bookings\/[^/]+\/pay$/, "/account/bookings", "Pay deposit"],
  [/^\/account\/bookings\/[^/]+\/pickup$/, "/account/bookings", "Pickup pass"],
  [/^\/receipt\/[^/]+$/, "/account/bookings", "Receipt"],
  [/^\/p\/[^/]+$/, "/", "Pickup pass"],
  [/^\/cars\/[^/]+$/, "/cars", "Vehicle details"],
  [/^\/auth\/reset-password$/, "/login", "Reset password"],
  [/^\/admin\/bookings\/[^/]+\/pickup$/, "/admin/bookings", "Pickup details"],
  [/^\/admin\/owners\/[^/]+$/, "/admin/owners", "Owner details"],
  [/^\/admin\/settings\/[^/]+$/, "/admin/settings"],
  [/^\/owner\/staff\/[^/]+$/, "/owner/staff", "Staff details"],
  [/^\/staff\/accept$/, "/staff", "Staff invitation"],
];

function label(path: string) {
  const segment = path.split("/").at(-1) || "home";
  return labels[path] ?? segment.replace(/-/g, " ").replace(/^./, letter => letter.toUpperCase());
}

export function pageRoute(pathname: string, query = new URLSearchParams()): { title: string; parent?: Parent } | undefined {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/account/bookings" && ["record", "reviews"].includes(query.get("view") ?? "")) {
    return { title: query.get("view") === "record" ? "Booking record" : "My reviews", parent: { href: "/account/profile", label: "Profile" } };
  }
  if (tabRoots.has(path)) return undefined;
  if (path === "/account/profile") {
    const section = query.get("section");
    return { title: section === "documents" ? "Documents" : section === "details" ? "Personal details" : "Profile", parent: { href: "/account", label: "Profile" } };
  }

  const rule = rules.find(([pattern]) => pattern.test(path));
  const parent = rule?.[1] ?? (path.slice(0, path.lastIndexOf("/")) || "/");
  let href = parent;
  const pickup = path.match(/^\/account\/bookings\/([^/]+)\/pickup$/);
  if (pickup) href += `#trip-${pickup[1]}`;
  if (parent === "/cars") {
    const filters = new URLSearchParams();
    for (const key of ["from", "to", "mode", "pickup"]) {
      const value = query.get(key);
      if (value) filters.set(key, value);
    }
    if (filters.size) href += `?${filters}`;
  }
  if (rule?.[2] === "Pay deposit" && query.get("step") === "proof") {
    const payQuery = new URLSearchParams(query);
    payQuery.delete("step");
    return { title: "Send proof", parent: { href: payQuery.size ? `${path}?${payQuery}` : path, label: "Pay" } };
  }
  return { title: rule?.[2] ?? label(path), parent: { href, label: label(parent) } };
}
