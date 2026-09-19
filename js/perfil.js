import { supabase } from "./supabase.js";
import { escapeHTML, formatarPreco, urlAvatar, ajustarNavTrocas,
  configurarBotaoLogout, exigirPerfilCompleto } from "./utils.js";

const fotoPerfil     = document.getElementById("fotoPerfil");
const nomeUsuario    = document.getElementById("nomeUsuario");
const tipoUsuarioEl  = document.getElementById("tipoUsuario");
const enderecoUsuario = document.getElementById("enderecoUsuario");
const notaUsuario    = document.getElementById("notaUsuario");
const gridProdutos   = document.getElementById("gridProdutos");
const agendaResumo   = document.getElementById("agendaResumo");
const btnTrocarTipo  = document.getElementById("btnTrocarTipo");

let usuarioId = null;
let tipoUsuarioAtual = null;

(async () => {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  const { user, perfil } = contexto;
  usuarioId = user.id;
  tipoUsuarioAtual = perfil.tipo_usuario;

  nomeUsuario.textContent = perfil.nome;
  tipoUsuarioEl.textContent = perfil.tipo_usuario;
  enderecoUsuario.textContent = `📍 ${perfil.bairro ? perfil.bairro + ", " : ""}${perfil.cidade || ""} - ${perfil.estado || ""}`;
  if (notaUsuario) {
    notaUsuario.textContent = perfil.total_avaliacoes
      ? `⭐ ${perfil.nota_media} (${perfil.total_avaliacoes} avaliações)`
      : "Ainda sem avaliações";
  }

  fotoPerfil.src = perfil.avatar_url || urlAvatar(supabase, user.id);
  ajustarNavTrocas(perfil.tipo_usuario);
  configurarBotaoLogout(supabase);
  configurarBotaoTrocarTipo();

  const linkMeusServicos = document.getElementById("linkMeusServicos");
  if (linkMeusServicos) {
    linkMeusServicos.style.display = perfil.tipo_usuario === "prestador" ? "inline" : "none";
  }

  if (perfil.tipo_usuario === "prestador") {
    await carregarMeusServicos();
    await carregarAgendaResumo();
  }
})();

/* =========================================================
   TROCAR TIPO DE CONTA (cliente ↔ prestador)
   Pode ser feito a qualquer momento, não só no cadastro — importante
   porque a escolha inicial fica travada até o email ser confirmado.
========================================================= */

function configurarBotaoTrocarTipo() {
  if (!btnTrocarTipo) return;

  btnTrocarTipo.textContent =
    tipoUsuarioAtual === "prestador"
      ? "🔁 Trocar para cliente"
      : "🔁 Virar prestador de serviço";

  btnTrocarTipo.addEventListener("click", trocarTipoUsuario);
}

async function trocarTipoUsuario() {
  const novoTipo = tipoUsuarioAtual === "prestador" ? "cliente" : "prestador";

  const mensagem =
    novoTipo === "cliente"
      ? "Ao trocar para cliente, seus serviços cadastrados ficam pausados (somem da busca) até você virar prestador de novo. Quer continuar?"
      : "Você vai virar prestador de serviço. Se já tinha serviços cadastrados antes, eles voltam a ficar ativos. Quer continuar?";

  if (!confirm(mensagem)) return;

  const { error: erroPerfil } = await supabase
    .from("perfis")
    .update({ tipo_usuario: novoTipo })
    .eq("id", usuarioId);

  if (erroPerfil) {
    console.error(erroPerfil);
    alert("Não foi possível trocar o tipo de conta. Tente novamente.");
    return;
  }

  // Pausa ou reativa os serviços já cadastrados — sem apagar nada, então
  // se a pessoa for e voltar, o catálogo continua lá.
  const { error: erroServicos } = await supabase
    .from("servicos_prestador")
    .update({ ativo: novoTipo === "prestador" })
    .eq("prestador_id", usuarioId);

  if (erroServicos) console.error(erroServicos);

  window.location.href =
    novoTipo === "prestador" ? "editar-perfil.html" : "descobrir.html";
}

/* =========================================================
   MEUS SERVIÇOS (vitrine)
========================================================= */

async function carregarMeusServicos() {
  const { data, error } = await supabase
    .from("servicos_prestador")
    .select(
      `
      id, preco, duracao_min, ativo,
      catalogo:catalogo_id ( produto, tipos_servico:tipo_servico_id ( nome, categorias:categoria_id (nome) ) ),
      servico_imagens ( url, ordem )
    `
    )
    .eq("prestador_id", usuarioId)
    .eq("ativo", true);

  if (error) {
    console.error(error);
    return;
  }

  gridProdutos.innerHTML = "";

  (data || []).forEach((s) => {
    const imagens = (s.servico_imagens || [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => i.url);

    const card = document.createElement("div");
    card.className = "produto-card";
    card.innerHTML = `
      <div class="slider">
        <div class="slides">
          ${
            imagens.length
              ? imagens.map((img) => `<img src="${img}" class="slide-img">`).join("")
              : `<img src="../img/sem_imagem.jpg" class="slide-img">`
          }
        </div>
      </div>
      <div class="produto-info">
        <h4 class="corcard">${escapeHTML(s.catalogo?.produto || "")}</h4>
        <p class="tag">${escapeHTML(s.catalogo?.tipos_servico?.categorias?.nome || "")}</p>
        <p class="corcard_2">${formatarPreco(s.preco)} • ${s.duracao_min}min</p>
      </div>
    `;
    gridProdutos.appendChild(card);
  });
}

/* =========================================================
   RESUMO DA AGENDA DE HOJE
========================================================= */

async function carregarAgendaResumo() {
  if (!agendaResumo) return;

  const { data, error } = await supabase
    .from("horarios_atendimento")
    .select("*")
    .eq("prestador_id", usuarioId)
    .order("dia_semana");

  if (error) {
    console.error(error);
    return;
  }

  const nomesDias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const hojeIndex = new Date().getDay();
  const hoje = (data || []).find((h) => h.dia_semana === hojeIndex);

  let html = `<div class="agenda-header"><h3>📅 Hoje (${nomesDias[hojeIndex]})</h3>
    <span class="ver-mais" id="toggleAgenda">Ver semana</span></div>`;

  html += hoje
    ? `<div class="hoje-box"><span class="horario">🟢 ${hoje.horario_inicio} → ${hoje.horario_fim}</span></div>
       ${hoje.intervalo_inicio ? `<div class="intervalo">☕ ${hoje.intervalo_inicio} → ${hoje.intervalo_fim}</div>` : ""}`
    : `<div class="hoje-box"><span class="fechado">❌ Fechado hoje</span></div>`;

  html += `<div class="lista-completa" id="listaCompleta" style="display:none">`;
  nomesDias.forEach((nome, i) => {
    const h = (data || []).find((d) => d.dia_semana === i);
    html += `<div class="linha-dia"><span>${nome}</span>
      ${h ? `🟢 ${h.horario_inicio}–${h.horario_fim}` : `<span class="fechado">Fechado</span>`}</div>`;
  });
  html += `</div>`;

  agendaResumo.innerHTML = html;

  const btn = document.getElementById("toggleAgenda");
  const lista = document.getElementById("listaCompleta");
  let aberto = false;
  btn.addEventListener("click", () => {
    aberto = !aberto;
    lista.style.display = aberto ? "block" : "none";
    btn.textContent = aberto ? "Ocultar" : "Ver semana";
  });
}
