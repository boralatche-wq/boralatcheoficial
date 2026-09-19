-- =========================================================================
-- RESET DE DESLIKE APÓS 2 HORAS
-- Antes, qualquer swipe (like OU deslike) excluía o serviço da fila PRA
-- SEMPRE. Isso é certo pro like (já virou match, não precisa reaparecer),
-- mas errado pro deslike — a pessoa pode ter passado batido, ou mudado de
-- ideia, e o serviço não pode ficar indisponível pro resto da vida.
--
-- Agora: like continua permanente. Deslike expira em 2h e o serviço volta
-- a aparecer na fila (tanto no Descobrir quanto na Troca).
-- =========================================================================

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

create or replace function fila_troca(
  p_usuario_id uuid,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_limite     int default 20,
  p_raio_km    double precision default null
) returns table (
  prestador_id uuid, prestador_nome text, prestador_avatar text,
  cidade text, estado text, nota_media numeric, total_avaliacoes int,
  servico_desejado_id uuid, produto_desejado text, categoria_desejada text,
  preco_desejado numeric, duracao_desejado smallint, descricao_desejada text,
  imagens_desejado text[], distancia_km double precision
)
language sql stable as $$
  with base as (
    select
      sd.prestador_id, sd.prestador_nome, sd.prestador_avatar,
      sd.cidade, sd.estado, sd.nota_media, sd.total_avaliacoes,
      sd.servico_id, sd.produto, sd.categoria,
      sd.preco, sd.duracao_min, sd.descricao,
      sd.imagens, sd.criado_em,
      distancia_km(p_lat, p_lng, sd.latitude, sd.longitude) as dist
    from servicos_disponiveis sd
    join interesses_busca ib
      on ib.catalogo_id = sd.catalogo_id
     and ib.usuario_id = p_usuario_id
    join perfis alvo
      on alvo.id = sd.prestador_id
     and alvo.tipo_usuario = 'prestador'
    where sd.ativo
      and sd.prestador_id <> p_usuario_id
      and not exists (
        select 1 from swipes s
         where s.usuario_id = p_usuario_id
           and s.alvo_tipo = 'troca_prestador'
           and s.alvo_id = sd.prestador_id
           and s.servico_id = sd.servico_id
           and (
             s.curtiu = true                              -- like: fica escondido pra sempre (já virou match)
             or s.criado_em > now() - interval '2 hours'   -- deslike: expira em 2h e reaparece
           )
      )
  )
  select
    prestador_id, prestador_nome, prestador_avatar,
    cidade, estado, nota_media, total_avaliacoes,
    servico_id, produto, categoria,
    preco, duracao_min, descricao,
    imagens, dist
  from base
  where p_raio_km is null or dist is null or dist <= p_raio_km
  order by dist asc nulls last, nota_media desc nulls last, criado_em desc
  limit p_limite
$$;

-- =========================================================================
-- TRAVA CONTRA MATCH DE SERVIÇO DUPLICADO
-- Como o deslike agora expira e o serviço pode reaparecer, e a busca por
-- texto nunca escondeu serviço já avaliado, vale garantir que curtir de
-- novo o mesmo serviço não crie um match repetido em `matches`.
-- (Matches de troca já são protegidos por outra checagem, no trigger.)
-- =========================================================================

alter table matches drop constraint if exists matches_servico_unico;

-- remove duplicatas de match de serviço que já possam existir (mantém o
-- mais antigo de cada grupo), senão o ALTER TABLE abaixo falha
delete from matches a
using matches b
where a.tipo = 'servico'
  and b.tipo = 'servico'
  and a.cliente_id = b.cliente_id
  and a.prestador_id = b.prestador_id
  and a.servico_id = b.servico_id
  and a.criado_em > b.criado_em;

alter table matches
  add constraint matches_servico_unico
  unique (tipo, cliente_id, prestador_id, servico_id);
