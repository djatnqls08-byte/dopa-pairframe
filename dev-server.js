// 내 컴퓨터에서 확인할 때만 쓰는 정적 서버 (배포에는 필요 없음)
const http = require("http"), fs = require("fs"), path = require("path");
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".css": "text/css", ".svg": "image/svg+xml" };
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(__dirname, path.normalize(p).replace(/^([\/])+/, ""));
  if (!f.startsWith(__dirname)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end("not found"); } r.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); r.end(b); });
}).listen(5178, () => console.log("pairframe on 5178"));
