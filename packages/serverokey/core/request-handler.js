// core/request-handler.js
const { URL, URLSearchParams } = require('url');
const fs = require('fs');
const path = require('path');
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

        if (routeConfig.auth?.required && !user) {
            this.authEngine.redirect(res, routeConfig.auth.failureRedirect || '/login');
            return;
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
                const dataFromReads = await this.connectorManager.getContext(routeConfig.reads || []);
                const dataContext = {
                    data: dataFromReads, // Все данные из reads теперь в data
                    user: user || null,
                };
                const html = await this.renderer.renderView(routeConfig, dataContext, url);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
            }

            if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const dataFromReads = await this.connectorManager.getContext(routeConfig.reads || []);
                
                const context = {
                    data: dataFromReads,
                    user: user || null,
                    body: body
                };

                const engine = new ActionEngine(context);
                await engine.run(routeConfig.steps || (routeConfig.handler ? [ { handler: routeConfig.handler } ] : []));
                
                // Если был использован handler, он мог изменить контекст напрямую
                if (routeConfig.handler) {
                    const handlerFunc = this.assetLoader.getAction(routeConfig.handler);
                    handlerFunc(engine.context, body);
                }

                const finalContext = engine.context;

                const internalActions = finalContext._internal || {};
                
                if (internalActions.loginUser && this.authEngine) {
                    const sessionId = await this.authEngine.createSession(internalActions.loginUser);
                    res.setHeader('Set-Cookie', cookie.serialize('session_id', sessionId, {
                        httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/', sameSite: 'lax'
                    }));
                }
                
                if (internalActions.logout && this.authEngine) {
                    await this.authEngine.clearSession(req, res);
                }

                for (const key of (routeConfig.writes || [])) {
                    if (finalContext.data[key]) {
                        await this.connectorManager.getConnector(key).write(finalContext.data[key]);
                    }
                }

                const responsePayload = {};
                
                if (internalActions.redirectUrl) {
                    responsePayload.redirectUrl = internalActions.redirectUrl;
                }
                
                if (routeConfig.update && !internalActions.redirectUrl) {
                     // --- КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ---
                     // Формируем ТОЧНО ТАКОЙ ЖЕ контекст, как и для 'view'
                     const componentRenderContext = {
                        data: finalContext.data,
                        user: finalContext.user,
                        // `url` и `globals` будут добавлены внутри renderComponent
                     };
                     const componentUpdate = await this.renderer.renderComponent(routeConfig.update, componentRenderContext, url);
                     Object.assign(responsePayload, componentUpdate);
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