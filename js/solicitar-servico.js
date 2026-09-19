import { supabase } from "./supabase.js";
import {
  escapeHTML,
  ajustarNavTrocas,
  configurarBotaoLogout,
  exigirPerfilCompleto,
} from "./utils.js";
import { iniciarBuscaCatalogo } from "./busca-catalogo.js";

const form = document.getElementById("formSolicitacao");
const radiosTipo = document.querySelectorAll('input[name="tipoSolicitacao"]');

const blocoCategoria = document.getElementById("blocoCategoria");
const blocoNomeTipo = document.getElementById("blocoNomeTipo");
const blocoTipoExistente = document.getElementById("blocoTipoExistente");
const blocoNomeProduto = document.getElementById("blocoNomeProduto");

const selectCategoria = document.getElementById("selectCategoria");
const nomeTipoServico = document.getElementById("nomeTipoServico");
const selectCategoriaParaTipo = document.getElementById("selectCategoriaParaTipo");
const selectTipoExistente = document.getElementById("selectTipoExistente");
const nomeProduto = document.getElementById("nomeProduto");
const descricaoPedido = document.getElementById("descricaoPedido");

const blocoCategoriaNova = document.getElementById("blocoCategoriaNova");
const blocoIconeCategoria = document.getElementById("blocoIconeCategoria");
const nomeCategoriaSugerida = document.getElementById("nomeCategoriaSugerida");
const iconeCategoriaSugerido = document.getElementById("iconeCategoriaSugerido");

const listaSolicitacoes = document.getElementById("listaSolicitacoes");

const inputBuscaCatalogo = document.getElementById("buscaCatalogo");
const resultadosBuscaCatalogo = document.getElementById("resultadosBuscaCatalogo");

let usuarioId = null;

(async () => {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  if (contexto.perfil.tipo_usuario !== "prestador") {
    alert("Essa área é exclusiva para prestadores de serviço.");
    return (location.href = "descobrir.html");
  }

  usuarioId = contexto.user.id;
  ajustarNavTrocas("prestador");
  configurarBotaoLogout(supabase);

  iniciarBuscaCatalogo({
    inputEl: inputBuscaCatalogo,
    resultadosEl: resultadosBuscaCatalogo,
  });

  await carregarCategorias();
  await carregarMinhasSolicitacoes();

  atualizarBlocosVisiveis();
})();

/* =========================================================
   ALTERNA OS CAMPOS CONFORME O TIPO DE PEDIDO ESCOLHIDO
========================================================= */

radiosTipo.forEach((r) => r.addEventListener("change", atualizarBlocosVisiveis));

function atualizarBlocosVisiveis() {
  const tipo = document.querySelector('input[name="tipoSolicitacao"]:checked').value;

  [blocoCategoriaNova, blocoIconeCategoria, blocoCategoria, blocoNomeTipo, blocoTipoExistente, blocoNomeProduto].forEach((el) => {
    el.classList.remove("ativo");
  });

  if (tipo === "categoria") {
    blocoCategoriaNova.classList.add("ativo");
    blocoIconeCategoria.classList.add("ativo");
    blocoNomeTipo.classList.add("ativo");
    blocoNomeProduto.classList.add("ativo");
  } else if (tipo === "tipo_servico") {
    blocoCategoria.classList.add("ativo");
    blocoNomeTipo.classList.add("ativo");
  } else if (tipo === "produto") {
    blocoTipoExistente.classList.add("ativo");
    blocoNomeProduto.classList.add("ativo");
  } else {
    blocoCategoria.classList.add("ativo");
    blocoNomeTipo.classList.add("ativo");
    blocoNomeProduto.classList.add("ativo");
  }
}

/* =========================================================
   CATÁLOGO EXISTENTE (pra escolher onde encaixar o pedido)
========================================================= */

async function carregarCategorias() {
  const { data } = await supabase.from("categorias").select("*").order("nome");

  [selectCategoria, selectCategoriaParaTipo].forEach((select) => {
    select.innerHTML = `<option value="">Categoria</option>`;
    data?.forEach((c) => {
      select.innerHTML += `<option value="${c.id}">${escapeHTML(c.nome)}</option>`;
    });
  });
}

selectCategoriaParaTipo.addEventListener("change", async () => {
  selectTipoExistente.innerHTML = `<option value="">Tipo de serviço existente</option>`;
  if (!selectCategoriaParaTipo.value) return;

  const { data } = await supabase
    .from("tipos_servico")
    .select("*")
    .eq("categoria_id", selectCategoriaParaTipo.value)
    .order("nome");

  data?.forEach((t) => {
    selectTipoExistente.innerHTML += `<option value="${t.id}">${escapeHTML(t.nome)}</option>`;
  });
});

/* =========================================================
   ENVIAR SOLICITAÇÃO
========================================================= */

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const tipo = document.querySelector('input[name="tipoSolicitacao"]:checked').value;
  const descricao = descricaoPedido.value.trim() || null;

  const payload = {
    solicitante_id: usuarioId,
    tipo_solicitacao: tipo,
    descricao,
  };

  if (tipo === "tipo_servico" || tipo === "ambos") {
    if (!selectCategoria.value) return alert("Escolha a categoria.");
    if (!nomeTipoServico.value.trim()) return alert("Escreva o nome do tipo de serviço.");
    payload.categoria_id = selectCategoria.value;
    payload.nome_tipo_servico_sugerido = nomeTipoServico.value.trim();
  }

  if (tipo === "categoria") {
    if (!nomeCategoriaSugerida.value.trim()) return alert("Escreva o nome da categoria nova.");
    if (!nomeTipoServico.value.trim()) return alert("Escreva o nome do tipo de serviço.");
    payload.nome_categoria_sugerida = nomeCategoriaSugerida.value.trim();
    payload.icone_categoria_sugerido = iconeCategoriaSugerido.value.trim() || null;
    payload.nome_tipo_servico_sugerido = nomeTipoServico.value.trim();
  }

  if (tipo === "produto") {
    if (!selectTipoExistente.value) return alert("Escolha o tipo de serviço existente.");
    payload.tipo_servico_id = selectTipoExistente.value;
  }

  if (tipo === "produto" || tipo === "ambos" || tipo === "categoria") {
    if (!nomeProduto.value.trim()) return alert("Escreva o nome do produto/serviço.");
    payload.nome_produto_sugerido = nomeProduto.value.trim();
  }

  const { error } = await supabase.from("solicitacoes_catalogo").insert(payload);

  if (error) {
    console.error(error);
    alert("Erro ao enviar solicitação. Confira se preencheu tudo certo.");
    return;
  }

  alert("Solicitação enviada! Você será avisado aqui mesmo quando for respondida.");
  form.reset();
  atualizarBlocosVisiveis();
  await carregarMinhasSolicitacoes();
});

/* =========================================================
   MINHAS SOLICITAÇÕES
========================================================= */

async function carregarMinhasSolicitacoes() {
  const { data, error } = await supabase
    .from("solicitacoes_catalogo")
    .select(
      `
      id, tipo_solicitacao, nome_tipo_servico_sugerido, nome_produto_sugerido,
      nome_categoria_sugerida, icone_categoria_sugerido,
      descricao, status, resposta_admin, criado_em,
      categoria:categoria_id ( nome ),
      tipo_servico_existente:tipo_servico_id ( nome ),
      tipo_servico_sugerido:tipo_servico_sugerido_id ( nome ),
      catalogo_sugerido:catalogo_sugerido_id ( produto )
    `
    )
    .eq("solicitante_id", usuarioId)
    .order("criado_em", { ascending: false });

  if (error) {
    console.error(error);
    listaSolicitacoes.innerHTML = `<p style="color:var(--erro)">Erro ao carregar.</p>`;
    return;
  }

  if (!data?.length) {
    listaSolicitacoes.innerHTML = `<p style="color:var(--cinza-texto)">Você ainda não pediu nada.</p>`;
    return;
  }

  const rotulos = { pendente: "⏳ Pendente", aceito: "✅ Aceito", recusado: "❌ Recusado", sugestao: "💡 Sugestão" };

  listaSolicitacoes.innerHTML = "";

  data.forEach((s) => {
    const item = document.createElement("div");
    item.className = "solicitacao-item";

    let oQuePediu = "";
    if (s.tipo_solicitacao === "categoria") {
      oQuePediu = `Categoria nova "${s.icone_categoria_sugerido ? s.icone_categoria_sugerido + " " : ""}${escapeHTML(s.nome_categoria_sugerida)}" com tipo "${escapeHTML(s.nome_tipo_servico_sugerido)}" e produto "${escapeHTML(s.nome_produto_sugerido)}"`;
    } else if (s.tipo_solicitacao === "tipo_servico") {
      oQuePediu = `Tipo de serviço novo "${escapeHTML(s.nome_tipo_servico_sugerido)}" em ${escapeHTML(s.categoria?.nome || "")}`;
    } else if (s.tipo_solicitacao === "produto") {
      oQuePediu = `Produto novo "${escapeHTML(s.nome_produto_sugerido)}" em ${escapeHTML(s.tipo_servico_existente?.nome || "")}`;
    } else {
      oQuePediu = `Tipo "${escapeHTML(s.nome_tipo_servico_sugerido)}" + produto "${escapeHTML(s.nome_produto_sugerido)}" em ${escapeHTML(s.categoria?.nome || "")}`;
    }

    let respostaHtml = "";
    if (s.status === "sugestao") {
      const sugestoes = [
        s.tipo_servico_sugerido?.nome && `tipo "${escapeHTML(s.tipo_servico_sugerido.nome)}"`,
        s.catalogo_sugerido?.produto && `produto "${escapeHTML(s.catalogo_sugerido.produto)}"`,
      ].filter(Boolean).join(" e ");
      respostaHtml = `<div class="resposta">💡 Já temos ${sugestoes} — use isso! ${s.resposta_admin ? escapeHTML(s.resposta_admin) : ""}</div>`;
    } else if (s.resposta_admin) {
      respostaHtml = `<div class="resposta">${escapeHTML(s.resposta_admin)}</div>`;
    }

    item.innerHTML = `
      <span class="status-badge status-${s.status}">${rotulos[s.status] || s.status}</span>
      <h4>${oQuePediu}</h4>
      ${s.descricao ? `<p>${escapeHTML(s.descricao)}</p>` : ""}
      ${respostaHtml}
      ${s.status === "pendente" ? `<button class="btn-cancelar-pedido">Cancelar pedido</button>` : ""}
    `;

    item.querySelector(".btn-cancelar-pedido")?.addEventListener("click", async () => {
      if (!confirm("Cancelar essa solicitação?")) return;
      await supabase.from("solicitacoes_catalogo").delete().eq("id", s.id);
      await carregarMinhasSolicitacoes();
    });

    listaSolicitacoes.appendChild(item);
  });
}
