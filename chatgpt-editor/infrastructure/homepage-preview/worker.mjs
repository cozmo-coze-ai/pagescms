// Isolated, static design previews. No production Worker bindings or API code.
const STATIC = /\.(?:css|js|mjs|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|webmanifest)$/i;
const PUBLIC_ROUTE = /^\/(?:[a-z0-9-]+\/)*$/;
const MANUAL_ROUTES = new Set(['ananda', 'b9', 'bs', 'f9', 'fb', 'gk', 'gka', 'gkb', 'ht', 'hta', 'htb', 'jt', 'jts', 'l9', 'prana', 'sa', 'sg', 'sj', 'yt']);
const isManual = path => {
  const parts = path.split('/').filter(Boolean);
  const route = ['ko', 'ja', 'zh'].includes(parts[0]) ? parts[1] : parts[0];
  return route === 'manual' || MANUAL_ROUTES.has(route);
};
export function allowedPreviewPath(path) {
  return !isManual(path) && ((PUBLIC_ROUTE.test(path) && !path.startsWith('/api/')) || (!path.startsWith('/api/') && !path.includes('..') && STATIC.test(path)));
}
export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Preview only', { status: 405 });
    const url = new URL(request.url);
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    if (!allowedPreviewPath(url.pathname)) return new Response('Only static public pages and assets are available in this preview.', { status: 404 });
    let response = await env.ASSETS.fetch(request);
    if (PUBLIC_ROUTE.test(url.pathname) && response.ok && request.method === 'GET') {
      // The widget checks origin, iframe source and exact commit before acknowledging.
      const script = `<script>addEventListener('load',()=>parent.postMessage({type:'coze-preview-loaded',commit:document.querySelector('meta[name="coze-build"]')?.content},'*'))</script>`;
      response = new HTMLRewriter().on('body', { element(element) { element.append(script, { html: true }); } }).transform(response);
    }
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'");
    return new Response(response.body, { status: response.status, headers });
  },
};
