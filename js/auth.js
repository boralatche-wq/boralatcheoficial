import { supabase } from "./supabase.js";

/**
 * Decide pra onde mandar o usuário depois de autenticado: se o perfil
 * (nome + tipo de usuário) ainda não existe, vai pra completar o cadastro;
 * senão, direto pro app.
 */
async function redirecionarConformePerfil(userId) {
  const { data: perfil } = await supabase
    .from("perfis")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  window.location.href = perfil ? "descobrir.html" : "completar-cadastro.html";
}

/**
 * Ao abrir a tela de login, se já existe uma sessão ativa — por exemplo,
 * a pessoa clicou no link de confirmação de email e o Supabase já criou a
 * sessão automaticamente ao carregar esta página — pula o formulário e
 * manda direto pra frente, em vez de pedir login de novo.
 */
(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) await redirecionarConformePerfil(user.id);
})();

async function login() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const senha = document.getElementById("senha").value;
  const mensagemErro = document.getElementById("mensagem-erro");

  mensagemErro.textContent = "";

  if (!email || !senha) {
    mensagemErro.textContent = "Preencha email e senha.";
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    mensagemErro.textContent =
      error.message === "Invalid login credentials"
        ? "Email ou senha inválidos. Se você acabou de se cadastrar, confirme seu email antes de entrar."
        : "Não foi possível entrar. Tente novamente.";
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await redirecionarConformePerfil(user.id);
}

window.login = login;
