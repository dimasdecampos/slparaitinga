-- Agenda colaborativa de São Luiz do Paraitinga — esquema Supabase
-- Rode este arquivo inteiro no SQL Editor do projeto (ou como migração).
--
-- Regras principais:
--   • qualquer pessoa lê a agenda; só quem está logado cria eventos, confirma e envia fotos
--   • "está acontecendo" e fotos só são aceitos na janela do evento (30 min antes até 2 h depois do fim)
--   • cada pessoa confirma um evento uma vez; limites contra spam
--   • 3 denúncias escondem automaticamente um evento ou foto até alguém revisar

-- ---------- perfis ----------
create table public.perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  criado_em timestamptz not null default now()
);

-- Nome do perfil: o digitado no login por e-mail ("nome"), senão o da conta Google ("full_name"/"name"),
-- senão a parte do e-mail antes do @, senão "Morador".
create function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Morador'), 60))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- Projeto Supabase compartilhado: quem já tinha conta antes desta migração também ganha perfil.
insert into public.perfis (id, nome)
select u.id, left(coalesce(
  nullif(trim(u.raw_user_meta_data ->> 'nome'), ''),
  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
  nullif(split_part(u.email, '@', 1), ''),
  'Morador'), 60)
from auth.users u
on conflict (id) do nothing;

-- ---------- eventos ----------
create table public.eventos (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(titulo) between 3 and 120),
  descricao text check (char_length(descricao) <= 2000),
  local text not null check (char_length(local) between 2 and 120),
  categoria text not null default 'Outros' check (categoria in
    ('Festa e tradição', 'Música', 'Religioso', 'Esporte', 'Cultura', 'Feira e comércio', 'Comunidade', 'Outros')),
  inicio timestamptz not null,
  fim timestamptz not null,
  criado_por uuid not null default auth.uid() references public.perfis on delete cascade,
  oculto boolean not null default false,
  criado_em timestamptz not null default now(),
  check (fim > inicio and fim <= inicio + interval '15 days')
);
create index eventos_inicio_idx on public.eventos (inicio);
create index eventos_fim_idx on public.eventos (fim);

-- ---------- "está acontecendo" ----------
create table public.confirmacoes (
  evento_id bigint not null references public.eventos on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfis on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (evento_id, usuario_id)
);

-- ---------- fotos com legenda ----------
create table public.registros (
  id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfis on delete cascade,
  legenda text not null check (char_length(legenda) between 1 and 280),
  foto text check (foto is null or foto like usuario_id::text || '/%'),
  oculto boolean not null default false,
  criado_em timestamptz not null default now()
);
create index registros_evento_idx on public.registros (evento_id, criado_em desc);

-- ---------- denúncias ----------
create table public.denuncias (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('evento', 'registro')),
  alvo_id bigint not null,
  usuario_id uuid not null default auth.uid() references public.perfis on delete cascade,
  motivo text check (char_length(motivo) <= 300),
  criado_em timestamptz not null default now(),
  unique (tipo, alvo_id, usuario_id)
);

create function public.aplicar_denuncia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.denuncias d where d.tipo = new.tipo and d.alvo_id = new.alvo_id) >= 3 then
    if new.tipo = 'evento' then update public.eventos set oculto = true where id = new.alvo_id;
    else update public.registros set oculto = true where id = new.alvo_id; end if;
  end if;
  return new;
end $$;
create trigger ao_denunciar after insert on public.denuncias
  for each row execute function public.aplicar_denuncia();

-- funções de trigger não devem ser chamáveis pela API
revoke execute on function public.novo_usuario() from public, anon, authenticated;
revoke execute on function public.aplicar_denuncia() from public, anon, authenticated;

-- ---------- janela em que o evento aceita confirmação e fotos ----------
create function public.janela_aberta(p_evento bigint) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.eventos e
    where e.id = p_evento and not e.oculto
      and now() between e.inicio - interval '30 minutes' and e.fim + interval '2 hours'
  );
$$;

-- ---------- limites por usuário ----------
-- Contados em funções security definer: uma política não pode consultar a própria tabela
-- (o Postgres responde "infinite recursion detected in policy").
create function public.eventos_do_dia(p_usuario uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.eventos e where e.criado_por = p_usuario and e.criado_em > now() - interval '1 day';
$$;
create function public.registros_da_hora(p_usuario uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.registros r where r.usuario_id = p_usuario and r.criado_em > now() - interval '1 hour';
$$;
revoke execute on function public.eventos_do_dia(uuid) from public, anon;
revoke execute on function public.registros_da_hora(uuid) from public, anon;
grant execute on function public.eventos_do_dia(uuid) to authenticated;
grant execute on function public.registros_da_hora(uuid) to authenticated;

-- ---------- segurança (RLS) ----------
alter table public.perfis enable row level security;
alter table public.eventos enable row level security;
alter table public.confirmacoes enable row level security;
alter table public.registros enable row level security;
alter table public.denuncias enable row level security;

-- O nome só fica público para quem publicou algo (evento ou foto); o resto só enxerga o próprio perfil.
-- Importante porque o projeto Supabase é compartilhado e tem contas de outros apps.
create policy "perfis: autores e o próprio" on public.perfis for select
  using (
    id = (select auth.uid())
    or exists (select 1 from public.eventos e where e.criado_por = perfis.id)
    or exists (select 1 from public.registros r where r.usuario_id = perfis.id)
  );
create policy "perfis: editar o próprio" on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "eventos: leitura pública" on public.eventos for select
  using (not oculto or criado_por = (select auth.uid()));
create policy "eventos: criar" on public.eventos for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and inicio > now() - interval '1 day'
    and public.eventos_do_dia((select auth.uid())) < 10
  );
create policy "eventos: editar os próprios" on public.eventos for update to authenticated
  using (criado_por = (select auth.uid())) with check (criado_por = (select auth.uid()));
create policy "eventos: apagar os próprios" on public.eventos for delete to authenticated
  using (criado_por = (select auth.uid()));

create policy "confirmacoes: leitura pública" on public.confirmacoes for select using (true);
create policy "confirmacoes: confirmar na janela" on public.confirmacoes for insert to authenticated
  with check (usuario_id = (select auth.uid()) and public.janela_aberta(evento_id));
create policy "confirmacoes: desfazer a própria" on public.confirmacoes for delete to authenticated
  using (usuario_id = (select auth.uid()));

create policy "registros: leitura pública" on public.registros for select
  using (not oculto or usuario_id = (select auth.uid()));
create policy "registros: enviar na janela" on public.registros for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and public.janela_aberta(evento_id)
    and public.registros_da_hora((select auth.uid())) < 20
  );
create policy "registros: apagar os próprios" on public.registros for delete to authenticated
  using (usuario_id = (select auth.uid()));

create policy "denuncias: ver as próprias" on public.denuncias for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy "denuncias: denunciar" on public.denuncias for insert to authenticated
  with check (usuario_id = (select auth.uid()));

-- colunas que o usuário pode preencher (oculto e datas de criação ficam com o banco)
revoke insert, update on public.eventos from anon, authenticated;
grant insert (titulo, descricao, local, categoria, inicio, fim) on public.eventos to authenticated;
grant update (titulo, descricao, local, categoria, inicio, fim) on public.eventos to authenticated;
revoke insert, update on public.registros from anon, authenticated;
grant insert (evento_id, legenda, foto) on public.registros to authenticated;
revoke insert, update on public.confirmacoes from anon, authenticated;
grant insert (evento_id) on public.confirmacoes to authenticated;
revoke insert, update on public.denuncias from anon, authenticated;
grant insert (tipo, alvo_id, motivo) on public.denuncias to authenticated;
revoke update on public.perfis from anon, authenticated;
grant update (nome) on public.perfis to authenticated;

-- ---------- visões usadas pelo site ----------
create view public.eventos_resumo with (security_invoker = true) as
select e.id, e.titulo, e.descricao, e.local, e.categoria, e.inicio, e.fim, e.criado_por, e.criado_em,
       p.nome as autor,
       (select count(*) from public.confirmacoes c where c.evento_id = e.id) as confirmacoes,
       (select max(c.criado_em) from public.confirmacoes c where c.evento_id = e.id) as ultima_confirmacao,
       (select count(*) from public.registros r where r.evento_id = e.id and not r.oculto) as registros
from public.eventos e
join public.perfis p on p.id = e.criado_por;

create view public.registros_resumo with (security_invoker = true) as
select r.id, r.evento_id, r.usuario_id, r.legenda, r.foto, r.criado_em, p.nome as autor
from public.registros r
join public.perfis p on p.id = r.usuario_id;

-- ---------- fotos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: enviar na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: apagar as próprias" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
