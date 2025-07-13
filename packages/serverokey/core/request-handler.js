// core/request-handler.js
const { URL, URLSearchParams } = require('url');
const fs = require('fs');
const path = require('path');
const { OperationHandler } = require('./operation-handler.js');
const { ActionEngine } = require('./action-engine.js');
const { AuthEngine } = require('./auth-engine.js'); 
const cookie = require('cookie');

class RequestHandler {
    constructor(manifest, connectorManager, assetLoader, renderer, modulePath, options = {}) {
        this.manifest = manifest;
        this.connectorManager = connectorManager;
        this.assetLoader = assetLoader;
        this.renderer = renderer;
        this.modulePath = modulePath;
        this.debug = options.debug || false;
        
        this.authEngine = null; 
        this.userConnector = null;
        this.authInitPromise = this._initializeAuthEngine();
    }

    async _initializeAuthEngine() {
        if (this.manifest.auth) {
            try {
                this.userConnector = this.connectorManager.getConnector(this.manifest.auth.userConnector);
                const sessionConnector = this.connectorManager.getConnector('session');
                
                await Promise.all([this.userConnector.initPromise, sessionConnector.initPromise]);
                
                this.authEngine = new AuthEngine(this.manifest, this.userConnector.collection, sessionConnector.collection);
                
            } catch (e) {
                console.error("CRITICAL: Failed to initialize AuthEngine. Auth will be disabled.", e);
                this.authEngine = null;
            }
        }
    }

    async handle(req, res) {
        await this.authInitPromise;

        const url = new URL(req.url, `http://${req.headers.host}`);
        const routeKey = `${req.method} ${url.pathname}`;
        
        let user = null;
        if (this.authEngine) {
            const session = await this.authEngine.getSession(req);
            if (session && session.userId) {
                user = await this.userConnector.collection.getById(session.userId);
            }
        }

        if (routeKey === 'GET /engine-client.js') {
            const clientScriptPath = path.resolve(__dirname, '..', 'engine-client.js'); 
            res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(fs.readFileSync(clientScriptPath));
            return;
        }

        const routeConfig = this.manifest.routes[routeKey];
        if (!routeConfig) {
            res.writeHead(404).end('Not Found');
            return;
        }

        if (this.authEngine && routeConfig.auth?.required) {
            if (!user) {
                this.authEngine.redirect(res, routeConfig.auth.failureRedirect || '/login');
                return;
            }
        }
        
        try {
            if (this.authEngine && routeConfig.type.startsWith('auth:')) {
                const body = await this._parseBody(req);
                switch (routeConfig.type) {
                    case 'auth:register':
                        try {
                            await this.authEngine.register(body);
                            this.authEngine.redirect(res, routeConfig.successRedirect || '/');
                        } catch (e) {
                            if (this.debug) console.error('[Auth] Registration failed:', e.message);
                            this.authEngine.redirect(res, routeConfig.failureRedirect || '/register?error=1');
                        }
                        break;
                    case 'auth:login':
                        try {
                            const loggedInUser = await this.authEngine.login(body);
                            const sessionId = await this.authEngine.createSession(loggedInUser);
                            res.setHeader('Set-Cookie', cookie.serialize('session_id', sessionId, {
                                httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/', sameSite: 'lax'
                            }));
                            this.authEngine.redirect(res, routeConfig.successRedirect || '/');
                        } catch (e) {
                            if (this.debug) console.error('[Auth] Login failed:', e.message);
                            this.authEngine.redirect(res, routeConfig.failureRedirect || '/login?error=1');
                        }
                        break;
                    case 'auth:logout':
                        await this.authEngine.clearSession(req, res);
                        this.authEngine.redirect(res, routeConfig.successRedirect || '/login');
                        break;
                    default:
                        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(`Unknown auth route type: ${routeConfig.type}`);
                }
                return;
            }

            if (routeConfig.type === 'view') {
                const readKeys = new Set(routeConfig.reads || []);
                // --- ИЗМЕНЕНИЕ: Мы больше не читаем 'user' через getContext, так как уже получили его
                readKeys.delete('user');
                const dataContext = await this.connectorManager.getContext(Array.from(readKeys));
                
                if (user) {
                    dataContext.user = user;
                }

                const html = await this.renderer.renderView(routeConfig, dataContext, url);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
            }

            if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const readKeys = new Set(routeConfig.reads || []);
                readKeys.delete('user');
                const context = await this.connectorManager.getContext(Array.from(readKeys));

                if (user) {
                    context.user = user;
                }
                
                context.body = body;

                let finalContext = context;

                if (routeConfig.steps) {
                    const engine = new ActionEngine(context);
                    await engine.run(routeConfig.steps);
                    finalContext = engine.context;
                } else if (routeConfig.handler) {
                    const handler = this.assetLoader.getAction(routeConfig.handler);
                    handler(finalContext, body);
                } else {
                    throw new Error(`Action route ${routeKey} has no 'steps' or 'handler' defined.`);
                }
                
                delete finalContext.body;
                delete finalContext.zod; // Удаляем служебный объект zod перед записью

                for (const key of routeConfig.writes) {
                    if (key === 'user') continue; 
                    const connector = this.connectorManager.getConnector(key);
                    await connector.write(finalContext[key]);
                }

                const globalContext = await this.renderer._getGlobalContext(url);
                
                if (user) {
                    finalContext.user = user;
                }

                const renderDataContext = { ...finalContext };
                
                const componentName = routeConfig.update;
                const { html, styles, scripts } = await this.renderer.renderComponent(componentName, renderDataContext, globalContext);
                
                const responsePayload = { html, styles, scripts, componentName };

                if (this.debug) {
                    console.log(`\n🐞 [DEBUG] Action '${routeKey}' completed. Sending payload to update '${componentName}':`);
                    console.dir(responsePayload, { depth: 2 });
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(responsePayload));
            }
        } catch (error) {
            console.error(`[Engine] Error processing route ${routeKey}:`, error);
            res.writeHead(500).end('Internal Server Error');
        }
    }

    _parseBody(req) {
        const contentType = req.headers['content-type'] || '';
        const MAX_BODY_SIZE = 1e6;

        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;

            req.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BODY_SIZE) {
                    req.socket.destroy(); 
                    reject(new Error('Payload Too Large'));
                    return; 
                }
                body += chunk.toString();
            });

            req.on('end', () => {
                try {
                    if (contentType.includes('application/json')) {
                        resolve(body ? JSON.parse(body) : {});
                    } else if (contentType.includes('application/x-www-form-urlencoded')) {
                        const params = new URLSearchParams(body);
                        resolve(Object.fromEntries(params.entries()));
                    } else {
                        resolve({});
                    }
                } catch (e) {
                    reject(new Error('Invalid request body'));
                }
            });

            req.on('error', err => {
                reject(err);
            });
        });
    }
}

module.exports = { RequestHandler };