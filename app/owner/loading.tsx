import { OwnerRouteLoading } from "@/components/owner/owner-route-loading";
import { ContentSkeleton } from "@/components/loading/PageSkeletons";

export default function Loading() { return <OwnerRouteLoading><ContentSkeleton rows={6} /></OwnerRouteLoading>; }
