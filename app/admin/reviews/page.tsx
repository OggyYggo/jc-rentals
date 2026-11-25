import { AnimatedReviewList } from "@/components/reviews/AnimatedReviewList";
import Link from "next/link";
import { z } from "zod";
import { AdminHeading } from "@/components/admin/ui";
import { ModerateReview, ResolveReport } from "@/components/reviews/ModerateReview";
import { Rating } from "@/components/reviews/ReviewContent";
import { getAdminContext } from "@/lib/admin-context";
import { exactTime } from "@/lib/audit/labels";
import { reportReasons, tagLabels } from "@/lib/reviews/model";

export const instant = false;
const tabs = { reported: "Reported", all: "All", hidden: "Hidden" } as const;
const paramsSchema = z.object({
  tab: z.enum(["reported","all","hidden"]).catch("reported"),
  owner: z.uuid().optional().catch(undefined),
  vehicle: z.uuid().optional().catch(undefined),
  rating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  since: z.iso.date().optional().catch(undefined),
  until: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(9999).catch(1),
});
type Row = { id: string; rating: number; owner_rating: number | null; comment: string | null; customer: { full_name: string } | null; owner_reply: string | null;
  tags: (keyof typeof tagLabels)[]; is_hidden: boolean; hidden_reason: string | null; created_at: string;
  car: { brand: string; model: string } | null; owner: { business_name: string } | null;
  review_reports: { id: string; reason: keyof typeof reportReasons; note: string | null; status: string }[] };

export default async function AdminReviews({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const { supabase } = await getAdminContext();
  const filters = paramsSchema.parse(await searchParams);
  const embedded = filters.tab === "reported" ? "review_reports!inner" : "review_reports";
  let query = supabase.from("reviews").select(`id,rating,owner_rating,comment,owner_reply,tags,is_hidden,hidden_reason,created_at,customer:profiles!reviews_customer_id_fkey(full_name),car:cars(brand,model),owner:owners(business_name),${embedded}(id,reason,note,status)`);
  if (filters.tab === "reported") query = query.eq("review_reports.status", "open");
  if (filters.tab === "hidden") query = query.eq("is_hidden", true);
  if (filters.owner) query = query.eq("owner_id", filters.owner);
  if (filters.vehicle) query = query.eq("car_id", filters.vehicle);
  if (filters.rating) query = query.eq("rating", filters.rating);
  if (filters.since) query = query.gte("created_at", filters.since + "T00:00:00+08:00");
  if (filters.until) query = query.lte("created_at", filters.until + "T23:59:59.999999+08:00");
  const offset = (filters.page - 1) * 20;
  const [reviews, owners, cars] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 20),
    supabase.from("owners").select("id,business_name").order("business_name"),
    supabase.from("cars").select("id,brand,model").order("brand"),
  ]);
  const rows = (reviews.data ?? []) as unknown as Row[];
  const href = (tab: keyof typeof tabs, page = 1) => "?" + new URLSearchParams(
    Object.entries({ ...filters, tab, page }).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]));
  const control = "mt-1 block w-full rounded border bg-white p-2";
  return <>
    <AdminHeading title="Review moderation" description="Review reports and manage review visibility."/>
    <nav className="mb-4 flex gap-2 max-lg:overflow-x-auto lg:flex-wrap" aria-label="Review tabs">{Object.entries(tabs).map(([key,label]) =>
      <Link key={key} href={href(key as keyof typeof tabs)} aria-current={key === filters.tab ? "page" : undefined}
        className={`rounded border px-3 py-2 text-sm max-lg:inline-flex max-lg:min-h-11 max-lg:shrink-0 max-lg:items-center ${key === filters.tab ? "bg-blue-50 font-semibold" : "bg-white"}`}>{key === "reported" ? <><span className="lg:hidden">Reports</span><span className="hidden lg:inline">{label}</span></> : label}</Link>)}</nav>
    <form className="mb-4 grid gap-3 rounded-xl border bg-white p-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
      <input type="hidden" name="tab" value={filters.tab}/>
      <label>Owner<select name="owner" defaultValue={filters.owner ?? ""} className={control}><option value="">All owners</option>
        {owners.data?.map(row => <option key={row.id} value={row.id}>{row.business_name}</option>)}</select></label>
      <label>Vehicle<select name="vehicle" defaultValue={filters.vehicle ?? ""} className={control}><option value="">All vehicles</option>
        {cars.data?.map(row => <option key={row.id} value={row.id}>{row.brand} {row.model}</option>)}</select></label>
      <label>Rating<select name="rating" defaultValue={filters.rating ?? ""} className={control}><option value="">All ratings</option>
        {[5,4,3,2,1].map(rating => <option key={rating} value={rating}>{rating}</option>)}</select></label>
      <label>From<input type="date" name="since" defaultValue={filters.since} className={control}/></label>
      <label>To<input type="date" name="until" defaultValue={filters.until} className={control}/></label>
      <button className="justify-self-start rounded-md bg-blue-800 px-3 py-2 font-semibold text-white">Apply filters</button>
    </form>
    {reviews.error ? <p role="alert">Could not load reviews. <Link className="underline" href={href(filters.tab, filters.page)}>Retry</Link></p>
      : !rows.length ? <p className="rounded-xl border bg-white p-4 text-sm">No reviews match these filters.</p>
      : <AnimatedReviewList className="space-y-3">{rows.slice(0,20).map(row => <li key={row.id} className="min-w-0 space-y-2 rounded-xl border bg-white p-4 text-sm">
        <h2 className="break-words font-semibold">{row.customer?.full_name && <span className="lg:hidden">{row.customer.full_name} · </span>}{row.car?.brand} {row.car?.model} · {row.owner?.business_name ?? "Rental owner"}</h2>
        <p><Rating rating={row.rating}/> · <time dateTime={row.created_at}>{exactTime(row.created_at)}</time></p>
        {row.owner_rating && <p>Owner and service <Rating rating={row.owner_rating}/></p>}
        {row.tags.length > 0 && <p>{row.tags.map(tag => tagLabels[tag]).join(" · ")}</p>}
        {row.comment && <p className="whitespace-pre-wrap break-words">{row.comment}</p>}
        {row.owner_reply && <p className="border-l-2 pl-2 whitespace-pre-wrap break-words">Owner reply: {row.owner_reply}</p>}
        {row.is_hidden && <p className="break-words text-amber-800">Hidden · {row.hidden_reason}</p>}
        <ModerateReview id={row.id} hidden={row.is_hidden}/>
        {row.review_reports.length > 0 && <div className="border-t pt-2 max-lg:rounded-lg max-lg:border-[#FFF2D6] max-lg:bg-[#FFF2D6] max-lg:p-3"><h3 className="font-semibold"><span className="lg:hidden">Reported</span><span className="hidden lg:inline">Reports</span> ({row.review_reports.length})</h3>
          <ul className="divide-y">{row.review_reports.map(report => <li key={report.id} className="py-2">
            <p>{reportReasons[report.reason]} · {report.status}</p>
            {report.note && <p className="whitespace-pre-wrap break-words">{report.note}</p>}
            {report.status === "open" && <ResolveReport id={report.id}/>}
          </li>)}</ul></div>}
      </li>)}</AnimatedReviewList>}
    <nav aria-label="Moderation pages" className="mt-4 flex gap-4 text-sm text-blue-800">
      {filters.page > 1 && <Link href={href(filters.tab,filters.page-1)} className="underline">Newer</Link>}
      {rows.length > 20 && <Link href={href(filters.tab,filters.page+1)} className="underline">Older</Link>}
    </nav>
  </>;
}
