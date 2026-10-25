#!/usr/bin/env python3
# Regenerates docs/inventario.md from the two apps, read only: git ls-files, git show and diff, nothing written there.
# The judgement (class and note of each file in both) lives in docs/inventario-classes.tsv; everything else is
# measured. Run it again before each migration step to see how far the apps have drifted since.
#
#   python3 docs/inventario.py            writes docs/inventario.md
#   python3 docs/inventario.py --check    exits 1 if a file in both apps has no class yet (new drift to judge)

import re, subprocess, sys, tempfile
from pathlib import Path

HOME = Path.home() / 'Projects'
A, G = HOME / 'Aristotle', HOME / 'Galen'
# The archetype: Aristotle's last commit before the copy, and the copy itself.
A0, G0 = 'd395a44', '6a235e1'
HERE = Path(__file__).resolve().parent
SKIP = re.compile(r'^docs/images/|^pnpm-lock\.yaml$')

# What the copy renamed, turned into markers so that only real differences are left.
NORM = [
    (r'Aristotle|Galen', 'APP'), (r'aristotle|galen', 'app'), (r'ARISTOTLE|GALEN', 'APP'),
    (r'\b(4747|4840)\b', 'PORT'), (r'\b(4757|4850)\b', 'DEVPORT'), (r'\b(4748|4841)\b', 'TLSPORT'), (r'127\.0\.0\.8[23]', 'LOOP'),
    (r'\b(the learner|the athlete)\b', 'SUBJ'), (r'\b(learner|athlete)\b', 'SUBJ'), (r'\b(tutor|agent)\b', 'AGENT'),
]


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True).stdout


def norm(text):
    for pat, rep in NORM:
        text = re.sub(pat, rep, text)
    return text.splitlines()


def changed(a, b):
    """Lines that differ, as GNU diff counts them (its < and > lines), so the numbers match a diff by hand."""
    with tempfile.NamedTemporaryFile('w') as fa, tempfile.NamedTemporaryFile('w') as fb:
        fa.write('\n'.join(a) + '\n')
        fb.write('\n'.join(b) + '\n')
        fa.flush()
        fb.flush()
        out = subprocess.run(['diff', fa.name, fb.name], capture_output=True, text=True).stdout
    return sum(1 for line in out.splitlines() if line[:2] in ('< ', '> ') or line in ('<', '>'))


def read(path):
    try:
        return path.read_text(errors='replace')
    except (FileNotFoundError, IsADirectoryError):
        return ''


def main():
    fa = set(git(A, 'ls-files').split())
    fg = set(git(G, 'ls-files').split())
    both, aonly, gonly = sorted(fa & fg), sorted(fa - fg), sorted(fg - fa)
    classes = {}
    for line in (HERE / 'inventario-classes.tsv').read_text().splitlines():
        if line.strip():
            f, k, n = line.split('\t')
            classes[f] = (k, n)
    rows, missing = [], []
    for f in both:
        ta, tg = read(A / f), read(G / f)
        if ta == tg:
            rows.append((f, 'igual', 0, 0, None, ''))
            continue
        raw = changed(ta.splitlines(), tg.splitlines())
        if SKIP.search(f):
            rows.append((f, '—', raw, None, None, 'Imagem ou lockfile'))
            continue
        a0, g0 = git(A, 'show', f'{A0}:{f}'), git(G, 'show', f'{G0}:{f}')
        att = (changed(norm(a0), norm(g0)), changed(norm(a0), norm(ta)), changed(norm(g0), norm(tg)))
        k, n = classes.get(f, ('?', ''))
        if k == '?':
            missing.append(f)
        rows.append((f, k, raw, changed(norm(ta), norm(tg)), att, n))
    if '--check' in sys.argv:
        print('\n'.join(missing) or 'Every file in both apps has a class.')
        sys.exit(1 if missing else 0)
    write(rows, aonly, gonly, git(A, 'log', '-1', '--format=%h').strip(), git(G, 'log', '-1', '--format=%h').strip())


NAMES = {'R': 'renomeação', 'D': 'deriva', 'M': 'misto', 'X': 'domínio', '?': '**por classificar**'}

GENERIC_A = {
    'ui/src/lib/tables.ts': ('genérico', 'Os `\\|` dentro de código e maths numa tabela. O Galen precisa dele.'),
    'ui/src/lib/Grip.svelte': ('genérico', 'A pega que redimensiona um painel.'),
    'ui/src/lib/charts/StepChart.svelte': ('genérico', 'Uma série em degraus.'),
    'tests/browser.test.ts': ('genérico', 'Na forma: servidor real, build e Chromium headless. O Galen não tem nenhum teste no browser.'),
    'ui/src/lib/storage.ts': ('legado', 'A mudança de chaves do Mind Gym. Morre, não vai para o núcleo.'),
    '.cursor/mcp.json': ('genérico', 'O Galen não tem a config do Cursor.'),
}
GENERIC_G = {
    'ui/src/lib/Page.svelte': ('genérico', 'Uma página com o chat ao lado. O Aristotle tem o mesmo dentro da aula.'),
    'ui/src/lib/charts/Columns.svelte': ('genérico', 'Colunas por dia.'),
    'ui/src/lib/charts/LineChart.svelte': ('genérico', 'Linhas com banda e linha de referência.'),
    'shared/dates.ts': ('genérico', 'Datas locais "YYYY-MM-DD" e o mesmo «hoje» no servidor e na interface.'),
    'server/library.ts': ('candidato', 'As notas em Markdown de data/, vigiadas. Fica no Galen até haver segundo uso (o Argus?).'),
}


def write(rows, aonly, gonly, ha, hg):
    counts = {}
    for r in rows:
        counts[r[1]] = counts.get(r[1], 0) + 1
    att = [r[4] for r in rows if r[4]]
    tc, ta, tg = (sum(x[i] for x in att) for i in range(3))
    o = []
    w = o.append
    w('# Inventário: Aristotle e Galen, ficheiro a ficheiro\n')
    w(f'Gerado por `docs/inventario.py` sobre os ficheiros versionados de `~/Projects/Aristotle` (`{ha}`) e `~/Projects/Galen` (`{hg}`), só por leitura. '
      'A classe e a nota de cada ficheiro comum estão em `docs/inventario-classes.tsv` (o juízo); os números são medidos. '
      'Para medir outra vez a deriva: `python3 docs/inventario.py`.\n')
    w('## Método\n')
    w('A cópia foi feita com renomeações: Aristotle→Galen, «the learner»→«he», `ARISTOTLE_`→`GALEN_`, portos 4747→4840. Comparados tal como estão, '
      'quase todos os ficheiros parecem diferentes. Por isso, antes de comparar, cada ficheiro é **normalizado**: os nomes das apps, os portos, o '
      'loopback e o sujeito passam a marcadores (`NORM` em `docs/inventario.py`). O que sobra é diferença real.\n')
    w(f'Depois, cada diferença é atribuída a quem a fez, contra o **arquétipo**: o Aristotle em `{A0}` (o último commit antes da cópia, 2026-10-14) e o '
      f'Galen em `{G0}` (a cópia, 2026-10-18 17:19). As três colunas de «Atribuição» contam as linhas diferentes, já normalizadas, feitas **na cópia**, '
      'no **Aristotle depois** e no **Galen depois**.\n')
    w('Classes: **igual** (byte a byte) · **renomeação** (igual depois de normalizar, ou só comentários: vai para o núcleo, parametrizado) · '
      '**deriva** (divergiu sem razão de domínio: escolhe-se a melhor versão e vai para o núcleo) · **misto** (mecanismo comum com domínio dentro: '
      'vai para o núcleo com um ponto de extensão) · **domínio** (diverge porque o domínio é outro: fica na app) · **só num**.\n')
    w('## Números\n')
    na = sum(1 for f in aonly if f.startswith('docs/images'))
    ng = sum(1 for f in gonly if f.startswith('docs/images'))
    w('| | ficheiros |\n|---|---|')
    w(f'| Versionados no Aristotle | {len(rows) + len(aonly)} |\n| Versionados no Galen | {len(rows) + len(gonly)} |\n| Nos dois | {len(rows)} |')
    for k, label in [('igual', 'iguais byte a byte'), ('R', 'renomeação'), ('D', 'deriva'), ('M', 'misto'), ('X', 'domínio'), ('—', 'imagens e lockfile (não classificados)'), ('?', 'por classificar')]:
        if counts.get(k):
            w(f'| … {label} | {counts[k]} |')
    w(f'| Só no Aristotle | {len(aonly)} ({na} imagens) |\n| Só no Galen | {len(gonly)} ({ng} imagens) |\n')
    w(f'Linhas diferentes nos ficheiros comuns, depois de normalizar: **{tc} feitas na cópia**, {ta} no Aristotle depois e {tg} no Galen depois. '
      'A divergência nasceu quase toda no commit que fez o Galen. Isso diz duas coisas: copiar já é divergir, e a deriva de hoje ainda é pequena '
      'e datável. É o momento barato para extrair.\n')
    w((HERE / 'inventario-custo.md').read_text())
    w('## Ficheiros nos dois\n')
    w('Linhas: diferentes em bruto / depois de normalizar. Atribuição: na cópia / Aristotle depois / Galen depois.\n')
    w('| Ficheiro | Classe | Linhas | Atribuição | Nota |\n|---|---|---|---|---|')
    for f, k, raw, nd, at, n in rows:
        if k == 'igual':
            w(f'| `{f}` | igual | 0 | — | |')
        elif k == '—':
            w(f'| `{f}` | — | {raw} | — | {n} |')
        else:
            w(f'| `{f}` | {NAMES[k]} | {raw} / {nd} | {at[0]} / {at[1]} / {at[2]} | {n} |')
    for lst, gen, who in [(aonly, GENERIC_A, 'Aristotle'), (gonly, GENERIC_G, 'Galen')]:
        w(f'\n## Só no {who}\n')
        w('Tudo domínio, menos o que está marcado.\n')
        w('| Ficheiro | Classe | Nota |\n|---|---|---|')
        imgs = [f for f in lst if f.startswith('docs/images')]
        for f in lst:
            if f.startswith('docs/images'):
                continue
            k, n = gen.get(f, ('domínio', ''))
            w(f'| `{f}` | {"**" + k + "**" if k != "domínio" else k} | {n} |')
        w(f'| `docs/images/` ({len(imgs)} ficheiros) | domínio | Imagens do README |')
    w('\n' + (HERE / 'inventario-agentes.md').read_text())
    (HERE / 'inventario.md').write_text('\n'.join(o) + '\n')
    print(f'docs/inventario.md: {len(rows)} in both, {len(aonly)} only in Aristotle, {len(gonly)} only in Galen; {counts.get("?", 0)} to classify')


if __name__ == '__main__':
    main()
