// core/connectors/json-connector.js
const fs = require('fs');
const path = require('path');
const { FormulaParser } = require('../formula-parser.js');

class JsonConnector {
    constructor(name, config, appPath) {
        this.name = name;
        this.config = config;
        this.appPath = appPath;
        this.filePath = path.join(this.appPath, 'app', 'data', `${this.name}.json`);
        this.data = null;
        this.initPromise = this.load();
    }

    async read() {
        await this.initPromise;
        // Возвращаем глубокую копию данных
        return JSON.parse(JSON.stringify(this.data));
    }

    async write(newData) {
        // Записываем новые данные и сохраняем в файл.
        this.data = JSON.parse(JSON.stringify(newData));
        this._runComputations();
        await this.save();
    }
    
    async load() {
        console.log(`[JsonConnector] Loading data for '${this.name}'...`);
        try {
            if (!fs.existsSync(this.filePath)) {
                 // Если файла нет, создаем его с initialState
                 console.log(`[JsonConnector] File not found for '${this.name}'. Creating with initial state.`);
                 this.data = this.config.initialState || {};
                 await this.save();
            } else {
                this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
            }
        } catch (e) {
            console.error(`[JsonConnector] Error loading or creating file for '${this.name}'. Using empty state.`, e);
            this.data = this.config.initialState || {};
        }
    }

    async save() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
            console.log(`[JsonConnector] Data source '${this.name}' saved to ${this.filePath}.`);
        } catch(e) {
            console.error(`[JsonConnector] Failed to save data for '${this.name}'.`, e);
        }
    }

    _runComputations() {
        if (!Array.isArray(this.config.computed)) {
            return;
        }

        const parser = new FormulaParser(this.data);

        this.config.computed.forEach(rule => {
            const { target, formula, format } = rule;
            
            let value;
            if (formula) {
                value = parser.evaluate(formula);
            } else if (this.data.hasOwnProperty(target)) {
                value = parseFloat(this.data[target]);
            }

            if (typeof value !== 'undefined' && !isNaN(value)) {
                if (format === 'toFixed(2)') {
                    this.data[target] = value.toFixed(2);
                } else {
                    this.data[target] = value;
                }
            } else {
                 this.data[target] = rule.defaultValue !== undefined ? rule.defaultValue : 0;
            }
        });
    }
}

module.exports = { JsonConnector };