-- =========================================================================
-- BORALÁ TCHE — SCHEMA NOVO (do zero)
-- Marketplace de serviços com busca híbrida: barra de busca + swipe (tinder)
-- =========================================================================
-- Como aplicar:
--   1. Crie um projeto novo no Supabase (ou um schema novo no mesmo projeto).
--   2. Rode este arquivo, depois 02_search.sql, 03_policies.sql e 04_seed.sql
--      nessa ordem, no SQL Editor do Supabase.
-- =========================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- busca "parecida" (fuzzy)
create extension if not exists unaccent;   -- busca sem acento

-- -------------------------------------------------------------------------
-- ENUMS
-- -------------------------------------------------------------------------

create type tipo_usuario as enum ('cliente', 'prestador', 'locador');

create type status_agendamento as enum (
  'pendente', 'confirmado', 'em_andamento', 'concluido', 'cancelado'
);

create type alvo_swipe as enum (
  'servico',          -- cliente/prestador avaliando um serviço ofertado
  'procura_cliente',  -- prestador avaliando um pedido de cliente
  'troca_prestador'   -- prestador avaliando outro prestador p/ troca de serviço
);

create type tipo_match as enum ('servico', 'troca');

-- -------------------------------------------------------------------------
-- PERFIS (1:1 com auth.users)
-- -------------------------------------------------------------------------

create table perfis (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  tipo_usuario    tipo_usuario not null default 'cliente',
  telefone        text,
  bio             text,
  cidade          text,
  estado          text,
  bairro          text,
  latitude        double precision,
  longitude       double precision,
  avatar_url      text,
  nota_media      numeric(3,2) default 0,
  total_avaliacoes int default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index perfis_tipo_idx on perfis (tipo_usuario);
create index perfis_geo_idx  on perfis (latitude, longitude);

-- -------------------------------------------------------------------------
-- CATÁLOGO (categoria > tipo de serviço > produto/serviço)
-- -------------------------------------------------------------------------

create table categorias (
  id    smallserial primary key,
  nome  text not null unique,
  slug  text not null unique,
  icone text
);

create table tipos_servico (
  id           serial primary key,
  categoria_id smallint not null references categorias(id) on delete cascade,
  nome         text not null,
  slug         text not null,
  unique (categoria_id, slug)
);

create table catalogo (
  id              serial primary key,
  tipo_servico_id int not null references tipos_servico(id) on delete cascade,
  produto         text not null,
  slug            text not null,
  criado_em       timestamptz not null default now()
);

create index catalogo_tipo_idx on catalogo (tipo_servico_id);

-- -------------------------------------------------------------------------
-- SERVIÇOS OFERECIDOS PELO PRESTADOR
-- -------------------------------------------------------------------------

create table servicos_prestador (
  id               uuid primary key default gen_random_uuid(),
  prestador_id     uuid not null references perfis(id) on delete cascade,
  catalogo_id      int  not null references catalogo(id),
  preco            numeric(10,2) not null check (preco >= 0),
  sinal_percentual smallint not null default 0 check (sinal_percentual between 0 and 100),
  duracao_min      smallint not null default 30 check (duracao_min > 0),
  descricao        text,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (prestador_id, catalogo_id)
);

create index servicos_prestador_ativo_idx    on servicos_prestador (ativo) where ativo;
create index servicos_prestador_catalogo_idx on servicos_prestador (catalogo_id);
create index servicos_prestador_prestador_idx on servicos_prestador (prestador_id);

create table servico_imagens (
  id         bigserial primary key,
  servico_id uuid not null references servicos_prestador(id) on delete cascade,
  url        text not null,
  ordem      smallint not null default 0,
  unique (servico_id, ordem) -- necessário pro upsert(onConflict: "servico_id,ordem")
);

-- -------------------------------------------------------------------------
-- AGENDA DO PRESTADOR
-- -------------------------------------------------------------------------

create table horarios_atendimento (
  id               bigserial primary key,
  prestador_id     uuid not null references perfis(id) on delete cascade,
  dia_semana       smallint not null check (dia_semana between 0 and 6), -- 0=domingo
  horario_inicio   time not null,
  horario_fim      time not null,
  intervalo_inicio time,
  intervalo_fim    time,
  unique (prestador_id, dia_semana)
);

-- -------------------------------------------------------------------------
-- INTERESSES DE BUSCA (o que o cliente/prestador está procurando)
-- -------------------------------------------------------------------------

create table interesses_busca (
  id          bigserial primary key,
  usuario_id  uuid not null references perfis(id) on delete cascade,
  catalogo_id int  not null references catalogo(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  unique (usuario_id, catalogo_id)
);

create index interesses_busca_usuario_idx  on interesses_busca (usuario_id);
create index interesses_busca_catalogo_idx on interesses_busca (catalogo_id);

-- -------------------------------------------------------------------------
-- SWIPES (like/dislike unificado — substitui cliente_match / prestador_match)
-- -------------------------------------------------------------------------

create table swipes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references perfis(id) on delete cascade,
  alvo_tipo   alvo_swipe not null,
  alvo_id     uuid not null,   -- id do outro usuário (perfil) sendo avaliado
  servico_id  uuid references servicos_prestador(id) on delete cascade,
  curtiu      boolean not null,
  criado_em   timestamptz not null default now(),
  unique (usuario_id, alvo_tipo, alvo_id, servico_id)
);

create index swipes_usuario_idx on swipes (usuario_id);
create index swipes_alvo_idx    on swipes (alvo_tipo, alvo_id);

-- -------------------------------------------------------------------------
-- MATCHES (quando os dois lados curtem)
-- -------------------------------------------------------------------------

create table matches (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  tipo_match not null default 'servico',
  cliente_id            uuid references perfis(id) on delete cascade,
  prestador_id          uuid references perfis(id) on delete cascade,
  parceiro_prestador_id uuid references perfis(id) on delete cascade, -- troca entre prestadores
  servico_id            uuid references servicos_prestador(id) on delete cascade,
  servico_parceiro_id   uuid references servicos_prestador(id) on delete cascade,
  criado_em             timestamptz not null default now()
);

create index matches_cliente_idx   on matches (cliente_id);
create index matches_prestador_idx on matches (prestador_id);

-- -------------------------------------------------------------------------
-- AGENDAMENTOS
-- -------------------------------------------------------------------------

create table agendamentos (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid references matches(id) on delete set null,
  cliente_id       uuid not null references perfis(id),
  prestador_id     uuid not null references perfis(id),
  servico_id       uuid not null references servicos_prestador(id),
  data             date not null,
  hora_inicio      time not null,
  hora_fim         time not null,
  status           status_agendamento not null default 'pendente',
  inicio_cliente   boolean not null default false,
  inicio_prestador boolean not null default false,
  fim_cliente      boolean not null default false,
  fim_prestador    boolean not null default false,
  criado_em        timestamptz not null default now()
);

create index agendamentos_prestador_data_idx on agendamentos (prestador_id, data);
create index agendamentos_cliente_data_idx   on agendamentos (cliente_id, data);

-- -------------------------------------------------------------------------
-- AVALIAÇÕES (novo — não existia antes, essencial p/ ranquear a busca)
-- -------------------------------------------------------------------------

create table avaliacoes (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  avaliador_id   uuid not null references perfis(id),
  avaliado_id    uuid not null references perfis(id),
  nota           smallint not null check (nota between 1 and 5),
  comentario     text,
  criado_em      timestamptz not null default now(),
  unique (agendamento_id, avaliador_id)
);

create index avaliacoes_avaliado_idx on avaliacoes (avaliado_id);

-- -------------------------------------------------------------------------
-- trigger utilitário: manter atualizado_em em dia
-- -------------------------------------------------------------------------

create or replace function trg_atualizar_timestamp()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger perfis_atualizado_em
  before update on perfis
  for each row execute function trg_atualizar_timestamp();

create trigger servicos_prestador_atualizado_em
  before update on servicos_prestador
  for each row execute function trg_atualizar_timestamp();

-- -------------------------------------------------------------------------
-- trigger: recalcular nota_media do perfil quando entra avaliação
-- -------------------------------------------------------------------------

create or replace function trg_atualizar_nota_media()
returns trigger language plpgsql as $$
begin
  update perfis p
     set nota_media = sub.media,
         total_avaliacoes = sub.total
    from (
      select avaliado_id,
             round(avg(nota)::numeric, 2) as media,
             count(*) as total
        from avaliacoes
       where avaliado_id = new.avaliado_id
       group by avaliado_id
    ) sub
   where p.id = sub.avaliado_id;
  return new;
end;
$$;

create trigger avaliacoes_atualiza_nota
  after insert on avaliacoes
  for each row execute function trg_atualizar_nota_media();
