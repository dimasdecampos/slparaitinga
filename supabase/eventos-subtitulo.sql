-- Subtítulo do evento: o assunto ou quem vai se apresentar (o título fica para o projeto/programa, ex.: Bosque das Artes).
alter table public.eventos add column if not exists subtitulo text check (subtitulo is null or char_length(subtitulo) <= 140);
grant insert (subtitulo), update (subtitulo) on public.eventos to authenticated;

create or replace view public.eventos_resumo with (security_invoker = true) as
select e.id, e.titulo, e.descricao, e.local, e.categoria, e.inicio, e.fim, e.criado_por, e.criado_em,
       p.nome as autor,
       (select count(*) from public.confirmacoes c where c.evento_id = e.id) as confirmacoes,
       (select max(c.criado_em) from public.confirmacoes c where c.evento_id = e.id) as ultima_confirmacao,
       (select count(*) from public.registros r where r.evento_id = e.id and not r.oculto) as registros,
       (select count(*) from public.encerramentos n where n.evento_id = e.id) as encerramentos,
       e.imagem,
       e.subtitulo
from public.eventos e
join public.perfis p on p.id = e.criado_por;
