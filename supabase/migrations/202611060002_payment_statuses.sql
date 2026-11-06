-- Keep enum additions in their own migration. PostgreSQL requires a commit
-- before the new values can be used by constraints, defaults, or functions.
alter type public.booking_status add value if not exists 'awaiting_payment';
alter type public.booking_status add value if not exists 'payment_review';
alter type public.booking_status add value if not exists 'expired';
