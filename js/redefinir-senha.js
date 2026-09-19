import { supabase } from "./supabase.js";

const areaFormulario = document.getElementById("areaFormulario");
const mensagemLink = document.getElementById("mensagemLink");

// Ao clicar no link do email, o Supabase estabelece uma sessão temporária
// de recuperação e dispara esse evento — é aí que liberamos o formulário.
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    mostrarFormulario();
  }
});

// Fallback: se a sessão já estiver pronta antes do listener rodar (ou o
// evento não disparar por algum motivo do navegador), confere direto.
(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    mostrarFormulario();
    return;
  }

  // dá um tempinho pro Supabase processar o token que veio na URL antes
  // de desistir e mostrar "link inválido"
  setTimeout(async () => {
    const {
      data: { session: sessaoTardia },
    } = await supabase.auth.getSession();

    if (sessaoTardia) {
      mostrarFormulario();
    } else {
      mensagemLink.textContent =
        "Link inválido ou expirado. Peça um novo em 'Esqueci a senha'.";
    }
  }, 2500);
})();

function mostrarFormulario() {
  areaFormulario.style.display = "block";
  mensagemLink.style.display = "none";
}

async function salvarNovaSenha() {
  const novaSenha = document.getElementById("novaSenha").value;
  const confirmarSenha = document.getElementById("confirmarSenha").value;
  const mensagemErro = document.getElementById("mensagem-erro");
  const btn = document.getElementById("btnSalvar");

  mensagemErro.textContent = "";

  if (novaSenha.length < 6) {
    mensagemErro.textContent = "A senha precisa ter pelo menos 6 caracteres.";
    return;
  }
  if (novaSenha !== confirmarSenha) {
    mensagemErro.textContent = "As senhas não coincidem.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Salvando...";

  const { error } = await supabase.auth.updateUser({ password: novaSenha });

  if (error) {
    mensagemErro.textContent = error.message;
    btn.disabled = false;
    btn.textContent = "Salvar nova senha";
    return;
  }

  alert("Senha alterada! Você já pode entrar com ela.");
  window.location.href = "index.html";
}

window.salvarNovaSenha = salvarNovaSenha;
