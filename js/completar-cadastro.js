import { supabase } from "./supabase.js";
import { exigirSessao } from "./utils.js";

let usuario = null;

(async () => {
  usuario = await exigirSessao(supabase);
  if (!usuario) return;

  // Se o perfil já existe (ex.: usuário voltou nessa página por engano),
  // não faz sentido pedir de novo — manda direto pro app.
  const { data: perfilExistente } = await supabase
    .from("perfis")
    .select("id, tipo_usuario")
    .eq("id", usuario.id)
    .maybeSingle();

  if (perfilExistente) {
    redirecionarPosCadastro(perfilExistente.tipo_usuario);
  }
})();

async function completarCadastro() {
  const nome = document.getElementById("nome").value.trim();
  const tipoUsuario =
    document.querySelector('input[name="tipo_usuario"]:checked')?.value || "cliente";
  const mensagemErro = document.getElementById("mensagem-erro");

  mensagemErro.textContent = "";

  if (!nome) {
    mensagemErro.textContent = "Preencha seu nome.";
    return;
  }

  const { error } = await supabase.from("perfis").insert({
    id: usuario.id,
    nome,
    tipo_usuario: tipoUsuario,
  });

  if (error) {
    console.error(error);
    mensagemErro.textContent = "Não foi possível salvar seu perfil. Tente novamente.";
    return;
  }

  redirecionarPosCadastro(tipoUsuario);
}

function redirecionarPosCadastro(tipoUsuario) {
  window.location.href =
    tipoUsuario === "prestador" ? "editar-perfil.html" : "descobrir.html";
}

window.completarCadastro = completarCadastro;
