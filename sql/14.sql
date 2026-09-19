-- =========================================================================
-- 14) FIX — "permission denied for sequence categorias_id_seq"
-- =========================================================================
-- O que aconteceu: a função aceitar_solicitacao_catalogo roda como
-- SECURITY INVOKER (padrão), ou seja, executa com as permissões do
-- usuário logado (role "authenticated"). O GRANT INSERT que demos em
-- categorias/tipos_servico/catalogo não é suficiente: colunas "id"
-- geradas automaticamente (serial/identity) dependem de uma sequência
-- interna (categorias_id_seq), e o Postgres trata USAGE nessa
-- sequência como uma permissão separada do INSERT na tabela.
--
-- A solução certa aqui não é ficar caçando e liberando sequência por
-- sequência (teria que fazer isso pra tipos_servico_id_seq e
-- catalogo_id_seq também, e de novo toda vez que criar uma tabela
-- nova). É trocar a função pra SECURITY DEFINER: ela passa a rodar com
-- as permissões de quem criou a função (o dono, normalmente postgres,
-- que já tem acesso total), e a checagem de "é admin mesmo?" continua
-- 100% garantida pelo IF interno da função — ninguém ganha acesso
-- extra além do que a função já faz de propósito.
-- =========================================================================

create or replace function aceitar_solicitacao_catalogo(
  p_solicitacao_id uuid,
  p_resposta text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sol solicitacoes_catalogo%rowtype;
  v_categoria_id smallint;
  v_tipo_servico_id int;
begin
  select * into v_sol from solicitacoes_catalogo where id = p_solicitacao_id;

  if not found then
    raise exception 'Solicitação não encontrada ou sem permissão de acesso';
  end if;

  -- essa checagem é o que garante que SECURITY DEFINER continua seguro:
  -- mesmo rodando com privilégios elevados, só segue adiante se quem
  -- chamou (auth.uid()) for de fato admin.
  if not exists (select 1 from perfis where id = auth.uid() and is_admin = true) then
    raise exception 'Apenas administradores podem aceitar solicitações';
  end if;

  if v_sol.status <> 'pendente' then
    raise exception 'Essa solicitação já foi respondida';
  end if;

  -- 1) categoria: cria se for pedido de categoria nova, senão usa a existente
  if v_sol.tipo_solicitacao = 'categoria' then
    insert into categorias (nome, slug, icone)
    values (
      v_sol.nome_categoria_sugerida,
      slugify(v_sol.nome_categoria_sugerida),
      coalesce(v_sol.icone_categoria_sugerido, '🆕')
    )
    returning id into v_categoria_id;
  else
    v_categoria_id := v_sol.categoria_id;
  end if;

  -- 2) tipo de serviço: cria se for categoria/tipo_servico/ambos, senão usa o existente
  if v_sol.tipo_solicitacao in ('tipo_servico', 'ambos', 'categoria') then
    insert into tipos_servico (categoria_id, nome, slug)
    values (v_categoria_id, v_sol.nome_tipo_servico_sugerido, slugify(v_sol.nome_tipo_servico_sugerido))
    returning id into v_tipo_servico_id;
  else
    v_tipo_servico_id := v_sol.tipo_servico_id;
  end if;

  -- 3) produto: cria se for produto/ambos/categoria
  if v_sol.tipo_solicitacao in ('produto', 'ambos', 'categoria') then
    insert into catalogo (tipo_servico_id, produto, slug)
    values (v_tipo_servico_id, v_sol.nome_produto_sugerido, slugify(v_sol.nome_produto_sugerido));
  end if;

  update solicitacoes_catalogo
     set status = 'aceito',
         resposta_admin = p_resposta,
         respondido_em = now()
   where id = p_solicitacao_id;
end;
$$;

grant execute on function aceitar_solicitacao_catalogo(uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- ALTERNATIVA (se preferir não usar SECURITY DEFINER por algum motivo):
-- liberar as sequências manualmente. Descomente e rode se for esse o
-- caminho escolhido — mas prefira o fix acima, é mais à prova de futuro.
-- -------------------------------------------------------------------------
-- grant usage, select on sequence categorias_id_seq to authenticated;
-- grant usage, select on sequence tipos_servico_id_seq to authenticated;
-- grant usage, select on sequence catalogo_id_seq to authenticated;