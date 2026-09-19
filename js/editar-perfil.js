import { supabase } from "./supabase.js";

import {
  exigirPerfilCompleto,
  ajustarNavTrocas,
  configurarBotaoLogout,
  urlAvatar,
  comprimirImagem,
  validarTelefone,
  validarCEP,
  buscarEnderecoPorCEP,
  geocodificarEndereco,
} from "./utils.js";


/* =========================================================
   ELEMENTOS DA PÁGINA
========================================================= */

const fileInput = document.getElementById("fileInput");
const avatarImg = document.getElementById("avatar");
const uploadBtn = document.getElementById("uploadBtn");

const formDados = document.getElementById("formDados");
const formSenha = document.getElementById("formSenha");

const linkServicos = document.getElementById("linkServicos");

const campoNome = document.getElementById("nome");
const campoTelefone = document.getElementById("telefone");
const campoBio = document.getElementById("bio");

const campoCEP = document.getElementById("cep");
const campoCidade = document.getElementById("cidade");
const campoEstado = document.getElementById("estado");
const campoBairro = document.getElementById("bairro");

const campoLogradouro = document.getElementById("logradouro");
const campoLatitude = document.getElementById("latitude");
const campoLongitude = document.getElementById("longitude");

const statusGeocodificacao =
  document.getElementById("statusGeocodificacao");


let usuarioAtual = null;


/* =========================================================
   STATUS DA GEOCODIFICAÇÃO
========================================================= */

function setStatusGeo(msg) {
  if (statusGeocodificacao) {
    statusGeocodificacao.textContent = msg;
  }
}


/* =========================================================
   INIT
   Carrega os dados atuais do usuário
========================================================= */

(async () => {
  try {
    const contexto = await exigirPerfilCompleto(supabase);

    if (!contexto) {
      return;
    }

    const { user, perfil } = contexto;

    usuarioAtual = user;

    /* Navegação */
    ajustarNavTrocas(perfil.tipo_usuario);

    /* Logout */
    configurarBotaoLogout(supabase);

    /* Link para serviços somente para prestadores */
    if (linkServicos) {
      linkServicos.style.display =
        perfil.tipo_usuario === "prestador"
          ? "block"
          : "none";
    }


    /* =====================================================
       AVATAR
    ===================================================== */

    if (avatarImg) {
      const avatarBase =
        perfil.avatar_url ||
        urlAvatar(supabase, user.id);

      /*
       * O parâmetro ?t evita que o celular mostre
       * uma imagem antiga armazenada no cache.
       */
      avatarImg.src =
        `${avatarBase.split("?")[0]}?t=${Date.now()}`;
    }


    /* =====================================================
       DADOS DO USUÁRIO
    ===================================================== */

    if (campoNome) {
      campoNome.value = perfil.nome || "";
    }

    if (campoTelefone) {
      campoTelefone.value = perfil.telefone || "";
    }

    if (campoBio) {
      campoBio.value = perfil.bio || "";
    }

    if (campoCidade) {
      campoCidade.value = perfil.cidade || "";
    }

    if (campoEstado) {
      campoEstado.value = perfil.estado || "";
    }

    if (campoBairro) {
      campoBairro.value = perfil.bairro || "";
    }

    if (campoLatitude) {
      campoLatitude.value =
        perfil.latitude ?? "";
    }

    if (campoLongitude) {
      campoLongitude.value =
        perfil.longitude ?? "";
    }

  } catch (erro) {

    console.error(
      "Erro ao carregar perfil:",
      erro
    );

    alert(
      "Não foi possível carregar os dados do perfil."
    );
  }
})();


/* =========================================================
   AVATAR
   Upload da foto de perfil
========================================================= */

uploadBtn?.addEventListener("click", async () => {

  try {

    /* =====================================================
       VERIFICAÇÕES
    ===================================================== */

    if (!usuarioAtual) {
      alert(
        "Usuário ainda não carregado. Aguarde alguns segundos."
      );
      return;
    }


    const arquivoOriginal =
      fileInput?.files?.[0];


    if (!arquivoOriginal) {
      alert(
        "Selecione uma imagem primeiro!"
      );
      return;
    }


    console.log(
      "Imagem selecionada:",
      arquivoOriginal.name
    );

    console.log(
      "Tipo:",
      arquivoOriginal.type
    );

    console.log(
      "Tamanho:",
      arquivoOriginal.size
    );


    /* =====================================================
       DESABILITA BOTÃO
    ===================================================== */

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Salvando...";


    /* =====================================================
       COMPRIMIR IMAGEM
    ===================================================== */

    let arquivo;

    try {

      arquivo =
        await comprimirImagem(
          arquivoOriginal
        );

    } catch (erroCompressao) {

      console.error(
        "Erro ao comprimir imagem:",
        erroCompressao
      );

      /*
       * Se a função de compressão não conseguir
       * processar a imagem, tentamos usar o arquivo
       * original.
       */

      arquivo = arquivoOriginal;
    }


    if (!arquivo) {
      throw new Error(
        "Não foi possível processar a imagem."
      );
    }


    console.log(
      "Arquivo final:",
      arquivo
    );


    /* =====================================================
       CAMINHO NO STORAGE
    ===================================================== */

    const filePath =
      `${usuarioAtual.id}/foto_perfil.png`;


    console.log(
      "Caminho do Storage:",
      filePath
    );


    /* =====================================================
       UPLOAD
       
       O upsert:true substitui a imagem anterior.
       Não precisamos executar remove() antes.
    ===================================================== */

    const { error: erroUpload } =
      await supabase.storage
        .from("avatars")
        .upload(
          filePath,
          arquivo,
          {
            upsert: true,

            /*
             * Como a função de compressão normalmente
             * gera PNG, informamos o tipo.
             */
            contentType:
              arquivo.type ||
              "image/png",

            /*
             * Evita cache agressivo.
             */
            cacheControl: "0"
          }
        );


    if (erroUpload) {

      console.error(
        "Erro no upload:",
        erroUpload
      );

      throw erroUpload;
    }


    console.log(
      "Upload realizado com sucesso!"
    );


    /* =====================================================
       URL DA NOVA FOTO
       
       O ?t=Date.now() é importante principalmente
       no celular para impedir que o navegador mostre
       a foto antiga.
    ===================================================== */

    const urlSemCache =
      urlAvatar(
        supabase,
        usuarioAtual.id
      ).split("?")[0];


    const novaUrl =
      `${urlSemCache}?t=${Date.now()}`;


    console.log(
      "Nova URL:",
      novaUrl
    );


    /* =====================================================
       ATUALIZA A IMAGEM NA TELA
    ===================================================== */

    if (avatarImg) {

      /*
       * Força o navegador a carregar a nova imagem.
       */
      avatarImg.src = novaUrl;

      /*
       * Se por algum motivo o navegador mantiver
       * a imagem antiga, tentamos novamente.
       */
      avatarImg.onload = () => {
        console.log(
          "Nova foto carregada no navegador."
        );
      };

      avatarImg.onerror = (erro) => {
        console.error(
          "Erro ao carregar nova foto:",
          erro
        );
      };
    }


    /* =====================================================
       SALVA A URL NO PERFIL
       
       No banco salvamos sem ?t=...
       O parâmetro de cache é usado somente
       quando carregamos a imagem.
    ===================================================== */

    const {
      error: erroPerfil
    } = await supabase
      .from("perfis")
      .update({
        avatar_url: urlSemCache
      })
      .eq(
        "id",
        usuarioAtual.id
      );


    if (erroPerfil) {

      console.error(
        "Erro ao atualizar avatar_url:",
        erroPerfil
      );

      throw erroPerfil;
    }


    /* =====================================================
       LIMPA O INPUT
    ===================================================== */

    if (fileInput) {
      fileInput.value = "";
    }


    /* =====================================================
       SUCESSO
    ===================================================== */

    alert(
      "Foto de perfil atualizada!"
    );


  } catch (erro) {

    console.error(
      "ERRO COMPLETO AO ATUALIZAR FOTO:",
      erro
    );


    let mensagem =
      "Não foi possível atualizar a foto.";


    if (erro?.message) {
      mensagem +=
        `\n\n${erro.message}`;
    }


    alert(mensagem);


  } finally {

    /*
     * Reativa o botão mesmo se ocorrer erro.
     */

    if (uploadBtn) {

      uploadBtn.disabled = false;

      uploadBtn.textContent =
        "Salvar foto";
    }
  }
});


/* =========================================================
   GEOCODIFICAÇÃO
   CEP → endereço → latitude/longitude
========================================================= */

async function autoPreencherPorCEP() {

  if (!campoCEP) {
    return;
  }


  if (!validarCEP(campoCEP.value)) {
    return;
  }


  setStatusGeo(
    "Buscando endereço pelo CEP..."
  );


  const endereco =
    await buscarEnderecoPorCEP(
      campoCEP.value
    );


  if (!endereco) {

    setStatusGeo(
      "CEP não encontrado. Preencha manualmente."
    );

    return;
  }


  /* Cidade */

  if (campoCidade) {

    campoCidade.value =
      endereco.cidade ||
      campoCidade.value;
  }


  /* Estado */

  if (campoEstado) {

    campoEstado.value =
      endereco.estado ||
      campoEstado.value;
  }


  /* Bairro */

  if (campoBairro) {

    campoBairro.value =
      endereco.bairro ||
      campoBairro.value;
  }


  /* Logradouro */

  if (campoLogradouro) {

    campoLogradouro.value =
      endereco.logradouro ||
      "";
  }


  setStatusGeo(
    "Calculando localização no mapa..."
  );


  /* =====================================================
     GEOCODIFICAÇÃO
  ===================================================== */

  const coords =
    await geocodificarEndereco(
      endereco
    );


  if (!coords) {

    setStatusGeo(
      "Endereço encontrado, mas não foi possível localizar no mapa. Você ainda pode salvar normalmente."
    );

    return;
  }


  if (campoLatitude) {

    campoLatitude.value =
      coords.lat;
  }


  if (campoLongitude) {

    campoLongitude.value =
      coords.lng;
  }


  setStatusGeo(
    `✅ Localização encontrada (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
  );
}


/* =========================================================
   CEP
========================================================= */

campoCEP?.addEventListener(
  "blur",
  autoPreencherPorCEP
);


/* =========================================================
   ALTERAÇÃO MANUAL DO ENDEREÇO
========================================================= */

[
  campoCidade,
  campoEstado,
  campoBairro
].forEach((campo) => {

  campo?.addEventListener(
    "blur",
    async () => {

      if (
        !campoCidade?.value ||
        !campoEstado?.value
      ) {
        return;
      }


      setStatusGeo(
        "Recalculando localização no mapa..."
      );


      const coords =
        await geocodificarEndereco({
          logradouro:
            campoLogradouro?.value,

          bairro:
            campoBairro?.value,

          cidade:
            campoCidade.value,

          estado:
            campoEstado.value
        });


      if (coords) {

        if (campoLatitude) {

          campoLatitude.value =
            coords.lat;
        }


        if (campoLongitude) {

          campoLongitude.value =
            coords.lng;
        }


        setStatusGeo(
          `✅ Localização atualizada (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        );
      }
    }
  );
});


/* =========================================================
   SALVAR DADOS
   Nome, telefone, bio e endereço
========================================================= */

formDados?.addEventListener(
  "submit",
  async (e) => {

    e.preventDefault();


    try {

      const nome =
        campoNome.value.trim();


      const telefone =
        campoTelefone.value.trim();


      const bio =
        campoBio.value.trim();


      const cidade =
        campoCidade.value.trim();


      const estado =
        campoEstado.value.trim();


      const bairro =
        campoBairro.value.trim();


      /* ===================================================
         VALIDAÇÕES
      =================================================== */

      if (!nome) {

        alert(
          "Preencha seu nome."
        );

        return;
      }


      if (!validarTelefone(telefone)) {

        alert(
          "Telefone inválido."
        );

        return;
      }


      if (
        campoCEP.value &&
        !validarCEP(campoCEP.value)
      ) {

        alert(
          "CEP inválido."
        );

        return;
      }


      /* ===================================================
         LATITUDE / LONGITUDE
      =================================================== */

      const latitude =
        campoLatitude.value
          ? parseFloat(
              campoLatitude.value
            )
          : null;


      const longitude =
        campoLongitude.value
          ? parseFloat(
              campoLongitude.value
            )
          : null;


      /* ===================================================
         ATUALIZA PERFIL
      =================================================== */

      const {
        error
      } = await supabase
        .from("perfis")
        .update({

          nome,

          telefone,

          bio,

          cidade,

          estado,

          bairro,

          latitude,

          longitude

        })
        .eq(
          "id",
          usuarioAtual.id
        );


      if (error) {

        console.error(
          "Erro ao salvar dados:",
          error
        );

        alert(
          "Erro ao salvar seus dados."
        );

        return;
      }


      alert(
        "Dados salvos!"
      );


    } catch (erro) {

      console.error(
        "Erro ao salvar dados:",
        erro
      );

      alert(
        "Erro inesperado ao salvar os dados."
      );
    }
  }
);


/* =========================================================
   TROCAR SENHA
========================================================= */

formSenha?.addEventListener(
  "submit",
  async (e) => {

    e.preventDefault();


    const senhaNova =
      document.getElementById(
        "senhaNova"
      ).value;


    const senhaConfirmar =
      document.getElementById(
        "senhaConfirmar"
      ).value;


    const mensagemErroSenha =
      document.getElementById(
        "mensagemErroSenha"
      );


    mensagemErroSenha.textContent =
      "";


    /* ===================================================
       VALIDA SENHA
    =================================================== */

    if (senhaNova.length < 6) {

      mensagemErroSenha.textContent =
        "A senha precisa ter pelo menos 6 caracteres.";

      return;
    }


    if (
      senhaNova !==
      senhaConfirmar
    ) {

      mensagemErroSenha.textContent =
        "As senhas não coincidem.";

      return;
    }


    /* ===================================================
       ATUALIZA SENHA NO SUPABASE
    =================================================== */

    const {
      error: erroSenha
    } = await supabase.auth.updateUser({
      password: senhaNova
    });


    if (erroSenha) {

      console.error(
        "Erro ao alterar senha:",
        erroSenha
      );

      mensagemErroSenha.textContent =
        erroSenha.message;

      return;
    }


    alert(
      "Senha alterada com sucesso!"
    );


    formSenha.reset();
  }
);