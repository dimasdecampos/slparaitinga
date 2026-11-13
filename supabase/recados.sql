-- Mural de recados dos eventos que estão acontecendo.
-- Leitura pública; escrever exige login e só vale na janela do evento (30 min antes até 2 h depois do fim).
-- Os recados valem pelo dia: a limpeza diária (scripts/limpar-fotos.mjs) apaga os de antes de hoje.

create table if not exists public.recados (
  id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfis on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 500),
  oculto boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists recados_evento_idx on public.recados (evento_id, criado_em);

-- limite contra spam: até 20 recados a cada 10 minutos por pessoa
create or replace function public.recados_recentes(p_usuario uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.recados r where r.usuario_id = p_usuario and r.criado_em > now() - interval '10 minutes';
$$;
revoke execute on function public.recados_recentes(uuid) from public, anon;
grant execute on function public.recados_recentes(uuid) to authenticated;

alter table public.recados enable row level security;
create policy "recados: leitura pública" on public.recados for select
  using (not oculto or usuario_id = (select auth.uid()));
create policy "recados: escrever na janela" on public.recados for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and public.janela_aberta(evento_id)
    and public.recados_recentes((select auth.uid())) < 20
  );
create policy "recados: apagar os próprios" on public.recados for delete to authenticated
  using (usuario_id = (select auth.uid()));
revoke insert, update on public.recados from anon, authenticated;
grant insert (evento_id, texto) on public.recados to authenticated;

-- quem escreve recado passa a ter o nome visível (como quem publica evento ou foto)
drop policy if exists "perfis: autores e o próprio" on public.perfis;
create policy "perfis: autores e o próprio" on public.perfis for select
  using (
    id = (select auth.uid())
    or exists (select 1 from public.eventos e where e.criado_por = perfis.id)
    or exists (select 1 from public.registros r where r.usuario_id = perfis.id)
    or exists (select 1 from public.recados m where m.usuario_id = perfis.id)
  );

-- denúncias também valem para recados (3 denúncias escondem o recado)
alter table public.denuncias drop constraint if exists denuncias_tipo_check;
alter table public.denuncias add constraint denuncias_tipo_check check (tipo in ('evento', 'registro', 'recado'));
create or replace function public.aplicar_denuncia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.denuncias d where d.tipo = new.tipo and d.alvo_id = new.alvo_id) >= 3 then
    if new.tipo = 'evento' then update public.eventos set oculto = true where id = new.alvo_id;
    elsif new.tipo = 'registro' then update public.registros set oculto = true where id = new.alvo_id;
    elsif new.tipo = 'recado' then update public.recados set oculto = true where id = new.alvo_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.aplicar_denuncia() from public, anon, authenticated;

create or replace view public.recados_resumo with (security_invoker = true) as
select m.id, m.evento_id, m.usuario_id, m.texto, m.criado_em, p.nome as autor
from public.recados m
join public.perfis p on p.id = m.usuario_id;
