// core/data-manager.js
// Управляет состоянием приложения (чтение/запись данных).
const fs = require('fs');
const path = require('path');

class DataManager {
    constructor(appPath, manifestData) {
        this.appPath = appPath;
        this.manifestData = manifestData;
        this.data = {};
        this.loadAll();
    }

    loadAll() {
        console.log('[Engine] Loading data sources...');
        for (const key in this.manifestData) {
            this.load(key);
        }
    }

    load(key) {
        const source = this.manifestData[key];
        const filePath = path.join(this.appPath, 'app', 'data', `${key}.json`);
        try {
            this.data[key] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            this.data[key] = source.initialState || {};
            console.log(`[Engine] Initialized '${key}' with initial state.`);
            this.save(key);
        }
    }

    save(key) {
        const filePath = path.join(this.appPath, 'app', 'data', `${key}.json`);
        fs.writeFileSync(filePath, JSON.stringify(this.data[key], null, 2));
        console.log(`[Engine] Data source '${key}' saved.`);
    }

    get(key) {
        return this.data[key];
    }
    
    // Возвращает глубокую копию для изоляции контекста
    getContext(keys) {
        const context = {};
        keys.forEach(key => {
            context[key] = JSON.parse(JSON.stringify(this.data[key]));
        });
        return context;
    }

    updateAndSave(key, newData) {
        this.data[key] = newData;
        this.save(key);
    }
}

module.exports = { DataManager };