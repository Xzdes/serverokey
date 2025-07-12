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
    }

    async read() {
        if (this.data === null) {
            await this.load();
        }
        return JSON.parse(JSON.stringify(this.data));
    }

    async write(newData) {
        this.data = newData;
        this._runComputations();
        await this.save();
    }
    
    async load() {
        console.log(`[JsonConnector] Loading data for '${this.name}'...`);
        try {
            if (!fs.existsSync(this.filePath)) {
                 throw new Error(`File not found: ${this.filePath}`);
            }
            this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        } catch (e) {
            this.data = this.config.initialState || {};
            console.log(`[JsonConnector] Initialized '${this.name}' with initial state.`);
            await this.save();
        }
    }

    async save() {
        await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
        console.log(`[JsonConnector] Data source '${this.name}' saved.`);
    }

    _runComputations() {
        if (!Array.isArray(this.config.computed)) {
            return;
        }

        const parser = new FormulaParser(this.data);

        this.config.computed.forEach(rule => {
            const { target, formula, format } = rule;
            if (!formula) {
                console.warn(`[JsonConnector] Rule for target '${target}' has no formula.`);
                return;
            }

            const result = parser.evaluate(formula);

            if (typeof result !== 'undefined' && !isNaN(result)) {
                let value = result;
                if (format === 'toFixed(2)') {
                    value = result.toFixed(2);
                }
                this.data[target] = value;
                console.log(`[Engine] Computed '${this.name}.${target}' with formula "${formula}" = ${value}`);
            } else {
                 console.warn(`[Engine] Formula "${formula}" for '${this.name}.${target}' resulted in an invalid value.`);
                 this.data[target] = rule.defaultValue !== undefined ? rule.defaultValue : 0;
            }
        });
    }
}

module.exports = { JsonConnector };