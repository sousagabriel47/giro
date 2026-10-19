-- =====================================================================
-- #GIRO | Deploy completo do banco (Supabase / PostgreSQL)
-- Execute uma vez no SQL Editor. Pode ser reexecutado sem erro nas
-- funções, gatilhos e políticas; as tabelas só são criadas se não existirem.
--
-- Conteúdo: sequência da etiqueta GR, perfis, movimentações e histórico,
-- requisições (baseadas na etiqueta GR) e histórico, funções, gatilhos e RLS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Sequência da etiqueta (GR000001, GR000002, ...)
-- ---------------------------------------------------------------------
create sequence if not exists etiqueta_seq;


-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------

-- Usuários do sistema e seus papéis
create table if not exists perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text,
  email text,
  papel text not null default 'campo'
    check (papel in ('campo','oficina','estoque','admin')),
  area text
);

-- Movimentações (uma linha por etiqueta GR)
create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null default 'GR' || lpad(nextval('etiqueta_seq')::text, 6, '0'),
  cod_material text not null,
  nome text not null,
  serie text,
  qtde int not null default 1,
  unidade text default 'PCA',
  origem text,
  destino text,
  status text not null default 'enviado_oficina'
    check (status in ('enviado_oficina','em_reparo','enviado_estoque','enviado_campo','recebido')),
  causa text,
  falha_aberta boolean default false,
  num_falha text,
  detalhes text,
  responsavel text,
  data_remocao date default current_date,
  condicao text,
  local_envio text,
  lib_data date,
  lib_resp text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

-- Histórico das movimentações
create table if not exists eventos (
  id bigint generated always as identity primary key,
  mov_id uuid references movimentacoes on delete cascade,
  status text,
  user_nome text,
  created_at timestamptz default now()
);

-- Requisições de material, identificadas pela etiqueta GR (uma por etiqueta)
create table if not exists requisicoes (
  id uuid primary key default gen_random_uuid(),
  mov_id uuid not null unique references movimentacoes on delete cascade,
  numero text unique not null,        -- número GR, copiado da movimentação por gatilho
  cod_material text not null,         -- copiado da movimentação por gatilho
  nome text not null,                 -- copiado da movimentação por gatilho
  unidade text,                       -- copiado da movimentação por gatilho
  qtde int not null default 1,
  area_destino text,
  justificativa text,
  status text not null default 'solicitada'
    check (status in ('solicitada','empenhada','enviada','recebida')),
  solicitante text,
  empenho_data date,
  empenho_resp text,
  observacao text,
  recebido_data date,
  recebido_resp text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

-- Histórico das requisições
create table if not exists req_eventos (
  id bigint generated always as identity primary key,
  req_id uuid references requisicoes on delete cascade,
  status text,
  user_nome text,
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 3. Funções e gatilhos
-- ---------------------------------------------------------------------

-- Papel do usuário logado (usado nas políticas RLS)
create or replace function meu_papel() returns text
language sql stable security definer set search_path = public as
$$ select papel from perfis where id = auth.uid() $$;

-- Cria o perfil ao cadastrar um usuário (papel inicial: campo; o admin ajusta depois)
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  insert into perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function novo_usuario();

-- Histórico automático das movimentações
create or replace function log_evento() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  if tg_op = 'INSERT' or new.status <> old.status then
    insert into eventos (mov_id, status, user_nome)
    values (new.id, new.status, (select nome from perfis where id = auth.uid()));
  end if;
  return new;
end $$;

drop trigger if exists t_log on movimentacoes;
create trigger t_log after insert or update on movimentacoes
  for each row execute function log_evento();

-- Requisição: copia número GR e dados do material da movimentação escolhida
create or replace function preenche_requisicao() returns trigger
language plpgsql security definer set search_path = public as
$$ declare m movimentacoes%rowtype;
begin
  select * into m from movimentacoes where id = new.mov_id;
  if not found then raise exception 'Etiqueta não encontrada'; end if;
  new.numero := m.numero;
  new.cod_material := m.cod_material;
  new.nome := m.nome;
  new.unidade := m.unidade;
  return new;
end $$;

drop trigger if exists t_preenche_req on requisicoes;
create trigger t_preenche_req before insert on requisicoes
  for each row execute function preenche_requisicao();

-- Histórico automático das requisições
create or replace function log_req_evento() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  if tg_op = 'INSERT' or new.status <> old.status then
    insert into req_eventos (req_id, status, user_nome)
    values (new.id, new.status, (select nome from perfis where id = auth.uid()));
  end if;
  return new;
end $$;

drop trigger if exists t_log_req on requisicoes;
create trigger t_log_req after insert or update on requisicoes
  for each row execute function log_req_evento();


-- ---------------------------------------------------------------------
-- 4. Segurança (RLS)
-- ---------------------------------------------------------------------
alter table perfis        enable row level security;
alter table movimentacoes enable row level security;
alter table eventos       enable row level security;
alter table requisicoes   enable row level security;
alter table req_eventos   enable row level security;

-- Leitura: qualquer usuário autenticado
drop policy if exists "ler perfis"       on perfis;
drop policy if exists "ler movs"         on movimentacoes;
drop policy if exists "ler eventos"      on eventos;
drop policy if exists "ler requisicoes"  on requisicoes;
drop policy if exists "ler req_eventos"  on req_eventos;
create policy "ler perfis"       on perfis        for select to authenticated using (true);
create policy "ler movs"         on movimentacoes for select to authenticated using (true);
create policy "ler eventos"      on eventos       for select to authenticated using (true);
create policy "ler requisicoes"  on requisicoes   for select to authenticated using (true);
create policy "ler req_eventos"  on req_eventos   for select to authenticated using (true);

-- Movimentações: o campo registra a remoção
drop policy if exists "campo registra remocao" on movimentacoes;
create policy "campo registra remocao" on movimentacoes for insert to authenticated
  with check (meu_papel() in ('campo','admin'));

-- Movimentações: cada papel só atua nos status que lhe cabem
drop policy if exists "atuar por papel" on movimentacoes;
create policy "atuar por papel" on movimentacoes for update to authenticated
  using (
    meu_papel() = 'admin'
    or (meu_papel() = 'oficina' and status in ('enviado_oficina','em_reparo'))
    or (meu_papel() = 'estoque' and status = 'enviado_estoque')
    or (meu_papel() = 'campo'   and status = 'enviado_campo')
  ) with check (true);

-- Requisições: o campo solicita
drop policy if exists "campo solicita" on requisicoes;
create policy "campo solicita" on requisicoes for insert to authenticated
  with check (meu_papel() in ('campo','admin'));

-- Requisições: estoque empenha e envia; campo confirma o recebimento
drop policy if exists "atuar por papel" on requisicoes;
create policy "atuar por papel" on requisicoes for update to authenticated
  using (
    meu_papel() = 'admin'
    or (meu_papel() = 'estoque' and status in ('solicitada','empenhada'))
    or (meu_papel() = 'campo'   and status = 'enviada')
  ) with check (true);


-- ---------------------------------------------------------------------
-- 5. Primeiro administrador (execute depois de criar sua conta no sistema)
-- ---------------------------------------------------------------------
-- update perfis set papel = 'admin' where email = 'voce@empresa.com';
--
-- Demais papéis: campo | oficina | estoque | admin
-- update perfis set papel = 'oficina' where email = 'fulano@empresa.com';
