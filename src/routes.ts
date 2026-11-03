// What each address on altcozygames.com is, without the Cloudflare runtime (so `npm test`
// runs it in Node). The Worker (worker.ts) turns these answers into responses.
import data from './generated/site-data.json' with { type: 'json' };

type LangData = (typeof data.langs)[keyof typeof data.langs];

/** Site language codes: en, pt, es, fr, de, pl, ru, ja, ko, zh. */
export const LANGS: readonly string[] = Object.keys(data.langs);

const langData = (lang: string): LangData | null =>
  (data.langs as Record<string, LangData>)[lang] ?? null;

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => values[key] ?? '');

/** The visitor's language from an Accept-Language header; English when none matches. */
export function pickLang(header: string | null): string {
  const wanted = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

export interface Duel {
  readonly variant: string;
  readonly tier: string;
  /** Normalized code, e.g. K2-k3jd9a8f-7j. */
  readonly code: string;
  readonly seconds: number;
}

/** Reads a duel code with the app's rules (src/app/core/duel/duel-code.ts); null if invalid. */
export function parseDuel(raw: string): Duel | null {
  const match = new RegExp(
    `^([${data.letters}])([1-4])-([a-z0-9]{1,16})-([a-z0-9]{1,6})$`,
    'i',
  ).exec(raw.trim());
  if (!match) return null;
  const [, letter, tierNumber, seed, time] = match;
  const variant = data.variants[data.letters.indexOf(letter.toUpperCase())];
  const tier = data.tiers[Number(tierNumber) - 1];
  const allowed = (data.variantTiers as Record<string, readonly string[]>)[variant] ?? [];
  if (!allowed.includes(tier)) return null;
  return {
    variant,
    tier,
    code: `${letter.toUpperCase()}${tierNumber}-${seed.toLowerCase()}-${time.toLowerCase()}`,
    seconds: parseInt(time, 36),
  };
}

export const formatTime = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A link preview: the tags a chat app reads to draw a card above the link. */
export interface Meta {
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly url: string;
}

export function duelMeta(lang: string, raw: string): Meta | null {
  const t = langData(lang);
  const duel = parseDuel(raw);
  if (!t || !duel) return null;
  const kind = `${(t.variant as Record<string, string>)[duel.variant]} · ${(t.difficulty as Record<string, string>)[duel.tier]}`;
  return {
    title: fill(t.duelTitle, { kind }),
    description: fill(t.duelDescription, { time: formatTime(duel.seconds) }),
    image: `${data.origin}/og/duel-${duel.variant}-${duel.tier}.jpg`,
    url: `${data.origin}/${lang}/d/${duel.code}`,
  };
}

export function dailyMeta(lang: string, raw: string): Meta | null {
  const t = langData(lang);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const day = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== raw) return null;
  const date = new Intl.DateTimeFormat(t.lang, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(day);
  return {
    title: fill(t.dailyTitle, { title: t.daily, date }),
    description: t.dailyDescription,
    image: `${data.origin}/og/daily.jpg`,
    url: `${data.origin}/${lang}/daily/${raw}`,
  };
}

export type Route =
  | { readonly kind: 'redirect'; readonly location: string; readonly status: 301 | 302 }
  | { readonly kind: 'assetlinks' }
  /** A page template (path of a static file) and the preview to put in it, if any. */
  | { readonly kind: 'page'; readonly template: string; readonly meta: Meta | null }
  | { readonly kind: 'asset' };

/**
 * What an address is. The Worker only sees addresses that match no static file: duel and
 * daily links, language-less paths, the App Link keys and old addresses.
 */
export function route(url: URL, acceptLanguage: string | null): Route {
  const path = url.pathname;
  if (path === '/.well-known/assetlinks.json') return { kind: 'assetlinks' };

  // The first links pointed at GitHub Pages (…/advanced-sudoku/duel/?c=<code>).
  if (/^\/advanced-sudoku\/duel\/?$/.test(path)) {
    const code = url.searchParams.get('c');
    return { kind: 'redirect', location: code ? `/d/${encodeURIComponent(code)}` : '/sudoku', status: 301 };
  }
  if (/^\/advanced-sudoku\/privacy\/?$/.test(path)) {
    return { kind: 'redirect', location: '/sudoku/privacy', status: 301 };
  }
  if (/^\/advanced-sudoku\/?$/.test(path)) {
    return { kind: 'redirect', location: '/sudoku', status: 301 };
  }

  // Short paths without a language (printed on the share card, typed by hand).
  const bare = /^\/(sudoku(?:\/privacy)?|d\/[^/]+|daily\/[^/]+)\/?$/.exec(path);
  if (bare) {
    return { kind: 'redirect', location: `/${pickLang(acceptLanguage)}/${bare[1]}`, status: 302 };
  }

  const page = /^\/([a-z]{2})\/(d|daily)\/([^/]+)\/?$/.exec(path);
  if (page && LANGS.includes(page[1])) {
    const [, lang, kind, raw] = page;
    const value = decodeURIComponent(raw);
    return {
      kind: 'page',
      template: `/${lang}/${kind}`,
      meta: kind === 'd' ? duelMeta(lang, value) : dailyMeta(lang, value),
    };
  }
  return { kind: 'asset' };
}
