-- Festas: conteúdo rico (HTML limpo pelo painel e de novo na publicação), imagem de destaque e campos personalizados.
alter table public.festas add column if not exists conteudo text check (conteudo is null or char_length(conteudo) <= 60000);
alter table public.festas add column if not exists imagem text check (imagem is null or imagem ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
alter table public.festas add column if not exists campos jsonb not null default '[]'
  check (jsonb_typeof(campos) = 'array' and jsonb_array_length(campos) <= 20);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('festas', 'festas', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "festas img: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'festas' and public.eh_equipe());
create policy "festas img: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'festas' and public.eh_equipe());
