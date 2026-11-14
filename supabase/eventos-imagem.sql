-- Imagem de capa de cada evento (fica no bucket "eventos", que NÃO é limpo todo dia como o de fotos).
alter table public.eventos add column if not exists imagem text
  check (imagem is null or imagem ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
grant insert (imagem), update (imagem) on public.eventos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eventos', 'eventos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "eventos img: enviar na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'eventos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eventos img: apagar as próprias ou equipe" on storage.objects for delete to authenticated
  using (bucket_id = 'eventos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.eh_equipe()));

create or replace view public.eventos_resumo with (security_invoker = true) as
select e.id, e.titulo, e.descricao, e.local, e.categoria, e.inicio, e.fim, e.criado_por, e.criado_em,
       p.nome as autor,
       (select count(*) from public.confirmacoes c where c.evento_id = e.id) as confirmacoes,
       (select max(c.criado_em) from public.confirmacoes c where c.evento_id = e.id) as ultima_confirmacao,
       (select count(*) from public.registros r where r.evento_id = e.id and not r.oculto) as registros,
       (select count(*) from public.encerramentos n where n.evento_id = e.id) as encerramentos,
       e.imagem
from public.eventos e
join public.perfis p on p.id = e.criado_por;
