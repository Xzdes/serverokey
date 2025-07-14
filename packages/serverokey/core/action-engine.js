// core/action-engine.js
const http = require('http');
const https = require('https');
const { z } = require('zod');
const path = require('path');

function evaluate(expression, context, appPath) {
    if (typeof expression !== 'string') return expression;
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);
    const func = new Function(...contextKeys, 'require', `return ${expression};`);
    return func(...contextValues, (module) => {
        try {
            return require(module);
        } catch (e) {
            try {
                return require(path.resolve(appPath, module));
            } catch (e2) {
                return require(path.resolve(appPath, 'app', module));
            }
        }
    });
}

function httpGet(url) {
    const client = url.startsWith('https://') ? https : http;
    const REQUEST_TIMEOUT = 5000;

    return new Promise((resolve, reject) => {
        const req = client.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpGet(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
            }

            let rawData = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                req.destroy();
                try {
                    resolve(JSON.parse(rawData));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response: ${e.message}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Request Error: ${e.message}`)));
        req.setTimeout(REQUEST_TIMEOUT, () => {
            req.destroy();
            reject(new Error(`Request timed out after ${REQUEST_TIMEOUT}ms`));
        });
    });
}


class ActionEngine {
    constructor(context, appPath, assetLoader, requestHandler) {
        this.context = JSON.parse(JSON.stringify(context));
        this.context.zod = z;
        this.appPath = appPath;
        this.assetLoader = assetLoader;
        this.requestHandler = requestHandler;
        this.context._internal = {}; 
    }

    async run(steps) {
        if (!Array.isArray(steps)) return;
        for (const step of steps) {
            if (this.context._internal.interrupt) break;
            await this.executeStep(step);
        }
    }

    async executeStep(step) {
        try {
            if (step.set) {
                const value = evaluate(step.to, this.context, this.appPath);
                this._setValue(step.set, value);
            } else if (step.if) {
                const condition = evaluate(step.if, this.context, this.appPath);
                if (condition && step.then) {
                    await this.run(step.then);
                } else if (!condition && step.else) {
                    await this.run(step.else);
                }
            } else if (step.forEach) {
                const list = evaluate(step.forEach, this.context, this.appPath);
                const itemName = step.as || 'item';
                if (Array.isArray(list)) {
                    for (const item of list) {
                        const loopEngine = new ActionEngine({ ...this.context, [itemName]: item }, this.appPath, this.assetLoader, this.requestHandler);
                        await loopEngine.run(step.steps);
                        Object.assign(this.context, loopEngine.context);
                        Object.assign(item, loopEngine.context[itemName]);
                    }
                }
            } else if (step['http:get']) {
                const config = step['http:get'];
                const url = evaluate(config.url, this.context, this.appPath);
                try {
                    const data = await httpGet(url);
                    this._setValue(config.saveTo, data);
                } catch (error) {
                    this._setValue(config.saveTo, { error: error.message });
                }
            } else if (step['auth:login']) {
                this.context._internal.loginUser = evaluate(step['auth:login'], this.context, this.appPath);
            } else if (step['auth:logout']) {
                this.context._internal.logout = true;
            } else if (step['client:redirect']) {
                this.context._internal.redirectUrl = evaluate(step['client:redirect'], this.context, this.appPath);
                this.context._internal.interrupt = true;
            } 
            else if (step.run) {
                const handlerName = step.run;
                const handler = this.assetLoader.getAction(handlerName);
                if (handler) {
                    await handler(this.context, this.context.body);
                } else {
                    throw new Error(`[ActionEngine] Handler '${handlerName}' not found for 'run' step.`);
                }
            }
            else if (step['action:run']) {
                const config = step['action:run'];
                const targetActionName = config.name;
                const targetActionRoute = this.requestHandler.findRoute(targetActionName);

                if (!targetActionRoute) {
                    throw new Error(`[ActionEngine] Action '${targetActionName}' not found for 'action:run' step.`);
                }
                
                const withData = config.with ? evaluate(config.with, this.context, this.appPath) : {};

                const subContext = {
                    user: this.context.user,
                    body: this.context.body,
                    data: { ...this.context.data, ...withData }
                };
                
                const resultContext = await this.requestHandler.runAction(targetActionName, subContext, null);

                if(config.saveTo) {
                    this._setValue(config.saveTo, resultContext);
                } else {
                    Object.assign(this.context.data, resultContext.data);
                }
            }
            else {
                console.warn('[ActionEngine] Unknown or incomplete step:', step);
            }
        } catch (error) {
            console.error(`\n💥 [ActionEngine] Step execution failed!`);
            console.error(`   Step: ${JSON.stringify(step)}`);
            console.error(`   Error: ${error.message}\n`);
            throw error;
        }
    }

    _setValue(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.context;
        for (const key of keys) {
            if (target[key] === undefined || target[key] === null) {
                target[key] = {};
            }
            target = target[key];
        }
        target[lastKey] = value;
    }
}

module.exports = { ActionEngine };