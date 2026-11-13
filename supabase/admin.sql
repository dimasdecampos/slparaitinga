-- Painel /admin: papéis de usuário, poderes da equipe sobre a agenda e o conteúdo das festas.
-- Papéis: 'usuario' (padrão), 'contribuidor' (edita agenda e festas) e 'admin' (tudo, inclusive usuários).
-- Toda checagem de papel acontece no banco (RLS e funções); o painel só esconde o que a pessoa não pode usar.

-- ---------- papéis ----------
alter table public.perfis add column if not exists papel text not null default 'usuario';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_papel_check') then
    alter table public.perfis add constraint perfis_papel_check check (papel in ('usuario', 'contribuidor', 'admin'));
  end if;
end $$;
-- papel não é editável pela API: só pelas funções de admin abaixo (o grant de update continua só em "nome")

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.papel from public.perfis p where p.id = auth.uid()), 'anonimo');
$$;
create or replace function public.eh_equipe() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.meu_papel() in ('admin', 'contribuidor');
$$;
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.meu_papel() = 'admin';
$$;
revoke execute on function public.meu_papel(), public.eh_equipe(), public.eh_admin() from public;
grant execute on function public.meu_papel(), public.eh_equipe(), public.eh_admin() to anon, authenticated;

-- ---------- equipe na agenda ----------
-- vê eventos ocultos, edita e apaga qualquer evento, cria sem o limite diário e com data no passado
create policy "eventos: equipe vê tudo" on public.eventos for select to authenticated using (public.eh_equipe());
create policy "eventos: equipe cria" on public.eventos for insert to authenticated
  with check (criado_por = (select auth.uid()) and public.eh_equipe());
create policy "eventos: equipe edita" on public.eventos for update to authenticated
  using (public.eh_equipe()) with check (public.eh_equipe());
create policy "eventos: equipe apaga" on public.eventos for delete to authenticated using (public.eh_equipe());

-- moderação: equipe vê e apaga fotos e recados de qualquer pessoa
create policy "registros: equipe vê tudo" on public.registros for select to authenticated using (public.eh_equipe());
create policy "registros: equipe apaga" on public.registros for delete to authenticated using (public.eh_equipe());
create policy "recados: equipe vê tudo" on public.recados for select to authenticated using (public.eh_equipe());
create policy "recados: equipe apaga" on public.recados for delete to authenticated using (public.eh_equipe());

-- ocultar/mostrar não passa por grant de coluna (senão o autor poderia "desocultar" o próprio evento denunciado)
create or replace function public.equipe_ocultar(p_tipo text, p_id bigint, p_oculto boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_equipe() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_tipo = 'evento' then update public.eventos set oculto = p_oculto where id = p_id;
  elsif p_tipo = 'registro' then update public.registros set oculto = p_oculto where id = p_id;
  elsif p_tipo = 'recado' then update public.recados set oculto = p_oculto where id = p_id;
  else raise exception 'Tipo inválido.'; end if;
  if not p_oculto then delete from public.denuncias where tipo = p_tipo and alvo_id = p_id; end if; -- revisado: zera as denúncias
end $$;
revoke execute on function public.equipe_ocultar(text, bigint, boolean) from public, anon;
grant execute on function public.equipe_ocultar(text, bigint, boolean) to authenticated;

-- lista da agenda para o painel: com ocultos, autor e número de denúncias
create or replace function public.equipe_eventos() returns table (
  id bigint, titulo text, descricao text, local text, categoria text, inicio timestamptz, fim timestamptz,
  oculto boolean, criado_por uuid, autor text, criado_em timestamptz, denuncias bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_equipe() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
    select e.id, e.titulo, e.descricao, e.local, e.categoria, e.inicio, e.fim, e.oculto, e.criado_por, p.nome, e.criado_em,
           (select count(*) from public.denuncias d where d.tipo = 'evento' and d.alvo_id = e.id)
    from public.eventos e left join public.perfis p on p.id = e.criado_por
    order by e.inicio desc;
end $$;
revoke execute on function public.equipe_eventos() from public, anon;
grant execute on function public.equipe_eventos() to authenticated;

-- ---------- usuários (só admin) ----------
-- o projeto Supabase é compartilhado: o painel lista só quem tem perfil na agenda e nunca apaga contas
create or replace function public.admin_usuarios() returns table (
  id uuid, nome text, email text, papel text, criado_em timestamptz, ultimo_acesso timestamptz, eventos bigint, recados bigint, fotos bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
    select p.id, p.nome, u.email::text, p.papel, p.criado_em, u.last_sign_in_at,
           (select count(*) from public.eventos e where e.criado_por = p.id),
           (select count(*) from public.recados m where m.usuario_id = p.id),
           (select count(*) from public.registros r where r.usuario_id = p.id)
    from public.perfis p left join auth.users u on u.id = p.id
    order by p.criado_em desc;
end $$;
revoke execute on function public.admin_usuarios() from public, anon;
grant execute on function public.admin_usuarios() to authenticated;

create or replace function public.admin_atualizar_usuario(p_id uuid, p_nome text, p_papel text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_papel not in ('usuario', 'contribuidor', 'admin') then raise exception 'Papel inválido.'; end if;
  if char_length(btrim(p_nome)) not between 2 and 60 then raise exception 'O nome precisa ter de 2 a 60 letras.'; end if;
  -- nunca deixar o painel sem nenhum admin
  if p_papel <> 'admin' and (select papel from public.perfis where id = p_id) = 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'Este é o único admin. Promova outra pessoa antes de mudar este papel.';
  end if;
  update public.perfis set nome = btrim(p_nome), papel = p_papel where id = p_id;
end $$;
revoke execute on function public.admin_atualizar_usuario(uuid, text, text) from public, anon;
grant execute on function public.admin_atualizar_usuario(uuid, text, text) to authenticated;

-- ---------- conteúdo das festas ----------
-- O site gera as páginas de /festas a partir desta tabela (na publicação, que roda a cada hora).
create table if not exists public.festas (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),       -- vira o endereço: /festas/<id>.html
  nome text not null check (char_length(nome) between 2 and 120),
  resumo text not null check (char_length(resumo) <= 400),           -- texto do cartão em /festas
  olho text not null default '' check (char_length(olho) <= 60),     -- linha acima do título (ex.: "Maio ou junho")
  lema text not null default '' check (char_length(lema) <= 200),    -- subtítulo da página
  chita text not null default 'vermelha' check (chita in ('vermelha', 'azul', 'amarela')),
  -- data: 'pascoa' (dias em relação à Páscoa), 'fixa' (MM-DD todo ano) ou 'livre' (só texto)
  data_tipo text not null default 'livre' check (data_tipo in ('pascoa', 'fixa', 'livre')),
  pascoa_ini int, pascoa_fim int,
  fixa_ini text check (fixa_ini ~ '^\d{2}-\d{2}$'), fixa_fim text check (fixa_fim ~ '^\d{2}-\d{2}$'),
  quando_texto text not null default '' check (char_length(quando_texto) <= 120),
  secoes jsonb not null default '[]' check (jsonb_typeof(secoes) = 'array'), -- [{"titulo": "...", "paragrafos": ["...", "..."]}]
  veja text[] not null default '{}',                                  -- ids de festas relacionadas
  ordem int not null default 0,
  publicada boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references public.perfis on delete set null
);
alter table public.festas enable row level security;
create policy "festas: leitura pública" on public.festas for select using (publicada or public.eh_equipe());
create policy "festas: equipe cria" on public.festas for insert to authenticated with check (public.eh_equipe());
create policy "festas: equipe edita" on public.festas for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "festas: admin apaga" on public.festas for delete to authenticated using (public.eh_admin());

create or replace function public.festas_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); new.atualizado_por := auth.uid(); return new; end $$;
create trigger festas_carimbo before insert or update on public.festas for each row execute function public.festas_carimbo();

-- o papel de cada pessoa não é público: a API só entrega id, nome e data; o próprio papel vem por meu_papel()
revoke select on public.perfis from anon, authenticated;
grant select (id, nome, criado_em) on public.perfis to anon, authenticated;
