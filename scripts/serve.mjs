import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

try {
  await stat(resolve(root, 'index.html'));
} catch {
  console.error('The built game is missing. Run npm ci and npm run build in this folder.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Sunspoke-Coast', '1');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let target;
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`) || target.includes('\0')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
  } catch {
    response.writeHead(400).end('Invalid URL');
    return;
  }
  try {
    const file = await stat(target);
    if (!file.isFile()) {
      response.writeHead(404).end('File not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': file.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end('File not found');
  }
});

let port = 4173;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 4193) {
    port += 1;
    server.listen(port, '127.0.0.1');
  } else {
    console.error(`The local server could not start. ${error.message}`);
    process.exitCode = 1;
  }
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Sunspoke Coast is ready at ${url}`);
  console.log('Keep this window open while playing. Press Ctrl+C to stop the server.');
  if (process.argv.includes('--no-open')) return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log(`Open ${url} in your browser to play.`));
  browser.unref();
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
server.listen(port, '127.0.0.1');
