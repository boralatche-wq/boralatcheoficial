import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

/**
 * Liga uma busca ao vivo no catálogo (tipos_servico + catalogo) a um
 * input + container de resultados. Usado tanto na tela do prestador
 * (pra ele checar se já existe antes de pedir) quanto na do admin
 * (pra checar antes de aprovar, ou pra escolher o item ao "sugerir
 * existente").
 *
 * @param {Object} opts
 * @param {HTMLInputElement} opts.inputEl
 * @param {HTMLElement} opts.resultadosEl
 * @param {(item: {tipo: "produto"|"tipo_servico", id: string, rotulo: string}) => void} [opts.aoSelecionar]
 *        Se informado, cada resultado vira um botão clicável (usado no
 *        painel "sugerir existente" do admin). Se omitido, os
 *        resultados são só informativos (usado na tela do prestador).
 */
export function iniciarBuscaCatalogo({ inputEl, resultadosEl, aoSelecionar = null }) {
  let timer = null;
  let ultimaBusca = 0;

  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const termo = inputEl.value.trim();

    if (termo.length < 2) {
      resultadosEl.innerHTML = "";
      resultadosEl.classList.remove("ativo");
      return;
    }

    timer = setTimeout(() => buscar(termo), 300);
  });

  async function buscar(termo) {
    const idBusca = ++ultimaBusca;

    resultadosEl.classList.add("ativo");
    resultadosEl.innerHTML = `<p class="busca-carregando">Buscando "${escapeHTML(termo)}"...</p>`;

    const [{ data: produtos, error: erroProdutos }, { data: tipos, error: erroTipos }] = await Promise.all([
      supabase
        .from("catalogo")
        .select("id, produto, tipo_servico:tipo_servico_id ( id, nome, categoria:categoria_id ( id, nome, icone ) )")
        .ilike("produto", `%${termo}%`)
        .limit(8),
      supabase
        .from("tipos_servico")
        .select("id, nome, categoria:categoria_id ( id, nome, icone )")
        .ilike("nome", `%${termo}%`)
        .limit(6),
    ]);

    // se o usuário já digitou algo novo enquanto essa busca rodava, ignora o resultado velho
    if (idBusca !== ultimaBusca) return;

    if (erroProdutos || erroTipos) {
      console.error(erroProdutos || erroTipos);
      resultadosEl.innerHTML = `<p class="busca-erro">Não deu pra buscar agora. Tenta de novo.</p>`;
      return;
    }

    renderizar(termo, produtos || [], tipos || []);
  }

  function renderizar(termo, produtos, tipos) {
    if (!produtos.length && !tipos.length) {
      resultadosEl.innerHTML = `
        <div class="busca-vazia">
          <span>🔍</span>
          <p>Nada parecido com "<strong>${escapeHTML(termo)}</strong>" no catálogo ainda.</p>
        </div>`;
      return;
    }

    const tag = aoSelecionar ? "button" : "div";
    const atributoTipo = (t) => (aoSelecionar ? `type="button"` : "");

    let html = "";

    if (produtos.length) {
      html += `<p class="busca-grupo-titulo">Produtos/serviços que já existem</p>`;
      produtos.forEach((p) => {
        html += `
          <${tag} ${atributoTipo()} class="busca-item" data-tipo="produto" data-id="${p.id}">
            <span class="busca-item-icone">${p.tipo_servico?.categoria?.icone || "🧾"}</span>
            <span class="busca-item-texto">
              <strong>${escapeHTML(p.produto)}</strong>
              <small>${escapeHTML(p.tipo_servico?.categoria?.nome || "-")} • ${escapeHTML(p.tipo_servico?.nome || "-")}</small>
            </span>
          </${tag}>`;
      });
    }

    if (tipos.length) {
      html += `<p class="busca-grupo-titulo">Tipos de serviço que já existem</p>`;
      tipos.forEach((t) => {
        html += `
          <${tag} ${atributoTipo()} class="busca-item" data-tipo="tipo_servico" data-id="${t.id}">
            <span class="busca-item-icone">${t.categoria?.icone || "🗂️"}</span>
            <span class="busca-item-texto">
              <strong>${escapeHTML(t.nome)}</strong>
              <small>${escapeHTML(t.categoria?.nome || "-")}</small>
            </span>
          </${tag}>`;
      });
    }

    resultadosEl.innerHTML = html;

    if (aoSelecionar) {
      resultadosEl.querySelectorAll(".busca-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          resultadosEl.querySelectorAll(".busca-item").forEach((b) => b.classList.remove("selecionado"));
          btn.classList.add("selecionado");

          const rotulo = btn.querySelector("strong")?.textContent || "";
          aoSelecionar({ tipo: btn.dataset.tipo, id: btn.dataset.id, rotulo });
        });
      });
    }
  }
}
