BEGIN;

UPDATE public.orders
SET order_status = 'placed'
WHERE order_status = 'pending';

ALTER TABLE public.orders
  ALTER COLUMN order_status SET DEFAULT 'placed';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS valid_order_status;

ALTER TABLE public.orders
  ADD CONSTRAINT valid_order_status
  CHECK (order_status IN (
    'placed',
    'confirmed',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

COMMIT;
