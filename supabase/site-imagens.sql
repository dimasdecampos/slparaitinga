-- Fotos da home, enviadas pelo painel /admin (aba "Home"): a capa do topo e os três cartões de "Conheça a cidade".
-- O site lê esta tabela na publicação (a cada hora) e coloca as fotos direto no HTML.
create table if not exists public.site_imagens (
  chave text primary key check (chave in ('capa', 'lugares', 'historia', 'servicos')),
  imagem text check (imagem is null or imagem ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),  -- caminho no bucket "site"
  legenda text not null default '' check (char_length(legenda) <= 160),              -- descrição da foto e crédito
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references public.perfis on delete set null
);
alter table public.site_imagens enable row level security;
create policy "site_imagens: leitura pública" on public.site_imagens for select using (true);
create policy "site_imagens: equipe cria" on public.site_imagens for insert to authenticated with check (public.eh_equipe());
create policy "site_imagens: equipe edita" on public.site_imagens for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "site_imagens: equipe apaga" on public.site_imagens for delete to authenticated using (public.eh_equipe());

create or replace function public.site_imagens_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); new.atualizado_por := auth.uid(); return new; end $$;
create trigger site_imagens_carimbo before insert or update on public.site_imagens for each row execute function public.site_imagens_carimbo();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "site img: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.eh_equipe());
create policy "site img: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.eh_equipe());
