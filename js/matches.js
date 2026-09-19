import { supabase } from "./supabase.js";
import {
  criarLinkWhatsApp,
  escapeHTML,
  formatarPreco,
  urlAvatar,
  ajustarNavTrocas,
  configurarBotaoLogout,
  exigirPerfilCompleto,
} from "./utils.js";

const dashboardEl = document.getElementById("dashboardFinanceiro");

const tituloSolicitacoes = document.getElementById("tituloSolicitacoes");
const listaSolicitacoes = document.getElementById("listaSolicitacoes");
const semSolicitacoes = document.getElementById("semSolicitacoes");
const contagemSolicitacoes = document.getElementById("contagemSolicitacoes");
const ordenarSolicitacoes = document.getElementById("ordenarSolicitacoes");

const listaAgendados = document.getElementById("listaAgendados");
const semAgendados = document.getElementById("semAgendados");
const contagemAgendados = document.getElementById("contagemAgendados");

const tituloAguardandoConfirmacao = document.getElementById("tituloAguardandoConfirmacao");
const listaAguardandoConfirmacao = document.getElementById("listaAguardandoConfirmacao");
const semAguardandoConfirmacao = document.getElementById("semAguardandoConfirmacao");
const contagemAguardandoConfirmacao = document.getElementById("contagemAguardandoConfirmacao");

const listaAguardando = document.getElementById("listaAguardando");
const semAguardando = document.getElementById("semAguardando");
const contagemAguardando = document.getElementById("contagemAguardando");

const listaTrocas = document.getElementById("listaTrocas");
const semTrocas = document.getElementById("semTrocas");
const contagemTrocas = document.getElementById("contagemTrocas");

const semMatches = document.getElementById("semMatches");
const saudacao = document.getElementById("saudacao");

const modalAvaliacao = document.getElementById("modalAvaliacao");
const estrelasEl = document.getElementById("estrelas");
const comentarioEl = document.getElementById("comentarioAvaliacao");

let usuarioId = null;
let tipoUsuario = null;
let notaSelecionada = 0;
let avaliacaoPendente = null; // { agendamentoId, avaliadoId }
let solicitacoesPendentesCache = []; // guardado pra poder reordenar sem refazer a consulta

(async function init() {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  usuarioId = contexto.user.id;
  tipoUsuario = contexto.perfil.tipo_usuario;
  if (saudacao) saudacao.textContent = `Bem-vindo, ${contexto.perfil.nome || ""}`;
  ajustarNavTrocas(tipoUsuario);
  configurarBotaoLogout(supabase);

  configurarModalAvaliacao();

  if (tipoUsuario === "prestador") {
    tituloSolicitacoes.style.display = "flex";
    ordenarSolicitacoes.addEventListener("change", () => renderizarSolicitacoes());
  } else {
    tituloAguardandoConfirmacao.style.display = "flex";
  }

  await Promise.all([carregarDashboard(), carregarMatches()]);
})();

/* =========================================================
   DASHBOARD — quanto o cliente investiu / quanto o prestador recebeu
   (só conta atendimentos de SERVIÇO concluídos — troca não envolve
   dinheiro, então fica de fora da conta)
========================================================= */

async function carregarDashboard() {
  const campoUsuario = tipoUsuario === "prestador" ? "prestador_id" : "cliente_id";

  const { data, error } = await supabase
    .from("agendamentos")
    .select("id, status, match:match_id (tipo), servico:servico_id (preco)")
    .eq(campoUsuario, usuarioId)
    .eq("status", "concluido");

  if (error) {
    console.error(error);
    return;
  }

  const concluidos = (data || []).filter((a) => a.match?.tipo === "servico");
  const total = concluidos.reduce((soma, a) => soma + Number(a.servico?.preco || 0), 0);
  const qtd = concluidos.length;

  const titulo = tipoUsuario === "prestador" ? "💰 Você já recebeu" : "💰 Você já investiu";
  const legenda =
    qtd === 0
      ? "Nenhum atendimento concluído ainda"
      : `em ${qtd} atendimento${qtd > 1 ? "s" : ""} concluído${qtd > 1 ? "s" : ""}`;

  dashboardEl.innerHTML = `
    <div class="legenda">${titulo}</div>
    <div class="valor">${formatarPreco(total)}</div>
    <div class="legenda">${legenda}</div>
  `;
}

/* =========================================================
   CARREGAR MATCHES + AGENDAMENTOS (pra saber o status de cada um)
========================================================= */

async function carregarMatches() {
  const filtroMatches = `cliente_id.eq.${usuarioId},prestador_id.eq.${usuarioId},parceiro_prestador_id.eq.${usuarioId}`;

  const [matchesResp, agendamentosResp] = await Promise.all([
    supabase
      .from("matches")
      .select(
        `
        id, criado_em, tipo,
        cliente:cliente_id ( id, nome, telefone, avatar_url ),
        prestador:prestador_id ( id, nome, telefone, avatar_url ),
        parceiro:parceiro_prestador_id ( id, nome, telefone, avatar_url ),
        servico:servico_id (
          id, preco, duracao_min,
          catalogo:catalogo_id (produto),
          imagens:servico_imagens ( url, ordem )
        ),
        servico_parceiro:servico_parceiro_id (
          id, preco, duracao_min,
          catalogo:catalogo_id (produto)
        )
      `
      )
      .or(filtroMatches)
      .order("criado_em", { ascending: false }),

    supabase
      .from("agendamentos")
      .select("id, match_id, data, hora_inicio, hora_fim, status, cliente_id, prestador_id")
      .or(`cliente_id.eq.${usuarioId},prestador_id.eq.${usuarioId}`)
      .order("criado_em", { ascending: false }),
  ]);

  if (matchesResp.error) {
    console.error(matchesResp.error);
    return;
  }
  if (agendamentosResp.error) console.error(agendamentosResp.error);

  // agora pode ter MAIS DE UM agendamento pendente pro mesmo match (vários
  // clientes pedindo o mesmo horário não se aplica aqui — é 1 match por
  // par cliente/prestador — mas o mesmo match pode ter um pedido pendente
  // e, depois de recusado, um novo pedido; guardamos todos, não só o 1º).
  const agendamentosPorMatch = {};
  (agendamentosResp.data || []).forEach((a) => {
    if (!agendamentosPorMatch[a.match_id]) agendamentosPorMatch[a.match_id] = [];
    agendamentosPorMatch[a.match_id].push(a);
  });

  const matches = matchesResp.data || [];

  listaAgendados.innerHTML = "";
  listaAguardando.innerHTML = "";
  listaAguardandoConfirmacao.innerHTML = "";
  listaTrocas.innerHTML = "";
  solicitacoesPendentesCache = [];

  let qtdAgendados = 0;
  let qtdAguardando = 0;
  let qtdAguardandoConfirmacao = 0;
  let qtdTrocas = 0;

  matches.forEach((m) => {
    const agendamentosDoMatch = agendamentosPorMatch[m.id] || [];

    if (m.tipo === "troca") {
      listaTrocas.appendChild(criarCardTroca(m));
      qtdTrocas++;
      return;
    }

    // tipo === "servico" — pega o agendamento mais relevante: um
    // confirmado/em_andamento tem prioridade sobre um pendente antigo.
    const confirmado = agendamentosDoMatch.find((a) =>
      ["confirmado", "em_andamento", "concluido"].includes(a.status)
    );
    const pendentes = agendamentosDoMatch.filter((a) => a.status === "pendente");

    if (confirmado) {
      listaAgendados.appendChild(criarCardServico(m, confirmado));
      qtdAgendados++;
    } else if (pendentes.length) {
      if (tipoUsuario === "prestador") {
        // cada pedido pendente vira uma linha na área de solicitações
        pendentes.forEach((p) => solicitacoesPendentesCache.push({ match: m, agendamento: p }));
      } else {
        // cliente só vê o pedido mais recente que ele mesmo fez
        listaAguardandoConfirmacao.appendChild(criarCardServico(m, pendentes[0]));
        qtdAguardandoConfirmacao++;
      }
    } else {
      listaAguardando.appendChild(criarCardServico(m, null));
      qtdAguardando++;
    }
  });

  contagemAgendados.textContent = qtdAgendados;
  contagemAguardando.textContent = qtdAguardando;
  contagemAguardandoConfirmacao.textContent = qtdAguardandoConfirmacao;
  contagemTrocas.textContent = qtdTrocas;

  semAgendados.style.display = qtdAgendados ? "none" : "block";
  semAguardando.style.display = qtdAguardando ? "none" : "block";
  semAguardandoConfirmacao.style.display = qtdAguardandoConfirmacao ? "none" : "block";
  semTrocas.style.display = qtdTrocas ? "none" : "block";
  semMatches.style.display = matches.length ? "none" : "block";

  if (tipoUsuario === "prestador") renderizarSolicitacoes();
}

/* =========================================================
   SOLICITAÇÕES PENDENTES (só prestador) — lista ordenável
========================================================= */

function renderizarSolicitacoes() {
  const ordem = ordenarSolicitacoes.value;

  const ordenado = [...solicitacoesPendentesCache].sort((a, b) => {
    const precoA = Number(a.match.servico?.preco || 0);
    const precoB = Number(b.match.servico?.preco || 0);
    const duracaoA = Number(a.match.servico?.duracao_min || 0);
    const duracaoB = Number(b.match.servico?.duracao_min || 0);

    if (ordem === "preco_asc") return precoA - precoB;
    if (ordem === "preco_desc") return precoB - precoA;
    if (ordem === "duracao_asc") return duracaoA - duracaoB;
    if (ordem === "duracao_desc") return duracaoB - duracaoA;
    // "recente": mantém a ordem que já veio (mais recente primeiro)
    return 0;
  });

  listaSolicitacoes.innerHTML = "";
  contagemSolicitacoes.textContent = ordenado.length;
  semSolicitacoes.style.display = ordenado.length ? "none" : "block";

  ordenado.forEach(({ match, agendamento }) => {
    listaSolicitacoes.appendChild(criarLinhaSolicitacao(match, agendamento));
  });
}

function criarLinhaSolicitacao(m, agendamento) {
  const cliente = m.cliente;
  const produto = m.servico?.catalogo?.produto || "Serviço";
  const avatarUrl = cliente?.avatar_url || urlAvatar(supabase, cliente?.id);

  const linha = document.createElement("div");
  linha.className = "solicitacao-card";

  linha.innerHTML = `
    <img src="${avatarUrl}" onerror="this.src='../img/avatar.png'">
    <div class="solicitacao-info">
      <h4>${escapeHTML(cliente?.nome || "Cliente")}</h4>
      <p>${escapeHTML(produto)} • ${formatarPreco(m.servico?.preco)} • ${m.servico?.duracao_min}min</p>
      <p>📅 ${formatarDataBR(agendamento.data)} às ${agendamento.hora_inicio?.slice(0, 5)}</p>
    </div>
    <div class="solicitacao-acoes">
      <button class="btn-aceitar">✅ Aceitar</button>
      <button class="btn-recusar">✕ Recusar</button>
    </div>
  `;

  linha.querySelector(".btn-aceitar").addEventListener("click", () => aceitarSolicitacao(agendamento.id));
  linha.querySelector(".btn-recusar").addEventListener("click", () => recusarSolicitacao(agendamento.id));

  return linha;
}

async function aceitarSolicitacao(agendamentoId) {
  if (!confirm("Aceitar esse pedido? Outros pedidos pro mesmo horário serão recusados automaticamente.")) return;

  const { error } = await supabase.rpc("aceitar_agendamento", { p_agendamento_id: agendamentoId });

  if (error) {
    console.error(error);
    alert(`Não foi possível aceitar: ${error.message}`);
    return;
  }

  await carregarMatches();
}

async function recusarSolicitacao(agendamentoId) {
  if (!confirm("Recusar esse pedido?")) return;

  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado" })
    .eq("id", agendamentoId);

  if (error) {
    console.error(error);
    alert("Não foi possível recusar. Tente novamente.");
    return;
  }

  await carregarMatches();
}

/* =========================================================
   CARD — match de SERVIÇO (cliente ↔ prestador)
========================================================= */

function criarCardServico(m, agendamento) {
  const souPrestador = tipoUsuario === "prestador";
  const outraPessoa = souPrestador ? m.cliente : m.prestador;
  const produto = m.servico?.catalogo?.produto || "Serviço";

  const card = document.createElement("div");
  card.className = "card";

  const linkWhatsApp = criarLinkWhatsApp(
    outraPessoa?.telefone,
    `Olá ${outraPessoa?.nome || ""}, vim através do Boralá Tche sobre ${produto}!`
  );

  const avatarUrl = outraPessoa?.avatar_url || urlAvatar(supabase, outraPessoa?.id);
  const imagensServico = (m.servico?.imagens || []).slice().sort((a, b) => a.ordem - b.ordem);

  const slidesHtml = imagensServico.length
    ? imagensServico.map((img) => `<img src="${img.url}" class="match-slide-img">`).join("")
    : `<div class="match-sem-foto">📸</div>`;

  const indicadoresHtml =
    imagensServico.length > 1
      ? `<div class="match-indicadores">
          ${imagensServico.map((_, i) => `<span class="dot ${i === 0 ? "ativo" : ""}"></span>`).join("")}
         </div>`
      : "";

  const statusHtml = agendamento
    ? `<span class="match-status status-${agendamento.status}">${rotuloStatus(agendamento.status)}</span>
       <p class="match-preco">📅 ${formatarDataBR(agendamento.data)} às ${agendamento.hora_inicio?.slice(0, 5)}</p>`
    : "";

  const podeFinalizar = agendamento && ["confirmado", "em_andamento"].includes(agendamento.status);

  card.innerHTML = `
    <button class="btn-deslike">❌</button>

    <div class="match-header">
      <img class="match-avatar" src="${avatarUrl}" onerror="this.src='../img/avatar.png'">
      <div class="match-header-texto">
        <h3>${escapeHTML(outraPessoa?.nome || "Usuário")}</h3>
        <span class="match-badge match-badge-servico">❤ Serviço</span>
      </div>
    </div>

    <div class="match-media">
      <div class="match-slider">
        <div class="match-slides">${slidesHtml}</div>
        ${indicadoresHtml}
      </div>
    </div>

    <div class="card-content">
      <p class="match-produto">${escapeHTML(produto)}</p>
      ${m.servico?.preco ? `<p class="match-preco">${formatarPreco(m.servico.preco)} • ${m.servico.duracao_min}min</p>` : ""}
      ${statusHtml}

      <div class="match-acoes">
        ${linkWhatsApp ? `<a class="btn-whatsapp" href="${linkWhatsApp}" target="_blank">WhatsApp</a>` : ""}
        ${
          podeFinalizar
            ? `<button class="btn-agendar btn-finalizar">✅ Finalizar</button>`
            : !agendamento
            ? `<button class="btn-agendar btn-ir-agenda">📅 Agendar</button>`
            : ""
        }
      </div>
    </div>
  `;

  card.querySelector(".btn-deslike").addEventListener("click", async () => {
    await supabase.from("matches").delete().eq("id", m.id);
    card.remove();
  });

  card.querySelector(".btn-ir-agenda")?.addEventListener("click", () => {
    location.href = `agendar.html?match=${m.id}`;
  });

  card.querySelector(".btn-finalizar")?.addEventListener("click", () =>
    finalizarAgendamento(agendamento, m, outraPessoa)
  );

  // Só abre perfil público de quem é PRESTADOR — se eu sou o prestador,
  // a "outra pessoa" aqui é um cliente, que não tem perfil público de
  // serviços pra mostrar.
  if (!souPrestador) {
    const header = card.querySelector(".match-header");
    header.classList.add("clicavel");
    header.addEventListener("click", () => irParaPerfilPublico(outraPessoa?.id));
  }

  if (imagensServico.length > 1) ativarSliderMatch(card);

  return card;
}

function irParaPerfilPublico(prestadorId) {
  if (!prestadorId) return;
  location.href = `perfil-publico.html?id=${prestadorId}`;
}

/* =========================================================
   CARD — match de TROCA (prestador ↔ prestador)
========================================================= */

function criarCardTroca(m) {
  const parceiro = m.parceiro;
  const meuServico = m.servico?.catalogo?.produto || "seu serviço";
  const servicoDele = m.servico_parceiro?.catalogo?.produto || "o serviço dele(a)";

  const card = document.createElement("div");
  card.className = "card";

  const linkWhatsApp = criarLinkWhatsApp(
    parceiro?.telefone,
    `Olá ${parceiro?.nome || ""}, vim através do Boralá Tche sobre nossa troca de serviço!`
  );

  const avatarUrl = parceiro?.avatar_url || urlAvatar(supabase, parceiro?.id);

  card.innerHTML = `
    <button class="btn-deslike">❌</button>

    <div class="match-header">
      <img class="match-avatar" src="${avatarUrl}" onerror="this.src='../img/avatar.png'">
      <div class="match-header-texto">
        <h3>${escapeHTML(parceiro?.nome || "Prestador")}</h3>
        <span class="match-badge match-badge-troca">🔄 Troca</span>
      </div>
    </div>

    <div class="card-content" style="padding-top:14px">
      <p class="match-produto">🎁 Você oferece: ${escapeHTML(meuServico)}</p>
      <p class="match-produto">🎉 Você recebe: ${escapeHTML(servicoDele)}</p>

      <div class="match-acoes">
        ${linkWhatsApp ? `<a class="btn-whatsapp" href="${linkWhatsApp}" target="_blank">Combinar no WhatsApp</a>` : ""}
      </div>
    </div>
  `;

  card.querySelector(".btn-deslike").addEventListener("click", async () => {
    await supabase.from("matches").delete().eq("id", m.id);
    card.remove();
  });

  const header = card.querySelector(".match-header");
  header.classList.add("clicavel");
  header.addEventListener("click", () => irParaPerfilPublico(parceiro?.id));

  return card;
}

/* =========================================================
   FINALIZAR ATENDIMENTO + AVALIAÇÃO
========================================================= */

async function finalizarAgendamento(agendamento, match, outraPessoa) {
  if (!confirm("Confirmar que esse atendimento já foi concluído?")) return;

  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "concluido" })
    .eq("id", agendamento.id);

  if (error) {
    console.error(error);
    alert("Não foi possível finalizar. Tente novamente.");
    return;
  }

  avaliacaoPendente = {
    agendamentoId: agendamento.id,
    avaliadoId: outraPessoa?.id,
  };

  notaSelecionada = 0;
  atualizarEstrelas();
  comentarioEl.value = "";
  modalAvaliacao.classList.remove("hidden");

  await carregarDashboard();
  await carregarMatches();
}

function configurarModalAvaliacao() {
  estrelasEl.querySelectorAll("span").forEach((estrela) => {
    estrela.addEventListener("click", () => {
      notaSelecionada = Number(estrela.dataset.nota);
      atualizarEstrelas();
    });
  });

  document.getElementById("btnPularAvaliacao").addEventListener("click", () => {
    modalAvaliacao.classList.add("hidden");
    avaliacaoPendente = null;
  });

  document.getElementById("btnEnviarAvaliacao").addEventListener("click", async () => {
    if (!avaliacaoPendente) return;

    if (!notaSelecionada) {
      alert("Escolhe pelo menos 1 estrela, ou clica em Pular.");
      return;
    }

    const { error } = await supabase.from("avaliacoes").insert({
      agendamento_id: avaliacaoPendente.agendamentoId,
      avaliador_id: usuarioId,
      avaliado_id: avaliacaoPendente.avaliadoId,
      nota: notaSelecionada,
      comentario: comentarioEl.value.trim() || null,
    });

    if (error) console.error(error);

    modalAvaliacao.classList.add("hidden");
    avaliacaoPendente = null;
  });
}

function atualizarEstrelas() {
  estrelasEl.querySelectorAll("span").forEach((estrela) => {
    estrela.classList.toggle("ativa", Number(estrela.dataset.nota) <= notaSelecionada);
  });
}

/* =========================================================
   HELPERS
========================================================= */

function rotuloStatus(status) {
  const rotulos = {
    pendente: "⏳ Pendente",
    confirmado: "✅ Confirmado",
    em_andamento: "🔵 Em andamento",
    concluido: "✅ Concluído",
    cancelado: "❌ Cancelado",
  };
  return rotulos[status] || status;
}

function formatarDataBR(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function ativarSliderMatch(card) {
  const slides = card.querySelector(".match-slides");
  const dots = card.querySelectorAll(".match-indicadores .dot");
  if (!slides) return;

  let index = 0;
  const total = slides.children.length;

  slides.addEventListener("click", () => {
    index = (index + 1) % total;
    slides.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("ativo", i === index));
  });
}
