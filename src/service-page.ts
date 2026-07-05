export function servicePageHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tabula JSON Store</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
      main { width: min(560px, calc(100vw - 48px)); }
      h1 { font-size: 28px; margin: 0 0 12px; }
      p { color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 16px; line-height: 1.55; margin: 0; }
      a { color: inherit; text-underline-offset: 4px; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    </style>
  </head>
  <body>
    <main>
      <h1>Tabula JSON Store</h1>
      <p>Encrypted snapshot storage for <code>Tabula.md</code> share links.</p>
      <p>The server cannot decrypt stored snapshots.</p>
      <p>Snapshots are retained for a limited window before they expire.</p>
      <p><a href="https://github.com/tabula-md/tabula-json" rel="noreferrer">Read more on GitHub</a>.</p>
    </main>
  </body>
</html>`;
}
