-- =========================================================================
-- GRANTS EXPLÍCITOS — necessário ALÉM da RLS.
-- RLS decide quais LINHAS você pode tocar; GRANT decide se você pode
-- tocar na TABELA. Sem o grant, o Postgres barra antes mesmo de avaliar
-- a policy (é exatamente o erro 42501 / "permission denied for table").
-- Script idempotente: seguro rodar quantas vezes precisar.
-- =========================================================================

grant usage on schema public to authenticated, anon;

-- Leitura pública (catálogo/categorias/tipos — não editável pelo app,
-- só leitura; escrita fica só para o SQL editor / service_role)
grant select on categorias, tipos_servico, catalogo to authenticated;

-- Perfis: leitura pública, dono edita/insere o próprio
grant select, insert, update on perfis to authenticated;

-- Serviços do prestador + imagens
grant select, insert, update, delete on servicos_prestador to authenticated;
grant select, insert, update, delete on servico_imagens to authenticated;

-- Horários de atendimento
grant select, insert, update, delete on horarios_atendimento to authenticated;

-- Interesses de busca (usados na busca de troca e no swipe)
grant select, insert, update, delete on interesses_busca to authenticated;

-- Swipes e matches
grant select, insert, delete on swipes to authenticated;
grant select, insert, delete on matches to authenticated;

-- Agendamentos (o que estava faltando)
grant select, insert, update on agendamentos to authenticated;

-- Avaliações
grant select, insert on avaliacoes to authenticated;

-- Sequências: tabelas com id serial/bigserial (não uuid) precisam de
-- permissão na sequência também, senão o INSERT falha mesmo com o GRANT
-- da tabela acima (esse é o próximo erro que apareceria se não fizermos
-- isso agora).
grant usage, select on sequence servico_imagens_id_seq to authenticated;
grant usage, select on sequence horarios_atendimento_id_seq to authenticated;
grant usage, select on sequence interesses_busca_id_seq to authenticated;
