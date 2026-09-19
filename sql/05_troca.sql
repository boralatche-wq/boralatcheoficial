-- =========================================================================
-- TROCA DE SERVIÇO ENTRE PRESTADORES
-- Ex.: uma manicure troca um atendimento com uma cabeleireira.
-- Diferente do match de serviço (cliente → prestador, que já nasce
-- confirmado ao curtir), aqui o match só existe quando OS DOIS prestadores
-- curtem um ao outro — por isso existe um gatilho dedicado.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Coluna extra em `swipes`: qual serviço MEU estou oferecendo na troca
--    (só é preenchida quando alvo_tipo = 'troca_prestador')
-- -------------------------------------------------------------------------

alter table swipes
  add column servico_oferecido_id uuid references servicos_prestador(id);

comment on column swipes.servico_id is
  'Para alvo_tipo=servico: o serviço que estou curtindo. Para troca_prestador: o serviço DELE que eu quero.';
comment on column swipes.servico_oferecido_id is
  'Só usado em alvo_tipo=troca_prestador: qual serviço MEU estou propondo em troca.';

-- -------------------------------------------------------------------------
-- 2) FUNÇÃO — FILA DE TROCA (estilo Tinder, só entre prestadores)
--    Mostra serviços de OUTROS prestadores que batem com os interesses
--    que este prestador salvou em `interesses_busca`.
-- -------------------------------------------------------------------------

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

-- -------------------------------------------------------------------------
-- 3) TRIGGER — cria o match de troca automaticamente quando os dois lados
--    curtiram um ao outro (reciprocidade).
-- -------------------------------------------------------------------------

create or replace function trg_criar_match_troca()
returns trigger language plpgsql security definer as $$
declare
  reciproco swipes%rowtype;
begin
  if new.alvo_tipo <> 'troca_prestador' or new.curtiu is not true then
    return new;
  end if;

  select * into reciproco
    from swipes
   where usuario_id = new.alvo_id
     and alvo_tipo = 'troca_prestador'
     and alvo_id = new.usuario_id
     and curtiu = true
   limit 1;

  if found then
    if not exists (
      select 1 from matches
       where tipo = 'troca'
         and (
           (prestador_id = new.usuario_id and parceiro_prestador_id = new.alvo_id)
           or (prestador_id = new.alvo_id and parceiro_prestador_id = new.usuario_id)
         )
    ) then
      insert into matches (
        tipo, prestador_id, parceiro_prestador_id,
        servico_id, servico_parceiro_id
      ) values (
        'troca', new.usuario_id, new.alvo_id,
        new.servico_oferecido_id, reciproco.servico_oferecido_id
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger swipes_cria_match_troca
  after insert on swipes
  for each row execute function trg_criar_match_troca();

-- -------------------------------------------------------------------------
-- 4) VIEW auxiliar — detalhes prontos de um match de troca (usada na tela
--    de Matches para mostrar "o que eu ofereço" x "o que eu recebo")
-- -------------------------------------------------------------------------

create or replace view trocas_detalhadas as
select
  m.id as match_id,
  m.criado_em,
  m.prestador_id,
  p1.nome as prestador_nome,
  p1.telefone as prestador_telefone,
  p1.avatar_url as prestador_avatar,
  m.parceiro_prestador_id,
  p2.nome as parceiro_nome,
  p2.telefone as parceiro_telefone,
  p2.avatar_url as parceiro_avatar,
  sp1.id as meu_servico_id,
  c1.produto as meu_servico_produto,
  sp2.id as servico_parceiro_id,
  c2.produto as servico_parceiro_produto
from matches m
join perfis p1 on p1.id = m.prestador_id
join perfis p2 on p2.id = m.parceiro_prestador_id
left join servicos_prestador sp1 on sp1.id = m.servico_id
left join catalogo c1 on c1.id = sp1.catalogo_id
left join servicos_prestador sp2 on sp2.id = m.servico_parceiro_id
left join catalogo c2 on c2.id = sp2.catalogo_id
where m.tipo = 'troca';
