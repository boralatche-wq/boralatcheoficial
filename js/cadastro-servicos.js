import { supabase } from "./supabase.js";
import { exigirPerfilCompleto, ajustarNavTrocas, comprimirImagem } from "./utils.js";

const formAgenda = document.getElementById("formAgenda");
const formServico = document.getElementById("formServico");

const selectCategoria = document.getElementById("servicoCategoria");
const selectTipo = document.getElementById("servicoTipo");
const selectProduto = document.getElementById("servicoProduto");
const listaServicosEl = document.getElementById("listaServicosCadastrados");
const btnSubmitServico = formServico?.querySelector('button[type="submit"]');
const btnCancelarEdicao = document.getElementById("btnCancelarEdicaoServico");

let usuarioAtual = null;
let servicoEditandoId = null; // id da linha em servicos_prestador sendo editada (null = criando novo)

/* =========================================================
   INIT
========================================================= */

(async () => {
  const contexto = await exigirPerfilCompleto(supabase);
  if (!contexto) return;

  if (contexto.perfil.tipo_usuario !== "prestador") {
    alert("Essa área é exclusiva para prestadores de serviço.");
    return (location.href = "descobrir.html");
  }

  usuarioAtual = contexto.user;
  ajustarNavTrocas("prestador");

  await carregarAgenda();
  await carregarCategorias();
  await carregarServicosCadastrados();
})();

/* =========================================================
   AGENDA (horarios_atendimento)
========================================================= */

const DIAS_SEMANA = [
  "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
];

async function carregarAgenda() {
  const { data, error } = await supabase
    .from("horarios_atendimento")
    .select("dia_semana, horario_inicio, horario_fim, intervalo_inicio, intervalo_fim")
    .eq("prestador_id", usuarioAtual.id);

  if (error) {
    console.error("Erro ao carregar agenda:", error);
    return;
  }

  (data || []).forEach((registro) => {
    const i = registro.dia_semana;

    const checkAtivo = document.getElementById(`dia-${i}-ativo`);
    const inputInicio = document.getElementById(`dia-${i}-inicio`);
    const inputFim = document.getElementById(`dia-${i}-fim`);
    const inputIntervaloInicio = document.getElementById(`dia-${i}-intervalo-inicio`);
    const inputIntervaloFim = document.getElementById(`dia-${i}-intervalo-fim`);

    if (checkAtivo) checkAtivo.checked = true;
    // horario_inicio/fim vêm do banco como "HH:MM:SS" — <input type="time">
    // aceita "HH:MM", então cortamos os segundos se vierem.
    if (inputInicio && registro.horario_inicio) {
      inputInicio.value = registro.horario_inicio.slice(0, 5);
    }
    if (inputFim && registro.horario_fim) {
      inputFim.value = registro.horario_fim.slice(0, 5);
    }
    if (inputIntervaloInicio && registro.intervalo_inicio) {
      inputIntervaloInicio.value = registro.intervalo_inicio.slice(0, 5);
    }
    if (inputIntervaloFim && registro.intervalo_fim) {
      inputIntervaloFim.value = registro.intervalo_fim.slice(0, 5);
    }
  });
}

formAgenda?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const registros = [];

  DIAS_SEMANA.forEach((_, index) => {
    const ativo = document.getElementById(`dia-${index}-ativo`)?.checked;
    if (!ativo) return;

    registros.push({
      prestador_id: usuarioAtual.id,
      dia_semana: index,
      horario_inicio: document.getElementById(`dia-${index}-inicio`).value,
      horario_fim: document.getElementById(`dia-${index}-fim`).value,
      intervalo_inicio: document.getElementById(`dia-${index}-intervalo-inicio`)?.value || null,
      intervalo_fim: document.getElementById(`dia-${index}-intervalo-fim`)?.value || null,
    });
  });

  if (!registros.length) return alert("Marque ao menos um dia de atendimento.");

  const { error } = await supabase
    .from("horarios_atendimento")
    .upsert(registros, { onConflict: "prestador_id,dia_semana" });

  if (error) {
    console.error(error);
    return alert("Erro ao salvar agenda.");
  }

  alert("Agenda salva!");
});

/* =========================================================
   CATÁLOGO EM CASCATA (categoria > tipo > produto)
========================================================= */

async function carregarCategorias() {
  const { data } = await supabase.from("categorias").select("*").order("nome");

  selectCategoria.innerHTML = `<option value="">Selecione a categoria</option>`;
  data?.forEach((c) => {
    selectCategoria.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
  });
}

async function carregarTipos(categoriaId) {
  selectTipo.innerHTML = `<option value="">Selecione o tipo</option>`;
  selectProduto.innerHTML = `<option value="">Selecione o produto/serviço</option>`;

  if (!categoriaId) return;

  const { data } = await supabase
    .from("tipos_servico")
    .select("*")
    .eq("categoria_id", categoriaId)
    .order("nome");

  data?.forEach((t) => {
    selectTipo.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
  });
}

async function carregarProdutos(tipoId) {
  selectProduto.innerHTML = `<option value="">Selecione o produto/serviço</option>`;

  if (!tipoId) return;

  const { data } = await supabase
    .from("catalogo")
    .select("*")
    .eq("tipo_servico_id", tipoId)
    .order("produto");

  data?.forEach((p) => {
    selectProduto.innerHTML += `<option value="${p.id}">${p.produto}</option>`;
  });
}

selectCategoria?.addEventListener("change", () => carregarTipos(selectCategoria.value));
selectTipo?.addEventListener("change", () => carregarProdutos(selectTipo.value));

/* =========================================================
   MODO EDIÇÃO
========================================================= */

async function entrarModoEdicao(servico) {
  servicoEditandoId = servico.id;

  const categoriaId = servico.catalogo?.tipos_servico?.categoria_id || "";
  const tipoId = servico.catalogo?.tipo_servico_id || "";
  const catalogoId = servico.catalogo?.id || servico.catalogo_id || "";

  selectCategoria.value = categoriaId;
  await carregarTipos(categoriaId);
  selectTipo.value = tipoId;
  await carregarProdutos(tipoId);
  selectProduto.value = catalogoId;

  document.getElementById("servicoPreco").value = servico.preco;
  document.getElementById("servicoDuracao").value = servico.duracao_min;

  const sinalInput = document.getElementById("servicoSinal");
  if (sinalInput) sinalInput.value = servico.sinal_percentual ?? 0;

  const descInput = document.getElementById("servicoDescricao");
  if (descInput) descInput.value = servico.descricao || "";

  if (btnSubmitServico) btnSubmitServico.textContent = "Salvar alterações";
  if (btnCancelarEdicao) btnCancelarEdicao.classList.remove("hidden");

  formServico.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sairModoEdicao() {
  servicoEditandoId = null;
  formServico.reset();
  selectTipo.innerHTML = `<option value="">Selecione o tipo</option>`;
  selectProduto.innerHTML = `<option value="">Selecione o produto/serviço</option>`;
  if (btnSubmitServico) btnSubmitServico.textContent = "Adicionar serviço";
  if (btnCancelarEdicao) btnCancelarEdicao.classList.add("hidden");
}

btnCancelarEdicao?.addEventListener("click", sairModoEdicao);

/* =========================================================
   CADASTRAR / ATUALIZAR SERVIÇO OFERECIDO
========================================================= */

formServico?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const catalogoId = selectProduto.value;
  const preco = parseFloat(document.getElementById("servicoPreco").value);
  const duracao = parseInt(document.getElementById("servicoDuracao").value, 10);
  const sinal = parseInt(document.getElementById("servicoSinal")?.value || "0", 10);
  const descricao = document.getElementById("servicoDescricao")?.value?.trim() || "";
  const arquivos = [...(document.getElementById("servicoImagens")?.files || [])].slice(0, 3);

  if (!catalogoId) return alert("Selecione o serviço no catálogo.");
  if (!preco || preco <= 0) return alert("Informe um preço válido.");
  if (!duracao || duracao <= 0) return alert("Informe a duração em minutos.");
  if (sinal < 0 || sinal > 100) {
    return alert("O sinal deve ser uma porcentagem entre 0 e 100 (ex.: 20 para 20%).");
  }

  // upsert: se prestador_id + catalogo_id já existir, ATUALIZA a linha existente
  // (é assim que a edição funciona, sem precisar de uma rota separada de update)
  const { data: servico, error } = await supabase
    .from("servicos_prestador")
    .upsert(
      {
        prestador_id: usuarioAtual.id,
        catalogo_id: catalogoId,
        preco,
        duracao_min: duracao,
        sinal_percentual: sinal,
        descricao,
        ativo: true,
      },
      { onConflict: "prestador_id,catalogo_id" }
    )
    .select()
    .single();

  if (error) {
    console.error(error);
    return alert("Erro ao salvar serviço.");
  }

  // Upload das imagens (comprimidas) para o storage `servicos`
  // — só roda se o usuário selecionou novas imagens; editar sem trocar foto não mexe nas antigas.
  let erroImagens = false;

  for (let i = 0; i < arquivos.length; i++) {
    const arquivoParaSubir = await comprimirImagem(arquivos[i], 900, 0.75);
    const path = `${usuarioAtual.id}/${servico.id}/imagem${i + 1}.jpg`;

    let erroUpload;
    try {
      const resultado = await supabase.storage
        .from("servicos")
        .upload(path, arquivoParaSubir, { upsert: true });
      erroUpload = resultado.error;
    } catch (erroInesperado) {
      erroUpload = erroInesperado;
    }

    if (erroUpload) {
      console.error("Erro ao subir imagem:", erroUpload);
      erroImagens = true;
      continue; // tenta as próximas mesmo se uma falhar
    }

    const { data: pub } = supabase.storage.from("servicos").getPublicUrl(path);

    const { error: erroImagem } = await supabase.from("servico_imagens").upsert(
      { servico_id: servico.id, url: pub.publicUrl, ordem: i },
      { onConflict: "servico_id,ordem" }
    );

    if (erroImagem) {
      console.error("Erro ao salvar registro da imagem:", erroImagem);
      erroImagens = true;
    }
  }

  if (erroImagens) {
    alert(
      "O serviço foi salvo, mas houve um problema ao subir alguma imagem. " +
      "Veja o console (F12) pra detalhes — provavelmente falta rodar as " +
      "policies de Storage (09_storage_policies.sql) ou a constraint " +
      "única de servico_imagens (08_fix_servico_imagens.sql)."
    );
  }

  alert(servicoEditandoId ? "Serviço atualizado com sucesso!" : "Serviço cadastrado com sucesso!");
  sairModoEdicao();
  await carregarServicosCadastrados();
});

/* =========================================================
   LISTAR SERVIÇOS JÁ CADASTRADOS (editar + toggle ativo/inativo)
========================================================= */

async function carregarServicosCadastrados() {
  if (!listaServicosEl) return;

  const { data, error } = await supabase
    .from("servicos_prestador")
    .select(`
      id, preco, duracao_min, sinal_percentual, descricao, ativo, catalogo_id,
      catalogo:catalogo_id (
        id, produto, tipo_servico_id,
        tipos_servico:tipo_servico_id ( id, categoria_id )
      )
    `)
    .eq("prestador_id", usuarioAtual.id)
    .order("criado_em", { ascending: false });

  if (error) return console.error(error);

  listaServicosEl.innerHTML = "";

  (data || []).forEach((s) => {
    const linha = document.createElement("div");
    linha.className = "linha-servico";
    linha.innerHTML = `
      <span>${s.catalogo?.produto || "-"}</span>
      <span>R$ ${Number(s.preco).toFixed(2)} • ${s.duracao_min}min</span>
      <div style="display:flex; align-items:center; gap:10px;">
        <button type="button" class="btn-editar-servico">✏️ Editar</button>
        <label class="switch">
          <input type="checkbox" ${s.ativo ? "checked" : ""} data-id="${s.id}">
          <span>Ativo</span>
        </label>
      </div>
    `;

    linha.querySelector(".btn-editar-servico").addEventListener("click", () => entrarModoEdicao(s));

    linha.querySelector("input[type=checkbox]").addEventListener("change", async (e) => {
      await supabase
        .from("servicos_prestador")
        .update({ ativo: e.target.checked })
        .eq("id", s.id);
    });

    listaServicosEl.appendChild(linha);
  });
}