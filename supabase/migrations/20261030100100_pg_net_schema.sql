-- pg_net in the extensions schema (its functions live in schema net either way); nothing used it yet.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
