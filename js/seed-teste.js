import { supabase } from "./supabase.js";
import { USUARIOS_TESTE } from "./usuarios-teste.js";

const btnCriar = document.getElementById("btnCriar");
const logEl = document.getElementById("log");

function log(msg) {
  logEl.textContent += `\n${msg}`;
}

btnCriar.addEventListener("click", async () => {
  btnCriar.disabled = true;
  btnCriar.textContent = "Criando...";
  logEl.textContent = "Iniciando...";

  for (const u of USUARIOS_TESTE) {
    await criarUsuario(u);
  }

  // Garante que ninguém fica "logado" como o último usuário de teste criado
  await supabase.auth.signOut();

  log("\n✅ Concluído! Vá em index.html e use o login rápido pra entrar.");
  btnCriar.textContent = "Concluído";
});

async function criarUsuario(u) {
  log(`\n→ ${u.email} (${u.tipo})...`);

  const { data, error: signupError } = await supabase.auth.signUp({
    email: u.email,
    password: u.senha,
  });

  if (signupError) {
    // já existe = ok, só avisa e segue (idempotente)
    if (signupError.message.includes("already registered")) {
      log(`   já existia, pulando.`);
      return;
    }
    log(`   ❌ erro no signup: ${signupError.message}`);
    return;
  }

  if (!data.session) {
    log(`   ⚠️ sem sessão (confirmação de email está ligada?). Perfil NÃO criado.`);
    return;
  }

  const { error: perfilError } = await supabase.from("perfis").insert({
    id: data.user.id,
    nome: u.nome,
    tipo_usuario: u.tipo,
    telefone: u.telefone,
    cidade: u.cidade,
    estado: u.estado,
    bairro: u.bairro,
  });

  if (perfilError) {
    log(`   ⚠️ conta criada, mas erro ao salvar perfil: ${perfilError.message}`);
    return;
  }

  log(`   ✅ criado.`);

  // precisa deslogar entre uma criação e outra, senão a próxima chamada de
  // signUp herda a sessão da anterior de forma confusa em alguns navegadores
  await supabase.auth.signOut();
}
