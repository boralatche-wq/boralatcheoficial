import { supabase } from "./supabase.js";
import { criarLinkWhatsApp, ajustarNavTrocas,
  configurarBotaoLogout, exigirPerfilCompleto } from "./utils.js";

const grid = document.getElementById("gridDias");
const mesAno = document.getElementById("mesAno");
const listaHorarios = document.getElementById("listaHorarios");
const dataSelecionada = document.getElementById("dataSelecionada");

const modal = document.getElementById("modalAgendamento");
const modalBody = document.getElementById("modalBody");
const fecharModal = document.getElementById("fecharModal");

fecharModal.onclick = () => modal.classList.add("hidden");

let dataAtual = new Date();
let horariosUsuario = [];
let agendamentosUsuario = [];
let usuarioLogado = null;
let souPrestador = false;

/* ================= HELPERS ================= */

function formatarISO(data) {
  const local = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return local.toISOString().split("T")[0];
}

function toMin(hora) {
  if (!hora) return 0;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function toHora(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ================= CARREGAR DADOS ================= */

async function carregarTudo() {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  const { user, perfil } = contexto;
  usuarioLogado = perfil;
  souPrestador = perfil.tipo_usuario === "prestador";
  ajustarNavTrocas(perfil.tipo_usuario);
  configurarBotaoLogout(supabase);

  const campoUsuario = souPrestador ? "prestador_id" : "cliente_id";

  // horarios_atendimento só existe pra quem PRESTA serviço — cliente não
  // tem "horário de trabalho", só os próprios agendamentos. Por isso essa
  // busca só roda pra prestador; pra cliente, horariosUsuario fica vazio
  // de propósito (a tela usa outra lógica pra ele, ver gerarHorarios()).
  const [horarios, agendamentos] = await Promise.all([
    souPrestador
      ? supabase.from("horarios_atendimento").select("*").eq("prestador_id", user.id)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("agendamentos")
      .select(
        `
        *,
        cliente:cliente_id ( nome, telefone ),
        prestador:prestador_id ( nome, telefone ),
        servico:servico_id ( duracao_min, catalogo:catalogo_id (produto) )
      `
      )
      .eq(campoUsuario, user.id),
  ]);

  if (horarios.error) console.error("Erro ao carregar horários:", horarios.error);
  if (agendamentos.error) console.error("Erro ao carregar agendamentos:", agendamentos.error);

  horariosUsuario = horarios.data || [];
  agendamentosUsuario = agendamentos.data || [];
}

/* ================= OCUPAÇÃO ================= */

function getOcupacao(min, data) {
  for (const ag of agendamentosUsuario) {
    if (ag.data !== data) continue;

    const duracao = Number(ag.servico?.duracao_min || 30);
    const inicio = toMin(ag.hora_inicio);
    const fim = inicio + duracao;

    if (min >= inicio && min < fim) return { ag, inicio, fim };
  }
  return null;
}

function agendamentosDoDia(data) {
  return agendamentosUsuario
    .filter((a) => a.data === data)
    .sort((a, b) => toMin(a.hora_inicio) - toMin(b.hora_inicio));
}

function existeOcupacao(data) {
  return agendamentosUsuario.some((a) => a.data === data);
}

/* ================= CALENDÁRIO ================= */

function gerarCalendario() {
  grid.innerHTML = "";

  const ano = dataAtual.getFullYear();
  const mes = dataAtual.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  mesAno.textContent = `${meses[mes]} ${ano}`;

  let start = primeiro.getDay();
  if (start === 0) start = 7;
  for (let i = 1; i < start; i++) grid.innerHTML += "<div></div>";

  for (let d = 1; d <= ultimo.getDate(); d++) {
    const data = new Date(ano, mes, d);
    const iso = formatarISO(data);

    const div = document.createElement("div");
    div.textContent = d;

    // "dia-disponivel" (destaque de dia de trabalho) só faz sentido pra
    // prestador — cliente não tem agenda de trabalho, só agendamentos.
    const trabalha = souPrestador && horariosUsuario.some((h) => h.dia_semana === data.getDay());
    const ocupado = existeOcupacao(iso);

    if (trabalha) div.classList.add("dia-disponivel");
    if (ocupado) div.classList.add("dia-ocupado");

    div.onclick = () => {
      document.querySelectorAll(".grid-dias div").forEach((el) => el.classList.remove("dia-ativo"));
      div.classList.add("dia-ativo");
      gerarHorarios(data);
    };

    grid.appendChild(div);
  }
}

/* ================= HORÁRIOS / AGENDAMENTOS DO DIA ================= */

function gerarHorarios(data) {
  listaHorarios.innerHTML = "";
  const iso = formatarISO(data);
  dataSelecionada.textContent = data.toLocaleDateString("pt-BR");

  if (souPrestador) {
    gerarGradeDeHorarios(data, iso);
  } else {
    gerarListaDeAgendamentosCliente(iso);
  }
}

// PRESTADOR: grade completa do dia de trabalho, com os horários ocupados
// destacados (comportamento original, sem mudança).
function gerarGradeDeHorarios(data, iso) {
  const config = horariosUsuario.find((h) => h.dia_semana === data.getDay());

  if (!config) {
    listaHorarios.innerHTML = "<p>Sem horários de atendimento configurados pra esse dia.</p>";
    return;
  }

  const inicio = toMin(config.horario_inicio);
  const fim = toMin(config.horario_fim);

  for (let t = inicio; t <= fim; t += 20) criarSlot(t, iso);
}

// CLIENTE: não existe "grade de trabalho" — mostra direto os agendamentos
// que ele tem marcados naquele dia (pode ser com prestadores diferentes).
function gerarListaDeAgendamentosCliente(iso) {
  const doDia = agendamentosDoDia(iso);

  if (!doDia.length) {
    listaHorarios.innerHTML = "<p>Nenhum agendamento seu nesse dia.</p>";
    return;
  }

  doDia.forEach((ag) => {
    const item = document.createElement("div");
    item.className = "horario-item indisponivel";
    item.textContent = `${ag.hora_inicio.slice(0, 5)} — ${ag.servico?.catalogo?.produto || "Serviço"}`;
    item.style.gridColumn = "1 / -1";
    item.style.textAlign = "left";
    item.style.padding = "10px 14px";
    item.onclick = () => abrirModal({ ag, inicio: toMin(ag.hora_inicio), fim: toMin(ag.hora_inicio) + Number(ag.servico?.duracao_min || 30) });
    listaHorarios.appendChild(item);
  });
}

function criarSlot(min, data) {
  const hora = toHora(min);
  const slot = document.createElement("div");
  slot.className = "horario-item";
  slot.textContent = hora;

  const ocupacao = getOcupacao(min, data);
  if (ocupacao) {
    slot.classList.add("indisponivel");
    slot.onclick = () => abrirModal(ocupacao);
  }

  listaHorarios.appendChild(slot);
}

/* ================= MODAL ================= */

function abrirModal(oc) {
  // Guarda defensiva: só abre se realmente vier um agendamento válido,
  // pra nunca mostrar o modal em branco.
  if (!oc?.ag) {
    console.warn("abrirModal chamado sem um agendamento válido:", oc);
    return;
  }

  const { ag, fim } = oc;
  const isCliente = usuarioLogado.tipo_usuario === "cliente";

  const outraPessoa = isCliente ? ag.prestador : ag.cliente;
  const telefone = outraPessoa?.telefone;
  const linkWhatsApp = criarLinkWhatsApp(telefone, `Olá ${outraPessoa?.nome}, sobre nosso agendamento`);

  modalBody.innerHTML = `
    <h2>${ag.servico?.catalogo?.produto || "Serviço"}</h2>
    <p><strong>${isCliente ? "Prestador" : "Cliente"}:</strong> ${outraPessoa?.nome || "-"}</p>
    <p><strong>Telefone:</strong> ${telefone || "-"}</p>
    ${linkWhatsApp ? `<p><a href="${linkWhatsApp}" target="_blank">WhatsApp</a></p>` : ""}
    <hr>
    <p><strong>Início:</strong> ${ag.hora_inicio}</p>
    <p><strong>Fim:</strong> ${toHora(fim)}</p>
    <p><strong>Status:</strong> ${ag.status}</p>
  `;

  modal.classList.remove("hidden");
}

/* ================= NAV ================= */

document.getElementById("prevMes").onclick = () => {
  dataAtual.setMonth(dataAtual.getMonth() - 1);
  gerarCalendario();
};

document.getElementById("nextMes").onclick = () => {
  dataAtual.setMonth(dataAtual.getMonth() + 1);
  gerarCalendario();
};

/* ================= INIT ================= */

async function init() {
  await carregarTudo();
  gerarCalendario();
}

init();
