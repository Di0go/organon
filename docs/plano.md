# Organon: o plano

O núcleo partilhado das apps da saga: Aristotle (o tutor), Galen (o médico e treinador) e as que vêm, a primeira das
quais é o Argus (um espião de rede legível em cima do `tshark`). Para quê, nas palavras do Diogo: «a nuclei or engine
or basis […] so we can build faster things with a stronger basis, fix things centralized for every app and keep
consistency around UI/UX and functionality».

Escrito a 2026-10-25. O inventário em que assenta está em [inventario.md](inventario.md) (gerado, ficheiro a
ficheiro). A prova de que a forma funciona está neste repositório (`packages/core`, `examples/minimal`) e em
«A prova», mais abaixo.

## Resumo

- **O que se mediu.** Os dois repositórios partilham 119 ficheiros: 19 iguais byte a byte, 33 que só diferem nos
  nomes, 9 que derivaram sem razão, 37 mistos (mecanismo comum com domínio dentro) e 16 que são de facto do domínio.
  A deriva sem razão é pequena (322 linhas, feitas na cópia). O custo está nos mistos: 4686 linhas de mecanismo
  entrelaçado com domínio, que não se copiam de um lado para o outro, e por isso cada correcção ao mecanismo se refaz
  à mão. Desde a cópia: uma correcção feita duas vezes, sete feitas só de um lado (duas delas já na própria cópia), e
  um defeito presente nas duas.
- **A fronteira.** Entra no núcleo o que existe, ou vai existir, em duas apps com o mesmo significado e não nomeia
  nada do domínio. O que mistura as duas coisas entra como mecanismo, e o domínio liga-se por um ponto de extensão.
- **A forma.** Um repositório próprio que publica um pacote, `@organon/core`, em versões imutáveis. Cada app fixa uma
  versão exacta e muda-a quando quer. Antes de uma versão sair, o `canary` corre as *gates* de cada app contra ela,
  numa cópia descartável. Rejeitados: o monorepo, a cópia sincronizada e o `link:` para uma checkout.
- **A prova.** Extraídos o `settings` e o `store` do servidor, e os tokens, o tema e o selector de aspecto da UI. Uma
  app mínima instala-os de um *tarball*, constrói, arranca na dev e passa 8 testes, 4 deles num Chromium headless.
  O `settings` do núcleo dá exactamente o mesmo resultado que o original de cada app, sobre os `settings.json` reais.
  O `canary` apanha uma alteração do núcleo que os testes do próprio núcleo deixam passar.
- **A ordem.** Primeiro o Argus, nascido no núcleo: cada peça que ele precisa é extraída para o Organon em vez de
  copiada. Depois o Galen, depois o Aristotle, que é público e por isso precisa do canal de publicação no GitHub.

## A tarefa, em verbos, e quem ajudou

Separar o que é a mesma coisa do que só parece diferente. Provar que a deriva já custa. Traçar uma fronteira que uma
sessão nova aplique sozinha a uma linha nova. Escolher como o código passa de um repositório para os outros sem partir
nenhum. Mostrá-lo a correr. Ordenar a migração para que cada passo seja reversível e verificável, sem tocar em `data/`.

Três ofícios que um projecto destes não chamaria deram os métodos:

- **Crítica textual** (quem colaciona manuscritos): normalizar a ortografia antes de comparar e atribuir cada
  variante ao ramo que a introduziu, contra o arquétipo. É o método de [inventario.md](inventario.md).
- **Manutenção de uma distribuição** (Debian): testar as dependências inversas antes de um pacote passar a *testing*
  (autopkgtest), «upstream first», nunca reescrever uma versão publicada, e um *changelog* que diz o que cada
  utilizador tem de mudar. Deu o `canary`, o `pack:release` e o `CHANGELOG.md`.
- **Redacção legislativa**: termos definidos, um teste de decisão que se aplica sem o autor, e os casos de fronteira
  resolvidos por escrito antes de alguém tropeçar neles. Deu «A fronteira».

## A fronteira

### Termos

- **Núcleo**: o pacote `@organon/core`, neste repositório.
- **App**: um repositório que fixa uma versão do núcleo (Argus, Galen, Aristotle).
- **Domínio**: aquilo de que a app trata e as outras não. Aulas, conceitos e missões no Aristotle; dias, análises,
  suplementos e pessoas no Galen; capturas, fluxos e anfitriões no Argus.
- **Mecanismo**: código que funciona da mesma maneira seja qual for o domínio (escrever um ficheiro inteiro, pôr um
  agente num pseudo-terminal, desenhar um separador).
- **Ponto de extensão**: o sítio onde a app entrega domínio a um mecanismo do núcleo. É uma função, uma lista ou um
  ficheiro com nome e forma definidos pelo núcleo.

### O teste

Para cada ficheiro, função ou linha, pela ordem:

1. **Nomeia alguma coisa do domínio?** (um tipo, uma rota, um campo de `data/`, uma palavra do ofício) Se não
   nomeia, segue para 2. Se nomeia e o resto é mecanismo, o mecanismo vai para o núcleo e o domínio passa a ser
   entregue por um ponto de extensão. Se é todo domínio, fica na app.
2. **Existe em duas apps com o mesmo significado, ou o Argus precisa dele para nascer?** Se sim, vai para o núcleo.
   Se não, fica na app até ao segundo uso (a **regra do segundo uso**: o núcleo não adivinha).
3. **Diverge entre as apps sem razão de domínio?** Escolhe-se a melhor versão (a que tem as correcções do inventário),
   e é essa que vai. A outra versão não se discute duas vezes.

Uma correcção a código do núcleo faz-se no núcleo («upstream first»). Se for urgente numa app, faz-se na app e, no
mesmo dia, no núcleo, e a app volta ao núcleo na versão seguinte.

### O que entra no núcleo

Por área, com a origem (o lado do inventário que tem a melhor versão):

| Área | O que entra | Origem | Ponto de extensão |
|---|---|---|---|
| Ponte para o agente | `agents.ts`, `terminal.ts`, `tutor.ts`, `bridge.ts`, `oneshot.ts`, `llm.ts`, `web.ts`, o cliente MCP de `tutor-api.ts`, o *drawer* (`TerminalDrawer`, `TerminalView`, `TutorConversation`, `tutor.svelte.ts`) | renomeação: qualquer lado | as instruções do agente na API e os tempos de espera (o `quiz` do Aristotle espera minutos) |
| Chat | `chat.ts` com as ferramentas da app opcionais e o parágrafo depois de uma ferramenta, `ChatPanel`, `Page` | Galen | o *prompt* de sistema, o contexto da página, as menções `@`, se o chat escreve e que ferramentas tira |
| Servidor MCP | `createMcpServer`, `method`, os *prompts* a partir das skills, `alwaysLoad` das ferramentas centrais | renomeação | `tools(store) => ToolDef[]`, a lista das centrais, o nome da secção de regras do `AGENTS.md` |
| Definições | `settings.ts`, `shared/agents.ts`, a página Settings na parte de «quem corre o agente» | **extraído** (0.1.x) | `extra` / `setExtra`; secções de Settings da app (a porta do relógio do Galen) |
| Armazenamento e backups | `store.ts`, `warnings.ts`, `slug.ts`, `backup.ts` | **extraído** `store`/`warnings`; `backup` renomeação | `describeChanges(files)` para a mensagem do commit de `data/` |
| Servidor | `index.ts` sem rotas (HTTP, estáticos, CSP, Host e Origin exactos, `peer.ts`, SSE, WebSocket), `/api/state` com o build e o reload da página | Galen (`206713f`) | as rotas, o estado do *feed* e os seus eventos |
| Configuração | `config.ts` como `defineApp({ name, prefix, ports, loopback, defaultAccent })` | renomeação | os caminhos de `data/` |
| `.test`, systemd, release | `install-service.sh`, `tls.sh`, `setup-hostname.sh`, `release.ts`, `control.ts`, `dev.ts`, `gates.ts`, `docs.ts`, `doc-zones.ts`, `claude-stop-hook.ts`, `.githooks`, CI | renomeação (sem a limpeza do gym.test, que é história do Aristotle) | um `app.json` com nome, portos, loopback e o que a release precisa a mais (o Argus vai precisar de captura de rede) |
| Configuração dos agentes | `.mcp.json`, `.codex`, `.gemini`, `opencode.json`, `.claude/settings.json` base, `.claude/rules/development.md` | renomeação | gerados a partir do `app.json`; permissões e hooks da app por cima |
| Instruções comuns | a secção «Working on the app» do `AGENTS.md`, as regras de `docs/development.md`, o método do `researcher` | renomeação / misto | a app escreve a sua secção de domínio; o núcleo compõe o `AGENTS.md` e um teste avisa quando sai de sincronia |
| Design tokens | `tokens.css`, os acentos | **extraído** (Galen) | `defaultAccent`; tokens da app depois dos do núcleo |
| Componentes e layout | `base.css`, `shell.css` sem `.rail`, `prose.css` sem o kit, `Ribbon` (moldura), `TabBar`, `StatusLine` (moldura), `router`, `Search`, `ContextMenu`, `HoverCard`, `Markdown` com `tables.ts`, `maths`, `Lightbox`, `drafts`, `focus`, `visible`, `Grip`, os gráficos genéricos (`scale` com `niceRange`, `LineChart`, `Columns`, `StackedColumns`, `TableView`, `StepChart`), `format` com `asDate`, `shared/dates.ts`. **Extraídos:** `theme`, `LookPicker`, `theme-boot.js` | o lado de cada correcção no inventário | páginas (rota, componente, título e ícone do separador, lugar na faixa), itens da linha de estado, fontes da pesquisa, acções do menu, tipos de cartão, o logótipo |
| Testes | o arranque de um servidor real em pastas descartáveis, o teste no browser | Aristotle (`browser.test.ts`) | os testes de domínio |

### O que fica em cada app

O armazém do domínio (`gym.ts` e os seus; `clinic.ts` e os seus), as definições das ferramentas MCP, as skills, a
parte de domínio dos subagentes, as páginas e o painel inicial, os dados de demonstração e o `seed.ts`, os tipos de
`shared/types.ts`, `docs/data.md`, `docs/plan.md`, o README, o logótipo, o kit visual e os explorables do Aristotle, a
porta do relógio e as amostras do Galen, e o hook de check-in.

### Casos de fronteira, já resolvidos

- **O `researcher`.** O método (duas fontes, uma primária, dizer o que não se confirmou) é do núcleo, como texto base
  do subagente. As fontes preferidas são da app.
- **O chat que escreve no registo** (Galen `f1d2435`). É mecanismo: o núcleo dá ao chat as ferramentas da app quando a
  app o pede, e a app diz quais tira (o Galen tira `remove_lab` e `remove_entity`). O Aristotle continua sem.
- **`server/library.ts`** (as notas em Markdown de `data/`, vigiadas). Só o Galen tem. Fica lá até ao segundo uso.
- **O logótipo e o ícone.** São da app. O núcleo só pede a função que desenha o ícone (`favicon` em `createTheme`).
- **`storage.ts`** (a mudança das chaves do Mind Gym). É legado do Aristotle, não entra; o núcleo aceita
  `legacyKeys` no tema, e o Aristotle passa lá as chaves antigas enquanto houver browsers com elas.
- **`FeedState`.** O transporte (SSE, reconexão, build) é do núcleo. Os registos que o *feed* leva são tipos da app.
- **Os nomes em disco.** O `settings.json` continua a dizer `tutor` e `helpers`, mesmo no Galen, onde quem corre não é
  um tutor. Mudar o nome seria uma migração de dados sem ganho.
- **Um defeito encontrado ao extrair** (o `settings.json` ilegível reescrito por cima). Corrige-se no núcleo, com
  teste. As apps recebem-no ao mudar o pino, e não há outra correcção nelas.
- **A mesma classe de defeito no `store`** (achada na revisão). Um ficheiro de `data/` que existe mas não se lê
  (permissões, erro de disco) era carregado como o valor por omissão, e a escrita seguinte substituía-o. Isto vale para
  o `store.ts` das duas apps, que era igual byte a byte. Corrigido na 0.3.0: o `store` lembra-se dele, avisa, e o
  `writeJson` do `store` recusa escrevê-lo. As escritas para `data/` passam a ir pelo `store`, não pelas funções
  soltas; o *shim* de cada app exporta as do `store`. A regra fica geral: **o núcleo nunca escreve por cima do que não
  conseguiu ler.**

### Decisões que são do Diogo

- **O núcleo é público como o Aristotle?** Recomendação: **sim, MIT**. O Aristotle e o Galen são públicos e vão
  depender dele; um núcleo privado parte o `git clone` e o `pnpm install` de quem os instala.
- **O nome do pacote.** `@organon/core` é provisório. Se o núcleo for para o npm, o *scope* tem de estar livre; pelo
  GitHub (recomendado, abaixo) o nome é indiferente.

## A forma

### Restrições medidas, não supostas

1. **O Node recusa TypeScript dentro de `node_modules`.** As apps correm `node server/index.ts` sem build. Um pacote
   com `.ts` instalado dá `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`; por symlink para fora de `node_modules`
   funciona. O servidor do núcleo tem de ir compilado (JS e `.d.ts`); a UI pode ir em fonte, porque quem a lê é o Vite.
2. **A cópia de release é uma `git worktree` noutro sítio** (`~/.local/share/<app>/app`) que corre
   `pnpm install --frozen-lockfile`. Uma dependência por caminho relativo (`file:../Organon`) parte-se lá.
3. **O Aristotle e o Galen são públicos no GitHub.** Uma dependência num caminho absoluto da máquina do Diogo parte o
   `git clone` de qualquer outra pessoa.
4. **A pré-optimização do Vite compila os `.svelte.ts` de um pacote sem tirar os tipos.** O build passa e a dev não
   arranca. Encontrado na prova (0.1.0), corrigido no plugin `organon()` (0.1.1) e guardado por um teste.

### Quatro formas comparadas

| | A. Monorepo com as apps dentro | **B. Repositório próprio, pacote com versão fixada por app** | C. Cópia sincronizada por guião (subtree) | D. `link:` para uma checkout do Organon |
|---|---|---|---|---|
| Corrigir uma vez | sim | sim | só se o guião correr em todas | sim |
| Cada app escolhe quando actualiza | **não**: todas na mesma versão | **sim**: muda o pino | sim | **não**: a release segue a árvore de trabalho |
| Uma correcção não parte uma app | só com os testes de todas a cada commit | o `canary` corre antes de sair | não | não |
| Testar contra as apps antes | sim, é o mesmo repositório | `canary` | à mão | não |
| Clones públicos | o Galen (a saúde) e o Aristotle passam a viver juntos | sim, com o canal no GitHub | sim | não |
| Cópia de release | precisa de mudar `release.ts` | sim (caminho absoluto ou URL, com integridade no lockfile) | sim | não |
| TS do servidor sem build | sim | não: o núcleo compila o servidor | sim | sim |
| Custo de entrada | mover três repositórios e as suas histórias | um build e um *tarball* por versão | pequeno, e a deriva volta | nenhum |

**Escolhida a B.** É a única em que as três coisas que o Diogo pediu valem ao mesmo tempo: corrigir no centro, cada
app no seu ritmo, e nenhuma parte sem aviso. O preço é um build do servidor no núcleo, e esse preço já está pago na
prova. A **A** junta num só repositório o registo de saúde (público, mas pessoal) com o tutor e o espião de rede, e
obriga todas as apps a andarem juntas. A **C** é o que existe hoje, com um guião por cima: a deriva do inventário
nasceu exactamente assim. A **D** serve para desenvolver o núcleo, e para mais nada: uma alteração a meio no Organon
partia a app em produção.

### Como se empacota

- **Um pacote**, `@organon/core`, com *subpath exports* (`/server/settings`, `/ui/tokens.css`, `/vite`…). Uma só
  versão para as apps fixarem, sem matriz de compatibilidades entre pacotes. Se um dia pesar, parte-se, mas não antes.
- O servidor e o código partilhado vão compilados (`tsc` com `rewriteRelativeImportExtensions`, em `dist/`). A UI vai
  em fonte (`.svelte`, `.svelte.ts`, `.css`), servida pelo plugin `organon()`.
- **Versões**: semver. Em 0.x, uma *minor* pode partir, uma *patch* só corrige. O `CHANGELOG.md` diz, em cada versão,
  o que a app tem de mudar («nada», quase sempre).
- **Imutáveis**: `pnpm pack:release` recusa reescrever uma versão que já existe. O lockfile de cada app guarda o *hash*
  do *tarball*, por isso um *tarball* reescrito falharia a instalação em vez de mudar a app em silêncio.
- **Fixada por app**: versão exacta, sem `^`.
- **Canal**: enquanto não houver repositório no GitHub, os *tarballs* vivem em `~/Projects/Organon/releases/` e a app
  aponta para eles por caminho absoluto (`file:~/Projects/Organon/releases/organon-core-0.3.0.tgz`). Isto
  funciona na checkout e na cópia de release, mas não num clone público. Com o GitHub, cada versão vira um *release*
  com o *tarball* anexado, e as apps apontam para o URL dele. **Uma app pública só migra depois disso.**

### Como uma correcção chega às apps

1. Faz-se no núcleo, com o teste que a reproduz a falhar primeiro.
2. `pnpm gates` no Organon: lint, tipos, os testes do núcleo, e o `canary` de cada app que já está no núcleo.
3. Versão nova (*patch* ou *minor*), entrada no `CHANGELOG.md`, `pnpm pack:release`.
4. Em cada app, quando ela quiser: muda o pino, `pnpm install`, `pnpm gates`, `pnpm release`. Se correr mal,
  `pnpm release --rollback` volta ao pino anterior, que continua em `releases/`.

### Como se testa o núcleo contra as apps

`pnpm canary <pasta da app>… [--run "<comando>"]` empacota o núcleo **da árvore de trabalho** num sítio descartável,
clona a app (só o que está commitado, portanto nunca `data/`), troca-lhe o `@organon/core` por esse *tarball* e corre
lá o comando dela (por omissão `pnpm test`; para as apps, `pnpm gates`). Não toca na checkout da app, nas branches, em
`data/` nem nas instâncias a correr. Uma app que ainda não usa o núcleo é saltada e dita.

As *gates* do Organon correm o `canary` contra a app de exemplo. Quando o Argus existir, junta-se à lista em
`package.json` (`gates`), e o mesmo para cada app que migrar.

Regras do `canary`, porque um `canary` que passa sem testar é pior do que nenhum:

- Uma app que não tem `@organon/core` **falha**, não é saltada. Para testar uma branch de migração: `--ref <branch>`.
- Os testes de browser da app **têm de correr**: o `canary` põe `ORGANON_REQUIRE_CHROMIUM=1`, e um teste que saltaria
  por falta de Chromium falha.
- Nenhuma variável `ARISTOTLE_*`, `GALEN_*`, `ARGUS_*` da shell chega aos testes da cópia.
- **As *gates* de hoje das apps não arrancam a dev.** Foi a dev que a 0.1.0 partia, com o build verde. Por isso o
  passo 0 dá a cada app um teste de dev vindo do núcleo, como o `examples/minimal/tests/dev.test.ts`: arranca o Vite
  da app e abre uma página no Chromium. Até uma app o ter, o `canary` dela não prova que a dev arranca.
- O `canary` instala com `--no-frozen-lockfile` (o *tarball* é outro, e o lockfile tem de mudar). A instalação
  congelada, a que a release faz, só se ensaia na app, quando ela muda o pino e corre `pnpm release`.

## A prova

Num repositório novo, com uma fatia real extraída, consumida como as apps a vão consumir.

**Extraído** (`packages/core`):

- `server/settings.ts`: Aristotle e Galen numa só versão, criada com o ficheiro, os avisos e a chave da app; as
  chaves próprias de uma app passam por `extra` / `setExtra`; o acento lê-se aqui. Corrigido: um `settings.json` que
  não se lê fica de lado, não é reescrito.
- `server/store.ts` (era igual byte a byte nos dois), ligado à pasta de dados e aos avisos da app por `createStore`.
- `server/warnings.ts`, `shared/agents.ts`, `shared/accents.ts`.
- `ui/tokens.css` (do Galen), `ui/theme.svelte.ts`, `ui/LookPicker.svelte` (o pop-up Appearance, que as duas tinham no
  `Ribbon`), `ui/theme-boot.js` e o plugin `organon()` que o serve.

**Consumido** por `examples/minimal`, que não faz parte do workspace e instala o núcleo de
`releases/organon-core-0.3.0.tgz`. Com isso, o servidor lê o JS compilado de dentro de `node_modules/.pnpm`.

**Verificado**, com o que se corre:

| O quê | Comando | Resultado |
|---|---|---|
| O defeito, antes, no código original | `node scripts/proofs/settings-overwrite.ts Galen` (num ficheiro temporário com uma vírgula a mais) | o ficheiro reescrito como `{"tutor":"codex"}`: `LOST: written over` |
| A restrição do Node | `bash scripts/proofs/node-modules-ts.sh` | `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`; pelo symlink de fora, funciona |
| Os testes do núcleo | `pnpm test` (raiz) | 17 passam, 0 falham (settings 9, store 5, ui 3) |
| O `store` não escreve por cima do que não leu (0.3.0) | o teste de ponta a ponta da app de exemplo: `notes.json` em modo 000, depois `POST /api/notes` | com a 0.2.0, `200` e o ficheiro substituído; com a 0.3.0, `500`, o aviso em `/api/state` e o ficheiro intacto |
| Os testes mordem | tirar `green` do `theme-boot.js` | o teste da UI falha; reposto, passa |
| A app de exemplo | `pnpm gates` em `examples/minimal` | svelte-check sem erros; 9 testes passam, 4 no Chromium headless |
| A dev arranca | `pnpm dev` em `examples/minimal`, depois o Chromium headless em `localhost:5193` | `/api/health` dá `{"ok":true,"instance":"dev"}`; o acento muda para azul (`#6ea8ff`); o *motto* grava-se em `.dev/state/settings.json`; 0 erros na consola |
| O defeito da dev, apanhado | `tests/dev.test.ts` com a 0.1.0 e com a 0.1.1 | falha com a 0.1.0, passa com a 0.1.1 |
| O mesmo resultado que o original, com dados reais | `node scripts/proofs/settings-differential.ts Aristotle` e `… Galen`: o `settings.ts` original e o do núcleo, cada um numa cópia em `600` do `settings.json` real, com a mesma sequência de três mudanças | `view()` antes e depois, o ficheiro final e o *endpoint* com o mesmo *hash* nas duas apps; as chaves da app (`accent`, `health.token`) preservadas; modo `600` |
| O `canary` passa | `pnpm canary examples/minimal` | `minimal: PASS` |
| O `canary` apanha uma quebra | o `view()` sem `agents` (os testes do núcleo continuam a passar) |
| O `canary` não passa no vazio | uma app sem `@organon/core` | `FAIL, not on the core`; 0 de 1 |
| A red team | um subagente sem a solução, com os métodos de intrusão e auditoria | 10 achados; o que se fez com cada um está em «O que a red team mudou» | `minimal: FAIL`, no teste do browser que escolhe o agente |
| Tudo junto | `pnpm gates` (raiz) | lint, tipos, testes do núcleo, e o `canary` com as *gates* do exemplo: verde |
| Nada tocado nas apps | `git status` nas duas, os HEAD, o `mtime` dos `settings.json` | limpo; `391d61c` e `bc5e23c`; os mesmos de antes |

**O que a red team mudou** (0.2.0 e este documento): o `canary` falha quando salta uma app, aceita `--ref`, exige o
Chromium e não passa as variáveis da app; o `settings` recusa escrever por cima de um ficheiro que não consegue ler,
põe as escritas em fila (três mudanças ao mesmo tempo perdiam uma) e faz o `chmod` antes do rename; o `theme-boot.js`
lê as chaves antigas; o `pack:release` só sai de uma árvore limpa e depois das *gates*; os guiões das provas estão
em `scripts/proofs/`; o critério de `data/` passou a ser medível com os backups automáticos a correr; o resumo deixou
de dizer que a cópia criou deriva, quando o que criou foram mistos. Ao refazer o teste diferencial depois da fila,
apanhou-se uma regressão (a ordem das chaves no ficheiro), já corrigida.

**Não testado:** a cópia de release e o systemd de uma app sobre o núcleo (nenhuma app real está nele ainda: é o
critério do passo 1); um clone público a instalar o núcleo (precisa do GitHub); o Firefox (só o Chromium).

## A migração, por ordem

Regras que valem em todos os passos:

- **`data/` não se toca.** Os formatos não mudam com o núcleo. O `data/` real continua a receber os commits de backup
  automáticos durante a migração, por isso o critério não é «o mesmo *hash*»; é «a migração não escreveu em `data/`»:
  todo o trabalho corre na dev (`.dev/data`, cópia por `pnpm dev:snapshot`), e no fim `git -C data log --since=<início>`
  só mostra commits de backup (`Data: …`) e `git -C data status --porcelain` está vazio. O `settings.json` vive na
  pasta de estado, não em `data/`, e o teste diferencial acima mostra que o núcleo o lê e escreve como as apps.
- **Uma app de cada vez, numa branch, na instância de dev.** A release só com a palavra do Diogo.
- **Cada módulo trocado prova-se com um teste diferencial**, como o do `settings`: o original e o do núcleo, sobre uma
  cópia dos dados reais, têm de dar o mesmo resultado.
- **Antes de cada passo**, `python3 docs/inventario.py` mede outra vez a deriva, e `--check` diz se apareceu um ficheiro
  comum que ainda não tem classe.

### Passo 0: o núcleo de que o Argus precisa para nascer

O que entra é o que está em «O que entra no núcleo», pela ordem do custo (as correcções do inventário primeiro,
porque são as que já custaram):

1. O servidor sem rotas, com o reload num release novo (correcção 2), e `config.ts` como `defineApp`.
2. A ponte para o agente e o servidor MCP (o harness, sem as ferramentas).
3. O chat, com as ferramentas opcionais e o parágrafo (correcção 6).
4. A moldura da UI (`base.css`, `shell.css`, `Ribbon`, `TabBar`, `StatusLine`, `router`, `Search`, `HoverCard`,
   `ContextMenu`) com os pontos de extensão das páginas, mais `Markdown` com `tables.ts` (3), `format` com `asDate` (4)
   e os gráficos genéricos.
5. `.test`, systemd e release a partir de um `app.json`; os ficheiros de configuração dos agentes gerados a partir dele.
   Mais o teste de dev (o Vite da app arranca e uma página desenha-se no Chromium) e o arranque de servidor de teste,
   que cada app passa a correr nas suas *gates*.
6. O `AGENTS.md` comum, composto, com o teste de sincronia.

**Feito quando:** cada peça tem testes no núcleo; a app de exemplo usa-as todas (uma página, uma ferramenta MCP, o
*drawer*, o chat) e passa as suas *gates*, incluindo a dev; `pnpm gates` do Organon está verde; a versão está em
`releases/` com a sua entrada no `CHANGELOG.md`. Este passo faz-se dentro do passo 1, puxado pelo que o Argus pede: uma
peça entra quando ele precisa dela, nunca por cópia para o Argus.

### Passo 1: o Argus, nascido no núcleo

O Argus é o primeiro consumidor real e o único sem passado: não há `data/` para proteger, nem utilizadores, nem
README público. É o sítio certo para descobrir o que falta ao núcleo. Proposta de endereço: `argus.test` em
`127.0.0.84` (o `.80` ao `.83` já estão ocupados), portos 4930 (live), 4940 (dev), 4931 (TLS) e 5203 (Vite), todos
livres hoje.

**Feito quando:** o Argus tem `@organon/core` fixado numa versão exacta; nenhum ficheiro do Argus é cópia de
infraestrutura do Galen ou do Aristotle, medido assim: `docs/inventario.py` ganha um modo `--against <repo>` que, para
cada ficheiro do Argus com o mesmo caminho num dos dois, conta as linhas diferentes depois de normalizar (o `NORM`
alargado a `Argus`/`ARGUS`), e nenhum pode ficar abaixo de 20% de diferença sem estar na lista de excepções do Argus; corre na dev, em `https://argus.test` pela cópia de release e pelo systemd, com `pnpm release --rollback`
experimentado; o `canary` do Organon corre as *gates* dele e está verde.

**Primeiro pedido, esboçado** (para uma sessão aberta em `~/Projects/Argus`, que ainda não existe):

> O Argus é um espião de rede legível em cima do `tshark`, da saga do Aristotle e do Galen, e nasce no núcleo deles,
> o Organon (`~/Projects/Organon`, lê o `AGENTS.md` e o `docs/plano.md`, passos 0 e 1). Cria `~/Projects/Argus` com
> `git init`, sobre o `@organon/core` fixado numa versão exacta de `~/Projects/Organon/releases/`, com
> `examples/minimal` como modelo. Regra: o que o Argus precisa e é mecanismo (servidor, *drawer*, MCP, chat, `.test`,
> release) é extraído para o Organon, com testes, numa versão nova, e nunca copiado para o Argus. O que é do Argus
> (capturas, fluxos, anfitriões, as ferramentas MCP, as páginas) fica lá. A primeira entrega é uma página que mostra
> os anfitriões vistos numa captura de 30 segundos, e uma ferramenta MCP `get_hosts` que o agente chama. Precisa de
> capturar sem root: vê como o `dumpcap` lhe dá `cap_net_raw` e escreve-o no guião de instalação, para o Diogo correr
> com `pkexec`. Endereço: `argus.test` em `127.0.0.84`, portos 4930/4940/4931/5203. Não mexas no Aristotle nem no
> Galen. Feito quando: o critério do passo 1 do plano, corrido e medido.

### Passo 2: o Galen

O Galen é a melhor versão de quase tudo o que derivou (tokens, datas, reload, chat). Migrar é sobretudo trocar a
sua infraestrutura pelo núcleo, que nasceu dele, e ganhar o que só o Aristotle tinha (os `|` nas tabelas, o teste no
browser). É público, por isso o seu `README` só pode apontar para o núcleo depois de o canal no GitHub existir. Até
lá, pode migrar numa branch e correr na dev, e não ir para a `main`.

**Feito quando:** cada ficheiro do Galen classificado «renomeação», «deriva» ou «misto» no inventário passou a ser um
*shim* de poucas linhas (para o `store`: `export const { loadJson, loadJsonDir, writeJson, writeFileAtomic,
AppendLog } = createStore({ dataDir: DATA_DIR, warnings })` mais `export { readLog, endLastLine, isObject, WriteQueue }
from '@organon/core/server/store'`, para que os 11 módulos que o importam não mudem e as escritas passem pelo `store`,
que recusa um ficheiro que não conseguiu ler; o `AppendLog` ligado mantém o construtor `(warning, written)`) ou a parte de domínio
de um ponto de extensão; os testes diferenciais de cada módulo trocado, no modelo de
`scripts/proofs/settings-differential.ts`, estão verdes sobre a cópia em `.dev/data`; `pnpm gates` passa; a release
foi feita com a palavra do Diogo, e o rollback experimentado; a migração não escreveu em `data/` (regra acima); o
`canary` do Organon corre as *gates* da branch do Galen (`--ref organon`) e, depois do merge, as da `main`.

**Primeiro pedido, esboçado** (para `~/Projects/Galen`):

> Migra o Galen para o Organon (`~/Projects/Organon`: `AGENTS.md`, `docs/plano.md` passo 2, e `docs/inventario.md`,
> que diz, ficheiro a ficheiro, o que é do núcleo). Numa branch `organon`, na dev. Troca, um módulo de cada vez, cada
> ficheiro «renomeação», «deriva» ou «misto» pelo do `@organon/core` fixado; um *shim* de uma linha onde a app só tem
> de ligar o núcleo às suas pastas. Para cada módulo, um teste diferencial: o original (de `main`) e o do núcleo, sobre
> a cópia de `data/` em `.dev/data` (`pnpm dev:snapshot`), dão o mesmo resultado; o modelo é
> `~/Projects/Organon/scripts/proofs/settings-differential.ts`. O que faltar ao núcleo faz-se no Organon, numa versão nova,
> com o `canary` verde, e não no Galen. `data/` não se toca: no fim, `git -C data log` desde o início só tem commits
> de backup. A release só com a palavra
> do Diogo. Feito quando: o critério do passo 2 do plano, corrido e medido.

### Passo 3: o Aristotle

O último porque é o mais antigo e o mais usado, o público com mais gente a ver, e o que mais muda à vista: os gráficos
deixam de seguir o acento (séries fixas e seguras para daltonismo), ganha o verde e as correcções do Galen. O seu
`storage.ts` passa a `legacyKeys` no tema, e o `setup-hostname.sh` com a limpeza do gym.test fica como guião próprio,
porque é história e não infraestrutura.

**Feito quando:** o mesmo critério do passo 2, sobre o Aristotle; mais o teste no browser que ele já tinha, agora no
núcleo, a correr nas *gates*; mais o `git clone` público do README a funcionar num directório limpo, com o núcleo
vindo do canal no GitHub.

**Primeiro pedido, esboçado** (para `~/Projects/Aristotle`):

> Migra o Aristotle para o Organon, como o Galen foi migrado (`~/Projects/Organon/docs/plano.md`, passo 3, e o que o
> passo 2 deixou escrito). Branch `organon`, dev. As mudanças à vista vão no README e no `CHANGELOG` do Aristotle
> antes da release: os gráficos com séries fixas, o acento verde, a página que se recarrega num release novo, os dias
> certos a oeste de Greenwich. O `storage.ts` sai (as chaves antigas passam a `legacyKeys` e a `data-legacy` no
> `theme-boot.js`). `data/` não se toca: no fim, `git -C data log` desde o início só tem commits de backup. A release só com a palavra do Diogo, e só depois de o núcleo estar publicado no GitHub
> (o README público tem de instalar num clone limpo). Feito quando: o critério do passo 3 do plano, corrido e medido.

## O que se rejeitou, para ninguém voltar a tentar

- **Publicar o servidor em TypeScript fonte.** O Node não o corre de `node_modules`. Um *loader* que tirasse os tipos
  em `node_modules` resolvia, mas punha magia no arranque de todas as apps e da release por causa de um build de
  segundos.
- **A UI compilada.** Não é preciso: o Vite lê a fonte, e o plugin `organon()` tira-a da pré-optimização.
- **Vários pacotes** (`@organon/server`, `@organon/ui`, `@organon/tokens`). Três versões a combinar por app, sem
  ganho enquanto forem as mesmas pessoas a mudá-los ao mesmo tempo.
- **Mudar os nomes em disco do `settings.json`.** Migração de dados sem ganho.
- **`file:../Organon`.** Parte-se na cópia de release, que vive noutro sítio.
- **Testar a dev só com o build.** A 0.1.0 construía e não arrancava. O `tests/dev.test.ts` fica para sempre.

## Riscos conhecidos

- **Dependências CommonJS na UI do núcleo.** O plugin `organon()` tira o núcleo da pré-optimização do Vite. Quando a
  UI do núcleo trouxer `marked`, `DOMPurify` ou `KaTeX`, o Vite pode precisar delas pré-optimizadas e a dev partir
  com o build verde, que é a mesma classe de defeito da 0.1.0. Ao extrair o `Markdown`: `optimizeDeps.include` dessas
  dependências no plugin, e o teste de dev da app de exemplo a usar o componente.
- **`releases/` é a fonte dos *rollbacks*.** Os *tarballs* estão commitados no Organon; apagar um parte o rollback de
  uma app fixada nele. Com o GitHub, os *releases* de lá passam a ser a cópia de referência.
