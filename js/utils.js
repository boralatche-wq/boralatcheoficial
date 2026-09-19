/**
 * Boralá Tche — Utilitários compartilhados
 */

/** Escapa HTML para prevenir XSS */
export function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/** UUID v4 (fallback para navegadores sem crypto.randomUUID) */
export function gerarUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Busca o perfil (tabela `perfis`) do usuário autenticado */
export async function carregarPerfilLogado(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Erro ao carregar perfil:", error);
    return null;
  }
  return data;
}

/** Gera link do WhatsApp com número e mensagem formatados */
export function criarLinkWhatsApp(numero, mensagem) {
  if (!numero) return null;
  let n = numero.replace(/\D/g, "");
  if (!n.startsWith("55")) n = "55" + n;
  if (n.length < 12) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}

/** Formata número em Real (R$) */
export function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata distância em km de forma amigável */
export function formatarDistancia(km) {
  if (km === null || km === undefined) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Pega a geolocalização do navegador (com timeout e fallback silencioso) */
export function obterGeolocalizacao({ timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    const timer = setTimeout(() => resolve(null), timeout);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout }
    );
  });
}

/** Debounce simples — essencial para a busca por texto não disparar a cada tecla */
export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Garante que existe uma sessão ativa. Se não houver, redireciona para o
 * login e retorna null (o chamador deve checar isso e parar a execução).
 */
export async function exigirSessao(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    location.href = "index.html";
    return null;
  }
  return user;
}

/**
 * Garante sessão ativa E perfil completo (linha em `perfis` já criada, com
 * nome e tipo_usuario). Se a sessão existir mas o perfil ainda não tiver
 * sido preenchido, manda para completar-cadastro.html.
 * Usar isso no início de toda página que dependa de `perfis` (descobrir,
 * matches, perfil, agenda, troca, cadastro-servicos).
 */
export async function exigirPerfilCompleto(supabase) {
  const user = await exigirSessao(supabase);
  if (!user) return null;

  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !perfil) {
    location.href = "completar-cadastro.html";
    return null;
  }

  return { user, perfil };
}

/**
 * Exige sessão + perfil completo + pelo menos um dos papéis permitidos.
 * Se o usuário não tiver permissão, volta para descobrir.html e retorna
 * null (o chamador deve checar isso e parar a execução).
 *
 * Exemplos:
 *   troca.html               → exigirPapel(supabase, { prestador: true })
 *   admin-solicitacoes.html  → exigirPapel(supabase, { admin: true })
 *   solicitar-servico.html   → exigirPapel(supabase, { prestador: true, admin: true })
 *
 * Atenção: isto protege só a interface. A segurança de verdade precisa
 * estar nas políticas RLS do Supabase.
 */
export async function exigirPapel(supabase, { prestador = false, admin = false } = {}) {
  const resultado = await exigirPerfilCompleto(supabase);
  if (!resultado) return null;

  const { perfil } = resultado;
  const permitido =
    (prestador && perfil.tipo_usuario === "prestador") ||
    (admin && perfil.is_admin === true);

  if (!permitido) {
    location.href = "descobrir.html";
    return null;
  }
  return resultado;
}

/** Valida telefone BR (10 ou 11 dígitos, com DDD) */
export function validarTelefone(telefone) {
  const t = (telefone || "").replace(/\D/g, "");
  return t.length === 10 || t.length === 11;
}

/** Valida CEP BR (8 dígitos) */
export function validarCEP(cep) {
  return (cep || "").replace(/\D/g, "").length === 8;
}

/** Detecta se o arquivo é HEIC/HEIF (formato padrão de câmera em muitos
 *  Android e iPhone) — esse formato não é decodificável nativamente por
 *  <img>/canvas/createImageBitmap no Chrome, então precisa ser convertido
 *  antes de qualquer outra coisa. */
function ehHeic(file) {
  const tipo = (file.type || "").toLowerCase();
  const nome = (file.name || "").toLowerCase();
  return (
    tipo.includes("heic") ||
    tipo.includes("heif") ||
    nome.endsWith(".heic") ||
    nome.endsWith(".heif")
  );
}

/** Carrega a lib heic2any sob demanda (uma única vez, via CDN) para
 *  converter HEIC/HEIF → JPEG no navegador. */
function carregarHeic2Any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (window.__heic2anyPromise) return window.__heic2anyPromise;

  window.__heic2anyPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    script.onload = () => resolve(window.heic2any);
    script.onerror = () => reject(new Error("Falha ao carregar heic2any"));
    document.head.appendChild(script);
  });

  return window.__heic2anyPromise;
}

async function converterHeicParaJpeg(file) {
  const heic2any = await carregarHeic2Any();
  const resultado = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(resultado) ? resultado[0] : resultado;
  const novoNome = file.name.replace(/\.hei[cf]$/i, ".jpg");
  return new File([blob], novoNome, { type: "image/jpeg" });
}

/**
 * Comprime uma imagem no navegador antes do upload (upload mais rápido,
 * menos gasto de storage). Usada tanto no avatar quanto nas fotos de
 * serviço.
 *
 * Sempre resolve com um File utilizável — nunca com null/undefined.
 * Converte HEIC/HEIF (fotos de câmera que o Chrome não decodifica
 * nativamente) para JPEG antes de comprimir. Se a compressão falhar por
 * qualquer outro motivo, cai pro arquivo original em vez de simplesmente
 * descartar a imagem.
 */
export async function comprimirImagem(file, maxLargura = 900, qualidade = 0.75) {
  if (!file) return null;

  let arquivoOrigem = file;

  if (ehHeic(file)) {
    try {
      arquivoOrigem = await converterHeicParaJpeg(file);
    } catch (erro) {
      console.warn(
        "comprimirImagem: falha ao converter HEIC. O arquivo original " +
          "provavelmente não vai abrir como imagem no navegador.",
        erro
      );
      // segue com o arquivo original mesmo assim — mantém a tentativa de
      // compressão abaixo, que pode até funcionar em alguns navegadores.
    }
  }

  // Método principal: createImageBitmap decodifica o arquivo direto,
  // sem passar por base64 (bem mais leve de memória que FileReader +
  // <img>), e corrige rotação EXIF sozinho — mais confiável em fotos
  // grandes de celular.
  try {
    const resultado = await comprimirComImageBitmap(arquivoOrigem, maxLargura, qualidade);
    if (resultado) return resultado;
  } catch (erro) {
    console.warn("comprimirImagem: createImageBitmap falhou, tentando método alternativo.", erro);
  }

  // Plano B: método antigo via FileReader + <img>, para navegadores sem
  // suporte a createImageBitmap.
  try {
    const resultado = await comprimirComFileReader(arquivoOrigem, maxLargura, qualidade);
    if (resultado) return resultado;
  } catch (erro) {
    console.warn("comprimirImagem: método alternativo também falhou.", erro);
  }

  // Último recurso: sobe a imagem (já convertida de HEIC pra JPEG, se foi
  // o caso) sem comprimir, em vez de deixar o upload sem nenhuma imagem.
  console.warn("comprimirImagem: não foi possível comprimir, enviando arquivo sem compressão.");
  return arquivoOrigem;
}

function comprimirComImageBitmap(file, maxLargura, qualidade) {
  return new Promise((resolve, reject) => {
    if (typeof createImageBitmap !== "function") return resolve(null);

    const timer = setTimeout(() => reject(new Error("timeout no createImageBitmap")), 15000);

    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((bitmap) => {
        clearTimeout(timer);
        try {
          const escala = Math.min(1, maxLargura / bitmap.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * escala));
          canvas.height = Math.max(1, Math.round(bitmap.height * escala));

          canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close?.();

          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(null);
              resolve(new File([blob], file.name, { type: "image/jpeg" }));
            },
            "image/jpeg",
            qualidade
          );
        } catch (erro) {
          resolve(null);
        }
      })
      .catch((erro) => {
        clearTimeout(timer);
        reject(erro);
      });
  });
}

function comprimirComFileReader(file, maxLargura, qualidade) {
  return new Promise((resolve) => {
    let finalizado = false;
    const finalizar = (resultado) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      resolve(resultado);
    };

    const timer = setTimeout(() => finalizar(null), 12000);

    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => finalizar(null);
    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onerror = () => finalizar(null);
    img.onload = () => {
      try {
        const escala = Math.min(1, maxLargura / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));

        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return finalizar(null);
            finalizar(new File([blob], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          qualidade
        );
      } catch (erro) {
        finalizar(null);
      }
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Geocodificação — CEP → endereço → latitude/longitude
 * 1) ViaCEP: CEP → logradouro/bairro/cidade/UF (gratuito, sem chave)
 * 2) Nominatim (OpenStreetMap): endereço → lat/lng (gratuito, sem chave)
 */
export async function buscarEnderecoPorCEP(cepBruto) {
  const cep = (cepBruto || "").replace(/\D/g, "");
  if (cep.length !== 8) return null;

  const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const dados = await resp.json();
  if (dados.erro) return null;

  return {
    logradouro: dados.logradouro,
    bairro: dados.bairro,
    cidade: dados.localidade,
    estado: dados.uf,
  };
}

export async function geocodificarEndereco({ logradouro, bairro, cidade, estado }) {
  const consulta = [logradouro, bairro, cidade, estado, "Brasil"]
    .filter(Boolean)
    .join(", ");

  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=` +
    encodeURIComponent(consulta);

  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  const dados = await resp.json();

  if (!dados?.length) return null;
  return { lat: parseFloat(dados[0].lat), lng: parseFloat(dados[0].lon) };
}

/** Desloga o usuário e volta pra tela de login */
export async function deslogar(supabase) {
  if (!confirm("Sair da sua conta?")) return;
  await supabase.auth.signOut();
  location.href = "index.html";
}

/** @deprecated Logout centralizado em nav.js — mantido por compatibilidade */
export function configurarBotaoLogout() {}

/** @deprecated Permissões de nav centralizadas em nav.js — mantido por compatibilidade */
export function ajustarNavTrocas() {}

/** URL pública do avatar do usuário (com cache-busting) */
export function urlAvatar(supabase, userId) {
  const { data } = supabase.storage
    .from("avatars")
    .getPublicUrl(`${userId}/foto_perfil.png`);
  return `${data.publicUrl}?t=${Date.now()}`;
}