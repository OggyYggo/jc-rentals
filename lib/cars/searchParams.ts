import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

const carSearchSchema = z.object({
  vehicle: z.enum(["car", "motorcycle"]).optional().catch(undefined),
  mode: z.enum(["self", "driver"]).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  pickup: z.string().trim().max(80).optional().catch(undefined),
  seats: z.coerce.number().int().min(1).max(20).optional().catch(undefined),
  sort: z.enum(["recommended", "price_asc", "price_desc"]).optional().catch(undefined),
  type: z.string().trim().max(80).optional().catch(undefined),
  transmission: z.string().trim().max(40).optional().catch(undefined),
  minPrice: z.coerce.number().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().min(0).optional().catch(undefined),
});

export type CarSearch = z.infer<typeof carSearchSchema>;
export type CarSearchInput = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function todayInManila() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseCarSearch(input: CarSearchInput) {
  const rawMode = first(input.mode);
  const rawFrom = first(input.from) ?? first(input.start);
  const rawTo = first(input.to) ?? first(input.end);
  const parsed = carSearchSchema.safeParse({
    mode: rawMode === "self_drive" ? "self" : rawMode === "with_driver" ? "driver" : rawMode,
    vehicle: first(input.vehicle),
    from: rawFrom,
    to: rawTo,
    pickup: first(input.pickup),
    seats: first(input.seats),
    sort: first(input.sort),
    type: first(input.type),
    transmission: first(input.transmission),
    minPrice: first(input.minPrice),
    maxPrice: first(input.maxPrice),
  });
  const search = parsed.success ? parsed.data : {};
  const dateRequested = Boolean(rawFrom || rawTo);
  const validDatePair = Boolean(search.from && search.to && search.from >= todayInManila() && search.to > search.from);
  const invalidDates = dateRequested && !validDatePair;

  return {
    search: {
      ...search,
      from: validDatePair ? search.from : undefined,
      to: validDatePair ? search.to : undefined,
      sort: search.sort ?? "recommended",
    } satisfies CarSearch,
    invalidDates,
  };
}

export function carsUrl(params: Partial<CarSearch>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/cars?${query}` : "/cars";
}
