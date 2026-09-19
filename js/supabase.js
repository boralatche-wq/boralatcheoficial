import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ⚠️ Troque pelas credenciais do NOVO projeto Supabase (com o schema novo).
// A publishable/anon key é segura para expor no front-end; o que protege
// os dados são as políticas de RLS definidas em sql/03_policies.sql.
export const supabase = createClient(
  "https://acwmqxnizgbnpalsawru.supabase.co",
  "sb_publishable_YYbrDIcCPDH-h3KZNmPd8g_7d8h2_He"
);

