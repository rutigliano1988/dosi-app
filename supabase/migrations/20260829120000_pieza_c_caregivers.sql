-- Pieza C — Aviso a un cuidador. Reutiliza la tabla caregivers (legado móvil, sin uso).

-- columnas de emparejamiento
alter table public.caregivers add column if not exists pair_code            text;
alter table public.caregivers add column if not exists pair_code_expires_at timestamptz;
alter table public.caregivers add column if not exists owner_name           text;

-- el legado tenía estas NOT NULL sin default; se relajan
alter table public.caregivers alter column name         drop not null;
alter table public.caregivers alter column relation_key drop not null;
alter table public.caregivers alter column color        drop not null;
alter table public.caregivers alter column added_date   drop not null;

-- un cuidador por paciente (una fila por owner)
create unique index if not exists caregivers_one_per_owner
  on public.caregivers (owner_user_id);

-- el cuidador puede borrar su propia relación (corte al cerrar sesión + stop-caring)
drop policy if exists "caregiver can leave" on public.caregivers;
create policy "caregiver can leave" on public.caregivers
  for delete using (auth.uid() = caregiver_user_id);

-- doses: marca de "cuidador avisado" y "recordatorio enviado"
alter table public.doses add column if not exists caregiver_alerted_at timestamptz;
alter table public.doses add column if not exists nudged_at            timestamptz;
