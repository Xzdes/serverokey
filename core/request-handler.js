// core/request-handler.js
// Центральный обработчик запросов. Оркестратор.
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

class RequestHandler {
    constructor(manifest, dataManager, assetLoader, renderer) {
        this.manifest = manifest;
        this.dataManager = dataManager;
        this.assetLoader = assetLoader;
        this.renderer = renderer;
    }

    async handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const routeKey = `${req.method} ${url.pathname}`;

        // Отдача клиентского скрипта
        if (routeKey === 'GET /engine-client.js') {
            const clientScriptPath = path.join(process.cwd(), 'engine-client.js');
            res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(fs.readFileSync(clientScriptPath));
            return;
        }

        const routeConfig = this.manifest.routes[routeKey];
        if (!routeConfig) {
            res.writeHead(404).end('Not Found');
            return;
        }
        
        try {
            if (routeConfig.type === 'view') {
                let html = this.renderer.renderView(routeConfig, this.dataManager.data);
                html = html.replace('</body>', `<script src="/engine-client.js"></script></body>`);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
            }

            if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const handler = this.assetLoader.getAction(routeConfig.handler);
                const context = this.dataManager.getContext(routeConfig.reads);

                handler(context, body);
                
                routeConfig.writes.forEach(key => {
                    this.dataManager.updateAndSave(key, context[key]);
                });

                const updatedHtml = this.renderer.renderComponent(routeConfig.update, this.dataManager.data);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(updatedHtml);
            }
        } catch (error) {
            console.error(`[Engine] Error processing route ${routeKey}:`, error);
            res.writeHead(500).end('Internal Server Error');
        }
    }

    _parseBody(req) {
        return new Promise(resolve => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(JSON.parse(data || '{}')));
        });
    }
}

module.exports = { RequestHandler };