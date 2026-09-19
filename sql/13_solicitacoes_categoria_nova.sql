-- =========================================================================
-- 13a) SOLICITAR CATEGORIA NOVA — PARTE 1 de 2
-- Rode SOMENTE este arquivo primeiro. Clique em "Run", espere terminar
-- (aparecer "Success"), e só DEPOIS abra e rode o arquivo
-- 13b_solicitacoes_categoria_nova.sql.
--
-- Se rodar os dois juntos (ou colar tudo numa query só), o Postgres dá
-- o erro "unsafe use of new value ... before it has been committed",
-- porque o editor do Supabase executa o script inteiro como uma única
-- transação — o valor novo do enum só existe de fato pros outros
-- comandos depois que essa transação fecha.
-- =========================================================================

alter type tipo_solicitacao_catalogo add value if not exists 'categoria';
































-- =========================================================================
-- 13b) SOLICITAR CATEGORIA NOVA — PARTE 2 de 2
-- Só rode isso DEPOIS de já ter rodado e confirmado o
-- 13a_solicitacoes_categoria_nova.sql (o ALTER TYPE) em uma execução
-- separada. Se der o erro "unsafe use of new value", é sinal de que
-- os dois arquivos foram rodados juntos — feche a aba, abra de novo
-- só com este arquivo, e rode.
-- =========================================================================

-- novos campos: nome da categoria sugerida e um emoji opcional pra ela
alter table solicitacoes_catalogo add column if not exists nome_categoria_sugerida text;
alter table solicitacoes_catalogo add column if not exists icone_categoria_sugerido text;

-- troca a constraint pra cobrir o novo caso
alter table solicitacoes_catalogo drop constraint if exists solicitacoes_catalogo_dados_check;

alter table solicitacoes_catalogo add constraint solicitacoes_catalogo_dados_check check (
  (tipo_solicitacao = 'tipo_servico' and categoria_id is not null and nome_tipo_servico_sugerido is not null)
  or
  (tipo_solicitacao = 'produto' and tipo_servico_id is not null and nome_produto_sugerido is not null)
  or
  (tipo_solicitacao = 'ambos' and categoria_id is not null and nome_tipo_servico_sugerido is not null and nome_produto_sugerido is not null)
  or
  (tipo_solicitacao = 'categoria' and nome_categoria_sugerida is not null and nome_tipo_servico_sugerido is not null and nome_produto_sugerido is not null)
);

-- admin precisa poder inserir categoria nova também
drop policy if exists "categorias_admin_insere" on categorias;
create policy "categorias_admin_insere" on categorias
  for insert with check (
    exists (select 1 from perfis where id = auth.uid() and is_admin = true)
  );

grant insert on categorias to authenticated;

-- -------------------------------------------------------------------------
-- ACEITAR — agora também cria a categoria quando for o caso
-- -------------------------------------------------------------------------

create or replace function aceitar_solicitacao_catalogo(
  p_solicitacao_id uuid,
  p_resposta text default null
) returns void
language plpgsql as $$
declare
  v_sol solicitacoes_catalogo%rowtype;
  v_categoria_id smallint;
  v_tipo_servico_id int;
begin
  select * into v_sol from solicitacoes_catalogo where id = p_solicitacao_id;

  if not found then
    raise exception 'Solicitação não encontrada ou sem permissão de acesso';
  end if;

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