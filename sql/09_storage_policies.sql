-- =========================================================================
-- STORAGE POLICIES — buckets `avatars` e `servicos`
-- RLS de tabela (public.*) é uma coisa; RLS de Storage (storage.objects) é
-- outra, totalmente separada. Sem isso, upload falha mesmo com a tabela
-- liberada — geralmente com erro "new row violates row-level security
-- policy" ou simplesmente falhando sem mensagem clara no client.
--
-- Pré-requisito: os buckets `avatars` e `servicos` já precisam existir
-- (Storage → New bucket no painel do Supabase). Marque como "Public
-- bucket" também, ou a leitura (select) das imagens não funciona.
--
-- Estrutura de caminho esperada pelos dois buckets: `<user_id>/arquivo...`
-- — é assim que os dois JS (editar-perfil.js e cadastro-servicos.js) já
-- fazem upload, então a policy usa esse primeiro segmento do caminho pra
-- saber se é o dono.
-- =========================================================================

-- ---------- BUCKET: avatars ----------

drop policy if exists "avatars_leitura_publica" on storage.objects;
create policy "avatars_leitura_publica"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_dono_insere" on storage.objects;
create policy "avatars_dono_insere"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_dono_atualiza" on storage.objects;
create policy "avatars_dono_atualiza"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_dono_deleta" on storage.objects;
create policy "avatars_dono_deleta"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------- BUCKET: servicos ----------

drop policy if exists "servicos_leitura_publica_storage" on storage.objects;
create policy "servicos_leitura_publica_storage"
on storage.objects for select
using (bucket_id = 'servicos');

drop policy if exists "servicos_dono_insere_storage" on storage.objects;
create policy "servicos_dono_insere_storage"
on storage.objects for insert
with check (
  bucket_id = 'servicos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "servicos_dono_atualiza_storage" on storage.objects;
create policy "servicos_dono_atualiza_storage"
on storage.objects for update
using (
  bucket_id = 'servicos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "servicos_dono_deleta_storage" on storage.objects;
create policy "servicos_dono_deleta_storage"
on storage.objects for delete
using (
  bucket_id = 'servicos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
