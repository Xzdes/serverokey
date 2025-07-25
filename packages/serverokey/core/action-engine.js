// packages/serverokey/core/action-engine.js
const http = require('http');
const https = require('https');
const { z, ZodError } = require('zod');
const path = require('path');

/**
 * Безопасно вычисляет JavaScript-выражение в заданном контексте.
 * @param {string} expression - Выражение для вычисления.
 * @param {object} context - Контекст с данными (data, user, body, context).
 * @param {string} appPath - Путь к приложению для разрешения модулей.
 * @param {boolean} debug - Флаг отладки.
 * @returns {*} - Результат вычисления или undefined в случае ошибки.
 */
function evaluate(expression, context, appPath, debug = false) {
    if (typeof expression !== 'string') return expression;

    try {
        const func = new Function('ctx', 'require', `
            with (ctx) {
                return (${expression});
            }
        `);
        
        const smartRequire = (module) => {
            try { return require(module); } catch (e) {
            try { return require(path.resolve(appPath, module)); } catch (e2) {
            try { return require(path.resolve(appPath, 'app', module)); } catch (e3) {
            try { return require(path.resolve(appPath, 'app', 'actions', module)); } catch (e4) {
                console.error(`[smartRequire] Failed to resolve module '${module}'`);
                throw e4;
            }}}}
        };
        
        context.zod = z;

        return func(context, smartRequire);

    } catch (error) {
        // Если это ошибка валидации Zod, мы НЕ "прощаем" ее, а пробрасываем наверх,
        // чтобы ActionEngine мог ее перехватить и остановить выполнение.
        if (error instanceof ZodError) {
            throw error;
        }

        // Для всех остальных ошибок (синтаксис, доступ к полям) сохраняем старое поведение:
        // выводим предупреждение и возвращаем undefined.
        if (debug) {
            console.warn(`[ActionEngine] Evaluate warning for expression "${expression}": ${error.message}`);
        }
        return undefined;
    }
}

/**
 * Выполняет GET-запрос к внешнему API.
 * @param {string} url - URL для запроса.
 * @returns {Promise<object>} - Промис, который разрешается с JSON-ответом.
 */
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
    constructor(context, appPath, assetLoader, requestHandler, debug = false) {
        this.context = JSON.parse(JSON.stringify(context));
        this.appPath = appPath;
        this.assetLoader = assetLoader;
        this.requestHandler = requestHandler;
        this.debug = debug;
        this.context._internal = {}; 
        
        if (this.debug && this.context.body && Object.keys(this.context.body).length > 0) {
            console.log('🐞 [ActionEngine] Executing with body:', this.context.body);
        }
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
                const value = evaluate(step.to, this.context, this.appPath, this.debug);
                this._setValue(step.set, value);
            } else if (step.if) {
                const condition = evaluate(step.if, this.context, this.appPath, this.debug);
                if (condition) {
                    if(step.then) await this.run(step.then);
                } else {
                    if(step.else) await this.run(step.else);
                }
            } else if (step.forEach) {
                const list = evaluate(step.forEach, this.context, this.appPath, this.debug);
                const itemName = step.as || 'item';
                if (Array.isArray(list)) {
                    for (const item of list) {
                        const loopEngine = new ActionEngine({ ...this.context, [itemName]: item }, this.appPath, this.assetLoader, this.requestHandler, this.debug);
                        await loopEngine.run(step.steps);
                        Object.assign(this.context, loopEngine.context);
                        Object.assign(item, loopEngine.context[itemName]);
                    }
                }
            } else if (step['http:get']) {
                const config = step['http:get'];
                const url = evaluate(config.url, this.context, this.appPath, this.debug);
                try {
                    const data = await httpGet(url);
                    this._setValue(config.saveTo, data);
                } catch (error) {
                    this._setValue(config.saveTo, { error: error.message });
                }
            } else if (step['auth:login']) {
                this.context._internal.loginUser = evaluate(step['auth:login'], this.context, this.appPath, this.debug);
            } else if (step['auth:logout']) {
                this.context._internal.logout = true;
            } else if (step['client:redirect']) {
                const redirectValue = evaluate(step['client:redirect'], this.context, this.appPath, this.debug);
                this.context._internal.redirect = redirectValue;
                this.context._internal.interrupt = true;
            } 
            else if (step.run) {
                let handlerName = step.run;
                if (handlerName.endsWith('.js')) {
                    handlerName = handlerName.slice(0, -3);
                }
                const pathParts = handlerName.split(/[\\/]/);
                handlerName = pathParts[pathParts.length - 1];

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
                
                const subContext = {
                    user: this.context.user,
                    body: this.context.body,
                    data: this.context.data
                };
                
                const resultContext = await this.requestHandler.runAction(
                    targetActionName, 
                    subContext, 
                    null,
                    null,
                    this.debug
                );
                
                Object.assign(this.context.data, resultContext.data);
            }
            else {
                console.warn('[ActionEngine] Unknown or incomplete step:', step);
            }
        } catch (error) {
            const errorMessage = `Step execution failed! Step: ${JSON.stringify(step)}. Error: ${error.message}`;
            console.error(`\n💥 [ActionEngine] ${errorMessage}\n`);
            throw new Error(errorMessage, { cause: error });
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