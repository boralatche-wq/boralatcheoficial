import { supabase } from "./supabase.js";

async function enviarRecuperacao() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const mensagemErro = document.getElementById("mensagem-erro");
  const mensagemSucesso = document.getElementById("mensagem-sucesso");
  const btn = document.getElementById("btnEnviar");

  mensagemErro.textContent = "";
  mensagemSucesso.textContent = "";

  if (!email) {
    mensagemErro.textContent = "Preencha seu email.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Enviando...";

  // redirectTo: pra onde o Supabase manda o usuário depois de clicar no
  // link do email — precisa ser essa mesma URL (ajustada pro domínio real
  // quando publicar) e essa URL precisa estar na lista de "Redirect URLs"
  // em Authentication → URL Configuration no painel do Supabase, senão o
  // link do email não funciona.
  const redirectTo = new URL("redefinir-senha.html", window.location.href).toString();

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  btn.disabled = false;
  btn.textContent = "Enviar link";

  // Por segurança, o Supabase não avisa se o email existe ou não — sempre
  // mostra a mesma mensagem de sucesso, então não dá pra usar isso pra
  // descobrir quem tem conta.
  if (error && !error.message.includes("rate limit")) {
    console.error(error);
  }

  mensagemSucesso.textContent = "Se esse email tiver uma conta, o link chega em instantes. Confere também a caixa de spam.";
}

window.enviarRecuperacao = enviarRecuperacao;
