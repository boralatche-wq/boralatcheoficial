import { supabase } from "./supabase.js";

async function cadastrar() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const senha = document.getElementById("senha").value;
  const mensagemErro = document.getElementById("mensagem-erro");

  if (mensagemErro) mensagemErro.textContent = "";

  if (!email || !senha) {
    alert("Preencha email e senha.");
    return;
  }

  if (senha.length < 6) {
    alert("A senha precisa ter pelo menos 6 caracteres.");
    return;
  }

  // Cria só a conta de autenticação. Nome e tipo de usuário (cliente ou
  // prestador) são escolhidos na próxima etapa, em completar-cadastro.html —
  // é lá que a linha em `perfis` é criada de fato.
  const { data, error: signupError } = await supabase.auth.signUp({
    email,
    password: senha,
  });

  if (signupError) {
    // Ainda pode acontecer (ex.: rate limit do Supabase por excesso de
    // tentativas), então continua tratado — só não é mais o jeito
    // principal de detectar email duplicado (ver comentário abaixo).
    alert(
      signupError.message.includes("already registered")
        ? "Esse email já está cadastrado."
        : signupError.message
    );
    return;
  }

  // Com "Confirm email" desligado, o Supabase NÃO retorna erro quando o
  // email já existe (é assim de propósito, pra não dar pra descobrir
  // quais emails estão cadastrados testando um por um). O jeito oficial
  // de detectar isso é checar `identities`: se vier vazio, quer dizer que
  // já existia uma conta com esse email e nada novo foi criado — sem
  // precisar de nenhuma chamada extra (o que evitaria bater no limite de
  // cadastro do Supabase, que é por quantidade de chamadas, não só por
  // erro).
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    if (mensagemErro) {
      mensagemErro.textContent = "Esse email já está cadastrado. Tenta entrar ou recuperar a senha.";
    } else {
      alert("Esse email já está cadastrado. Tenta entrar ou recuperar a senha.");
    }
    return;
  }

  if (!data.session) {
    // Só aconteceria se "Confirm email" estivesse ligado de novo.
    alert("Conta criada! Confirme seu email para continuar o cadastro.");
    window.location.href = "index.html";
    return;
  }

  window.location.href = "completar-cadastro.html";
}

window.cadastrar = cadastrar;
