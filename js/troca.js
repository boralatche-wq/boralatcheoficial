import { supabase } from "./supabase.js";
import { escapeHTML, formatarPreco, formatarDistancia, obterGeolocalizacao, ajustarNavTrocas,
  configurarBotaoLogout, exigirPerfilCompleto } from "./utils.js";

/* =========================================================
   ELEMENTOS
========================================================= */

const seletorMeuServico = document.getElementById("seletorMeuServico");

const listaInteresses   = document.getElementById("listaInteresses");
const selectCategoria   = document.getElementById("interesseCategoria");
const selectTipo        = document.getElementById("interesseTipo");
const selectProduto     = document.getElementById("interesseProduto");
const btnAdicionarInteresse = document.getElementById("btnAdicionarInteresse");

const swipeDeck   = document.getElementById("swipeDeckTroca");
const swipeVazio  = document.getElementById("swipeVazioTroca");
const btnCarregarMaisTroca = document.getElementById("btnCarregarMaisTroca");
const btnLike     = document.getElementById("btnTrocaLike");
const btnSkip     = document.getElementById("btnTrocaSkip");

const abaSwipe       = document.getElementById("abaSwipeTroca");
const abaInteresses  = document.getElementById("abaInteresses");
const btnAbaSwipe    = document.getElementById("btnAbaSwipeTroca");
const btnAbaInteresses = document.getElementById("btnAbaInteresses");

/* =========================================================
   ESTADO
========================================================= */

let usuarioId = null;
let localizacao = null;
let fila = [];
let indice = 0;

const TAMANHO_PAGINA_TROCA = 15; // candidatos por lote — evita carregar tudo de uma vez

/* =========================================================
   INIT
========================================================= */

(async function init() {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  if (contexto.perfil.tipo_usuario !== "prestador") {
    alert("A troca de serviço é uma área exclusiva para prestadores.");
    return (location.href = "descobrir.html");
  }

  usuarioId = contexto.user.id;
  ajustarNavTrocas("prestador");
  configurarBotaoLogout(supabase);

  obterGeolocalizacao().then((loc) => (localizacao = loc));

  await Promise.all([
    carregarMeusServicos(),
    carregarCategorias(),
    carregarInteresses(),
  ]);

  configurarEventos();
})();

function configurarEventos() {
  selectCategoria?.addEventListener("change", async () => {
    await carregarTipos(selectCategoria.value);
  });
  selectTipo?.addEventListener("change", async () => {
    await carregarProdutos(selectTipo.value);
  });

  btnAdicionarInteresse?.addEventListener("click", adicionarInteresse);

  btnLike?.addEventListener("click", () => avaliarAtual(true));
  btnSkip?.addEventListener("click", () => avaliarAtual(false));

  btnAbaSwipe?.addEventListener("click", () => alternarAba("swipe"));
  btnAbaInteresses?.addEventListener("click", () => alternarAba("interesses"));

  btnCarregarMaisTroca?.addEventListener("click", carregarFila);
}

function alternarAba(aba) {
  const ehSwipe = aba === "swipe";
  abaSwipe.style.display = ehSwipe ? "block" : "none";
  abaInteresses.style.display = ehSwipe ? "none" : "block";
  btnAbaSwipe.classList.toggle("ativo", ehSwipe);
  btnAbaInteresses.classList.toggle("ativo", !ehSwipe);

  if (ehSwipe && fila.length === 0) carregarFila();
}

/* =========================================================
   MEUS SERVIÇOS — o que eu ofereço na troca
========================================================= */

async function carregarMeusServicos() {
  const { data, error } = await supabase
    .from("servicos_prestador")
    .select("id, preco, catalogo:catalogo_id (produto)")
    .eq("prestador_id", usuarioId)
    .eq("ativo", true);

  if (error) return console.error(error);

  seletorMeuServico.innerHTML = "";

  if (!data?.length) {
    seletorMeuServico.innerHTML = `<option value="">Cadastre um serviço primeiro</option>`;
    seletorMeuServico.disabled = true;
    return;
  }

  data.forEach((s) => {
    seletorMeuServico.innerHTML += `<option value="${s.id}">${escapeHTML(
      s.catalogo?.produto || ""
    )} (${formatarPreco(s.preco)})</option>`;
  });
}

/* =========================================================
   INTERESSES DE TROCA (o que eu quero receber)
========================================================= */

async function carregarCategorias() {
  const { data } = await supabase.from("categorias").select("*").order("nome");
  selectCategoria.innerHTML = `<option value="">Categoria</option>`;
  data?.forEach((c) => {
    selectCategoria.innerHTML += `<option value="${c.id}">${escapeHTML(c.nome)}</option>`;
  });
}

async function carregarTipos(categoriaId) {
  selectTipo.innerHTML = `<option value="">Tipo</option>`;
  selectProduto.innerHTML = `<option value="">Produto/serviço</option>`;
  if (!categoriaId) return;

  const { data } = await supabase
    .from("tipos_servico")
    .select("*")
    .eq("categoria_id", categoriaId)
    .order("nome");

  data?.forEach((t) => {
    selectTipo.innerHTML += `<option value="${t.id}">${escapeHTML(t.nome)}</option>`;
  });
}

async function carregarProdutos(tipoId) {
  selectProduto.innerHTML = `<option value="">Produto/serviço</option>`;
  if (!tipoId) return;

  const { data } = await supabase
    .from("catalogo")
    .select("*")
    .eq("tipo_servico_id", tipoId)
    .order("produto");

  data?.forEach((p) => {
    selectProduto.innerHTML += `<option value="${p.id}">${escapeHTML(p.produto)}</option>`;
  });
}

async function adicionarInteresse() {
  const catalogoId = selectProduto.value;
  if (!catalogoId) return alert("Escolha o serviço que você quer receber em troca.");

  const { error } = await supabase
    .from("interesses_busca")
    .insert({ usuario_id: usuarioId, catalogo_id: catalogoId });

  if (error && error.code !== "23505") {
    console.error(error);
    return alert("Erro ao salvar interesse.");
  }

  await carregarInteresses();
  fila = []; // força recarregar a fila com o novo interesse
}

async function carregarInteresses() {
  const { data, error } = await supabase
    .from("interesses_busca")
    .select("id, catalogo:catalogo_id (produto)")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false });

  if (error) return console.error(error);

  listaInteresses.innerHTML = "";

  if (!data?.length) {
    listaInteresses.innerHTML = `<p class="dica">Você ainda não marcou o que quer receber em troca.</p>`;
    return;
  }

  data.forEach((i) => {
    const chip = document.createElement("span");
    chip.className = "chip chip-removivel";
    chip.innerHTML = `${escapeHTML(i.catalogo?.produto || "")} <button aria-label="remover">✕</button>`;

    chip.querySelector("button").addEventListener("click", async () => {
      await supabase.from("interesses_busca").delete().eq("id", i.id);
      chip.remove();
      fila = [];
    });

    listaInteresses.appendChild(chip);
  });
}

/* =========================================================
   FILA DE SWIPE (fila_troca)
========================================================= */

async function carregarFila() {
  const { data, error } = await supabase.rpc("fila_troca", {
    p_usuario_id: usuarioId,
    p_lat: localizacao?.lat ?? null,
    p_lng: localizacao?.lng ?? null,
    p_limite: TAMANHO_PAGINA_TROCA,
  });

  if (error) {
    console.error(error);
    return;
  }

  fila = data || [];
  indice = 0;
  renderizarAtual();
}

function renderizarAtual() {
  swipeDeck.innerHTML = "";

  if (indice >= fila.length) {
    swipeVazio.style.display = "block";
    return;
  }
  swipeVazio.style.display = "none";

  const visiveis = fila.slice(indice, indice + 3).reverse();

  visiveis.forEach((c, i) => {
    const card = document.createElement("div");
    card.className = "swipe-card";
    card.style.zIndex = i + 1;

    const imagens = c.imagens_desejado?.length ? c.imagens_desejado : ["../img/sem_imagem.jpg"];

    card.innerHTML = `
      <img class="swipe-img" src="${imagens[0]}">
      <div class="swipe-info">
        <h3>${escapeHTML(c.produto_desejado)}</h3>
        <p>👤 ${escapeHTML(c.prestador_nome)} ${c.nota_media ? `⭐ ${c.nota_media}` : ""}</p>
        <p>${formatarPreco(c.preco_desejado)} • ${c.duracao_desejado || 0}min</p>
        <p>📍 ${escapeHTML(c.cidade || "")} ${
          c.distancia_km !== null ? `• ${formatarDistancia(c.distancia_km)}` : ""
        }</p>
        <span class="chip-combina">🔄 quer o que você tem</span>
      </div>
    `;

    if (i === visiveis.length - 1) ativarGestoArrasto(card, c);
    swipeDeck.appendChild(card);
  });
}

function ativarGestoArrasto(card, candidato) {
  let startX = 0, dx = 0, arrastando = false;

  const mover = (novoDx) => {
    dx = novoDx;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 12}deg)`;
    card.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.4));
  };

  const soltar = () => {
    arrastando = false;
    if (dx > 100) return concluir(card, candidato, true);
    if (dx < -100) return concluir(card, candidato, false);
    card.style.transform = "";
    card.style.opacity = "";
  };

  card.addEventListener("touchstart", (e) => { arrastando = true; startX = e.touches[0].clientX; });
  card.addEventListener("touchmove", (e) => { if (arrastando) mover(e.touches[0].clientX - startX); });
  card.addEventListener("touchend", soltar);

  card.addEventListener("mousedown", (e) => { arrastando = true; startX = e.clientX; });
  window.addEventListener("mousemove", (e) => { if (arrastando) mover(e.clientX - startX); });
  window.addEventListener("mouseup", () => { if (arrastando) soltar(); });
}

function concluir(card, candidato, curtiu) {
  card.style.transition = "transform .25s ease, opacity .25s ease";
  card.style.transform = `translateX(${curtiu ? 500 : -500}px) rotate(${curtiu ? 20 : -20}deg)`;
  card.style.opacity = "0";
  setTimeout(() => registrar(candidato, curtiu), 200);
}

function avaliarAtual(curtiu) {
  const atual = fila[indice];
  if (!atual) return;
  const card = swipeDeck.querySelector(".swipe-card:last-child");
  if (card) concluir(card, atual, curtiu);
  else registrar(atual, curtiu);
}

async function registrar(candidato, curtiu) {
  if (curtiu && !seletorMeuServico.value) {
    alert("Escolha, no topo, qual dos seus serviços você está oferecendo na troca.");
    renderizarAtual(); // desfaz a animação/avanço
    return;
  }

  const { error } = await supabase.from("swipes").upsert(
    {
      usuario_id: usuarioId,
      alvo_tipo: "troca_prestador",
      alvo_id: candidato.prestador_id,
      servico_id: candidato.servico_desejado_id,
      servico_oferecido_id: curtiu ? seletorMeuServico.value : null,
      curtiu,
    },
    { onConflict: "usuario_id,alvo_tipo,alvo_id,servico_id" }
  );

  if (error) console.error(error);

  indice++;
  renderizarAtual();
}
