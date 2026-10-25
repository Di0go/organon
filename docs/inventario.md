# Inventário: Aristotle e Galen, ficheiro a ficheiro

Gerado por `docs/inventario.py` sobre os ficheiros versionados de `~/Projects/Aristotle` (`391d61c`) e `~/Projects/Galen` (`bc5e23c`), só por leitura. A classe e a nota de cada ficheiro comum estão em `docs/inventario-classes.tsv` (o juízo); os números são medidos. Para medir outra vez a deriva: `python3 docs/inventario.py`.

## Método

A cópia foi feita com renomeações: Aristotle→Galen, «the learner»→«he», `ARISTOTLE_`→`GALEN_`, portos 4747→4840. Comparados tal como estão, quase todos os ficheiros parecem diferentes. Por isso, antes de comparar, cada ficheiro é **normalizado**: os nomes das apps, os portos, o loopback e o sujeito passam a marcadores (`NORM` em `docs/inventario.py`). O que sobra é diferença real.

Depois, cada diferença é atribuída a quem a fez, contra o **arquétipo**: o Aristotle em `d395a44` (o último commit antes da cópia, 2026-10-14) e o Galen em `6a235e1` (a cópia, 2026-10-18 17:19). As três colunas de «Atribuição» contam as linhas diferentes, já normalizadas, feitas **na cópia**, no **Aristotle depois** e no **Galen depois**.

Classes: **igual** (byte a byte) · **renomeação** (igual depois de normalizar, ou só comentários: vai para o núcleo, parametrizado) · **deriva** (divergiu sem razão de domínio: escolhe-se a melhor versão e vai para o núcleo) · **misto** (mecanismo comum com domínio dentro: vai para o núcleo com um ponto de extensão) · **domínio** (diverge porque o domínio é outro: fica na app) · **só num**.

## Números

| | ficheiros |
|---|---|
| Versionados no Aristotle | 229 |
| Versionados no Galen | 199 |
| Nos dois | 119 |
| … iguais byte a byte | 19 |
| … renomeação | 33 |
| … deriva | 9 |
| … misto | 37 |
| … domínio | 16 |
| … imagens e lockfile (não classificados) | 5 |
| Só no Aristotle | 110 (38 imagens) |
| Só no Galen | 80 (10 imagens) |

Linhas diferentes nos ficheiros comuns, depois de normalizar: 9250 feitas na cópia, 363 no Aristotle depois e 3599 no Galen depois. Por classe, as feitas na cópia são:

| Classe | na cópia | Aristotle depois | Galen depois |
|---|---|---|---|
| domínio | 4242 | 190 | 2283 |
| misto | 4686 | 169 | 1278 |
| deriva | 150 | 4 | 31 |
| renomeação | 172 | 0 | 7 |

A deriva sem razão é pequena: 322 linhas na cópia, entre deriva e renomeação. O grosso é domínio, que tem de divergir, e **misto** (4686 na cópia, 1278 no Galen depois): mecanismo comum com domínio entrelaçado. É aí que está o custo, porque um ficheiro misto não se pode copiar de um lado para o outro, e uma correcção ao mecanismo tem de ser refeita à mão em cada app (a lista abaixo). Extrair um misto quer dizer separar o mecanismo e dar-lhe um ponto de extensão.

## O custo de hoje: correcções feitas duas vezes, ou feitas só num lado

Esta é a lista do que vai para o núcleo primeiro (docs/plano.md, «Ordem da extracção»).

| # | Correcção | Onde | Prova |
|---|---|---|---|
| 1 | **Feita duas vezes.** As páginas ocupam a largura que há (`--page-w: 1600px`): o mesmo diff em `base.css` e `shell.css`, em dois commits com 12 segundos de diferença | Aristotle `78e2148` (2026-10-18 22:19:14) · Galen `d8b00e8` (22:19:02) | `git show 78e2148 -- ui/src/styles` e `git show d8b00e8 -- ui/src/styles`: as mesmas linhas, incluindo o comentário |
| 2 | **Só no Galen.** A página carrega sozinha um release novo, sem F5 (`/api/state` diz o build; `feed.svelte.ts` recarrega quando não se está a escrever) | Galen `206713f` | `grep -n build Aristotle/ui/src/lib/feed.svelte.ts`: nada |
| 3 | **Só no Aristotle.** Os `\|` dentro de `código`, `$maths$`, `{{termo\|def}}` não partem a linha de uma tabela (`tables.ts`) | Aristotle `3516991` | `Galen/ui/src/lib/markdown.ts` faz `marked.parse(source)` sem `escapeTablePipes`; as notas do Galen têm tabelas |
| 4 | **Só no Galen.** As datas "YYYY-MM-DD" lidas como meio-dia local, não meia-noite UTC (o dia anterior a oeste de Greenwich) | Galen, na cópia (`format.ts` `asDate`) | O `formatDay` do Aristotle, que o `TabBar.svelte:79` chama com o dia do id de uma sessão, medido: `TZ=America/New_York` dá «Wed 21 Oct» para 2026-10-22; `Europe/Lisbon` dá «Thu 22 Oct». Latente para o Diogo, real para quem clona o repositório público a oeste |
| 5 | **Só no Galen.** Tokens: `--on-acc` próprio de cada acento em dark, e séries de gráfico fixas e validadas para daltonismo, em vez do acento | Galen, na cópia (`base.css`) | No Aristotle, `--series-1: var(--acc)`. Resolvido no núcleo: `tokens.css` |
| 6 | **Só no Galen.** Na resposta do chat, o texto depois de uma chamada de ferramenta começa um parágrafo novo | Galen `f1d2435` (`chat.ts`) | Hoje só o Galen dá ferramentas ao chat; vem com elas para o núcleo |
| 7 | **Só no Galen.** Cartões de hover que mantêm os parágrafos e cabem na largura | Galen `9cdd5cf` (`HoverCard.svelte`) | A parte genérica está misturada com o `EntityCard` |
| 8 | **Só no Aristotle.** Um teste no browser real (servidor, build, Chromium headless), feito depois da cópia | Aristotle `0188e94` (2026-10-24; `tests/browser.test.ts`, `playwright-core`) | O `package.json` do Galen não tem `playwright-core` |
| 9 | **Nas duas, por corrigir.** Um `settings.json` que não se lê (uma vírgula a mais) é reescrito por cima na mudança seguinte: perde-se o `agentCommand` posto à mão, ou o token do relógio | `settings.ts` das duas | Reproduzido no código original do Galen: `node scripts/proofs/settings-overwrite.ts Galen`. Corrigido no núcleo, 0.1.0 |
| 10 | **Mesma coisa em quatro sítios por app.** A lista de acentos em `theme.svelte.ts`, `theme-boot.js`, `config.ts` e `base.css`; as duas apps discordam (o verde só no Galen) | as duas | Resolvido no núcleo: `shared/accents.ts`, mais um teste que segura a cópia do `theme-boot.js` |
| 11 | **Lido duas vezes.** `config.ts` lê o `settings.json` à parte só para o acento, além do `settings.ts` | as duas | Resolvido no núcleo: `settings.accent` |


## Ficheiros nos dois

Linhas: diferentes em bruto / depois de normalizar. Atribuição: na cópia / Aristotle depois / Galen depois.

| Ficheiro | Classe | Linhas | Atribuição | Nota |
|---|---|---|---|---|
| `.claude/agents/researcher.md` | misto | 22 / 20 | 20 / 0 / 0 | Mesmo método de verificação; as fontes preferidas e o mapa são do domínio. |
| `.claude/rules/development.md` | renomeação | 10 / 8 | 6 / 0 / 2 | Só nomes, porto do Vite e a excepção da porta do relógio no Galen. |
| `.claude/settings.json` | misto | 25 / 19 | 10 / 0 / 9 | As mesmas permissões e o mesmo Stop hook (núcleo); o Galen junta Edit/Write em data/ e dois hooks UserPromptSubmit (app). |
| `.codex/config.toml` | renomeação | 4 / 0 | 0 / 0 / 0 | Só o nome do servidor MCP. |
| `.editorconfig` | igual | 0 | — | |
| `.gemini/settings.json` | renomeação | 2 / 0 | 0 / 0 / 0 | Só o nome do servidor MCP. |
| `.githooks/pre-commit` | igual | 0 | — | |
| `.githooks/pre-push` | igual | 0 | — | |
| `.github/dependabot.yml` | igual | 0 | — | |
| `.github/workflows/ci.yml` | misto | 2 / 2 | 2 / 0 / 0 | O mesmo CI; o Aristotle junta o librsvg para o preview_svg (um passo da app). |
| `.gitignore` | renomeação | 9 / 7 | 7 / 0 / 0 | Comentários; o Aristotle tem mais linhas de explicação. |
| `.mcp.json` | renomeação | 6 / 0 | 0 / 0 / 0 | Só nomes. |
| `.nvmrc` | igual | 0 | — | |
| `.prettierrc.json` | igual | 0 | — | |
| `AGENTS.md` | misto | 27 / 25 | 23 / 1 / 5 | Metade «Working on the app» igual; a outra é o domínio (teaching / keeping his record). O núcleo leva as regras comuns. |
| `CLAUDE.md` | domínio | 2 / 2 | 2 / 0 / 0 | Lista as skills de cada app. |
| `CONTRIBUTING.md` | renomeação | 8 / 6 | 6 / 0 / 0 | Só nomes. |
| `LICENSE` | igual | 0 | — | |
| `README.md` | domínio | 248 / 242 | 249 / 2 / 157 | Produto. |
| `biome.json` | igual | 0 | — | |
| `docs/README.md` | misto | 15 / 11 | 9 / 1 / 1 | Índice com as mesmas entradas genéricas. |
| `docs/architecture.md` | misto | 402 / 374 | 311 / 5 / 98 | Mecanismo comum descrito duas vezes; o domínio diverge. |
| `docs/data.md` | domínio | 105 / 105 | 82 / 4 / 53 | Os formatos de data/ são do domínio; a parte do backup é comum. |
| `docs/development.md` | misto | 96 / 60 | 53 / 2 / 13 | Fluxo dev/release/gates igual; os exemplos são do domínio. |
| `docs/extending.md` | misto | 78 / 70 | 70 / 0 / 0 | «Como acrescentar» igual na forma; os pontos de extensão diferem. |
| `docs/images/banner-dark.svg` | — | 27 | — | Imagem ou lockfile |
| `docs/images/banner-light.svg` | — | 33 | — | Imagem ou lockfile |
| `docs/images/hero-dark.webp` | — | 0 | — | Imagem ou lockfile |
| `docs/images/hero-light.webp` | — | 0 | — | Imagem ou lockfile |
| `docs/interface.md` | misto | 142 / 142 | 127 / 6 / 61 | Tokens, tema e layout comuns; páginas do domínio. |
| `docs/plan.md` | domínio | 182 / 182 | 148 / 14 / 24 | O plano de cada produto. |
| `opencode.json` | renomeação | 4 / 0 | 0 / 0 / 0 | Só nomes. |
| `package.json` | domínio | 8 / 6 | 4 / 1 / 1 | Dependências do domínio (dagre, ts-fsrs no Aristotle; lucide no Galen). O playwright-core e o teste no browser entraram no Aristotle depois da cópia (0188e94, 2026-10-24); o Galen nunca os teve. |
| `pnpm-lock.yaml` | — | 46 | — | Imagem ou lockfile |
| `scripts/claude-stop-hook.ts` | renomeação | 6 / 4 | 4 / 0 / 0 | Só comentários. |
| `scripts/dev.ts` | renomeação | 25 / 13 | 13 / 0 / 0 | Porto do Vite; o Galen não copia data/exports no snapshot. |
| `scripts/doc-zones.ts` | domínio | 4 / 4 | 4 / 0 / 0 | Que código obriga a que doc (lista do domínio). |
| `scripts/docs.ts` | misto | 34 / 24 | 24 / 0 / 0 | Gerador comum; o Aristotle junta o kit visual e os explorables. |
| `scripts/fixtures/demo.ts` | domínio | 651 / 651 | 370 / 0 / 357 | Os dados de demonstração. |
| `scripts/gates.ts` | igual | 0 | — | |
| `scripts/install-service.sh` | renomeação | 22 / 0 | 0 / 0 / 0 | Igual a menos de nomes. |
| `scripts/release.ts` | deriva | 20 / 4 | 4 / 0 / 0 | Só formatação (uma linha partida em três no Aristotle). |
| `scripts/seed.ts` | domínio | 73 / 61 | 53 / 0 / 12 | Semeia o domínio. |
| `scripts/setup-hostname.sh` | deriva | 85 / 23 | 0 / 0 / 23 | O Galen tirou a limpeza do antigo gym.test (história do Aristotle) e documenta o seu loopback. O resto igual. |
| `scripts/tls.sh` | deriva | 20 / 6 | 0 / 0 / 6 | O Aristotle guarda a CA antiga (gym.test) como retired-ca.crt; o Galen apaga-a. História, não domínio. |
| `server/agents.ts` | renomeação | 30 / 12 | 12 / 0 / 0 | Comentários (tempos de espera do quiz/ask). |
| `server/backup.ts` | misto | 27 / 25 | 25 / 0 / 0 | Igual a menos da mensagem do commit, que resume o domínio (tópicos vs dias). Ponto de extensão: describeChanges. |
| `server/bridge.ts` | renomeação | 30 / 8 | 8 / 0 / 0 | A mensagem de erro final nomeia collect_answers vs get_today. |
| `server/chat.ts` | misto | 85 / 73 | 34 / 0 / 47 | Mecanismo igual. O Galen junta as ferramentas MCP ao chat (appTools) e corrige o parágrafo depois de uma chamada de ferramenta; o Aristotle não tem nenhum dos dois. |
| `server/config.ts` | misto | 116 / 76 | 61 / 0 / 17 | Portos, pastas e env comuns, com prefixo; caminhos de data/ do domínio. Lê o settings.json uma segunda vez para o acento. |
| `server/control.ts` | renomeação | 16 / 0 | 0 / 0 / 0 | Igual a menos de nomes. |
| `server/index.ts` | misto | 339 / 317 | 267 / 10 / 48 | Servidor HTTP, estáticos, SSE, WebSocket comuns; rotas do domínio. Só o Galen recarrega a página num release novo (206713f). |
| `server/llm.ts` | renomeação | 8 / 4 | 4 / 0 / 0 | Comentários. |
| `server/mcp.ts` | misto | 1767 / 1763 | 1335 / 126 / 514 | createMcpServer, method e prompts comuns (~150 linhas); defineTools é o domínio. |
| `server/method.ts` | renomeação | 21 / 15 | 15 / 0 / 0 | Nome da secção de AGENTS.md e a lista de ajudantes. |
| `server/oneshot.ts` | renomeação | 13 / 13 | 10 / 0 / 5 | Comentários. |
| `server/peer.ts` | renomeação | 4 / 2 | 2 / 0 / 0 | Comentário. |
| `server/search.ts` | misto | 272 / 272 | 232 / 0 / 42 | Dobrar acentos e ordenar comuns; as fontes de pesquisa são do domínio. |
| `server/settings.ts` | misto | 48 / 44 | 10 / 0 / 34 | Igual + o token da porta do relógio (Galen). Extraído nesta prova. |
| `server/slug.ts` | renomeação | 2 / 2 | 2 / 0 / 0 | Comentário. |
| `server/store.ts` | igual | 0 | — | |
| `server/terminal.ts` | renomeação | 12 / 8 | 8 / 0 / 0 | Comentários. |
| `server/tutor-api.ts` | misto | 111 / 101 | 100 / 0 / 5 | O cliente MCP em processo é comum; as instruções e o tempo de espera do quiz são do domínio. |
| `server/tutor.ts` | renomeação | 20 / 12 | 12 / 0 / 0 | Gym vs Clinic (o tipo do armazém do domínio). |
| `server/warnings.ts` | renomeação | 2 / 2 | 2 / 0 / 0 | Comentário. Extraído nesta prova. |
| `server/web.ts` | renomeação | 10 / 6 | 6 / 0 / 0 | Comentário e user agent. |
| `shared/tutor.ts` | misto | 37 / 25 | 14 / 0 / 11 | Igual + HealthDoorView (Galen) dentro de um tipo comum. Extraído nesta prova (shared/agents). |
| `shared/types.ts` | domínio | 1238 / 1238 | 806 / 0 / 486 | Os tipos do domínio, com o FeedState genérico misturado. |
| `svelte.config.js` | igual | 0 | — | |
| `tests/backup.test.ts` | misto | 21 / 11 | 11 / 0 / 0 | O mesmo teste com nomes de ficheiro do domínio. |
| `tests/docs.test.ts` | igual | 0 | — | |
| `tests/mcp.test.ts` | domínio | 1780 / 1732 | 1347 / 103 / 314 | Ferramentas do domínio; o arranque do servidor de teste é comum. |
| `tests/tutor.test.ts` | misto | 271 / 247 | 247 / 0 / 0 | Quase todo igual na mecânica (247 linhas de diferença foram feitas na cópia). |
| `tests/unit.test.ts` | domínio | 368 / 366 | 182 / 36 / 156 | Unidades do domínio. |
| `tsconfig.json` | igual | 0 | — | |
| `tsconfig.server.json` | igual | 0 | — | |
| `ui/index.html` | domínio | 4 / 2 | 2 / 0 / 0 | O ícone (o logótipo de cada app). |
| `ui/public/theme-boot.js` | deriva | 8 / 8 | 8 / 0 / 0 | Lista de acentos e chave antiga mind-gym no Aristotle. Extraído nesta prova. |
| `ui/src/App.svelte` | misto | 79 / 75 | 60 / 0 / 25 | Moldura comum; as páginas registadas são do domínio. |
| `ui/src/lib/ChatPanel.svelte` | misto | 115 / 101 | 101 / 0 / 0 | Mecanismo igual; as menções (@) e o contexto da página são do domínio. Ponto de extensão: mentions. |
| `ui/src/lib/Composer.svelte` | renomeação | 2 / 2 | 2 / 0 / 0 | Comentário. |
| `ui/src/lib/ContextMenu.svelte` | misto | 51 / 47 | 47 / 0 / 0 | Copiar e pesquisar comuns; glosar e perguntar são do Aristotle. |
| `ui/src/lib/Home.svelte` | domínio | 1025 / 1025 | 774 / 0 / 723 | O painel de cada produto. |
| `ui/src/lib/HoverCard.svelte` | misto | 345 / 345 | 300 / 0 / 85 | Mecanismo igual; os tipos de cartão são do domínio. O Galen corrigiu os parágrafos e a largura dos cartões (9cdd5cf). |
| `ui/src/lib/Lightbox.svelte` | renomeação | 6 / 6 | 6 / 0 / 0 | Comentários. |
| `ui/src/lib/Logo.svelte` | domínio | 15 / 15 | 15 / 0 / 0 | O logótipo. |
| `ui/src/lib/Markdown.svelte` | misto | 168 / 168 | 165 / 7 / 0 | Render comum; [[concept]], kit e explorables são do Aristotle. Só o Aristotle protege os | nas tabelas. |
| `ui/src/lib/Ribbon.svelte` | misto | 134 / 134 | 127 / 0 / 13 | Faixa e pop-up Appearance comuns; os lugares são do domínio. O pop-up foi extraído nesta prova (LookPicker). |
| `ui/src/lib/Search.svelte` | misto | 46 / 46 | 44 / 0 / 6 | Paleta comum; para onde leva cada resultado é do domínio. |
| `ui/src/lib/StatusLine.svelte` | misto | 36 / 34 | 20 / 0 / 18 | Moldura comum; o que mostra é do domínio. Ponto de extensão: itens da linha. |
| `ui/src/lib/TabBar.svelte` | misto | 118 / 118 | 97 / 0 / 29 | Separadores comuns; títulos e ícones por rota do domínio. |
| `ui/src/lib/TerminalDrawer.svelte` | renomeação | 20 / 12 | 12 / 0 / 0 | Rótulos e a chave antiga mind-gym (Aristotle). |
| `ui/src/lib/TerminalView.svelte` | renomeação | 4 / 0 | 0 / 0 / 0 | Igual a menos de nomes. |
| `ui/src/lib/TutorConversation.svelte` | renomeação | 12 / 8 | 8 / 0 / 0 | Textos. |
| `ui/src/lib/actions.ts` | domínio | 225 / 225 | 201 / 30 / 0 | O Aristotle tem as acções da aula; o Galen esvaziou-o. |
| `ui/src/lib/charts/StackedColumns.svelte` | igual | 0 | — | |
| `ui/src/lib/charts/TableView.svelte` | igual | 0 | — | |
| `ui/src/lib/charts/scale.ts` | deriva | 23 / 23 | 23 / 0 / 0 | O Galen juntou niceRange e dayIndex, genéricos, que o Aristotle não tem. |
| `ui/src/lib/drafts.ts` | renomeação | 6 / 4 | 4 / 0 / 0 | Comentários. |
| `ui/src/lib/feed.svelte.ts` | misto | 402 / 400 | 360 / 6 / 44 | Ligação SSE, reconexão e build novo comuns; os registos são do domínio. Só o Galen recarrega num release novo. |
| `ui/src/lib/focus.svelte.ts` | misto | 10 / 8 | 8 / 0 / 2 | Igual + as excepções do Aristotle (asides, gloss). |
| `ui/src/lib/format.ts` | deriva | 27 / 27 | 27 / 0 / 0 | O Galen corrigiu as datas "YYYY-MM-DD" (lidas como meia-noite UTC, o dia anterior a oeste); o Aristotle não. sessionStats é do Aristotle. |
| `ui/src/lib/markdown.ts` | deriva | 36 / 36 | 33 / 3 / 0 | O Aristotle corrigiu os | dentro de código e maths nas tabelas (3516991); o Galen não, e também tem tabelas e código. |
| `ui/src/lib/maths.svelte.ts` | renomeação | 2 / 2 | 2 / 0 / 0 | Comentário. |
| `ui/src/lib/router.svelte.ts` | misto | 123 / 123 | 99 / 0 / 28 | Router por hash comum; as rotas são do domínio. Ponto de extensão: routes. |
| `ui/src/lib/search.svelte.ts` | igual | 0 | — | |
| `ui/src/lib/tabs.svelte.ts` | misto | 24 / 22 | 22 / 0 / 0 | Igual + um separador por aula (Aristotle) + a chave antiga mind-gym. |
| `ui/src/lib/theme.svelte.ts` | deriva | 15 / 13 | 13 / 0 / 0 | Acento verde só no Galen; chave antiga no Aristotle. Extraído nesta prova. |
| `ui/src/lib/tutor.svelte.ts` | renomeação | 32 / 14 | 14 / 0 / 0 | Comentários. |
| `ui/src/lib/visible.ts` | renomeação | 2 / 2 | 2 / 0 / 0 | Comentário. |
| `ui/src/main.ts` | domínio | 9 / 3 | 3 / 0 / 0 | Que CSS do domínio carrega. |
| `ui/src/pages/Now.svelte` | renomeação | 3 / 3 | 3 / 0 / 0 | Comentário. |
| `ui/src/pages/Settings.svelte` | misto | 129 / 115 | 25 / 0 / 90 | «Quem corre o agente» igual; o Galen junta a porta do relógio. Ponto de extensão: secções de Settings. |
| `ui/src/styles/base.css` | deriva | 43 / 43 | 42 / 1 / 2 | Tokens: o Galen tem verde, --on-acc por acento e séries de gráfico fixas (validadas para daltonismo); o Aristotle não. Extraído nesta prova (tokens.css). |
| `ui/src/styles/charts.css` | igual | 0 | — | |
| `ui/src/styles/prose.css` | misto | 211 / 211 | 211 / 0 / 0 | Prosa comum; o kit visual (.kit, .sequence) é do Aristotle. |
| `ui/src/styles/shell.css` | misto | 45 / 43 | 15 / 5 / 33 | Moldura comum; o painel da biblioteca (.rail) é do Aristotle, o chat ao lado do Galen. |
| `ui/src/vite-env.d.ts` | igual | 0 | — | |
| `vite.config.ts` | renomeação | 4 / 2 | 2 / 0 / 0 | Porto do Vite. |

## Só no Aristotle

Tudo domínio, menos o que está marcado.

| Ficheiro | Classe | Nota |
|---|---|---|
| `.claude/agents/illustrator.md` | domínio |  |
| `.claude/skills/praxis/SKILL.md` | domínio |  |
| `.claude/skills/review/SKILL.md` | domínio |  |
| `.claude/skills/roadmap/SKILL.md` | domínio |  |
| `.claude/skills/teach/SKILL.md` | domínio |  |
| `.claude/skills/train/SKILL.md` | domínio |  |
| `.cursor/mcp.json` | **genérico** | O Galen não tem a config do Cursor. |
| `docs/teaching.md` | domínio |  |
| `server/asides.ts` | domínio |  |
| `server/feed.ts` | domínio |  |
| `server/glosses.ts` | domínio |  |
| `server/gym.ts` | domínio |  |
| `server/images.ts` | domínio |  |
| `server/missions.ts` | domínio |  |
| `server/notes.ts` | domínio |  |
| `server/reviews.ts` | domínio |  |
| `server/roadmaps.ts` | domínio |  |
| `server/topics.ts` | domínio |  |
| `tests/browser.test.ts` | **genérico** | Na forma: servidor real, build e Chromium headless. O Galen não tem nenhum teste no browser. |
| `ui/src/lib/Ask.svelte` | domínio |  |
| `ui/src/lib/AskPanel.svelte` | domínio |  |
| `ui/src/lib/Block.svelte` | domínio |  |
| `ui/src/lib/ClassPage.svelte` | domínio |  |
| `ui/src/lib/ConceptNode.svelte` | domínio |  |
| `ui/src/lib/ConceptPanel.svelte` | domínio |  |
| `ui/src/lib/FeedList.svelte` | domínio |  |
| `ui/src/lib/Grip.svelte` | **genérico** | A pega que redimensiona um painel. |
| `ui/src/lib/LessonActivity.svelte` | domínio |  |
| `ui/src/lib/LessonBench.svelte` | domínio |  |
| `ui/src/lib/LocalGraph.svelte` | domínio |  |
| `ui/src/lib/MapGraph.svelte` | domínio |  |
| `ui/src/lib/MapUpdate.svelte` | domínio |  |
| `ui/src/lib/Quiz.svelte` | domínio |  |
| `ui/src/lib/ReviewPanel.svelte` | domínio |  |
| `ui/src/lib/Sequence.svelte` | domínio |  |
| `ui/src/lib/Sidebar.svelte` | domínio |  |
| `ui/src/lib/StartPanel.svelte` | domínio |  |
| `ui/src/lib/StatusBar.svelte` | domínio |  |
| `ui/src/lib/aside.svelte.ts` | domínio |  |
| `ui/src/lib/automatic.svelte.ts` | domínio |  |
| `ui/src/lib/bench.svelte.ts` | domínio |  |
| `ui/src/lib/charts/StepChart.svelte` | **genérico** | Uma série em degraus. |
| `ui/src/lib/classes.svelte.ts` | domínio |  |
| `ui/src/lib/explorables/HeartRate.svelte` | domínio |  |
| `ui/src/lib/explorables/StressHormones.svelte` | domínio |  |
| `ui/src/lib/explorables/index.ts` | domínio |  |
| `ui/src/lib/gloss.svelte.ts` | domínio |  |
| `ui/src/lib/kit/Balance.svelte` | domínio |  |
| `ui/src/lib/kit/Flow.svelte` | domínio |  |
| `ui/src/lib/kit/Glyph.svelte` | domínio |  |
| `ui/src/lib/kit/Plate.svelte` | domínio |  |
| `ui/src/lib/kit/Timeline.svelte` | domínio |  |
| `ui/src/lib/layout.ts` | domínio |  |
| `ui/src/lib/library.ts` | domínio |  |
| `ui/src/lib/steps.ts` | domínio |  |
| `ui/src/lib/storage.ts` | **legado** | A mudança de chaves do Mind Gym. Morre, não vai para o núcleo. |
| `ui/src/lib/tables.ts` | **genérico** | Os `\|` dentro de código e maths numa tabela. O Galen precisa dele. |
| `ui/src/pages/About.svelte` | domínio |  |
| `ui/src/pages/KnowledgeMap.svelte` | domínio |  |
| `ui/src/pages/Lesson.svelte` | domínio |  |
| `ui/src/pages/Log.svelte` | domínio |  |
| `ui/src/pages/Mission.svelte` | domínio |  |
| `ui/src/pages/Practice.svelte` | domínio |  |
| `ui/src/pages/Praxis.svelte` | domínio |  |
| `ui/src/pages/Progress.svelte` | domínio |  |
| `ui/src/pages/Roadmap.svelte` | domínio |  |
| `ui/src/pages/Roadmaps.svelte` | domínio |  |
| `ui/src/pages/SessionView.svelte` | domínio |  |
| `ui/src/pages/Step.svelte` | domínio |  |
| `ui/src/pages/Topic.svelte` | domínio |  |
| `ui/src/styles/lesson.css` | domínio |  |
| `ui/src/styles/map.css` | domínio |  |
| `docs/images/` (38 ficheiros) | domínio | Imagens do README |

## Só no Galen

Tudo domínio, menos o que está marcado.

| Ficheiro | Classe | Nota |
|---|---|---|
| `.claude/skills/journal/SKILL.md` | domínio |  |
| `docs/apple-health.md` | domínio |  |
| `docs/journal.md` | domínio |  |
| `scripts/claude-checkin-hook.ts` | domínio |  |
| `server/clinic.ts` | domínio |  |
| `server/days.ts` | domínio |  |
| `server/entities.ts` | domínio |  |
| `server/gates.ts` | domínio |  |
| `server/intake.ts` | domínio |  |
| `server/labs.ts` | domínio |  |
| `server/library.ts` | **candidato** | As notas em Markdown de data/, vigiadas. Fica no Galen até haver segundo uso (o Argus?). |
| `server/loops.ts` | domínio |  |
| `server/metrics.ts` | domínio |  |
| `server/plans.ts` | domínio |  |
| `server/profile.ts` | domínio |  |
| `server/samples.ts` | domínio |  |
| `server/supplements.ts` | domínio |  |
| `server/watch.ts` | domínio |  |
| `shared/body.ts` | domínio |  |
| `shared/crossref.ts` | domínio |  |
| `shared/dates.ts` | **genérico** | Datas locais "YYYY-MM-DD" e o mesmo «hoje» no servidor e na interface. |
| `shared/people.ts` | domínio |  |
| `shared/plans.ts` | domínio |  |
| `shared/sessions.ts` | domínio |  |
| `tests/fixtures/shortcut-provisional.json` | domínio |  |
| `tests/watch.test.ts` | domínio |  |
| `ui/src/lib/BodyMap.svelte` | domínio |  |
| `ui/src/lib/Checkin.svelte` | domínio |  |
| `ui/src/lib/EntityCard.svelte` | domínio |  |
| `ui/src/lib/EntityChip.svelte` | domínio |  |
| `ui/src/lib/EntityIcon.svelte` | domínio |  |
| `ui/src/lib/EntityMeetings.svelte` | domínio |  |
| `ui/src/lib/EntityTags.svelte` | domínio |  |
| `ui/src/lib/GamePlan.svelte` | domínio |  |
| `ui/src/lib/LoopList.svelte` | domínio |  |
| `ui/src/lib/Page.svelte` | **genérico** | Uma página com o chat ao lado. O Aristotle tem o mesmo dentro da aula. |
| `ui/src/lib/PlanCheck.svelte` | domínio |  |
| `ui/src/lib/PlanLifts.svelte` | domínio |  |
| `ui/src/lib/ProtocolToday.svelte` | domínio |  |
| `ui/src/lib/RatingScale.svelte` | domínio |  |
| `ui/src/lib/TrainingNav.svelte` | domínio |  |
| `ui/src/lib/Vitals.svelte` | domínio |  |
| `ui/src/lib/WeekStrip.svelte` | domínio |  |
| `ui/src/lib/WeekTable.svelte` | domínio |  |
| `ui/src/lib/body.ts` | domínio |  |
| `ui/src/lib/charts/Columns.svelte` | **genérico** | Colunas por dia. |
| `ui/src/lib/charts/LineChart.svelte` | **genérico** | Linhas com banda e linha de referência. |
| `ui/src/lib/charts/NightChart.svelte` | domínio |  |
| `ui/src/lib/charts/SleepWindow.svelte` | domínio |  |
| `ui/src/lib/gameplan.ts` | domínio |  |
| `ui/src/lib/training-icons.ts` | domínio |  |
| `ui/src/lib/words.ts` | domínio |  |
| `ui/src/pages/Body.svelte` | domínio |  |
| `ui/src/pages/Day.svelte` | domínio |  |
| `ui/src/pages/Diary.svelte` | domínio |  |
| `ui/src/pages/Entities.svelte` | domínio |  |
| `ui/src/pages/Entity.svelte` | domínio |  |
| `ui/src/pages/Health.svelte` | domínio |  |
| `ui/src/pages/Labs.svelte` | domínio |  |
| `ui/src/pages/Marker.svelte` | domínio |  |
| `ui/src/pages/Note.svelte` | domínio |  |
| `ui/src/pages/Plan.svelte` | domínio |  |
| `ui/src/pages/Plans.svelte` | domínio |  |
| `ui/src/pages/Recovery.svelte` | domínio |  |
| `ui/src/pages/Session.svelte` | domínio |  |
| `ui/src/pages/Strength.svelte` | domínio |  |
| `ui/src/pages/Supplements.svelte` | domínio |  |
| `ui/src/pages/Training.svelte` | domínio |  |
| `ui/src/pages/You.svelte` | domínio |  |
| `ui/src/styles/dash.css` | domínio |  |
| `docs/images/` (10 ficheiros) | domínio | Imagens do README |

## Configuração dos agentes

- `.claude/skills/`: o Aristotle tem `teach`, `review`, `train`, `roadmap` e `praxis`; o Galen tem `journal`. Todas domínio. Nenhuma skill comum.
- `.claude/agents/`: o `researcher` existe nos dois, com o mesmo método e fontes do domínio (misto). O `illustrator` só existe no Aristotle (domínio: desenhos para aulas).
- `.claude/settings.json`: as mesmas permissões e o mesmo Stop hook (`scripts/claude-stop-hook.ts`, renomeação). O Galen junta permissões de escrita em `data/**` e dois hooks `UserPromptSubmit` (domínio).
- `.claude/rules/development.md`: renomeação. É uma das instruções comuns que vão para o núcleo (`AGENTS.md` do Organon, secção «Working on the app»).
- `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`: renomeação. Geráveis a partir do nome da app.


