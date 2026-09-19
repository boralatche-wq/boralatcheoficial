import { supabase } from "./supabase.js";
import {
  escapeHTML,
  ajustarNavTrocas,
  configurarBotaoLogout,
  exigirPerfilCompleto,
} from "./utils.js";
import { iniciarBuscaCatalogo } from "./busca-catalogo.js";

const abas = document.querySelectorAll(".aba-admin");
const painelPendentes = document.getElementById("painelPendentes");
const painelHistorico = document.getElementById("painelHistorico");
const listaPendentes = document.getElementById("listaPendentes");
const listaHistorico = document.getElementById("listaHistorico");
const contadorPendentes = document.getElementById("contadorPendentes");

const inputBuscaAdmin = document.getElementById("buscaCatalogoAdmin");
const resultadosBuscaAdmin = document.getElementById("resultadosBuscaAdmin");

const ROTULOS_STATUS = { aceito: "✅ Aceito", recusado: "❌ Recusado", sugestao: "💡 Sugestão" };
const ROTULOS_TAG = { categoria: "Categoria nova", tipo_servico: "Tipo novo", produto: "Produto novo", ambos: "Tipo + Produto" };

/* =========================================================
   INIT
========================================================= */

(async () => {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  // is_admin é uma flag em `perfis`, separada de tipo_usuario (cliente/prestador).
  // Ver 12_solicitacoes_catalogo.sql — marque sua conta com:
  //   update perfis set is_admin = true where id = 'SEU-USER-ID';
  if (!contexto.perfil.is_admin) {
    alert("Essa área é exclusiva para administradores.");
    return (location.href = "descobrir.html");
  }

  ajustarNavTrocas("admin");
  configurarBotaoLogout(supabase);

  iniciarBuscaCatalogo({ inputEl: inputBuscaAdmin, resultadosEl: resultadosBuscaAdmin });

  await carregarPendentes();
})();

abas.forEach((aba) => {
  aba.addEventListener("click", async () => {
    abas.forEach((a) => a.classList.remove("ativa"));
    aba.classList.add("ativa");

    const alvo = aba.dataset.aba;
    painelPendentes.classList.toggle("ativo", alvo === "pendentes");
    painelHistorico.classList.toggle("ativo", alvo === "historico");

    if (alvo === "historico" && !listaHistorico.dataset.carregado) {
      await carregarHistorico();
      listaHistorico.dataset.carregado = "1";
    }
  });
});

/* =========================================================
   PENDENTES
========================================================= */

async function carregarPendentes() {
  listaPendentes.innerHTML = `<p class="carregando">Carregando...</p>`;

  const { data, error } = await supabase
    .from("solicitacoes_catalogo")
    .select(
      `
      id, tipo_solicitacao, nome_tipo_servico_sugerido, nome_produto_sugerido,
      nome_categoria_sugerida, icone_categoria_sugerido,
      descricao, criado_em,
      categoria:categoria_id ( id, nome, icone ),
      tipo_servico_existente:tipo_servico_id ( id, nome )
    `
    )
    .eq("status", "pendente")
    .order("criado_em", { ascending: true });

  if (error) {
    console.error(error);
    listaPendentes.innerHTML = `<p class="erro-carregar">Erro ao carregar solicitações.</p>`;
    return;
  }

  contadorPendentes.textContent = data?.length || 0;

  if (!data?.length) {
    mostrarListaVazia();
    return;
  }

  listaPendentes.innerHTML = "";
  data.forEach((s) => listaPendentes.appendChild(criarCardPendente(s)));
}

function mostrarListaVazia() {
  listaPendentes.innerHTML = `
    <div class="vazio-admin">
      <span>✅</span>
      <p>Nenhuma solicitação pendente. Tudo em dia!</p>
    </div>`;
}

function rotuloPedido(s) {
  if (s.tipo_solicitacao === "categoria") {
    return `Categoria nova: <strong>${s.icone_categoria_sugerido ? s.icone_categoria_sugerido + " " : ""}${escapeHTML(s.nome_categoria_sugerida)}</strong> com tipo <strong>${escapeHTML(s.nome_tipo_servico_sugerido)}</strong> e produto <strong>${escapeHTML(s.nome_produto_sugerido)}</strong>`;
  }
  if (s.tipo_solicitacao === "tipo_servico") {
    return `Tipo de serviço novo: <strong>${escapeHTML(s.nome_tipo_servico_sugerido)}</strong> em ${escapeHTML(s.categoria?.nome || "-")}`;
  }
  if (s.tipo_solicitacao === "produto") {
    return `Produto novo: <strong>${escapeHTML(s.nome_produto_sugerido)}</strong> em ${escapeHTML(s.tipo_servico_existente?.nome || "-")}`;
  }
  return `Tipo <strong>${escapeHTML(s.nome_tipo_servico_sugerido)}</strong> + produto <strong>${escapeHTML(s.nome_produto_sugerido)}</strong> em ${escapeHTML(s.categoria?.nome || "-")}`;
}

function criarCardPendente(s) {
  const card = document.createElement("article");
  card.className = "card-solicitacao";
  card.dataset.id = s.id;

  const dataFormatada = new Date(s.criado_em).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  card.innerHTML = `
    <div class="card-topo">
      <span class="tag-tipo tag-${s.tipo_solicitacao}">${ROTULOS_TAG[s.tipo_solicitacao] || s.tipo_solicitacao}</span>
      <span class="card-data">${dataFormatada}</span>
    </div>
    <h3>${rotuloPedido(s)}</h3>
    ${s.descricao ? `<p class="card-descricao">"${escapeHTML(s.descricao)}"</p>` : ""}

    <div class="card-acoes">
      <button class="btn-aprovar" type="button">✅ Aprovar</button>
      <button class="btn-recusar" type="button">❌ Recusar</button>
      <button class="btn-sugerir" type="button">💡 Sugerir existente</button>
    </div>

    <div class="painel-recusa oculto">
      <label>Justificativa para o prestador</label>
      <textarea class="input-justificativa" placeholder="Explique por que não foi aprovado, pra ele entender e poder ajustar..."></textarea>
      <div class="painel-acoes">
        <button class="btn-confirmar-recusa" type="button">Confirmar recusa</button>
        <button class="btn-cancelar-painel" type="button">Cancelar</button>
      </div>
    </div>

    <div class="painel-sugestao oculto">
      <label>Busque e selecione o item já existente</label>
      <input type="text" class="input-busca-sugestao" placeholder="Buscar no catálogo...">
      <div class="resultados-busca-sugestao"></div>
      <p class="sugestao-selecionada"></p>
      <label>Mensagem para o prestador (opcional)</label>
      <textarea class="input-mensagem-sugestao" placeholder="Ex.: Já temos esse serviço cadastrado, é só usar!"></textarea>
      <div class="painel-acoes">
        <button class="btn-confirmar-sugestao" type="button" disabled>Enviar sugestão</button>
        <button class="btn-cancelar-painel" type="button">Cancelar</button>
      </div>
    </div>
  `;

  ligarAcoesCard(card, s);
  return card;
}

function ligarAcoesCard(card, s) {
  const painelRecusa = card.querySelector(".painel-recusa");
  const painelSugestao = card.querySelector(".painel-sugestao");

  const fecharPaineis = () => {
    painelRecusa.classList.add("oculto");
    painelSugestao.classList.add("oculto");
  };

  const removerCard = async () => {
    card.remove();
    contadorPendentes.textContent = listaPendentes.querySelectorAll(".card-solicitacao").length;
    if (!listaPendentes.querySelector(".card-solicitacao")) mostrarListaVazia();
    listaHistorico.dataset.carregado = ""; // força recarregar o histórico na próxima vez que abrir a aba
  };

  card.querySelector(".btn-aprovar").addEventListener("click", async () => {
    if (!confirm("Aprovar essa solicitação e criar no catálogo?")) return;

    const { error } = await supabase.rpc("aceitar_solicitacao_catalogo", {
      p_solicitacao_id: s.id,
      p_resposta: null,
    });

    if (error) {
      console.error(error);
      return alert("Erro ao aprovar: " + error.message);
    }

    await removerCard();
  });

  card.querySelector(".btn-recusar").addEventListener("click", () => {
    fecharPaineis();
    painelRecusa.classList.remove("oculto");
    painelRecusa.querySelector("textarea").focus();
  });

  card.querySelector(".btn-sugerir").addEventListener("click", () => {
    fecharPaineis();
    painelSugestao.classList.remove("oculto");
    painelSugestao.querySelector("input").focus();
  });

  card.querySelectorAll(".btn-cancelar-painel").forEach((btn) => {
    btn.addEventListener("click", fecharPaineis);
  });

  card.querySelector(".btn-confirmar-recusa").addEventListener("click", async () => {
    const justificativa = card.querySelector(".input-justificativa").value.trim();
    if (!justificativa) return alert("Escreva uma justificativa pro prestador entender o motivo.");

    const { error } = await supabase
      .from("solicitacoes_catalogo")
      .update({
        status: "recusado",
        resposta_admin: justificativa,
        respondido_em: new Date().toISOString(),
      })
      .eq("id", s.id);

    if (error) {
      console.error(error);
      return alert("Erro ao recusar: " + error.message);
    }

    await removerCard();
  });

  // busca dentro do painel de sugestão (mesmo módulo da tela do prestador,
  // mas aqui os resultados são clicáveis pra escolher o item certo)
  const inputSugestao = card.querySelector(".input-busca-sugestao");
  const resultadosSugestao = card.querySelector(".resultados-busca-sugestao");
  const textoSelecionado = card.querySelector(".sugestao-selecionada");
  const btnConfirmarSugestao = card.querySelector(".btn-confirmar-sugestao");
  let selecao = null;

  iniciarBuscaCatalogo({
    inputEl: inputSugestao,
    resultadosEl: resultadosSugestao,
    aoSelecionar: (item) => {
      selecao = item;
      textoSelecionado.textContent = `Selecionado: ${item.tipo === "produto" ? "produto" : "tipo de serviço"} "${item.rotulo}"`;
      btnConfirmarSugestao.disabled = false;
    },
  });

  btnConfirmarSugestao.addEventListener("click", async () => {
    if (!selecao) return;

    const mensagem = card.querySelector(".input-mensagem-sugestao").value.trim() || null;

    const payload = {
      status: "sugestao",
      resposta_admin: mensagem,
      respondido_em: new Date().toISOString(),
    };
    if (selecao.tipo === "produto") payload.catalogo_sugerido_id = selecao.id;
    if (selecao.tipo === "tipo_servico") payload.tipo_servico_sugerido_id = selecao.id;

    const { error } = await supabase.from("solicitacoes_catalogo").update(payload).eq("id", s.id);

    if (error) {
      console.error(error);
      return alert("Erro ao enviar sugestão: " + error.message);
    }

    await removerCard();
  });
}

/* =========================================================
   HISTÓRICO
========================================================= */

async function carregarHistorico() {
  listaHistorico.innerHTML = `<p class="carregando">Carregando...</p>`;

  const { data, error } = await supabase
    .from("solicitacoes_catalogo")
    .select(
      `
      id, tipo_solicitacao, nome_tipo_servico_sugerido, nome_produto_sugerido,
      nome_categoria_sugerida, icone_categoria_sugerido,
      status, resposta_admin, respondido_em,
      categoria:categoria_id ( nome ),
      tipo_servico_existente:tipo_servico_id ( nome ),
      tipo_servico_sugerido:tipo_servico_sugerido_id ( nome ),
      catalogo_sugerido:catalogo_sugerido_id ( produto )
    `
    )
    .neq("status", "pendente")
    .order("respondido_em", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    listaHistorico.innerHTML = `<p class="erro-carregar">Erro ao carregar histórico.</p>`;
    return;
  }

  if (!data?.length) {
    listaHistorico.innerHTML = `<p class="vazio-historico">Nada respondido ainda.</p>`;
    return;
  }

  listaHistorico.innerHTML = "";

  data.forEach((s) => {
    const item = document.createElement("div");
    item.className = "item-historico";

    let respostaHtml = "";
    if (s.status === "sugestao") {
      const sugestoes = [
        s.tipo_servico_sugerido?.nome && `tipo "${escapeHTML(s.tipo_servico_sugerido.nome)}"`,
        s.catalogo_sugerido?.produto && `produto "${escapeHTML(s.catalogo_sugerido.produto)}"`,
      ].filter(Boolean).join(" e ");
      respostaHtml = `<div class="resposta">💡 Sugerido: ${sugestoes}. ${s.resposta_admin ? escapeHTML(s.resposta_admin) : ""}</div>`;
    } else if (s.resposta_admin) {
      respostaHtml = `<div class="resposta">${escapeHTML(s.resposta_admin)}</div>`;
    }

    item.innerHTML = `
      <span class="status-badge status-${s.status}">${ROTULOS_STATUS[s.status] || s.status}</span>
      <h4>${rotuloPedido(s)}</h4>
      ${respostaHtml}
    `;

    listaHistorico.appendChild(item);
  });
}
