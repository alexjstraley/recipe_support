const http = require("http");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const root = __dirname;
const port = 4173;
const host = "0.0.0.0";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
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
    res.end(data);
  });
});

server.listen(port, host, () => {
  const url = `http://127.0.0.1:${port}/index.html`;
  console.log(`Recipe Support is running at ${url}`);
  childProcess.exec(`cmd /c start "" "${url}"`);
});

server.on("error", (error) => {
  console.error("Could not start the local server.");
  console.error(error.message);
  console.error("");
  console.error("If another copy is already open, close that window and try start-site.cmd again.");
  process.exit(1);
});
