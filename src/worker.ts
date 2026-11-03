// Cloudflare Worker for altcozygames.com. Static files in site/ are served before it runs;
// it handles the rest (see routes.ts): App Link keys, redirects, and the duel and daily
// pages with a link preview made for that very link.
import assetlinks from './generated/assetlinks.json' with { type: 'json' };
import { type Meta, route } from './routes.ts';

interface Env {
  readonly ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
}

/** Sets an attribute on every matching element (HTMLRewriter handler). */
const attribute = (name: string, value: string) => ({
  element(element: { setAttribute(name: string, value: string): void }) {
    element.setAttribute(name, value);
  },
});

function withPreview(page: Response, meta: Meta): Response {
  // HTMLRewriter is a Workers global: it edits the page as it streams through.
  return new HTMLRewriter()
    .on('title', {
      element(element: { setInnerContent(text: string): void }) {
        element.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', attribute('content', meta.description))
    .on('meta[property="og:title"]', attribute('content', meta.title))
    .on('meta[property="og:description"]', attribute('content', meta.description))
    .on('meta[property="og:image"]', attribute('content', meta.image))
    .on('meta[property="og:url"]', attribute('content', meta.url))
    .on('link[rel="canonical"]', attribute('href', meta.url))
    .transform(page);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const answer = route(url, request.headers.get('accept-language'));
    switch (answer.kind) {
      case 'redirect':
        return Response.redirect(new URL(answer.location, url).toString(), answer.status);
      case 'assetlinks':
        return Response.json(assetlinks, {
          headers: { 'cache-control': 'public, max-age=3600' },
        });
      case 'page': {
        const page = await env.ASSETS.fetch(new URL(answer.template, url));
        return answer.meta && page.ok ? withPreview(page, answer.meta) : page;
      }
      default: {
        const file = await env.ASSETS.fetch(request);
        if (file.status !== 404) return file;
        const notFound = await env.ASSETS.fetch(new URL('/404', url));
        return new Response(notFound.body, { status: 404, headers: notFound.headers });
      }
    }
  },
};
