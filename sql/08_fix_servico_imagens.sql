-- =========================================================================
-- CORREÇÃO — servico_imagens estava sem UNIQUE(servico_id, ordem).
-- O upsert em js/cadastro-servicos.js usa
-- `.upsert(..., { onConflict: "servico_id,ordem" })`, e isso EXIGE uma
-- constraint única nessas colunas — sem ela, o Postgres recusa com
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Script seguro rodar mesmo se já tiver dados de teste.
-- =========================================================================

-- Se por algum teste já ficou mais de uma imagem com o mesmo
-- (servico_id, ordem), remove os duplicados mais antigos antes de criar a
-- constraint (senão o ALTER TABLE abaixo falha).
delete from servico_imagens a
using servico_imagens b
where a.servico_id = b.servico_id
  and a.ordem = b.ordem
  and a.id < b.id;

-- Remove o índice antigo (não-único) se existir, pra não ficar redundante
-- com o índice que a constraint única cria sozinha.
drop index if exists servico_imagens_servico_idx;

alter table servico_imagens
  add constraint servico_imagens_servico_id_ordem_key unique (servico_id, ordem);
