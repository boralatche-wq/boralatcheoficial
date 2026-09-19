-- =========================================================================
-- BUSCA HÍBRIDA — full-text + fuzzy + geolocalização + ranking por nota
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0) unaccent() é STABLE no Postgres, não IMMUTABLE — e colunas geradas
--    exigem IMMUTABLE. Este wrapper resolve isso (o dicionário de acentos
--    não muda em produção, então é seguro tratá-lo como imutável aqui).
-- -------------------------------------------------------------------------

create or replace function unaccent_imutavel(text)
returns text
language sql immutable parallel safe strict as
$$ select unaccent('unaccent', $1) $$;

-- -------------------------------------------------------------------------
-- 1) Colunas de busca (tsvector) geradas automaticamente
-- -------------------------------------------------------------------------

alter table catalogo
  add column busca tsvector
  generated always as (to_tsvector('portuguese', unaccent_imutavel(produto))) stored;

alter table servicos_prestador
  add column busca tsvector
  generated always as (to_tsvector('portuguese', unaccent_imutavel(coalesce(descricao, '')))) stored;

create index catalogo_busca_gin        on catalogo using gin (busca);
create index catalogo_produto_trgm     on catalogo using gin (produto gin_trgm_ops);
create index servicos_prestador_busca_gin on servicos_prestador using gin (busca);

-- -------------------------------------------------------------------------
-- 2) Distância em km entre dois pontos (haversine) — usado para "perto de você"
-- -------------------------------------------------------------------------

create or replace function distancia_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * acos(
      least(1, greatest(-1,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
        + sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  end
$$;

-- -------------------------------------------------------------------------
-- 3) VIEW: catálogo de serviços "prontos para exibir" (junta tudo que a UI usa)
-- -------------------------------------------------------------------------

create or replace view servicos_disponiveis as
select
  sp.id                as servico_id,
  sp.prestador_id,
  pr.nome              as prestador_nome,
  pr.avatar_url        as prestador_avatar,
  pr.cidade,
  pr.estado,
  pr.bairro,
  pr.latitude,
  pr.longitude,
  pr.nota_media,
  pr.total_avaliacoes,
  c.id                 as catalogo_id,
  c.produto,
  ts.id                as tipo_servico_id,
  ts.nome              as tipo_servico,
  cat.id               as categoria_id,
  cat.nome             as categoria,
  sp.preco,
  sp.sinal_percentual,
  sp.duracao_min,
  sp.descricao,
  sp.ativo,
  sp.criado_em,
  coalesce(
    (select array_agg(si.url order by si.ordem)
       from servico_imagens si where si.servico_id = sp.id),
    array[]::text[]
  ) as imagens
from servicos_prestador sp
join perfis pr        on pr.id = sp.prestador_id
join catalogo c        on c.id = sp.catalogo_id
join tipos_servico ts  on ts.id = c.tipo_servico_id
join categorias cat    on cat.id = ts.categoria_id;

-- -------------------------------------------------------------------------
-- 4) FUNÇÃO PRINCIPAL — BARRA DE BUSCA
--    Combina: texto livre (full-text + fuzzy), filtros de categoria/tipo,
--    faixa de preço, distância e ordenação por relevância/nota/preço/perto.
-- -------------------------------------------------------------------------

create or replace function buscar_servicos(
  p_termo          text default null,
  p_categoria_id   smallint default null,
  p_tipo_servico_id int default null,
  p_preco_min      numeric default null,
  p_preco_max      numeric default null,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_raio_km        double precision default null,
  p_ordenar_por    text default 'relevancia',  -- relevancia | preco_asc | preco_desc | nota | distancia
  p_limite         int default 30,
  p_offset         int default 0,
  p_usuario_id     uuid default null -- quem está buscando: exclui os próprios serviços do resultado
) returns table (
  servico_id uuid, prestador_id uuid, prestador_nome text, prestador_avatar text,
  cidade text, estado text, bairro text, nota_media numeric, total_avaliacoes int,
  produto text, tipo_servico text, categoria text,
  preco numeric, sinal_percentual smallint, duracao_min smallint, descricao text,
  imagens text[], distancia_km double precision, relevancia real
)
language sql stable as $$
  with base as (
    select
      sd.*,
      distancia_km(p_lat, p_lng, sd.latitude, sd.longitude) as dist,
      case
        when p_termo is null or p_termo = '' then 0
        else
          ts_rank(
            to_tsvector('portuguese', unaccent_imutavel(sd.produto)) ||
            to_tsvector('portuguese', unaccent_imutavel(coalesce(sd.descricao,''))) ||
            to_tsvector('portuguese', unaccent_imutavel(sd.categoria)) ||
            to_tsvector('portuguese', unaccent_imutavel(sd.tipo_servico)),
            websearch_to_tsquery('portuguese', unaccent_imutavel(p_termo))
          )
          + similarity(unaccent_imutavel(sd.produto), unaccent_imutavel(p_termo)) * 0.5
      end as rel
    from servicos_disponiveis sd
    where sd.ativo
      and (p_usuario_id is null or sd.prestador_id <> p_usuario_id)
      and (p_categoria_id is null or sd.categoria_id = p_categoria_id)
      and (p_tipo_servico_id is null or sd.tipo_servico_id = p_tipo_servico_id)
      and (p_preco_min is null or sd.preco >= p_preco_min)
      and (p_preco_max is null or sd.preco <= p_preco_max)
      and (
        p_termo is null or p_termo = '' or
        to_tsvector('portuguese', unaccent_imutavel(sd.produto || ' ' || coalesce(sd.descricao,'') || ' ' || sd.categoria || ' ' || sd.tipo_servico))
          @@ websearch_to_tsquery('portuguese', unaccent_imutavel(p_termo))
        or similarity(unaccent_imutavel(sd.produto), unaccent_imutavel(p_termo)) > 0.15
      )
  )
  select
    servico_id, prestador_id, prestador_nome, prestador_avatar,
    cidade, estado, bairro, nota_media, total_avaliacoes,
    produto, tipo_servico, categoria,
    preco, sinal_percentual, duracao_min, descricao,
    imagens, dist, rel
  from base
  where p_raio_km is null or dist is null or dist <= p_raio_km
  order by
    case when p_ordenar_por = 'preco_asc'  then preco end asc nulls last,
    case when p_ordenar_por = 'preco_desc' then preco end desc nulls last,
    case when p_ordenar_por = 'nota'       then nota_media end desc nulls last,
    case when p_ordenar_por = 'distancia'  then dist end asc nulls last,
    case when p_ordenar_por = 'relevancia' then rel end desc,
    nota_media desc nulls last
  limit p_limite offset p_offset
$$;

-- -------------------------------------------------------------------------
-- 5) FUNÇÃO — FILA DE SWIPE (estilo Tinder)
--    Retorna candidatos que o usuário ainda não avaliou, priorizando:
--    1) o que ele marcou em "interesses_busca"  2) perto dele  3) melhor nota
-- -------------------------------------------------------------------------

create or replace function fila_swipe(
  p_usuario_id uuid,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_limite     int default 20,
  p_raio_km    double precision default null
) returns table (
  servico_id uuid, prestador_id uuid, prestador_nome text, prestador_avatar text,
  cidade text, estado text, nota_media numeric, total_avaliacoes int,
  produto text, tipo_servico text, categoria text,
  preco numeric, sinal_percentual smallint, duracao_min smallint, descricao text,
  imagens text[], distancia_km double precision, combina_interesse boolean
)
language sql stable as $$
  with base as (
    select
      sd.servico_id, sd.prestador_id, sd.prestador_nome, sd.prestador_avatar,
      sd.cidade, sd.estado, sd.nota_media, sd.total_avaliacoes,
      sd.produto, sd.tipo_servico, sd.categoria,
      sd.preco, sd.sinal_percentual, sd.duracao_min, sd.descricao,
      sd.imagens, sd.criado_em,
      distancia_km(p_lat, p_lng, sd.latitude, sd.longitude) as dist,
      exists (
        select 1 from interesses_busca ib
         where ib.usuario_id = p_usuario_id and ib.catalogo_id = sd.catalogo_id
      ) as combina_interesse
    from servicos_disponiveis sd
    where sd.ativo
      and sd.prestador_id <> p_usuario_id
      and not exists (
        select 1 from swipes s
         where s.usuario_id = p_usuario_id
           and s.alvo_tipo = 'servico'
           and s.servico_id = sd.servico_id
           and (
             s.curtiu = true                              -- like: fica escondido pra sempre (já virou match)
             or s.criado_em > now() - interval '2 hours'   -- deslike: expira em 2h e reaparece
           )
      )
  )
  select
    servico_id, prestador_id, prestador_nome, prestador_avatar,
    cidade, estado, nota_media, total_avaliacoes,
    produto, tipo_servico, categoria,
    preco, sinal_percentual, duracao_min, descricao,
    imagens, dist, combina_interesse
  from base
  where p_raio_km is null or dist is null or dist <= p_raio_km
  order by
    combina_interesse desc,
    dist asc nulls last,
    nota_media desc nulls last,
    criado_em desc
  limit p_limite
$$;
