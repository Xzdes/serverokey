// core/connectors/wise-json-connector.js
const path = require('path');
const WiseJSON = require('wise-json-db/wise-json');

let dbInstance = null;
let dbInitPromise = null;

class WiseJsonConnector {
    constructor(name, config, appPath) {
        this.name = name;
        this.config = config;
        this.collectionName = config.collection || name;
        this.appPath = appPath;
        this.collection = null;

        if (!dbInstance) {
            const dbPath = path.join(this.appPath, 'wise-db-data');
            dbInstance = new WiseJSON(dbPath);
            dbInitPromise = dbInstance.init().catch(err => {
                console.error("[WiseJsonConnector] CRITICAL: Failed to initialize WiseJSON DB.", err);
                dbInstance = null;
                throw err;
            });
        }

        this.initPromise = this._initialize();
    }
    
    async _initialize() {
        await dbInitPromise;
        if (!dbInstance) {
             throw new Error("WiseJSON DB instance is not available due to an earlier initialization error.");
        }
        this.collection = await dbInstance.getCollection(this.collectionName);
    }

    async read() {
        await this.initPromise;
        
        const allDocs = await this.collection.getAll() || [];
        
        if (this.name === 'user') {
            return allDocs[0] || this.config.initialState || {};
        }

        const data = { ...(this.config.initialState || {}), items: allDocs };
        
        this._runComputations(data);
        return data;
    }

    async write(newData) {
        await this.initPromise;
        
        // Удаляем вычисляемые поля перед записью, чтобы они не дублировались в БД.
        const dataToSave = { ...newData };
        if (this.config.computed && Array.isArray(this.config.computed)) {
            this.config.computed.forEach(rule => {
                delete dataToSave[rule.target];
            });
        }

        if (this.name === 'user') {
             const userId = dataToSave._id || 'default_user';
             // Простой upsert: удалить, затем вставить
             await this.collection.remove(userId);
             await this.collection.insert({ ...dataToSave, _id: userId });
             return;
        }
        
        const docsToSave = dataToSave.items || [];
        
        const txn = dbInstance.beginTransaction();
        try {
            const txnCollection = txn.collection(this.collectionName);
            await txnCollection.clear();
            if (docsToSave.length > 0) {
                await txnCollection.insertMany(docsToSave);
            }
            await txn.commit();
        } catch (error) {
            console.error(`[WiseJsonConnector] Transaction failed for collection '${this.collectionName}':`, error);
            await txn.rollback();
            throw error;
        }
    }
    
    _runComputations(data) {
        if (!Array.isArray(this.config.computed)) {
            return;
        }
        
        const parserContext = { ...data };
        const { FormulaParser } = require('../formula-parser.js');
        const parser = new FormulaParser(parserContext);

        this.config.computed.forEach(rule => {
            const { target, formula, format } = rule;
            if (!formula) return;
            
            const result = parser.evaluate(formula);

            if (typeof result !== 'undefined' && !isNaN(result)) {
                let value = result;
                if (format === 'toFixed(2)') {
                    value = parseFloat(result).toFixed(2);
                }
                data[target] = value;
                parser.context[target] = value;
            } else {
                 data[target] = rule.defaultValue !== undefined ? rule.defaultValue : 0;
            }
        });
    }
}

module.exports = { WiseJsonConnector };