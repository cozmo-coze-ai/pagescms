export default { fetch() { return new Response('COZE homepage previews are being configured.', { status: 503, headers: { 'X-Robots-Tag': 'noindex' } }); } };
