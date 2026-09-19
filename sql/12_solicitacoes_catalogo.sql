-- =========================================================================
-- SOLICITAÇÕES DE CATÁLOGO
-- Prestador não encontrou o tipo de serviço ou produto que presta no
-- catálogo? Ele solicita, e cabe ao admin decidir: aceitar (cria de
-- verdade no catálogo), recusar (com motivo) ou sugerir algo que já
-- existe (evita catálogo duplicado/fragmentado).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0) QUEM É ADMIN — não é um tipo_usuario (isso é papel de negócio:
--    cliente/prestador). Admin é uma permissão à parte, então vira uma
--    flag no perfil. Depois de rodar este arquivo, marque sua própria
--    conta como admin com:
--
--    update perfis set is_admin = true where id = 'SEU-USER-ID-AQUI';
-- -------------------------------------------------------------------------

alter table perfis add column if not exists is_admin boolean not null default false;

-- -------------------------------------------------------------------------
-- 1) TABELA
-- -------------------------------------------------------------------------

create type tipo_solicitacao_catalogo as enum ('tipo_servico', 'produto', 'ambos');
create type status_solicitacao_catalogo as enum ('pendente', 'aceito', 'recusado', 'sugestao');

create table solicitacoes_catalogo (
  id                uuid primary key default gen_random_uuid(),
  solicitante_id    uuid not null references perfis(id) on delete cascade,
  tipo_solicitacao  tipo_solicitacao_catalogo not null,

  categoria_id      smallint references categorias(id),
  tipo_servico_id   int references tipos_servico(id),

  nome_tipo_servico_sugerido text,
  nome_produto_sugerido      text,

  descricao text,

  status         status_solicitacao_catalogo not null default 'pendente',
  resposta_admin text,
  catalogo_sugerido_id      int references catalogo(id),
  tipo_servico_sugerido_id  int references tipos_servico(id),

  criado_em      timestamptz not null default now(),
  respondido_em  timestamptz,

  constraint solicitacoes_catalogo_dados_check check (
    (tipo_solicitacao = 'tipo_servico' and categoria_id is not null and nome_tipo_servico_sugerido is not null)
    or
    (tipo_solicitacao = 'produto' and tipo_servico_id is not null and nome_produto_sugerido is not null)
    or
    (tipo_solicitacao = 'ambos' and categoria_id is not null and nome_tipo_servico_sugerido is not null and nome_produto_sugerido is not null)
  )
);

create index solicitacoes_catalogo_solicitante_idx on solicitacoes_catalogo (solicitante_id);
create index solicitacoes_catalogo_status_idx on solicitacoes_catalogo (status);

-- -------------------------------------------------------------------------
-- 2) RLS
-- -------------------------------------------------------------------------

alter table solicitacoes_catalogo enable row level security;

drop policy if exists "solicitacoes_ve_propria_ou_admin" on solicitacoes_catalogo;
create policy "solicitacoes_ve_propria_ou_admin" on solicitacoes_catalogo
  for select using (
    auth.uid() = solicitante_id
    or exists (select 1 from perfis where id = auth.uid() and is_admin = true)
  );

drop policy if exists "solicitacoes_insere_propria" on solicitacoes_catalogo;
create policy "solicitacoes_insere_propria" on solicitacoes_catalogo
  for insert with check (auth.uid() = solicitante_id);

drop policy if exists "solicitacoes_cancela_propria_pendente" on solicitacoes_catalogo;
create policy "solicitacoes_cancela_propria_pendente" on solicitacoes_catalogo
  for delete using (auth.uid() = solicitante_id and status = 'pendente');

drop policy if exists "solicitacoes_admin_atualiza" on solicitacoes_catalogo;
create policy "solicitacoes_admin_atualiza" on solicitacoes_catalogo
  for update using (
    exists (select 1 from perfis where id = auth.uid() and is_admin = true)
  );

grant select, insert, delete, update on solicitacoes_catalogo to authenticated;

drop policy if exists "tipos_servico_admin_insere" on tipos_servico;
create policy "tipos_servico_admin_insere" on tipos_servico
  for insert with check (
    exists (select 1 from perfis where id = auth.uid() and is_admin = true)
  );

drop policy if exists "catalogo_admin_insere" on catalogo;
create policy "catalogo_admin_insere" on catalogo
  for insert with check (
    exists (select 1 from perfis where id = auth.uid() and is_admin = true)
  );

grant insert on tipos_servico, catalogo to authenticated;

-- -------------------------------------------------------------------------
-- 3) HELPER — slug a partir de texto livre
-- -------------------------------------------------------------------------

create or replace function slugify(txt text)
returns text
language sql immutable as $$
  select trim(both '-' from
    regexp_replace(lower(unaccent_imutavel(coalesce(txt, ''))), '[^a-z0-9]+', '-', 'g')
  )
$$;

-- -------------------------------------------------------------------------
-- 4) ACEITAR — cria de verdade no catálogo e marca a solicitação
-- -------------------------------------------------------------------------

create or replace function aceitar_solicitacao_catalogo(
  p_solicitacao_id uuid,
  p_resposta text default null
) returns void
language plpgsql as $$
declare
  v_sol solicitacoes_catalogo%rowtype;
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

  if v_sol.tipo_solicitacao in ('tipo_servico', 'ambos') then
    insert into tipos_servico (categoria_id, nome, slug)
    values (v_sol.categoria_id, v_sol.nome_tipo_servico_sugerido, slugify(v_sol.nome_tipo_servico_sugerido))
    returning id into v_tipo_servico_id;
  else
    v_tipo_servico_id := v_sol.tipo_servico_id;
  end if;

  if v_sol.tipo_solicitacao in ('produto', 'ambos') then
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