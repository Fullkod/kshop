-- POS (PRP pos-offline): counter sales. In its own migration: a new enum value cannot be used in the transaction that
-- creates it.

alter type public.order_channel add value if not exists 'pos';
