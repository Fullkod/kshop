-- Public reads (anon) had Supabase's 3 s statement timeout. Each storefront query takes 0.4–0.6 s in the database, but
-- a home fires about ten of them and the build prerenders several pages at once: on this compute size some went past
-- 3 s (57014), which failed the Vercel build (/s/demo, 2026-10-27) and made the browser QA flaky. Same limit as the
-- signed-in roles (authenticated, authenticator): 8 s still stops a runaway query.
alter role anon set statement_timeout = '8s';
notify pgrst, 'reload config';
