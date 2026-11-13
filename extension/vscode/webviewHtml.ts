// ── Webview HTML (sof funksiya — vscode importisiz, test qilinadi) ──
// Vite yasagan index.html'ni VS Code webview'iga moslaydi:
//   1) nisbiy asset URL'larini webview URI'lariga aylantiradi;
//   2) Content-Security-Policy qo'yadi — "faqat lokal" va'dasini BRAUZER darajasida
//      majburlaydi: tashqi tarmoqqa ulanish, begona skript/rasm/shrift yuklash
//      taqiqlanadi. Faqat kengaytmaning o'z fayllari (cspSource) ruxsat etiladi.
//   3) runtime asset bazasi skriptini (nonce bilan) qo'shadi.

/** Webview uchun qat'iy CSP. `style-src 'unsafe-inline'` — index.html'dagi
 *  <style> va React'ning inline `style={...}` atributlari uchun zarur (skript
 *  emas — XSS kodi ishga tushirilmaydi). `blob:`/`data:` — surat/klip eksporti
 *  va canvas teksturalari uchun. `connect-src` faqat o'z fayllarimiz (Vite
 *  modulepreload polyfill'i fetch ishlatadi) — tashqi tarmoq YO'Q. */
export function webviewCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} data: blob:`,
    `media-src ${cspSource} blob:`,
    `font-src ${cspSource}`,
    `connect-src ${cspSource}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

export function buildWebviewHtml(
  html: string,
  opts: { toUri: (file: string) => string; cspSource: string; nonce: string; assetBase: string },
): string {
  // Nisbiy asset URL'larini webview URI'lariga aylantiramiz.
  let out = html.replace(/(href|src)="\.?\/([^"]+)"/g, (_m, attr, file) => `${attr}="${opts.toUri(file)}"`);
  // Modul skriptlariga nonce (cspSource ham ruxsat beradi — ikki tomonlama kafolat).
  out = out.replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${opts.nonce}"`);
  const csp = `<meta http-equiv="Content-Security-Policy" content="${webviewCsp(opts.cspSource, opts.nonce)}">`;
  const base = `<script nonce="${opts.nonce}">window.__ASSET_BASE__ = ${JSON.stringify(opts.assetBase)};</script>`;
  // CSP <head>ning ENG BOSHIDA bo'lishi kerak — undan oldingi elementlarga qo'llanmaydi.
  return out.replace(/<head>/i, `<head>${csp}${base}`);
}
