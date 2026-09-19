import { supabase } from "./supabase.js";
import { escapeHTML, formatarPreco, exigirPerfilCompleto, ajustarNavTrocas, configurarBotaoLogout } from "./utils.js";

const resumoServico   = document.getElementById("resumoServico");
const areaCalendario  = document.getElementById("areaCalendario");
const mensagemAgendar = document.getElementById("mensagemAgendar");

const gridDias        = document.getElementById("gridDiasAgendar");
const mesAnoEl        = document.getElementById("mesAnoAgendar");
const listaHorarios   = document.getElementById("listaHorariosAgendar");
const dataSelecionadaEl = document.getElementById("dataSelecionadaAgendar");
const btnConfirmar    = document.getElementById("btnConfirmarAgendamento");

const params = new URLSearchParams(window.location.search);
const matchId = params.get("match");

let usuarioId = null;
let match = null;
let mesAtual = new Date();
let diasDisponiveisDoMes = {}; // { "2026-07-17": true/false }
let diaSelecionadoISO = null;
let horarioSelecionado = null;

/* ================= HELPERS ================= */

function formatarISO(data) {
  const local = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return local.toISOString().split("T")[0];
}

function somarMinutos(horaStr, minutos) {
  const [h, m] = horaStr.split(":").map(Number);
  const totalMin = h * 60 + m + minutos;
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

function mostrarMensagem(texto) {
  areaCalendario.style.display = "none";
  mensagemAgendar.style.display = "block";
  mensagemAgendar.textContent = texto;
}

/* ================= INIT ================= */

(async function init() {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;
  usuarioId = contexto.user.id;
  ajustarNavTrocas(contexto.perfil.tipo_usuario);
  configurarBotaoLogout(supabase);

  if (!matchId) return mostrarMensagem("Nenhum match informado.");

  const { data, error } = await supabase
    .from("matches")
    .select(
      `
      id, tipo, cliente_id, prestador_id,
      prestador:prestador_id ( nome ),
      servico:servico_id ( id, preco, duracao_min, catalogo:catalogo_id (produto) )
    `
    )
    .eq("id", matchId)
    .single();

  if (error || !data) {
    console.error(error);
    return mostrarMensagem("Não foi possível carregar esse match.");
  }

  if (data.tipo !== "servico") {
    return mostrarMensagem(
      "Agendamento automático ainda não está disponível para trocas entre prestadores — combine direto pelo WhatsApp por enquanto."
    );
  }

  match = data;

  resumoServico.innerHTML = `
    <h3>${escapeHTML(match.servico?.catalogo?.produto || "Serviço")}</h3>
    <p>👤 com ${escapeHTML(match.prestador?.nome || "")}</p>
    <p>${formatarPreco(match.servico?.preco)} • ${match.servico?.duracao_min || 30}min</p>
  `;

  areaCalendario.style.display = "block";

  await carregarDiasDoMes();
  gerarCalendario();

  configurarEventos();
})();

function configurarEventos() {
  document.getElementById("prevMesAgendar").onclick = async () => {
    mesAtual.setMonth(mesAtual.getMonth() - 1);
    await carregarDiasDoMes();
    gerarCalendario();
  };

  document.getElementById("nextMesAgendar").onclick = async () => {
    mesAtual.setMonth(mesAtual.getMonth() + 1);
    await carregarDiasDoMes();
    gerarCalendario();
  };

  btnConfirmar.onclick = confirmarAgendamento;
}

/* ================= DIAS DISPONÍVEIS (RPC) ================= */

async function carregarDiasDoMes() {
  const { data, error } = await supabase.rpc("dias_disponiveis_prestador", {
    p_prestador_id: match.prestador_id,
    p_ano: mesAtual.getFullYear(),
    p_mes: mesAtual.getMonth() + 1,
    p_duracao_min: match.servico?.duracao_min || 30,
  });

  if (error) {
    console.error(error);
    diasDisponiveisDoMes = {};
    return;
  }

  diasDisponiveisDoMes = {};
  (data || []).forEach((d) => {
    diasDisponiveisDoMes[d.dia] = d.disponivel;
  });
}

/* ================= CALENDÁRIO ================= */

function gerarCalendario() {
  gridDias.innerHTML = "";
  listaHorarios.innerHTML = "";
  dataSelecionadaEl.textContent = "";
  btnConfirmar.style.display = "none";
  diaSelecionadoISO = null;
  horarioSelecionado = null;

  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  mesAnoEl.textContent = `${meses[mes]} ${ano}`;

  let start = primeiro.getDay();
  if (start === 0) start = 7;
  for (let i = 1; i < start; i++) {
    const vazio = document.createElement("div");
    vazio.className = "dia-vazio-mes";
    gridDias.appendChild(vazio);
  }

  for (let d = 1; d <= ultimo.getDate(); d++) {
    const data = new Date(ano, mes, d);
    const iso = formatarISO(data);
    const livre = !!diasDisponiveisDoMes[iso];

    const div = document.createElement("div");
    div.textContent = d;

    if (livre) {
      div.classList.add("dia-livre");
      div.onclick = () => selecionarDia(iso, div);
    }

    gridDias.appendChild(div);
  }
}

async function selecionarDia(iso, elemento) {
  gridDias.querySelectorAll("div").forEach((el) => el.classList.remove("dia-selecionado"));
  elemento.classList.add("dia-selecionado");

  diaSelecionadoISO = iso;
  horarioSelecionado = null;
  btnConfirmar.style.display = "none";

  const dataFormatada = new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  dataSelecionadaEl.textContent = `Horários livres em ${dataFormatada}`;
  listaHorarios.innerHTML = "<p>Carregando...</p>";

  const { data, error } = await supabase.rpc("slots_disponiveis", {
    p_prestador_id: match.prestador_id,
    p_data: iso,
    p_duracao_min: match.servico?.duracao_min || 30,
  });

  if (error) {
    console.error(error);
    listaHorarios.innerHTML = "<p>Erro ao carregar horários.</p>";
    return;
  }

  listaHorarios.innerHTML = "";

  if (!data?.length) {
    listaHorarios.innerHTML = "<p>Sem horários livres nesse dia.</p>";
    return;
  }

  data.forEach((slot) => {
    const hora = slot.horario.slice(0, 5);
    const btn = document.createElement("div");
    btn.className = "horario-livre";
    btn.textContent = hora;

    btn.onclick = () => {
      listaHorarios.querySelectorAll(".horario-livre").forEach((el) => el.classList.remove("selecionado"));
      btn.classList.add("selecionado");
      horarioSelecionado = hora;
      btnConfirmar.style.display = "block";
    };

    listaHorarios.appendChild(btn);
  });
}

/* ================= CONFIRMAR AGENDAMENTO ================= */

async function confirmarAgendamento() {
  if (!diaSelecionadoISO || !horarioSelecionado) return;

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Agendando...";

  const duracao = match.servico?.duracao_min || 30;

  const { error } = await supabase.from("agendamentos").insert({
    match_id: match.id,
    cliente_id: match.cliente_id,
    prestador_id: match.prestador_id,
    servico_id: match.servico.id,
    data: diaSelecionadoISO,
    hora_inicio: `${horarioSelecionado}:00`,
    hora_fim: somarMinutos(horarioSelecionado, duracao),
    status: "pendente",
  });

  if (error) {
    console.error(error);
    // Se o horário foi ocupado por outra pessoa entre a consulta e a
    // confirmação, recarrega as opções em vez de deixar o botão travado.
    alert("Esse horário acabou de ficar indisponível. Escolha outro, por favor.");
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Confirmar agendamento";
    await carregarDiasDoMes();
    gerarCalendario();
    return;
  }

  mostrarMensagem("✅ Agendamento confirmado! Você já pode ver em Agenda.");
}
