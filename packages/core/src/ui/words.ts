// The frame's own words (the ribbon's buttons, the search palette, the menus, the look), in the app's language. Galen
// and Aristotle speak English, Argus Portuguese: an app says which once, before mounting, and may change any word.
//
//   setWords('pt');                    // main.ts
//   setWords('en', { search: 'Find' });

export const EN = {
  search: 'Search',
  searchHint: 'Search (Ctrl+K)',
  searchPlaceholder: 'Search…',
  searchEmpty: 'Type to search.',
  searching: 'Searching…',
  nothingMatches: (q: string) => `Nothing matches "${q}".`,
  move: 'move',
  open: 'open',
  or: 'or',
  appearance: 'Appearance',
  mode: 'Mode',
  light: 'Light',
  dark: 'Dark',
  accent: 'Accent',
  focus: 'Focus',
  focusHint: 'Focus: hide everything but the page (F)',
  leaveFocus: 'Leave focus',
  menu: 'Open the menu',
  places: 'Places',
  openPages: 'Open pages',
  close: (what: string) => `Close ${what}`,
  copy: 'Copy',
  searchFor: (app: string) => `Search ${app}`,
  nativeMenu: "Shift + right-click for the browser's menu",
  selectedText: 'Selected text',
  dev: 'The dev instance: its own port and data (.dev/), never the real one',
  andMore: (n: number) => ` (and ${n} more)`,
  updated: (app: string) => `${app} was updated`,
  needsReload: 'This page needs the new version.',
  reload: 'Reload',
  showTable: 'Show as a table',
  today: 'Today',
  yesterday: 'Yesterday',
  daysAgo: (n: number) => `${n} days ago`,
  weeksAgo: (n: number) => `${n} weeks ago`,
  monthsAgo: (n: number) => `${n} months ago`,
  underAMinute: 'under a minute',
  accentNames: {} as Record<string, string>,
  locale: 'en-GB',
};

export type Words = typeof EN;

export const PT: Words = {
  search: 'Procurar',
  searchHint: 'Procurar (Ctrl+K)',
  searchPlaceholder: 'Procurar…',
  searchEmpty: 'Escreve para procurar.',
  searching: 'A procurar…',
  nothingMatches: (q) => `Nada corresponde a «${q}».`,
  move: 'mover',
  open: 'abrir',
  or: 'ou',
  appearance: 'Aspecto',
  mode: 'Modo',
  light: 'Claro',
  dark: 'Escuro',
  accent: 'Cor',
  focus: 'Foco',
  focusHint: 'Foco: esconde tudo menos a página (F)',
  leaveFocus: 'Sair do foco',
  menu: 'Abrir o menu',
  places: 'Sítios',
  openPages: 'Páginas abertas',
  close: (what) => `Fechar ${what}`,
  copy: 'Copiar',
  searchFor: (app) => `Procurar no ${app}`,
  nativeMenu: 'Shift + botão direito para o menu do browser',
  selectedText: 'Texto seleccionado',
  dev: 'A instância de dev: porto e dados próprios (.dev/), nunca os verdadeiros',
  andMore: (n) => ` (e mais ${n})`,
  updated: (app) => `O ${app} foi actualizado`,
  needsReload: 'Esta página precisa da versão nova.',
  reload: 'Recarregar',
  showTable: 'Ver como tabela',
  today: 'Hoje',
  yesterday: 'Ontem',
  daysAgo: (n) => `há ${n} dias`,
  weeksAgo: (n) => `há ${n} semanas`,
  monthsAgo: (n) => `há ${n} meses`,
  underAMinute: 'menos de um minuto',
  accentNames: { green: 'Verde', blue: 'Azul', red: 'Vermelho', violet: 'Violeta', graphite: 'Grafite' },
  locale: 'pt-PT',
};

/** The words in use. Read at render: set them before mounting the app. */
export const words: Words = { ...EN };

export function setWords(language: 'en' | 'pt', overrides: Partial<Words> = {}): void {
  Object.assign(words, language === 'pt' ? PT : EN, overrides);
}
