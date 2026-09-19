import { supabase } from "./supabase.js";
import { deslogar } from "./utils.js";

const ICONS = {
  descobrir: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 2L13.5 9L22 12L13.5 15L12 22L10.5 15L2 12L10.5 9Z"/></svg>`,
  matches: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 21s-7-4.35-9.5-8.28C.5 9.28 2.42 6 6 6c2 0 3.5 1.5 6 4 2.5-2.5 4-4 6-4 3.58 0 5.5 3.28 3.5 6.72C19 16.65 12 21 12 21z"/></svg>`,
  agenda: `<svg viewBox="0 0 24 24" class="icon"><path d="M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 12a5 5 0 1 0 0-10a5 5 0 0 0 0 10zm0 2c-4 0-8 2-8 5v3h16v-3c0-3-4-5-8-5z"/></svg>`,
  mais: `<svg viewBox="0 0 24 24" class="icon"><circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2" fill="currentColor" stroke="none"/></svg>`,
  troca: `<svg viewBox="0 0 24 24" class="icon"><path d="M4 7h16l-3-3m3 3l-3 3M20 17H4l3 3m-3-3l3-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  solicitar: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 2l2.2 2.2 3.1-.4.9 3 .9 2.8 2.8 1.4-1.4 2.8.4 3.1-3 .9-1.4 2.8-2.8-1.4-3.1.4-.9-3-2.8-1.4 1.4-2.8-.4-3.1 3-.9L12 2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  sair: `<svg viewBox="0 0 24 24" class="icon"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>`,
};

const ROTA_ATIVA = {
  "descobrir.html": "descobrir",
  "matches.html": "matches",
  "agenda.html": "agenda",
  "perfil.html": "profile",
  "editar-perfil.html": "profile",
  "cadastro-servicos.html": "profile",
  "troca.html": "troca",
  "admin-solicitacoes.html": "admin",
  "solicitar-servico.html": "solicitar-servico",
  "agendar.html": "matches",
  "perfil-publico.html": "descobrir",
};

const ROTAS_MAIS = new Set(["troca", "admin", "solicitar-servico"]);

function paginaAtual() {
  return location.pathname.split("/").pop() || "descobrir.html";
}

function chaveAtiva() {
  return ROTA_ATIVA[paginaAtual()] || "descobrir";
}

function montarNav() {
  const ativa = chaveAtiva();
  const maisAtivo = ROTAS_MAIS.has(ativa);

  return `
    <div class="nav-overlay" id="navOverlay"></div>
    <nav class="bottom-nav" aria-label="Navegação principal">
      <a class="nav-item${ativa === "descobrir" ? " active" : ""}" data-key="descobrir" href="descobrir.html">
        ${ICONS.descobrir} Descobrir
      </a>
      <a class="nav-item${ativa === "matches" ? " active" : ""}" data-key="matches" href="matches.html">
        ${ICONS.matches} Matches
      </a>
      <a class="nav-item${ativa === "agenda" ? " active" : ""}" data-key="agenda" href="agenda.html">
        ${ICONS.agenda} Agenda
      </a>
      <a class="nav-item${ativa === "profile" ? " active" : ""}" data-key="profile" href="perfil.html">
        ${ICONS.profile} Perfil
      </a>
      <div class="nav-mais-wrap">
        <button type="button" class="nav-item${maisAtivo ? " active" : ""}" id="btnNavMais" aria-expanded="false" aria-haspopup="true">
          ${ICONS.mais} Mais
        </button>
        <div class="nav-mais-menu" id="navMaisMenu" role="menu">
          <button type="button" class="nav-mais-item nav-sair" id="btnLogout" role="menuitem">
            ${ICONS.sair} Sair
          </button>
        </div>
      </div>
    </nav>
  `;
}

function fecharMenuMais() {
  document.getElementById("navMaisMenu")?.classList.remove("aberto");
  document.getElementById("navOverlay")?.classList.remove("visivel");
  document.getElementById("btnNavMais")?.setAttribute("aria-expanded", "false");
}

function abrirMenuMais() {
  document.getElementById("navMaisMenu")?.classList.add("aberto");
  document.getElementById("navOverlay")?.classList.add("visivel");
  document.getElementById("btnNavMais")?.setAttribute("aria-expanded", "true");
}

function configurarMenuMais() {
  document.getElementById("btnNavMais")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("navMaisMenu");
    if (menu?.classList.contains("aberto")) fecharMenuMais();
    else abrirMenuMais();
  });

  document.getElementById("navOverlay")?.addEventListener("click", fecharMenuMais);

  document.getElementById("btnLogout")?.addEventListener("click", () => {
    fecharMenuMais();
    deslogar(supabase);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharMenuMais();
  });
}

/**
 * Regras do menu "Mais":
 *  - Trocas:            somente prestadores
 *  - Solicitar serviço: somente prestadores
 *  - Admin:             somente admins (perfis.is_admin === true)
 *
 * Os itens NÃO existem no HTML inicial: só são criados (inseridos no DOM)
 * se o perfil tiver permissão. Assim não dependem de CSS para ficarem
 * escondidos. Isso é só interface — a proteção real fica nas páginas
 * (exigirPapel) e nas políticas RLS do Supabase.
 */
function itemMaisHTML({ key, href, icone, rotulo }) {
  const ativo = chaveAtiva() === key ? " active" : "";
  return `
    <a class="nav-mais-item${ativo}" data-key="${key}" data-perm="1" href="${href}" role="menuitem">
      ${icone} ${rotulo}
    </a>
  `;
}

async function aplicarPermissoes() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("is_admin, tipo_usuario")
    .eq("id", user.id)
    .maybeSingle();

  // DEBUG temporário: confirma que esta versão do nav.js está carregada
  // e mostra o que o banco devolveu. Pode remover depois.
  console.info("[nav.js v3] user:", user.id, "perfil:", perfil);

  if (!perfil) return;

  const ehPrestador = perfil.tipo_usuario === "prestador";
  const ehAdmin = perfil.is_admin === true;

  const itens = [];
  if (ehPrestador) {
    itens.push({ key: "troca", href: "troca.html", icone: ICONS.troca, rotulo: "Trocas" });
    itens.push({ key: "solicitar-servico", href: "solicitar-servico.html", icone: ICONS.solicitar, rotulo: "Solicitar serviço" });
  }
  if (ehAdmin) {
    itens.push({ key: "admin", href: "admin-solicitacoes.html", icone: ICONS.admin, rotulo: "Admin" });
  }

  const btnSair = document.getElementById("btnLogout");
  if (!btnSair) return;

  // limpa itens já inseridos (evita duplicar se o nav for renderizado 2x)
  document.querySelectorAll(".nav-mais-item[data-perm]").forEach((el) => el.remove());

  itens.forEach((item) => btnSair.insertAdjacentHTML("beforebegin", itemMaisHTML(item)));
}

function renderizarNav() {
  const alvo = document.getElementById("app-nav");
  if (!alvo) return;

  alvo.innerHTML = montarNav();
  configurarMenuMais();
  aplicarPermissoes();
}

/** Compatível com chamadas antigas de includeNav() */
export async function includeNav() {
  renderizarNav();
}

renderizarNav();