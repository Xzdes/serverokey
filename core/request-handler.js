// core/request-handler.js
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { DataManipulator } = require('./data-manipulator.js');
const { FormulaEngine } = require('./formula-engine.js'); // Нам понадобится наш новый движок

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
                const html = this.renderer.renderView(routeConfig, this.dataManager.data);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html.replace('</body>', `<script src="/engine-client.js"></script></body>`));
            }

            if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const context = this.dataManager.getContext(routeConfig.reads);
                context.body = body;

                // --- ОБНОВЛЕННАЯ ЛОГИКА ---
                if (routeConfig.steps) {
                    // Используем новую систему "steps"
                    const engine = new FormulaEngine(context);
                    engine.run(routeConfig.steps);
                } else if (routeConfig.manipulate) {
                    // Используем декларативный манипулятор
                    const manipulator = new DataManipulator(context, this.assetLoader);
                    manipulator.execute(routeConfig.manipulate);
                } else if (routeConfig.handler) {
                    // Используем старый способ через JS-файл
                    const handler = this.assetLoader.getAction(routeConfig.handler);
                    handler(context, body);
                } else {
                    throw new Error(`Action route ${routeKey} has no 'steps', 'manipulate', or 'handler' defined.`);
                }
                
                delete context.body;

                routeConfig.writes.forEach(key => {
                    this.dataManager.updateAndSave(key, context[key]);
                });

                const componentName = routeConfig.update;
                const { html, styles } = this.renderer.renderComponent(componentName, this.dataManager.data);
                
                const styleTag = styles ? `<style>${styles}</style>` : '';
                const finalHtml = `${styleTag}${html}`;

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(finalHtml);
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