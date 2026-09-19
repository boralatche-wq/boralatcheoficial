import { supabase } from "./supabase.js";
import {
  debounce,
  obterGeolocalizacao,
  formatarPreco,
  formatarDistancia,
  escapeHTML,
  exigirPerfilCompleto,
  urlAvatar,
} from "./utils.js";

/* =========================================================
   ELEMENTOS
========================================================= */

const campoBusca      = document.getElementById("campoBusca");
const filtroCategoria  = document.getElementById("filtroCategoria");
const filtroTipo       = document.getElementById("filtroTipo");
const filtroPrecoMin   = document.getElementById("filtroPrecoMin");
const filtroPrecoMax   = document.getElementById("filtroPrecoMax");
const filtroOrdenar    = document.getElementById("filtroOrdenar");

const btnModoBusca     = document.getElementById("btnModoBusca");
const btnModoSwipe     = document.getElementById("btnModoSwipe");

const painelBusca      = document.getElementById("painelBusca");
const painelSwipe      = document.getElementById("painelSwipe");

const resultadosGrid   = document.getElementById("resultadosBusca");
const semResultados    = document.getElementById("semResultados");
const btnCarregarMaisBusca = document.getElementById("btnCarregarMaisBusca");

const swipeDeck        = document.getElementById("swipeDeck");
const swipeVazio        = document.getElementById("swipeVazio");
const btnSwipeLike      = document.getElementById("btnSwipeLike");
const btnSwipeSkip       = document.getElementById("btnSwipeSkip");
const btnCarregarMaisSwipe = document.getElementById("btnCarregarMaisSwipe");

/* =========================================================
   ESTADO
========================================================= */

const TAMANHO_PAGINA_BUSCA = 15; // resultados por "página" — evita carregar tudo de uma vez
const TAMANHO_PAGINA_SWIPE = 15; // perfis por lote no modo swipe

let usuarioId = null;
let localizacao = null;
let filaSwipe = [];
let indiceSwipe = 0;
let offsetBusca = 0;

/* =========================================================
   INIT
========================================================= */

(async function init() {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  usuarioId = contexto.user.id;
  // Não bloqueia a UI esperando a geolocalização — a busca funciona sem ela,
  // e é refeita automaticamente assim que (e se) o navegador responder.
  obterGeolocalizacao().then((loc) => {
    localizacao = loc;
    executarBusca();
  });

  await carregarCategorias();
  await executarBusca();

  configurarEventos();
})();

function configurarEventos() {
  campoBusca?.addEventListener("input", debounce(executarBusca, 350));
  filtroPrecoMin?.addEventListener("change", executarBusca);
  filtroPrecoMax?.addEventListener("change", executarBusca);
  filtroOrdenar?.addEventListener("change", executarBusca);

  filtroCategoria?.addEventListener("change", async () => {
    await carregarTipos(filtroCategoria.value);
    executarBusca();
  });

  filtroTipo?.addEventListener("change", executarBusca);

  btnModoBusca?.addEventListener("click", () => alternarModo("busca"));
  btnModoSwipe?.addEventListener("click", () => alternarModo("swipe"));

  btnSwipeLike?.addEventListener("click", () => avaliarAtual(true));
  btnSwipeSkip?.addEventListener("click", () => avaliarAtual(false));

  btnCarregarMaisBusca?.addEventListener("click", carregarMaisResultados);
  btnCarregarMaisSwipe?.addEventListener("click", carregarFilaSwipe);

  const btnToggleFiltros = document.getElementById("btnToggleFiltros");
  const painelFiltros = document.getElementById("painelFiltros");
  btnToggleFiltros?.addEventListener("click", () => {
    const aberto = painelFiltros?.classList.toggle("aberto");
    btnToggleFiltros.classList.toggle("ativo", aberto);
    btnToggleFiltros.setAttribute("aria-expanded", aberto ? "true" : "false");
  });
}

function alternarModo(modo) {
  const ehBusca = modo === "busca";

  painelBusca.classList.toggle("hidden", !ehBusca);
  painelSwipe.classList.toggle("hidden", ehBusca);

  btnModoBusca?.classList.toggle("ativo", ehBusca);
  btnModoSwipe?.classList.toggle("ativo", !ehBusca);

  if (!ehBusca && filaSwipe.length === 0) {
    carregarFilaSwipe();
  }
}

/* =========================================================
   CATEGORIAS / TIPOS (filtros em cascata)
========================================================= */

async function carregarCategorias() {
  const { data } = await supabase.from("categorias").select("*").order("nome");

  filtroCategoria.innerHTML = `<option value="">Todas as categorias</option>`;
  data?.forEach((c) => {
    filtroCategoria.innerHTML += `<option value="${c.id}">${escapeHTML(c.nome)}</option>`;
  });
}

async function carregarTipos(categoriaId) {
  filtroTipo.innerHTML = `<option value="">Todos os tipos</option>`;
  if (!categoriaId) return;

  const { data } = await supabase
    .from("tipos_servico")
    .select("*")
    .eq("categoria_id", categoriaId)
    .order("nome");

  data?.forEach((t) => {
    filtroTipo.innerHTML += `<option value="${t.id}">${escapeHTML(t.nome)}</option>`;
  });
}

/* =========================================================
   MODO 1 — BARRA DE BUSCA
========================================================= */

async function executarBusca() {
  offsetBusca = 0;
  const lista = await buscarPagina(offsetBusca);

  resultadosGrid.innerHTML = "";
  semResultados.style.display = lista.length ? "none" : "block";
  lista.forEach((s) => resultadosGrid.appendChild(criarCardResultado(s)));

  atualizarBotaoCarregarMaisBusca(lista.length);
}

async function carregarMaisResultados() {
  offsetBusca += TAMANHO_PAGINA_BUSCA;
  const lista = await buscarPagina(offsetBusca);

  lista.forEach((s) => resultadosGrid.appendChild(criarCardResultado(s)));
  atualizarBotaoCarregarMaisBusca(lista.length);
}

function atualizarBotaoCarregarMaisBusca(qtdRecebida) {
  // só mostra "carregar mais" se a página veio cheia — se veio menos que o
  // tamanho da página, é porque acabaram os resultados.
  btnCarregarMaisBusca.classList.toggle("hidden", qtdRecebida !== TAMANHO_PAGINA_BUSCA);
}

async function buscarPagina(offset) {
  const { data, error } = await supabase.rpc("buscar_servicos", {
    p_termo: campoBusca?.value.trim() || null,
    p_categoria_id: filtroCategoria?.value || null,
    p_tipo_servico_id: filtroTipo?.value || null,
    p_preco_min: filtroPrecoMin?.value ? Number(filtroPrecoMin.value) : null,
    p_preco_max: filtroPrecoMax?.value ? Number(filtroPrecoMax.value) : null,
    p_lat: localizacao?.lat ?? null,
    p_lng: localizacao?.lng ?? null,
    p_ordenar_por: filtroOrdenar?.value || "relevancia",
    p_limite: TAMANHO_PAGINA_BUSCA,
    p_offset: offset,
    p_usuario_id: usuarioId,
  });

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

function criarCardResultado(s) {
  const card = document.createElement("div");
  card.className = "produto-card";

  const imagens = s.imagens?.length ? s.imagens : ["../img/sem_imagem.jpg"];
  const avatarUrl = s.prestador_avatar || urlAvatar(supabase, s.prestador_id);

  card.innerHTML = `
    <div class="match-header">
      <img class="match-avatar" src="${avatarUrl}" onerror="this.src='../img/avatar.png'">
      <div class="match-header-texto">
        <h3>${escapeHTML(s.prestador_nome)}</h3>
        ${s.nota_media ? `<span class="match-badge match-badge-servico">⭐ ${s.nota_media}</span>` : ""}
      </div>
    </div>

    <div class="slider">
      <div class="slides">
        ${imagens.map((img) => `<img src="${img}" class="slide-img">`).join("")}
      </div>
      ${
        imagens.length > 1
          ? `<div class="indicadores">${imagens
              .map((_, i) => `<span class="dot ${i === 0 ? "ativo" : ""}"></span>`)
              .join("")}</div>`
          : ""
      }
    </div>

    <div class="produto-info">
      <h4>${escapeHTML(s.produto)}</h4>
      <p>${formatarPreco(s.preco)} • ${s.duracao_min || 0}min</p>
      <p class="local">📍 ${escapeHTML(s.bairro || s.cidade || "")}
        ${s.distancia_km !== null ? ` • ${formatarDistancia(s.distancia_km)}` : ""}
      </p>
      <button class="btn-agendar btn-quero">❤ Quero esse serviço</button>
    </div>
  `;

  card.querySelector(".btn-quero").addEventListener("click", (e) => {
    curtirServico(s);
    e.target.textContent = "✔ Solicitado";
    e.target.disabled = true;
  });

  const header = card.querySelector(".match-header");
  header.classList.add("clicavel");
  header.addEventListener("click", () => irParaPerfilPublico(s.prestador_id));

  ativarSlider(card);
  return card;
}

function irParaPerfilPublico(prestadorId) {
  location.href = `perfil-publico.html?id=${prestadorId}`;
}

async function curtirServico(s) {
  const { error: erroSwipe } = await supabase.from("swipes").upsert(
    {
      usuario_id: usuarioId,
      alvo_tipo: "servico",
      alvo_id: s.prestador_id,
      servico_id: s.servico_id,
      curtiu: true,
    },
    { onConflict: "usuario_id,alvo_tipo,alvo_id,servico_id" }
  );

  if (erroSwipe) {
    console.error(erroSwipe);
    return;
  }

  const { error: erroMatch } = await supabase.from("matches").insert({
    tipo: "servico",
    cliente_id: usuarioId,
    prestador_id: s.prestador_id,
    servico_id: s.servico_id,
  });

  // 23505 = já existe um match pra esse serviço — não é erro, só evita duplicar
  if (erroMatch && erroMatch.code !== "23505") console.error(erroMatch);
}

/* =========================================================
   MODO 2 — SWIPE (ESTILO TINDER)
========================================================= */

async function carregarFilaSwipe() {
  const { data, error } = await supabase.rpc("fila_swipe", {
    p_usuario_id: usuarioId,
    p_lat: localizacao?.lat ?? null,
    p_lng: localizacao?.lng ?? null,
    p_limite: TAMANHO_PAGINA_SWIPE,
  });

  if (error) {
    console.error(error);
    return;
  }

  filaSwipe = data || [];
  indiceSwipe = 0;
  renderizarSwipeAtual();
}

function renderizarSwipeAtual() {
  swipeDeck.innerHTML = "";

  if (indiceSwipe >= filaSwipe.length) {
    swipeVazio.classList.remove("hidden");
    return;
  }
  swipeVazio.classList.add("hidden");

  // Empilha até 3 cards visíveis para dar profundidade visual
  const visiveis = filaSwipe.slice(indiceSwipe, indiceSwipe + 3).reverse();

  visiveis.forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "swipe-card";
    card.style.zIndex = i + 1;

    const imagens = s.imagens?.length ? s.imagens : ["../img/sem_imagem.jpg"];
    const avatarUrl = s.prestador_avatar || urlAvatar(supabase, s.prestador_id);

    card.innerHTML = `
      <div class="match-header">
        <img class="match-avatar" src="${avatarUrl}" onerror="this.src='../img/avatar.png'">
        <div class="match-header-texto">
          <h3>${escapeHTML(s.prestador_nome)}</h3>
          ${s.nota_media ? `<span class="match-badge match-badge-servico">⭐ ${s.nota_media}</span>` : ""}
        </div>
      </div>

      <img class="swipe-img" src="${imagens[0]}">
      <div class="swipe-info">
        <h3>${escapeHTML(s.produto)}</h3>
        <p>${formatarPreco(s.preco)} • ${s.duracao_min || 0}min</p>
        <p>📍 ${escapeHTML(s.cidade || "")} ${
          s.distancia_km !== null ? `• ${formatarDistancia(s.distancia_km)}` : ""
        }</p>
        ${s.combina_interesse ? `<span class="chip-combina">🎯 combina com sua busca</span>` : ""}
      </div>
    `;

    const header = card.querySelector(".match-header");
    header.classList.add("clicavel");
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      irParaPerfilPublico(s.prestador_id);
    });

    // Só o card do topo (o último no array por causa do reverse) recebe swipe
    if (i === visiveis.length - 1) {
      ativarSwipeGesto(card, s);
    }

    swipeDeck.appendChild(card);
  });
}

function ativarSwipeGesto(card, servico) {
  let startX = 0;
  let dx = 0;
  let arrastando = false;

  const mover = (novoDx) => {
    dx = novoDx;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 12}deg)`;
    card.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.4));
  };

  const soltar = () => {
    arrastando = false;
    if (dx > 100) return concluirSwipe(card, servico, true);
    if (dx < -100) return concluirSwipe(card, servico, false);
    card.style.transform = "";
    card.style.opacity = "";
  };

  card.addEventListener("touchstart", (e) => {
    arrastando = true;
    startX = e.touches[0].clientX;
  });
  card.addEventListener("touchmove", (e) => {
    if (!arrastando) return;
    mover(e.touches[0].clientX - startX);
  });
  card.addEventListener("touchend", soltar);

  card.addEventListener("mousedown", (e) => {
    arrastando = true;
    startX = e.clientX;
  });
  window.addEventListener("mousemove", (e) => {
    if (!arrastando) return;
    mover(e.clientX - startX);
  });
  window.addEventListener("mouseup", () => {
    if (arrastando) soltar();
  });
}

function concluirSwipe(card, servico, curtiu) {
  card.style.transition = "transform .25s ease, opacity .25s ease";
  card.style.transform = `translateX(${curtiu ? 500 : -500}px) rotate(${curtiu ? 20 : -20}deg)`;
  card.style.opacity = "0";

  setTimeout(() => registrarSwipe(servico, curtiu), 200);
}

function avaliarAtual(curtiu) {
  const atual = filaSwipe[indiceSwipe];
  if (!atual) return;

  const card = swipeDeck.querySelector(".swipe-card:last-child");
  if (card) concluirSwipe(card, atual, curtiu);
  else registrarSwipe(atual, curtiu);
}

async function registrarSwipe(servico, curtiu) {
  const { error: erroSwipe } = await supabase.from("swipes").upsert(
    {
      usuario_id: usuarioId,
      alvo_tipo: "servico",
      alvo_id: servico.prestador_id,
      servico_id: servico.servico_id,
      curtiu,
    },
    { onConflict: "usuario_id,alvo_tipo,alvo_id,servico_id" }
  );

  if (erroSwipe) console.error(erroSwipe);

  if (curtiu) {
    const { error: erroMatch } = await supabase.from("matches").insert({
      tipo: "servico",
      cliente_id: usuarioId,
      prestador_id: servico.prestador_id,
      servico_id: servico.servico_id,
    });

    // 23505 = já existe um match pra esse serviço — não é erro, só evita duplicar
    if (erroMatch && erroMatch.code !== "23505") console.error(erroMatch);
  }

  indiceSwipe++;
  renderizarSwipeAtual();
}

/* =========================================================
   SLIDER DE IMAGENS (cards da busca por texto)
========================================================= */

function ativarSlider(card) {
  const slides = card.querySelector(".slides");
  const dots = card.querySelectorAll(".dot");
  if (!slides) return;

  let index = 0;
  const total = slides.children.length;

  function atualizar() {
    slides.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("ativo", i === index));
  }

  slides.addEventListener("click", () => {
    index = (index + 1) % total;
    atualizar();
  });
}
