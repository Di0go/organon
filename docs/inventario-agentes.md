## Configuração dos agentes

- `.claude/skills/`: o Aristotle tem `teach`, `review`, `train`, `roadmap` e `praxis`; o Galen tem `journal`. Todas domínio. Nenhuma skill comum.
- `.claude/agents/`: o `researcher` existe nos dois, com o mesmo método e fontes do domínio (misto). O `illustrator` só existe no Aristotle (domínio: desenhos para aulas).
- `.claude/settings.json`: as mesmas permissões e o mesmo Stop hook (`scripts/claude-stop-hook.ts`, renomeação). O Galen junta permissões de escrita em `data/**` e dois hooks `UserPromptSubmit` (domínio).
- `.claude/rules/development.md`: renomeação. É uma das instruções comuns que vão para o núcleo (`AGENTS.md` do Organon, secção «Working on the app»).
- `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`: renomeação. Geráveis a partir do nome da app.

