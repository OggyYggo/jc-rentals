type ReviewableTrip = {
  status: string;
  owner_id: string | null;
  returned_at?: string | null;
  completed_at?: string | null;
};

export function canReviewTrip(trip: ReviewableTrip | undefined, endDate: string, now: number) {
  if (!trip?.owner_id || !["returned", "completed"].includes(trip.status)) return false;
  const tripEnd = trip.status === "completed" ? trip.completed_at : trip.returned_at;
  const windowStart = tripEnd ? Date.parse(tripEnd) : Date.parse(endDate + "T00:00:00+08:00") + 86_400_000;
  return windowStart >= now - 60 * 86_400_000;
}
