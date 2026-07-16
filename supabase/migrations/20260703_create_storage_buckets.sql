-- Create bucket fotos-vehiculos
insert into storage.buckets (id, name, public)
values ('fotos-vehiculos', 'fotos-vehiculos', true)
on conflict (id) do nothing;

-- RLS para bucket fotos-vehiculos
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'fotos-vehiculos' );

create policy "Choferes can insert"
  on storage.objects for insert
  with check ( bucket_id = 'fotos-vehiculos' and auth.role() = 'authenticated' );
