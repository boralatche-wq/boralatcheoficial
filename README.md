# Boralá Tche — Reescrita completa (banco novo + busca híbrida)

## Rodada mais recente: prestador precisa aceitar o serviço

**Antes:** qualquer agendamento (mesmo "pendente") já bloqueava aquele
horário pra outros clientes — ou seja, quem marcasse primeiro ficava com
a vaga, sem o prestador ter voz ativa nenhuma.

**Agora:** um agendamento criado em `agendar.html` nasce como **pedido**
(`status = 'pendente'`) e **não ocupa o horário de verdade ainda**. Vários
clientes podem pedir o mesmo horário. Só quando o prestador **aceita** um
deles é que o horário fica realmente ocupado (`status = 'confirmado'`) —
e isso já recusa automaticamente qualquer outro pedido pendente que
colida com aquele horário.

- **`sql/11_aceitar_servico.sql`**:
  - `slots_disponiveis()` atualizada — só conta como ocupado
    `confirmado`/`em_andamento`/`concluido`, não mais `pendente`.
  - `aceitar_agendamento(id)` — função nova (RPC) que confirma o pedido
    escolhido e cancela, na mesma chamada, qualquer outro pedido pendente
    do mesmo prestador que sobreponha aquele horário. Roda com a
    permissão normal do prestador (RLS já garante que só ele mexe nos
    próprios agendamentos).
- **`matches.html`/`js/matches.js`** — nova seção **📋 Solicitações
  pendentes** (só aparece pra quem é prestador), com um seletor pra
  ordenar por "mais recente", "menor/maior preço" e "menor/maior duração"
  — assim, se vários clientes pedirem o mesmo horário, o prestador escolhe
  qual vale mais a pena aceitar. Cada linha tem botões **✅ Aceitar** /
  **✕ Recusar**.
  - Cliente agora vê uma seção **⏳ Aguardando confirmação do prestador**
    pros próprios pedidos ainda não respondidos.
  - O botão **✅ Finalizar** só aparece depois que o prestador aceitou
    (`confirmado`/`em_andamento`) — antes disso não tem como finalizar um
    pedido que nem foi aceito ainda.

## Rodada anterior: cadastro sem confirmação de email + recuperação de senha

**1) Detecção de email duplicado sem gastar chamadas extra.** Com
"Confirm email" desligado no Supabase, `signUp()` **não retorna mais erro**
quando o email já existe — é assim de propósito, pra ninguém conseguir
descobrir quais emails têm conta testando um por um. `js/cadastro.js`
agora usa o jeito oficial de detectar isso: depois do `signUp()`, se
`data.user.identities` vier como array vazio, quer dizer que já existia
uma conta com aquele email e nada novo foi criado — sem precisar de
nenhuma chamada extra (por isso não bate no limite de cadastro do
Supabase, que conta por quantidade de chamadas ao endpoint de auth).

**2) Recuperação/troca de senha** (era a peça que faltava sem confirmação
de email — se o usuário esquece a senha, precisa de outro jeito de entrar):
- **`esqueci-senha.html`** — pede o email, chama
  `supabase.auth.resetPasswordForEmail()`. Link "Esqueci a senha" já está
  na tela de login.
- **`redefinir-senha.html`** — é pra onde o link do email aponta. Detecta
  o evento `PASSWORD_RECOVERY` do Supabase (a sessão temporária que o link
  cria) e libera o formulário de senha nova.
- **`editar-perfil.html`** — ganhou uma seção "🔒 Trocar senha" pra quem já
  está logado e só quer trocar a senha sem precisar do fluxo por email.

**Importante pra configurar no Supabase:** em Authentication → URL
Configuration, a URL completa de `redefinir-senha.html` (com o domínio
real, quando publicar) precisa estar na lista de "Redirect URLs" —
senão o Supabase recusa o redirecionamento do link do email e a
recuperação não funciona. Em localhost/desenvolvimento isso geralmente já
vem liberado por padrão.

## O que mudou (histórico)

**1) Paleta alinhada ao logo.** Extraí as cores reais do PNG enviado
(vermelho `#FF174C` → roxo `#A636F7`) e repaletizei o app: fundo em
ameixa escura (mesma família do roxo), cards em branco quente, e os CTAs
principais (curtir, agendar, entrar, toggle ativo) usam o gradiente
vermelho→roxo do logo em vez de uma cor chapada. Os *nomes* das variáveis
CSS (`--verde-mate` etc.) continuam os mesmos por baixo — só os valores
mudaram — porque várias páginas HTML referenciam esses tokens direto no
`style=""`; trocar o valor evita precisar editar cada arquivo.

**2) Responsivo de verdade (mobile + tablet + desktop).** Antes só existia
o layout mobile. Agora tem breakpoints em `css/style.css`:
- `>= 640px` (tablet): grid com cards um pouco maiores.
- `>= 1024px` (desktop): conteúdo centralizado numa largura máxima
  (`--largura-conteudo`), mais colunas nos grids, hover states nos cards e
  botões (só existem a partir daqui, já que hover não faz sentido no
  celular), e o menu inferior vira uma "doca" flutuante centralizada em
  vez de ocupar a tela inteira.
- `>= 1440px`: mais folga ainda.
- `<= 360px`: ajustes finos pra aparelho bem estreito não estourar.

**3) Matches reorganizado em 3 áreas + dashboard financeiro** (tudo em
`matches.html`/`js/matches.js`):
- **💰 Dashboard no topo** — cliente vê "quanto já investiu"; prestador vê
  "quanto já recebeu". Soma só agendamentos de **serviço** com status
  `concluido` (troca não entra na conta, já que não envolve dinheiro).
- **📅 Agendamentos marcados** — matches de serviço que já têm um
  agendamento (`agendar.html` criou), com o status (pendente/confirmado/
  em andamento/concluído) e um botão **✅ Finalizar**.
- **❤ Aguardando agendamento** — matches de serviço que ainda não têm
  horário marcado (o botão "📅 Agendar" de sempre).
- **🔄 Trocas de Serviço** — matches de troca entre prestadores, em seção
  separada, mostrando o que você oferece e o que recebe. (Ainda não tem
  agendamento automático pra troca — combina pelo WhatsApp por enquanto,
  igual já era.)

**Finalizar + avaliação:** ao clicar "✅ Finalizar", o agendamento vira
`concluido` e abre um modal pra avaliar (1 a 5 estrelas + comentário
opcional), que grava em `avaliacoes` — e isso já alimenta a nota média do
perfil (o trigger `trg_atualizar_nota_media`, que já existia no banco
desde o início, só nunca tinha uma tela que desse pra usar ele de verdade).

Nenhuma mudança de SQL foi necessária pra essa rodada — só front-end
(CSS + `matches.html`/`matches.js`), reaproveitando tabelas e policies que
já existiam.

## O que mudou (histórico)

**Banco de dados:** schema novo do zero (pasta `sql/`).

Se você já tentou rodar alguma versão anterior (mesmo que com erro no meio),
rode **primeiro** `00_drop_tudo.sql` — ele apaga tudo (tabelas, views,
funções, tipos) com `IF EXISTS`/`CASCADE`, então é seguro rodar mesmo que só
parte tenha sido criada. Depois siga a ordem normal no SQL Editor do
Supabase (cada arquivo depende do anterior):

0. `00_drop_tudo.sql` — limpa qualquer tentativa anterior (rodar só se necessário)
1. `01_schema.sql` — tabelas, enums, triggers
2. `02_busca.sql` — full-text search, fuzzy match, geolocalização e as duas
   funções (RPC) que alimentam a busca: `buscar_servicos()` e `fila_swipe()`
3. `03_policies.sql` — Row Level Security (idempotente: pode rodar de novo
   sem erro de "policy already exists")
4. `04_seed.sql` — categorias/tipos/catálogo de exemplo (ajuste para o seu caso)
5. `05_troca.sql` — sistema de troca de serviço entre prestadores: fila
   dedicada (`fila_troca()`) e o gatilho que cria o match automaticamente
   quando os dois prestadores se curtem
6. `06_agendamento.sql` — disponibilidade automática de horários/dias
   (`slots_disponiveis()` e `dias_disponiveis_prestador()`), usada pela
   tela de agendamento (`agendar.html`)
7. `07_grants.sql` — grants explícitos de tabela para o papel
   `authenticated`. **Importante:** RLS decide quais *linhas* dá pra tocar,
   mas o Postgres também exige permissão bruta na *tabela* antes de
   avaliar a RLS — sem isso dá erro `42501 permission denied for table`
   mesmo com a policy certa. Normalmente o Supabase aplica isso sozinho
   ao criar as tabelas, mas pode falhar silenciosamente (principalmente
   depois de um `00_drop_tudo.sql` + recriação). Esse arquivo é
   idempotente, seguro rodar de novo a qualquer momento se aparecer esse
   erro em alguma tabela.

## Agendamento automático (fluxo completo)

Duas telas separadas, cada uma com um papel:

- **`agenda.html`/`js/agenda.js`** — "minha agenda": lista os próprios
  agendamentos (cliente ou prestador), só visualização. Clicar num horário
  ocupado abre os detalhes (com quem é, telefone/WhatsApp, horário).
- **`agendar.html`/`js/agendar.js`** — marcar um horário novo de verdade.
  Acessada pelo botão "📅 Agendar" em `matches.html`
  (`agendar.html?match=<id>`). Mostra o calendário do prestador daquele
  match com **só os dias que têm vaga** (via `dias_disponiveis_prestador`);
  ao clicar num dia, mostra **só os horários realmente livres** daquele dia
  (via `slots_disponiveis`), já descontando a duração do serviço e
  qualquer agendamento que outro cliente tenha feito naquele horário. Ao
  confirmar, cria a linha em `agendamentos` com status `pendente`.

**Por que as funções de disponibilidade são `security definer`:** a RLS de
`agendamentos` só deixa cada um ver os PRÓPRIOS agendamentos — correto pra
privacidade, mas sem isso o cálculo de disponibilidade não enxergaria os
horários que OUTROS clientes já reservaram com aquele prestador, e deixaria
marcar em cima. `slots_disponiveis()` e `dias_disponiveis_prestador()`
rodam com privilégio elevado só pra enxergar todos os agendamentos do
prestador ao calcular, mas devolvem apenas horários livres/ocupados —
nunca nome, telefone ou qualquer dado de quem agendou. Os detalhes
completos de um agendamento continuam só visíveis pra quem participa dele,
normalmente, em `agenda.html`.

**De → Para** (principais renomeações):

| Antes                                     | Agora                                          |
|--------------------------------------------|-------------------------------------------------|
| `usuarios`                                 | `perfis` (id = auth.users.id)                   |
| `servicos_catalogo`                        | `categorias` → `tipos_servico` → `catalogo`     |
| `servicos_prestador_v2` (imagem1/2/3)       | `servicos_prestador` + `servico_imagens` (normalizado) |
| `horarios_cliente`                         | `horarios_atendimento`                          |
| `cliente_procura` / `prestador_procura`     | `interesses_busca`                              |
| `cliente_match` / `prestador_match`         | `swipes` (like/dislike) + `matches` (match confirmado) |
| `agendamentos`                             | `agendamentos` (mesmo nome, colunas atualizadas)|
| — (não existia)                            | `avaliacoes` (nota do prestador, usada para ranquear a busca) |

**Arquivos JS (pasta `js/`):** todos reescritos para o schema novo.
`match.js` + `matches.js` antigos foram substituídos por:
- **`busca.js`** → o novo sistema de busca híbrido (barra de busca com
  filtros **e** modo swipe, na mesma tela — `descobrir.html`)
- **`matches.js`** → agora só lista os matches confirmados (era o antigo `inicio.js`)
- **`completar-cadastro.js`** → novo, não existia antes (ver seção abaixo)
- **`troca.js`** → novo, sistema de troca de serviço entre prestadores

## Fluxo de cadastro (em duas etapas)

Separei "criar conta" de "completar cadastro", como pedido:

1. **`cadastro.html` → `js/cadastro.js`** — só email e senha
   (`supabase.auth.signUp`). Não grava nada em `perfis` ainda.
2. **`completar-cadastro.html` → `js/completar-cadastro.js`** — nome e tipo
   de usuário (cliente/prestador). É só aqui que a linha em `perfis` é
   criada (`insert`, não `upsert` — se já existir, a própria página detecta
   e redireciona sem perguntar de novo).
3. Dali em diante: cliente vai para `descobrir.html`; prestador vai para
   `cadastro-servicos.html` (foto, endereço, agenda, catálogo).

Toda página que depende de `perfis` (descobrir, matches, perfil, agenda,
troca, cadastro-servicos, perfil-público) usa o guard central
`exigirPerfilCompleto()` (em `js/utils.js`): se não houver sessão, manda pro
login; se houver sessão mas a etapa 2 não tiver sido concluída (ex.: o
usuário fechou o app no meio do cadastro), manda pra
`completar-cadastro.html` em vez de quebrar a página.

**Duas proteções extras contra o problema da confirmação de email:**

1. **`index.html` detecta sessão já ativa ao carregar.** Se a pessoa clicar
   no link de confirmação de email e o Supabase já criar a sessão nesse
   momento, ela não vê o formulário de login de novo — é redirecionada na
   hora pro lugar certo (`completar-cadastro.html` ou `descobrir.html`).
2. **Trocar de cliente para prestador (ou o contrário) não fica preso ao
   cadastro.** Em `perfil.html` tem um botão "🔁 Virar prestador de serviço"
   / "🔁 Trocar para cliente" que funciona a qualquer momento, depois de
   logado — não depende de estar no fluxo de cadastro nem de confirmação de
   email pendente. Ele atualiza `perfis.tipo_usuario` e pausa/reativa os
   serviços já cadastrados (`servicos_prestador.ativo`) sem apagar nada, pra
   quem for e voltar não perder o catálogo.

## Correções desta rodada

**Prestador via os próprios serviços na busca/swipe.** O `fila_swipe()`
já excluía isso, mas a barra de busca (`buscar_servicos()`) não. Agora a
função recebe um parâmetro a mais (`p_usuario_id`) e filtra fora os
serviços do próprio prestador que está pesquisando. `js/busca.js` já manda
esse parâmetro. **Se seu banco já estava rodando**, é só rodar de novo o
`buscar_servicos()` atualizado do `02_busca.sql` — é `create or replace`,
não precisa dropar nada (o parâmetro novo tem valor padrão `null`).

O agendamento automático (a outra mudança grande desta rodada) está
documentado na seção "Agendamento automático" mais acima.

## Editar perfil (cliente e prestador) vs. Meus Serviços (só prestador)

Antes, `cadastro-servicos.html` misturava duas coisas: dados pessoais (foto,
telefone, endereço) — que fazem sentido pra qualquer usuário — e catálogo
de serviços/agenda, que é exclusivo de prestador. Separei:

- **`editar-perfil.html` / `js/editar-perfil.js`** — foto, nome, telefone,
  bio e endereço (com a mesma geocodificação automática por CEP). Aberta
  pra **qualquer usuário**, cliente ou prestador. Acessível pelo link
  "✏️ Editar meus dados" em `perfil.html`.
- **`cadastro-servicos.html` / `js/cadastro-servicos.js`** — agora só
  horários de atendimento e catálogo de serviços oferecidos. Continua
  exclusivo de prestador (guard redireciona quem não é). Acessível pelo
  link "🧾 Meus serviços", que só aparece em `perfil.html` pra quem é
  prestador — e também a partir de `editar-perfil.html`, pra quem é
  prestador continuar o cadastro depois de preencher os dados pessoais.
- Depois de escolher "prestador" em `completar-cadastro.html` (ou trocar
  de tipo em `perfil.html`), o caminho agora é: `editar-perfil.html`
  primeiro (dados pessoais) → link pra `cadastro-servicos.html` (agenda e
  catálogo).

As funções de geocodificação/compressão de imagem que antes estavam
duplicadas viraram utilitários compartilhados em `js/utils.js`
(`comprimirImagem`, `buscarEnderecoPorCEP`, `geocodificarEndereco`,
`validarTelefone`, `validarCEP`).

## Deslike expira em 2 horas

Antes, qualquer swipe (curtir ou não curtir) escondia o serviço da fila
**pra sempre** — o que faz sentido pro like (já virou match), mas não pro
deslike: a pessoa pode ter passado batido, ou mudado de ideia, e o serviço
não pode ficar indisponível pro resto da vida.

Agora (`sql/10_reset_swipes.sql`):
- **Like**: continua escondendo o serviço pra sempre (já é um match, não
  precisa reaparecer).
- **Deslike**: expira em 2 horas — depois disso, o serviço volta a
  aparecer normalmente na fila (tanto no 🧉 Descobrir quanto na 🔄 Troca).

Como o mesmo serviço pode ser "re-swipado" depois do reset, o front-end
salva o swipe com `upsert` (em vez de `insert`) — assim, curtir/descurtir
de novo atualiza a linha existente ao invés de dar erro de duplicidade.
Também adicionei uma constraint única em `matches` (`tipo, cliente_id,
prestador_id, servico_id`) pra garantir que re-curtir o mesmo serviço
nunca crie um match repetido.

## Carregamento em lotes (não sobrecarrega banco nem site)

Antes, tanto o modo swipe (Descobrir e Troca) quanto a busca por texto
buscavam/recarregavam sem controle — o swipe, por exemplo, buscava mais
gente sozinho assim que a fila acabava. Agora tudo é em lotes pequenos,
com um botão explícito pra pedir mais:

- **Busca por texto** (`descobrir.html`, modo 🔎 Buscar): 15 resultados por
  vez. Aparece "Carregar mais" no fim da lista se ainda pode ter mais
  (esconde sozinho quando a página veio incompleta, sinal de que acabou).
- **Swipe do Descobrir** (`descobrir.html`, modo 🧉 Descobrir): 15 perfis
  por lote. Quando a pilha acaba, aparece "Carregar mais perfis" em vez de
  buscar sozinho.
- **Swipe da Troca** (`troca.html`): mesma lógica, 15 por lote, botão
  "Carregar mais" quando esgota.

Nenhuma mudança no banco foi necessária pra isso — só o jeito como o
front-end pede os dados (usando o `p_offset` que `buscar_servicos()` já
suportava, e simplesmente parando de auto-chamar `fila_swipe()`/`fila_troca()`).

## O sistema de busca (o pedido principal)

Página `descobrir.html` com dois modos que dividem o mesmo estado:

- **🔎 Buscar** — texto livre (busca em português, sem acento, com
  tolerância a erro de digitação via `pg_trgm`) + filtros de categoria, tipo,
  faixa de preço e ordenação (relevância / mais perto / melhor avaliado /
  preço). Roda tudo em uma única função no banco (`buscar_servicos`), então
  a lista já vem pronta, ordenada e com distância calculada.
- **🧉 Descobrir (swipe)** — fila de cards gerada por `fila_swipe()`, que
  prioriza: 1) serviços que combinam com os interesses salvos do usuário,
  2) mais perto, 3) melhor nota. Arrasta ou usa os botões ❤ / ✕. Curtir
  grava o swipe e já cria o match (visível em "Matches").

Ambos os modos usam geolocalização do navegador quando disponível (não é
obrigatória — a busca funciona normalmente sem ela).

## Geocodificação automática (CEP → mapa)

Em `cadastro-servicos.html`, ao sair do campo CEP:

1. **ViaCEP** (gratuito, sem chave) preenche cidade/estado/bairro/logradouro.
2. **Nominatim/OpenStreetMap** (gratuito, sem chave) converte esse endereço
   em latitude/longitude, salvos em `perfis.latitude/longitude`.
3. Esses campos alimentam `distancia_km()` e por consequência a ordenação
   "mais perto" da busca, do swipe e da troca.

Se o prestador editar cidade/bairro/estado manualmente depois, a localização
é recalculada automaticamente ao sair do campo. Nominatim tem limite de uso
razoável para volume baixo/médio (~1 req/s); se o volume crescer bastante,
trocar por um provedor pago de geocoding é só substituir a função
`geocodificarEndereco()` em `js/cadastro-servicos.js`.

## Troca de serviço entre prestadores

Tela dedicada: `troca.html` / `js/troca.js` (aparece no menu inferior como
"🔄 Trocas", só para quem é `prestador`). Diferente do match cliente↔prestador
(que já nasce confirmado ao curtir), aqui o match **só é criado quando os
dois prestadores curtem um ao outro**:

1. O prestador marca em "🎯 O que eu quero" quais serviços te interessam
   receber em troca (grava em `interesses_busca`).
2. A aba "🔄 Descobrir trocas" mostra prestadores que oferecem exatamente
   isso, mais perto e melhor avaliados primeiro (`fila_troca()`).
3. Antes de curtir, ele escolhe no seletor do topo qual serviço próprio está
   oferecendo.
4. Cada curtida vira uma linha em `swipes` (`alvo_tipo = 'troca_prestador'`).
   Um gatilho no banco (`trg_criar_match_troca`) verifica se o outro lado já
   curtiu de volta e, se sim, cria a linha em `matches` (`tipo = 'troca'`)
   automaticamente — sem nenhuma chamada extra do front-end.

## Antes de rodar

1. Se necessário, rode `00_drop_tudo.sql` para limpar tentativas anteriores.
2. Crie/limpe o projeto no Supabase e rode `01` → `06` na ordem acima.
3. Crie os buckets de Storage `avatars` e `servicos` (públicos para leitura).
4. Edite `js/supabase.js` com a URL e a chave publicável do projeto novo.
5. Preencha `sql/04_seed.sql` com as categorias reais do seu negócio (ou
   mantenha o exemplo de estética/beleza para testar).

## Fora de escopo (não existia no site original também)

- Chat interno em tempo real — a ponte continua sendo o link direto do
  WhatsApp, como no site original enviado. Se quiser um chat de verdade
  dentro do app, é uma feature nova (tabela de mensagens + Realtime do
  Supabase), não uma migração do que já existia.
