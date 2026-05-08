import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist-extension');
const port = Number(process.env.PORT || 8080);

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(
        request.url || '/',
        `http://localhost:${port}`
    );
    const pathname = requestUrl.pathname;

    if (pathname === '/main.js') {
        try {
            const bundle = await readFile(
                path.join(distDir, 'main.js'),
                'utf8'
            );
            response.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
            });
            response.end(bundle);
        } catch {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end(
                'dist-extension/main.js not found. Run "npm run dev:extension" first.'
            );
        }
        return;
    }

    response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end(
        [
            'Epic Labs Extension Dev Server',
            '',
            `Bundle:   http://localhost:${port}/main.js`,
            '',
            'Usage:',
            `  1. Run "npm run dev:extension" in another terminal`,
            `  2. Open reader with ?debug_plugin=http://localhost:${port}/main.js`,
        ].join('\n')
    );
});

server.listen(port, '0.0.0.0', () => {
    process.stdout.write(
        `Extension dev server listening at http://localhost:${port}/main.js\n`
    );
});
