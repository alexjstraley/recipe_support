const http = require("http");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const publicFiles = new Set(require("./public-files").map(file => "/" + file));
const securityHeaders = require("./security-headers");

const server = http.createServer((req, res) => {
  for (const [name,value] of Object.entries(securityHeaders)) res.setHeader(name,value);
  if (!["GET","HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }); res.end("Method not allowed"); return;
  }
  const acceptedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `${host}:${port}`]);
  if (!acceptedHosts.has(req.headers.host)) { res.writeHead(400); res.end("Invalid host"); return; }
  let url;
  try { url = new URL(req.url, `http://127.0.0.1:${port}`); }
  catch { res.writeHead(400); res.end("Invalid request"); return; }
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!publicFiles.has(pathname)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const filePath = path.join(root, pathname);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const type =
      ext === ".html" ? "text/html" :
      ext === ".css" ? "text/css" :
      ext === ".js" ? "text/javascript" :
      "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

server.listen(port, host, () => {
  const url = `http://127.0.0.1:${port}/index.html`;
  console.log(`Recipe Support is running at ${url}`);
  if (!process.env.NO_OPEN) childProcess.exec(`cmd /c start "" "${url}"`);
});

server.on("error", (error) => {
  console.error("Could not start the local server.");
  console.error(error.message);
  console.error("");
  console.error("If another copy is already open, close that window and try start-site.cmd again.");
  process.exit(1);
});
