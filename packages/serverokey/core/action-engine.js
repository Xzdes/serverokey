// core/action-engine.js
const http = require('http');
const https = require('https');
const { z } = require('zod'); // <-- Импортируем Zod

// --- ИЗМЕНЕНИЕ: Упрощаем evaluate, он больше не скрывает ошибки ---
function evaluate(expression, context) {
    if (typeof expression !== 'string') return expression;
    // Мы передаем zod в контекст, поэтому он будет доступен внутри функции
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);
    // Выражение выполняется и может выбросить исключение (например, при ошибке валидации Zod)
    const func = new Function(...contextKeys, `return ${expression};`);
    return func(...contextValues);
}

// --- Старая, более сложная версия HTTP GET без изменений ---
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
    constructor(context) {
        // Клонируем контекст, чтобы избежать мутаций
        this.context = JSON.parse(JSON.stringify(context));
        // --- НОВЫЙ БЛОК: Добавляем Zod в контекст ПОСЛЕ клонирования ---
        this.context.zod = z;
    }

    async run(steps) {
        if (!Array.isArray(steps)) return;
        for (const step of steps) {
            await this.executeStep(step);
        }
    }

    // --- ИЗМЕНЕНИЕ: Оборачиваем выполнение шага в try/catch ---
    async executeStep(step) {
        try {
            if (step.set) {
                const value = evaluate(step.to, this.context);
                this._setValue(step.set, value);
            } else if (step.if) {
                const condition = evaluate(step.if, this.context);
                if (condition && step.then) {
                    await this.run(step.then);
                } else if (!condition && step.else) {
                    await this.run(step.else);
                }
            } else if (step.forEach) {
                const list = evaluate(step.forEach, this.context);
                const itemName = step.as || 'item';
                if (Array.isArray(list)) {
                    for (const item of list) {
                        const loopContext = { ...this.context, [itemName]: item };
                        const loopEngine = new ActionEngine(loopContext);
                        await loopEngine.run(step.steps);
                        Object.assign(item, loopEngine.context[itemName]);
                    }
                }
            } else if (step['http:get']) {
                const config = step['http:get'];
                const url = evaluate(config.url, this.context);
                console.log(`[ActionEngine] Performing HTTP GET: ${url}`);
                try {
                    const data = await httpGet(url);
                    this._setValue(config.saveTo, data);
                } catch (error) {
                    console.error(`[ActionEngine] HTTP GET request to ${url} failed:`, error);
                    this._setValue(config.saveTo, { error: error.message });
                }
            } else {
                console.warn('[ActionEngine] Unknown or incomplete step:', step);
            }
        } catch (error) {
            // Если любой шаг (включая evaluate) выбрасывает ошибку, мы ловим ее здесь.
            console.error(`\n💥 [ActionEngine] Step execution failed!`);
            console.error(`   Step: ${JSON.stringify(step)}`);
            console.error(`   Error: ${error.message}\n`);
            // Пробрасываем ошибку дальше, чтобы остановить весь запрос.
            // RequestHandler поймает ее и вернет 500 Internal Server Error.
            throw error; 
        }
    }

    _setValue(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (obj[key] === undefined || obj[key] === null) {
                obj[key] = {};
            }
            return obj[key];
        }, this.context);
        target[lastKey] = value;
    }
}

module.exports = { ActionEngine };