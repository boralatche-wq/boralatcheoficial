import { supabase } from "./supabase.js";
import {
  escapeHTML,
  formatarPreco,
  urlAvatar,
  ajustarNavTrocas,
  configurarBotaoLogout,
  exigirPerfilCompleto,
  criarLinkWhatsApp,
} from "./utils.js";

const urlParams = new URLSearchParams(window.location.search);
const prestadorId = urlParams.get("id");

const fotoPerfil       = document.getElementById("fotoPerfil");
const nomeUsuario      = document.getElementById("nomeUsuario");
const tipoUsuarioBadge = document.getElementById("tipoUsuarioBadge");
const enderecoUsuario  = document.getElementById("enderecoUsuario");
const notaUsuario      = document.getElementById("notaUsuario");
const perfilTags       = document.getElementById("perfilTags");
const perfilContato    = document.getElementById("perfilContato");
const gridProdutos     = document.getElementById("gridProdutos");
const semServicos      = document.getElementById("semServicos");

let meuId = null;

(async () => {
  if (!prestadorId) return console.error("ID não informado na URL");

  // Guard central: garante que quem está VISITANDO o perfil tem sessão
  // ativa e cadastro completo (o perfil sendo visitado é público e não
  // precisa passar por essa checagem).
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  meuId = contexto.user.id;
  ajustarNavTrocas(contexto.perfil.tipo_usuario);
  configurarBotaoLogout(supabase);

  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", prestadorId)
    .single();

  if (error || !perfil) return console.error("Prestador não encontrado");

  nomeUsuario.textContent = perfil.nome;

  tipoUsuarioBadge.textContent = perfil.tipo_usuario === "prestador" ? "🧾 Prestador" : "🙋 Cliente";
  tipoUsuarioBadge.classList.toggle("match-badge-troca", perfil.tipo_usuario !== "prestador");

  enderecoUsuario.textContent = `📍 ${perfil.bairro ? perfil.bairro + ", " : ""}${perfil.cidade || ""}${perfil.estado ? " - " + perfil.estado : ""}`;

  notaUsuario.textContent = perfil.total_avaliacoes
    ? `⭐ ${perfil.nota_media} (${perfil.total_avaliacoes} avaliações)`
    : "Ainda sem avaliações";

  fotoPerfil.src = perfil.avatar_url || urlAvatar(supabase, prestadorId);

  if (meuId !== prestadorId) {
    const link = criarLinkWhatsApp(perfil.telefone, `Olá ${perfil.nome}, vim através do Boralá Tche!`);
    if (link) {
      perfilContato.innerHTML = `<a class="btn-whatsapp" href="${link}" target="_blank">💬 Chamar no WhatsApp</a>`;
    }
  }

  await carregarServicos();
})();

async function carregarServicos() {
  const { data, error } = await supabase
    .from("servicos_prestador")
    .select(
      `
      id, preco, duracao_min,
      catalogo:catalogo_id (
        produto,
        tipos_servico:tipo_servico_id ( categorias:categoria_id (nome) )
      ),
      servico_imagens ( url, ordem )
    `
    )
    .eq("prestador_id", prestadorId)
    .eq("ativo", true);

  if (error) return console.error(error);

  gerarTags(data || []);

  gridProdutos.innerHTML = "";
  semServicos.style.display = data?.length ? "none" : "block";

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
        <p class="corcard_2">${formatarPreco(s.preco)} • ${s.duracao_min}min</p>
        <button class="btn-agendar btn-quero">❤ Quero esse serviço</button>
      </div>
    `;

    card.querySelector(".btn-quero").addEventListener("click", async (e) => {
      await solicitarServico(s.id);
      e.target.textContent = "✔ Serviço solicitado";
      e.target.disabled = true;
    });

    gridProdutos.appendChild(card);
  });
}

function gerarTags(servicos) {
  perfilTags.innerHTML = "";

  const categorias = [
    ...new Set(
      servicos
        .map((s) => s.catalogo?.tipos_servico?.categorias?.nome)
        .filter(Boolean)
    ),
  ];

  categorias.forEach((nome) => {
    const tag = document.createElement("span");
    tag.className = "match-badge match-badge-troca";
    tag.textContent = nome;
    perfilTags.appendChild(tag);
  });
}

async function solicitarServico(servicoId) {
  await supabase.from("swipes").upsert(
    {
      usuario_id: meuId,
      alvo_tipo: "servico",
      alvo_id: prestadorId,
      servico_id: servicoId,
      curtiu: true,
    },
    { onConflict: "usuario_id,alvo_tipo,alvo_id,servico_id" }
  );

  const { error: erroMatch } = await supabase.from("matches").insert({
    tipo: "servico",
    cliente_id: meuId,
    prestador_id: prestadorId,
    servico_id: servicoId,
  });

  // 23505 = já existe um match pra esse serviço — não é erro, só evita duplicar
  if (erroMatch && erroMatch.code !== "23505") console.error(erroMatch);
}
