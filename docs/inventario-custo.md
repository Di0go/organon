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

