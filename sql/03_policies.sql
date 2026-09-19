-- =========================================================================
-- ROW LEVEL SECURITY
-- Script idempotente: cada policy leva um "drop if exists" antes, então é
-- seguro rodar esse arquivo de novo (ex.: depois de um erro no meio) sem
-- precisar rodar 00_drop_tudo.sql.
-- =========================================================================

alter table perfis               enable row level security;
alter table catalogo              enable row level security;
alter table categorias            enable row level security;
alter table tipos_servico         enable row level security;
alter table servicos_prestador    enable row level security;
alter table servico_imagens       enable row level security;
alter table horarios_atendimento  enable row level security;
alter table interesses_busca      enable row level security;
alter table swipes                enable row level security;
alter table matches               enable row level security;
alter table agendamentos          enable row level security;
alter table avaliacoes            enable row level security;

-- PERFIS: qualquer um autenticado pode ler (é o "perfil público"),
-- só o dono pode editar o próprio.
drop policy if exists "perfis_leitura_publica" on perfis;
create policy "perfis_leitura_publica" on perfis
  for select using (true);

drop policy if exists "perfis_edita_proprio" on perfis;
create policy "perfis_edita_proprio" on perfis
  for update using (auth.uid() = id);

drop policy if exists "perfis_insere_proprio" on perfis;
create policy "perfis_insere_proprio" on perfis
  for insert with check (auth.uid() = id);

-- CATÁLOGO / CATEGORIAS / TIPOS: leitura pública, escrita só via service_role
drop policy if exists "catalogo_leitura" on catalogo;
create policy "catalogo_leitura" on catalogo for select using (true);

drop policy if exists "categorias_leitura" on categorias;
create policy "categorias_leitura" on categorias for select using (true);

drop policy if exists "tipos_servico_leitura" on tipos_servico;
create policy "tipos_servico_leitura" on tipos_servico for select using (true);

-- SERVIÇOS DO PRESTADOR: leitura pública (é a vitrine), só o dono edita
drop policy if exists "servicos_leitura_publica" on servicos_prestador;
create policy "servicos_leitura_publica" on servicos_prestador
  for select using (true);

drop policy if exists "servicos_dono_insere" on servicos_prestador;
create policy "servicos_dono_insere" on servicos_prestador
  for insert with check (auth.uid() = prestador_id);

drop policy if exists "servicos_dono_atualiza" on servicos_prestador;
create policy "servicos_dono_atualiza" on servicos_prestador
  for update using (auth.uid() = prestador_id);

drop policy if exists "servicos_dono_deleta" on servicos_prestador;
create policy "servicos_dono_deleta" on servicos_prestador
  for delete using (auth.uid() = prestador_id);

-- IMAGENS: leitura pública, escrita só do prestador dono do serviço
drop policy if exists "imagens_leitura_publica" on servico_imagens;
create policy "imagens_leitura_publica" on servico_imagens
  for select using (true);

drop policy if exists "imagens_dono_gerencia" on servico_imagens;
create policy "imagens_dono_gerencia" on servico_imagens
  for all using (
    exists (
      select 1 from servicos_prestador sp
      where sp.id = servico_imagens.servico_id
        and sp.prestador_id = auth.uid()
    )
  );

-- HORÁRIOS: leitura pública (agenda é pública), só o dono edita
drop policy if exists "horarios_leitura_publica" on horarios_atendimento;
create policy "horarios_leitura_publica" on horarios_atendimento
  for select using (true);

drop policy if exists "horarios_dono_gerencia" on horarios_atendimento;
create policy "horarios_dono_gerencia" on horarios_atendimento
  for all using (auth.uid() = prestador_id);

-- INTERESSES DE BUSCA: só o próprio usuário vê e edita
drop policy if exists "interesses_proprio" on interesses_busca;
create policy "interesses_proprio" on interesses_busca
  for all using (auth.uid() = usuario_id);

-- SWIPES: só o próprio usuário vê e cria os seus
drop policy if exists "swipes_proprio_le" on swipes;
create policy "swipes_proprio_le" on swipes
  for select using (auth.uid() = usuario_id);

drop policy if exists "swipes_proprio_insere" on swipes;
create policy "swipes_proprio_insere" on swipes
  for insert with check (auth.uid() = usuario_id);

drop policy if exists "swipes_proprio_deleta" on swipes;
create policy "swipes_proprio_deleta" on swipes
  for delete using (auth.uid() = usuario_id);

-- MATCHES: cada lado do match pode ver
drop policy if exists "matches_participantes" on matches;
create policy "matches_participantes" on matches
  for select using (
    auth.uid() in (cliente_id, prestador_id, parceiro_prestador_id)
  );

-- MATCHES: criação — cobre tanto o match direto de serviço (cliente_id = eu)
-- quanto o match de troca criado pelo trigger (prestador_id = eu, ver 05_troca.sql)
drop policy if exists "matches_insere_participante" on matches;
create policy "matches_insere_participante" on matches
  for insert with check (
    auth.uid() = cliente_id or auth.uid() = prestador_id
  );

-- MATCHES: qualquer lado pode remover (equivalente a "desfazer match")
drop policy if exists "matches_deleta_participante" on matches;
create policy "matches_deleta_participante" on matches
  for delete using (
    auth.uid() in (cliente_id, prestador_id, parceiro_prestador_id)
  );

-- AGENDAMENTOS: cliente ou prestador envolvido
drop policy if exists "agendamentos_participantes_le" on agendamentos;
create policy "agendamentos_participantes_le" on agendamentos
  for select using (auth.uid() in (cliente_id, prestador_id));

drop policy if exists "agendamentos_participantes_insere" on agendamentos;
create policy "agendamentos_participantes_insere" on agendamentos
  for insert with check (auth.uid() in (cliente_id, prestador_id));

drop policy if exists "agendamentos_participantes_atualiza" on agendamentos;
create policy "agendamentos_participantes_atualiza" on agendamentos
  for update using (auth.uid() in (cliente_id, prestador_id));

-- AVALIAÇÕES: leitura pública (fazem parte da nota do perfil),
-- só quem participou do agendamento pode avaliar
drop policy if exists "avaliacoes_leitura_publica" on avaliacoes;
create policy "avaliacoes_leitura_publica" on avaliacoes
  for select using (true);

drop policy if exists "avaliacoes_insere_participante" on avaliacoes;
create policy "avaliacoes_insere_participante" on avaliacoes
  for insert with check (
    auth.uid() = avaliador_id
    and exists (
      select 1 from agendamentos a
      where a.id = agendamento_id
        and auth.uid() in (a.cliente_id, a.prestador_id)
        and a.status = 'concluido'
    )
  );
