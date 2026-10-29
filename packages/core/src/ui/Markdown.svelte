<script lang="ts" module>
  // Renders Markdown (notes, an agent's readings, chat answers) and brings it to life: mermaid diagrams in the look's
  // colours, animated drawings with Play/Pause, and links the app opens inside itself.
  //
  //   <Markdown {source} look={theme} links={(href) => …the app's own href, or undefined to leave it…} />
  //
  // What is the app's comes in by props: its renderer (createMarkdown, when it has syntax of its own), where a link
  // goes (Galen's links between notes open the note), its look, and what it does to the rendered page itself.
  //
  // From Galen's Markdown.svelte, with its router and theme handed in.

  /** Diagrams drawn so far, by look (theme and accent) and source, so a note revisited shows them at once. */
  const diagrams = new Map<string, string>();
  /** The look Mermaid was last set up for. */
  let mermaidLook = '';
  /** Ids for Mermaid's drawings, unique on the page. */
  let drawn = 0;
</script>

<script lang="ts">
  import { type MarkdownRenderer, renderInline, renderMarkdown } from './markdown.ts';
  import { whileVisible } from './visible.ts';

  let {
    source,
    inline = false,
    markdown = { renderMarkdown, renderInline },
    links,
    look: theme,
    enhance,
    ownFigures,
  }: {
    source: string;
    /** A short string (a title, a label): no wrapping paragraph, and nothing brought to life. */
    inline?: boolean;
    /** The renderer: the core's, or the app's own from createMarkdown. */
    markdown?: MarkdownRenderer;
    /**
     * Where a link in the text goes, given its href as written: a new href, which opens in the app (its target is
     * dropped), or undefined to leave it as it is. Every link is left as it is when not given.
     */
    links?: (href: string) => string | undefined;
    /**
     * The app's look (createTheme): diagrams are drawn again when it changes. Without it they are drawn in the look
     * of the moment they are drawn.
     */
    look?: { value: string; accent: string };
    /**
     * The app's own work on the rendered page, run on every render before the core's (Aristotle's live figures and
     * glossed phrases); what it returns is called before the next one.
     */
    enhance?: (el: HTMLElement) => void | (() => void);
    /** A selector for the app's own live figures (Aristotle's ".kit"): their drawings get no Play/Pause from here. */
    ownFigures?: string;
  } = $props();

  let el = $state<HTMLElement>();

  const html = $derived(inline ? markdown.renderInline(source) : markdown.renderMarkdown(source));

  $effect(() => {
    void html;
    if (el && enhance) return enhance(el);
  });

  // Links the app opens inside itself (Galen's links between notes, "../training/kickboxing.md#section").
  $effect(() => {
    void html;
    if (!links) return;
    for (const a of el?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []) {
      const target = links(a.getAttribute('href') ?? '');
      if (target !== undefined) {
        a.setAttribute('href', target);
        a.removeAttribute('target');
      }
    }
  });

  // Animated drawings (SMIL) get Play/Pause and Replay; with reduced motion they start paused. Out of sight (scrolled
  // away, or the tab hidden) they pause by themselves and carry on when seen again, unless he paused them.
  $effect(() => {
    void html;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stops: (() => void)[] = [];
    for (const svg of el?.querySelectorAll<SVGSVGElement>('svg') ?? []) {
      if (!svg.querySelector('animate, animateTransform, animateMotion, set') || svg.parentElement?.closest('svg')) continue;
      if (ownFigures && svg.closest(ownFigures)) continue;
      let frame = svg.closest('figure') as HTMLElement | null;
      if (!frame) {
        frame = document.createElement('figure');
        svg.replaceWith(frame);
        frame.append(svg);
      }
      frame.querySelector('.figure-tools')?.remove();
      let paused = still;
      let seen = false;
      const tools = document.createElement('div');
      tools.className = 'figure-tools';
      const play = document.createElement('button');
      const replay = document.createElement('button');
      replay.textContent = 'Replay';
      const apply = () => {
        if (paused || !seen) svg.pauseAnimations();
        else svg.unpauseAnimations();
        play.textContent = paused ? 'Play' : 'Pause';
      };
      play.onclick = () => {
        paused = !paused;
        apply();
      };
      replay.onclick = () => {
        svg.setCurrentTime(0);
        paused = false;
        apply();
      };
      apply();
      tools.append(play, replay);
      svg.after(tools);
      stops.push(
        whileVisible(svg, (visible) => {
          seen = visible;
          apply();
        }),
      );
    }
    return () => {
      for (const stop of stops) stop();
    };
  });

  // Draw ```mermaid blocks once the HTML is in the page. Mermaid is large, so it loads on first use. A diagram
  // drawn before in this look is put in at once; a new one holds its space while it is drawn. When the theme or the
  // accent changes, the diagrams are drawn again in the new colours, those not yet drawn too (in Galen's copy, a look
  // changed while a diagram was first drawn left its placeholder for good).
  $effect(() => {
    void html;
    const root = document.documentElement;
    const look = theme ? `${theme.value}|${theme.accent}` : `${root.dataset.theme}|${root.dataset.accent}`;
    const todo: { at: HTMLElement; source: string }[] = [];
    for (const code of el?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? []) {
      todo.push({ at: code.parentElement!, source: code.textContent ?? '' });
    }
    for (const figure of el?.querySelectorAll<HTMLElement>('figure.diagram[data-source]') ?? []) {
      if (figure.dataset.look !== look) todo.push({ at: figure, source: figure.dataset.source ?? '' });
    }
    // One still being drawn when the look changed: its drawing was dropped, so it is drawn in the new look instead.
    for (const hold of el?.querySelectorAll<HTMLElement>('.diagram-loading[data-source]') ?? []) {
      todo.push({ at: hold, source: hold.dataset.source ?? '' });
    }
    if (todo.length === 0) return;
    let gone = false;
    const pending: { at: HTMLElement; source: string }[] = [];
    for (const d of todo) {
      const svg = diagrams.get(`${look}\n${d.source}`);
      if (svg) d.at.replaceWith(diagram(svg, d.source, look));
      else if (d.at.tagName === 'PRE') {
        // The space it will take, roughly, so the page doesn't jump when it is drawn.
        const hold = document.createElement('div');
        hold.className = 'figure-loading diagram-loading';
        hold.dataset.source = d.source;
        d.at.replaceWith(hold);
        pending.push({ at: hold, source: d.source });
      } else pending.push(d);
    }
    if (pending.length === 0) return;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      if (gone) return;
      if (mermaidLook !== look) {
        mermaid.initialize(mermaidConfig());
        mermaidLook = look;
      }
      for (const d of pending) {
        try {
          const { svg } = await mermaid.render(`mermaid-${++drawn}`, d.source);
          diagrams.set(`${look}\n${d.source}`, svg);
          if (gone) return;
          d.at.replaceWith(diagram(svg, d.source, look));
        } catch {
          if (gone) return;
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          code.textContent = d.source;
          pre.append(code);
          pre.classList.add('diagram-error');
          d.at.replaceWith(pre);
        }
      }
    })();
    return () => {
      gone = true;
    };
  });

  /** A drawn diagram, carrying its source and look so it can be drawn again when the look changes. */
  function diagram(svg: string, source: string, look: string): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'diagram';
    figure.dataset.source = source;
    figure.dataset.look = look;
    figure.innerHTML = svg;
    return figure;
  }

  /** Mermaid in the app's colours, read from the tokens. A diagram can't change them (or add CSS) from its own text. */
  function mermaidConfig() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const soft = mix(v('--acc'), v('--b0'), dark ? 0.72 : 0.84);
    // Timelines colour their sections from cScale0…11: the accent, softened, with plain text on it.
    const scale = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        [`cScale${i}`, i % 2 ? mix(soft, v('--b0'), 0.35) : soft],
        [`cScaleLabel${i}`, v('--fg')],
        [`cScaleInv${i}`, v('--acc')],
      ]).flat(),
    );
    return {
      startOnLoad: false,
      securityLevel: 'strict' as const,
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'suppressErrorRendering',
        'maxEdges',
        'theme',
        'themeCSS',
        'themeVariables',
        'darkMode',
        'fontFamily',
        'altFontFamily',
      ],
      theme: 'base' as const,
      themeVariables: {
        darkMode: dark,
        fontFamily: v('--sans'),
        fontSize: '14px',
        background: v('--b0'),
        primaryColor: v('--b1'),
        primaryBorderColor: v('--rule-strong'),
        primaryTextColor: v('--fg'),
        secondaryColor: v('--b2'),
        tertiaryColor: v('--b1'),
        lineColor: v('--muted'),
        textColor: v('--fg'),
        edgeLabelBackground: v('--b0'),
        clusterBkg: v('--b1'),
        clusterBorder: v('--rule-strong'),
        noteBkgColor: v('--b2'),
        noteBorderColor: v('--rule-strong'),
        ...scale,
        // Charts (xychart): lines and bars in the accent, then the semantic colours.
        xyChart: {
          plotColorPalette: [v('--acc'), v('--shaky'), v('--solid'), v('--muted')].join(', '),
          titleColor: v('--fg'),
          xAxisLabelColor: v('--muted'),
          yAxisLabelColor: v('--muted'),
          xAxisTitleColor: v('--muted'),
          yAxisTitleColor: v('--muted'),
          xAxisLineColor: v('--rule-strong'),
          yAxisLineColor: v('--rule-strong'),
          xAxisTickColor: v('--rule-strong'),
          yAxisTickColor: v('--rule-strong'),
        },
      },
    };
  }

  /** a blended toward b by t (0-1), for hex colours: Mermaid needs plain colours, not color-mix(). */
  function mix(a: string, b: string, t: number): string {
    const [x, y] = [rgb(a), rgb(b)];
    const channels = x.map((c, i) =>
      Math.round(c + ((y[i] ?? c) - c) * t)
        .toString(16)
        .padStart(2, '0'),
    );
    return `#${channels.join('')}`;
  }

  /** "#abc" or "#aabbcc" as [r, g, b]. */
  function rgb(hex: string): number[] {
    if (hex.length === 4) return [...hex.slice(1)].map((c) => parseInt(c + c, 16));
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
</script>

{#if inline}
  <span class="md-inline">{@html html}</span>
{:else}
  <div class="md" bind:this={el}>{@html html}</div>
{/if}
