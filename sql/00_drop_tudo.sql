-- =========================================================================
-- DROP TOTAL — apaga tudo do schema "Boralá Tche novo" antes de recriar.
-- Rode ISSO primeiro, depois 01_schema.sql → 05_troca.sql na ordem normal.
-- Seguro rodar mesmo que só parte das tabelas/funções tenha sido criada
-- (tudo com IF EXISTS / CASCADE).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) VIEWS
-- -------------------------------------------------------------------------

drop view if exists trocas_detalhadas cascade;
drop view if exists servicos_disponiveis cascade;

-- -------------------------------------------------------------------------
-- 2) TABELAS (ordem inversa de dependência — CASCADE cuida de triggers,
--    policies, índices e FKs automaticamente)
-- -------------------------------------------------------------------------

drop table if exists avaliacoes            cascade;
drop table if exists agendamentos          cascade;
drop table if exists matches               cascade;
drop table if exists swipes                cascade;
drop table if exists interesses_busca      cascade;
drop table if exists horarios_atendimento  cascade;
drop table if exists servico_imagens       cascade;
drop table if exists servicos_prestador    cascade;
drop table if exists catalogo              cascade;
drop table if exists tipos_servico         cascade;
drop table if exists categorias            cascade;
drop table if exists perfis                cascade;

-- -------------------------------------------------------------------------
-- 3) FUNÇÕES (as tabelas já levaram os triggers junto, mas as funções
--    ficam órfãs e precisam ser apagadas à parte)
-- -------------------------------------------------------------------------

drop function if exists ocupacao_prestador(uuid) cascade;
drop function if exists fila_troca(uuid, double precision, double precision, int) cascade;
drop function if exists trg_criar_match_troca() cascade;
drop function if exists fila_swipe(uuid, double precision, double precision, int) cascade;
drop function if exists buscar_servicos(
  text, smallint, int, numeric, numeric,
  double precision, double precision, double precision, text, int, int
) cascade;
drop function if exists distancia_km(double precision, double precision, double precision, double precision) cascade;
drop function if exists unaccent_imutavel(text) cascade;
drop function if exists trg_atualizar_nota_media() cascade;
drop function if exists trg_atualizar_timestamp() cascade;

-- -------------------------------------------------------------------------
-- 4) ENUMS (tipos customizados)
-- -------------------------------------------------------------------------

drop type if exists tipo_match      cascade;
drop type if exists alvo_swipe      cascade;
drop type if exists status_agendamento cascade;
drop type if exists tipo_usuario    cascade;

-- -------------------------------------------------------------------------
-- 5) EXTENSÕES — deixei comentado de propósito.
--    Elas são compartilhadas pelo projeto Supabase inteiro; só descomente
--    se tiver certeza de que nada mais no projeto depende delas.
-- -------------------------------------------------------------------------

-- drop extension if exists pg_trgm;
-- drop extension if exists unaccent;
-- drop extension if exists pgcrypto;

-- Pronto. Agora rode, na ordem: 01_schema.sql → 02_busca.sql →
-- 03_policies.sql → 04_seed.sql → 05_troca.sql
