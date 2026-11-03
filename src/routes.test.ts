import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { dailyMeta, duelMeta, parseDuel, pickLang, route } from './routes.ts';

const at = (path: string) => new URL(path, 'https://altcozygames.com');

describe('pickLang', () => {
  it('takes the first supported language, by weight', () => {
    assert.equal(pickLang('pt-BR,pt;q=0.9,en;q=0.8'), 'pt');
    assert.equal(pickLang('nl-NL,de;q=0.7,en;q=0.9'), 'en');
    assert.equal(pickLang('zh-Hans-CN'), 'zh');
  });

  it('falls back to English', () => {
    assert.equal(pickLang(null), 'en');
    assert.equal(pickLang('nl'), 'en');
  });
});

describe('parseDuel', () => {
  it('reads a code like the app', () => {
    assert.deepEqual(parseDuel('k2-K3JD9A8F-7J'), {
      variant: 'killer',
      tier: 'medium',
      code: 'K2-k3jd9a8f-7j',
      seconds: parseInt('7j', 36),
    });
  });

  it('refuses tiers a variant does not have and malformed codes', () => {
    assert.equal(parseDuel('K4-abc-1y'), null); // no insane killer
    assert.equal(parseDuel('X1-abc-1y'), null);
    assert.equal(parseDuel('C1-abc'), null);
  });
});

describe('link previews', () => {
  it('names the duel in the link language', () => {
    const meta = duelMeta('pt', 'K3-abc123-3n')!;
    assert.equal(meta.title, 'Desafio de sudoku · Killer · Difícil');
    assert.equal(meta.description, 'Um amigo resolveu em 2:11. Consegue bater?');
    assert.equal(meta.image, 'https://altcozygames.com/og/duel-killer-hard.jpg');
    assert.equal(meta.url, 'https://altcozygames.com/pt/d/K3-abc123-3n');
  });

  it('dates the daily', () => {
    const meta = dailyMeta('en', '2026-11-03')!;
    assert.equal(meta.title, 'Daily challenge · November 3');
    assert.equal(dailyMeta('en', '2026-02-30'), null);
  });
});

describe('route', () => {
  it('serves the App Link keys', () => {
    assert.deepEqual(route(at('/.well-known/assetlinks.json'), null), { kind: 'assetlinks' });
  });

  it('sends language-less paths to the visitor language', () => {
    assert.deepEqual(route(at('/sudoku'), 'fr-FR'), {
      kind: 'redirect',
      location: '/fr/sudoku',
      status: 302,
    });
    assert.deepEqual(route(at('/d/K2-abc-1y'), 'ja'), {
      kind: 'redirect',
      location: '/ja/d/K2-abc-1y',
      status: 302,
    });
  });

  it('moves the first links (GitHub Pages paths) to the new ones', () => {
    assert.deepEqual(route(at('/advanced-sudoku/duel/?c=C1-415o0fb18g-1y'), null), {
      kind: 'redirect',
      location: '/d/C1-415o0fb18g-1y',
      status: 301,
    });
    assert.equal((route(at('/advanced-sudoku/privacy/'), null) as { location: string }).location, '/sudoku/privacy');
  });

  it('serves the duel template with its preview', () => {
    const answer = route(at('/es/d/C1-415o0fb18g-1y'), null);
    assert.equal(answer.kind, 'page');
    if (answer.kind !== 'page') return;
    assert.equal(answer.template, '/es/d');
    assert.equal(answer.meta?.title, 'Desafío de sudoku · Clásico · Fácil');
  });

  it('keeps the plain template for a broken code, and leaves other paths to the files', () => {
    assert.deepEqual(route(at('/pt/d/nonsense'), null), {
      kind: 'page',
      template: '/pt/d',
      meta: null,
    });
    assert.deepEqual(route(at('/xx/d/K2-abc-1y'), null), { kind: 'asset' });
  });
});
