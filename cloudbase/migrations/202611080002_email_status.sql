-- Only the caller's own verification boolean; no emails, identifiers or tokens.
begin;
create function public.cg_email_verified() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select email_verified from auth.users where sub=auth.uid()),false)
$$;
revoke all on function public.cg_email_verified() from public,anon;
grant execute on function public.cg_email_verified() to authenticated;
commit;
