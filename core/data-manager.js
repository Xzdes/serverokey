// core/data-manager.js
const fs = require('fs');
const path = require('path');
const { FormulaParser } = require('./formula-parser.js'); // Импортируем парсер формул

class DataManager {
    constructor(appPath, manifest) {
        this.appPath = appPath;
        this.manifest = manifest; 
        this.data = {};
        this.loadAll();
    }

    loadAll() {
        console.log('[Engine] Loading data sources...');
        for (const key in this.manifest.data) {
            this.load(key);
        }
        
        if (this.data.viewState && this.data.positions && this.data.viewState.filtered.length === 0) {
            console.log('[Engine] Initializing viewState.filtered from positions.all...');
            this.data.viewState.filtered = JSON.parse(JSON.stringify(this.data.positions.all));
            this.save('viewState');
        }
    }

    load(key) {
        const sourceConfig = this.manifest.data[key];
        const filePath = path.join(this.appPath, 'app', 'data', `${key}.json`);
        try {
            if (!fs.existsSync(filePath)) {
                 throw new Error(`File not found: ${filePath}`);
            }
            this.data[key] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            this.data[key] = sourceConfig.initialState || {};
            console.log(`[Engine] Initialized '${key}' with initial state.`);
            this.save(key);
        }
    }

    save(key) {
        const filePath = path.join(this.appPath, 'app', 'data', `${key}.json`);
        fs.writeFileSync(filePath, JSON.stringify(this.data[key], null, 2));
        console.log(`[Engine] Data source '${key}' saved.`);
    }

    // --- ПРАВИЛЬНАЯ ВЕРСИЯ МЕТОДА ---
    _runComputations(dataKey) {
        const dataConfig = this.manifest.data[dataKey];
        if (!dataConfig || !Array.isArray(dataConfig.computed)) {
            return;
        }

        const dataObject = this.data[dataKey];
        // Создаем парсер с текущим объектом данных в качестве контекста
        const parser = new FormulaParser(dataObject);

        // Проходим по каждому правилу вычисления
        dataConfig.computed.forEach(rule => {
            const { target, formula, format } = rule;
            
            // Если нет формулы, пропускаем правило
            if (!formula) {
                console.warn(`[DataManager] Rule for target '${target}' has no formula.`);
                return;
            }

            const result = parser.evaluate(formula);

            if (typeof result !== 'undefined' && !isNaN(result)) {
                // Применяем форматирование, если оно указано
                if (format === 'toFixed(2)') {
                    dataObject[target] = result.toFixed(2);
                } else {
                    dataObject[target] = result;
                }
                console.log(`[Engine] Computed '${dataKey}.${target}' with formula "${formula}" = ${dataObject[target]}`);
            } else {
                 console.warn(`[Engine] Formula "${formula}" for '${dataKey}.${target}' resulted in an invalid value.`);
                 // Устанавливаем безопасное значение по умолчанию, чтобы избежать NaN в данных
                 dataObject[target] = rule.defaultValue !== undefined ? rule.defaultValue : 0;
            }
        });
    }

    get(key) { return this.data[key]; }
    
    getContext(keys) {
        const context = {};
        keys.forEach(key => {
            context[key] = JSON.parse(JSON.stringify(this.data[key]));
        });
        return context;
    }

    updateAndSave(key, newData) {
        this.data[key] = newData;
        this._runComputations(key);
        this.save(key);
    }
}

module.exports = { DataManager };