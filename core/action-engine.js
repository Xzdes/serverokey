// core/action-engine.js
const http = require('http');
const https = require('https'); // <-- Вот здесь была ошибка, теперь она исправлена.

// Безопасная функция для выполнения выражений (без изменений)
function evaluate(expression, context) {
    if (typeof expression !== 'string') return expression;
    try {
        const contextKeys = Object.keys(context);
        const contextValues = Object.values(context);
        const func = new Function(...contextKeys, `return ${expression};`);
        return func(...contextValues);
    } catch (e) {
        console.warn(`[ActionEngine] Could not evaluate expression "${expression}". Returning as a string.`, e.message);
        return expression;
    }
}

// --- Финальная, отказоустойчивая версия HTTP GET ---
function httpGet(url) {
    const client = url.startsWith('https://') ? https : http;
    const REQUEST_TIMEOUT = 5000; // 5 секунд

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
                // Успех! Очищаем таймаут.
                req.destroy(); // Убедимся, что все ресурсы освобождены
                try {
                    resolve(JSON.parse(rawData));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response: ${e.message}`));
                }
            });
        });

        // Обработчик ошибок соединения
        req.on('error', (e) => {
            reject(new Error(`Request Error: ${e.message}`));
        });

        // --- Главное изменение: добавляем таймаут ---
        req.setTimeout(REQUEST_TIMEOUT, () => {
            // Запрос занял слишком много времени, прерываем его.
            req.destroy(); // Обязательно "убиваем" запрос, чтобы он не висел впустую.
            // Отклоняем Promise с понятной ошибкой.
            reject(new Error(`Request timed out after ${REQUEST_TIMEOUT}ms`));
        });
    });
}


class ActionEngine {
    constructor(context) {
        this.context = JSON.parse(JSON.stringify(context));
    }

    async run(steps) {
        if (!Array.isArray(steps)) return;
        for (const step of steps) {
            await this.executeStep(step);
        }
    }

    async executeStep(step) {
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