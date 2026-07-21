-- E-RAMP OTBAN X — Supabase schema
-- Jalankan seluruh isi file ini di Supabase Dashboard > SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  nip varchar(18),
  role text not null default 'inspector' check (role in ('inspector','coordinator','admin')),
  office text not null default 'Kantor Otoritas Bandar Udara Wilayah X Merauke',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nip_check check (nip is null or nip ~ '^[0-9]{18}$')
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  inspection_date date not null,
  start_time time,
  place text,
  operator text not null,
  aoc_no text,
  registration text not null,
  aircraft_type text,
  flight_in text,
  route_from text,
  route_to text,
  action_taken text not null default 'No remarks',
  general_remarks text,
  status text not null default 'draft' check (status in ('draft','submitted','verified','archived')),
  total_items integer not null default 0,
  compliant_count integer not null default 0,
  finding_count integer not null default 0,
  not_applicable_count integer not null default 0,
  not_checked_count integer not null default 0,
  inspector_name text,
  inspector_nip varchar(18),
  submitted_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_results (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  section_code text not null,
  section_name text not null,
  item_code text not null,
  item_number integer not null,
  item_name text not null,
  status text not null default 'not_checked' check (status in ('compliant','non_compliant','not_applicable','not_checked')),
  finding text,
  category text,
  corrective_action text,
  photo_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, item_code)
);

create table if not exists public.finding_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  result_id uuid not null references public.inspection_results(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists inspections_created_by_idx on public.inspections(created_by);
create index if not exists inspections_date_idx on public.inspections(inspection_date desc);
create index if not exists inspections_registration_idx on public.inspections(registration);
create index if not exists results_inspection_idx on public.inspection_results(inspection_id);
create index if not exists results_status_idx on public.inspection_results(status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists inspections_updated_at on public.inspections;
create trigger inspections_updated_at before update on public.inspections
for each row execute function public.set_updated_at();

drop trigger if exists results_updated_at on public.inspection_results;
create trigger results_updated_at before update on public.inspection_results
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, nip)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(new.email,'@',1), 'Inspector'),
    nullif(new.raw_user_meta_data ->> 'nip','')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'inspector');
$$;

create or replace function public.can_view_inspection(target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.inspections i
    where i.id = target_id
      and (i.created_by = auth.uid() or i.status in ('submitted','verified','archived') or public.current_user_role() in ('coordinator','admin'))
  );
$$;

create or replace function public.can_edit_inspection(target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.inspections i
    where i.id = target_id
      and ((i.created_by = auth.uid() and i.status = 'draft') or public.current_user_role() in ('coordinator','admin'))
  );
$$;

create or replace function public.refresh_inspection_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  target := coalesce(new.inspection_id, old.inspection_id);
  update public.inspections i set
    total_items = x.total_items,
    compliant_count = x.compliant_count,
    finding_count = x.finding_count,
    not_applicable_count = x.na_count,
    not_checked_count = x.nc_count,
    updated_at = now()
  from (
    select count(*)::int total_items,
      count(*) filter (where status='compliant')::int compliant_count,
      count(*) filter (where status='non_compliant')::int finding_count,
      count(*) filter (where status='not_applicable')::int na_count,
      count(*) filter (where status='not_checked')::int nc_count
    from public.inspection_results where inspection_id = target
  ) x where i.id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_counts_after_results on public.inspection_results;
create trigger refresh_counts_after_results
after insert or update or delete on public.inspection_results
for each row execute function public.refresh_inspection_counts();

alter table public.profiles enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_results enable row level security;
alter table public.finding_photos enable row level security;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_role() in ('coordinator','admin'));
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists inspections_read on public.inspections;
drop policy if exists inspections_insert on public.inspections;
drop policy if exists inspections_update_owner on public.inspections;
drop policy if exists inspections_update_manager on public.inspections;
drop policy if exists inspections_delete on public.inspections;
create policy inspections_read on public.inspections for select to authenticated
using (created_by = auth.uid() or status in ('submitted','verified','archived') or public.current_user_role() in ('coordinator','admin'));
create policy inspections_insert on public.inspections for insert to authenticated
with check (created_by = auth.uid());
create policy inspections_update_owner on public.inspections for update to authenticated
using (created_by = auth.uid() and status='draft')
with check (created_by = auth.uid() and status in ('draft','submitted'));
create policy inspections_update_manager on public.inspections for update to authenticated
using (public.current_user_role() in ('coordinator','admin'))
with check (public.current_user_role() in ('coordinator','admin'));
create policy inspections_delete on public.inspections for delete to authenticated
using ((created_by = auth.uid() and status='draft') or public.current_user_role()='admin');

drop policy if exists results_read on public.inspection_results;
drop policy if exists results_insert on public.inspection_results;
drop policy if exists results_update on public.inspection_results;
drop policy if exists results_delete on public.inspection_results;
create policy results_read on public.inspection_results for select to authenticated
using (public.can_view_inspection(inspection_id));
create policy results_insert on public.inspection_results for insert to authenticated
with check (public.can_edit_inspection(inspection_id));
create policy results_update on public.inspection_results for update to authenticated
using (public.can_edit_inspection(inspection_id)) with check (public.can_edit_inspection(inspection_id));
create policy results_delete on public.inspection_results for delete to authenticated
using (public.can_edit_inspection(inspection_id));

drop policy if exists photos_read on public.finding_photos;
drop policy if exists photos_insert on public.finding_photos;
drop policy if exists photos_delete on public.finding_photos;
create policy photos_read on public.finding_photos for select to authenticated
using (public.can_view_inspection(inspection_id));
create policy photos_insert on public.finding_photos for insert to authenticated
with check (uploaded_by=auth.uid() and public.can_edit_inspection(inspection_id));
create policy photos_delete on public.finding_photos for delete to authenticated
using (public.can_edit_inspection(inspection_id));

grant usage on schema public to authenticated;
grant select, insert on public.profiles to authenticated;
grant update (full_name, nip) on public.profiles to authenticated;
grant select, insert, update, delete on public.inspections to authenticated;
grant select, insert, update, delete on public.inspection_results to authenticated;
grant select, insert, delete on public.finding_photos to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('inspection-photos','inspection-photos',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists storage_photo_read on storage.objects;
drop policy if exists storage_photo_insert on storage.objects;
drop policy if exists storage_photo_delete on storage.objects;
create policy storage_photo_read on storage.objects for select to authenticated
using (bucket_id='inspection-photos' and public.can_view_inspection(((storage.foldername(name))[1])::uuid));
create policy storage_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='inspection-photos' and (storage.foldername(name))[2]=auth.uid()::text and public.can_edit_inspection(((storage.foldername(name))[1])::uuid));
create policy storage_photo_delete on storage.objects for delete to authenticated
using (bucket_id='inspection-photos' and public.can_edit_inspection(((storage.foldername(name))[1])::uuid));

-- Setelah akun dibuat, role dapat dipromosikan lewat SQL Editor:
-- update public.profiles set role='coordinator' where id='UUID_USER';
-- update public.profiles set role='admin' where id='UUID_USER';
