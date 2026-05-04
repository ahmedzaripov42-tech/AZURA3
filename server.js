// AZURA local dev server.
// Mirrors Cloudflare Pages cache behavior: long cache for versioned assets,
// no cache for index.html / sw.js / api responses.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
  ".woff": "font/woff"
};

function cacheFor(ext, reqPath) {
  if (ext === ".html" || reqPath.endsWith("/sw.js") || reqPath === "/_worker.js") {
    return "no-cache, must-revalidate";
  }
  if ([".js",".css",".webp",".svg",".png",".jpg",".jpeg",".woff2",".woff"].includes(ext)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-store";
}

http.createServer((req, res) => {
  let reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  let filePath = path.normalize(path.join(root, reqPath));
  if (!filePath.startsWith(root)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) filePath = path.join(root, "index.html");
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Server xatosi");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": cacheFor(ext, reqPath),
        "X-Content-Type-Options": "nosniff"
      });
      res.end(data);
    });
  });
}).listen(port, () => {
  console.log(`AZURA local server: http://localhost:${port}`);
});
