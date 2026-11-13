-- "Já terminou": quem está no local avisa que o evento acabou. Com 2 avisos (e mais avisos
-- do que confirmações) o evento sai de "Acontecendo agora". Mesma janela das confirmações.
create table if not exists public.encerramentos (
  evento_id bigint not null references public.eventos on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfis on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (evento_id, usuario_id)
);
alter table public.encerramentos enable row level security;
create policy "encerramentos: leitura pública" on public.encerramentos for select using (true);
create policy "encerramentos: avisar na janela" on public.encerramentos for insert to authenticated
  with check (usuario_id = (select auth.uid()) and public.janela_aberta(evento_id));
create policy "encerramentos: desfazer o próprio" on public.encerramentos for delete to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update on public.encerramentos from anon, authenticated;
grant insert (evento_id) on public.encerramentos to authenticated;

create or replace view public.eventos_resumo with (security_invoker = true) as
select e.id, e.titulo, e.descricao, e.local, e.categoria, e.inicio, e.fim, e.criado_por, e.criado_em,
       p.nome as autor,
       (select count(*) from public.confirmacoes c where c.evento_id = e.id) as confirmacoes,
       (select max(c.criado_em) from public.confirmacoes c where c.evento_id = e.id) as ultima_confirmacao,
       (select count(*) from public.registros r where r.evento_id = e.id and not r.oculto) as registros,
       (select count(*) from public.encerramentos n where n.evento_id = e.id) as encerramentos
from public.eventos e
join public.perfis p on p.id = e.criado_por;
