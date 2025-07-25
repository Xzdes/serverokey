// packages/serverokey/core/connectors/wise-json-connector.js
const path = require('path');
const { Migrator } = require('../migrator.js');

// --- УДАЛЯЕМ ГЛОБАЛЬНЫЙ ЭКЗЕМПЛЯР ОТСЮДА ---
// let dbInstance = null;
// let dbInitPromise = null;
// -------------------------------------------

class WiseJsonConnector {
    // --- ИЗМЕНЕНИЕ: Принимаем dbInstance в конструкторе ---
    constructor(name, config, appPath, dbInstance) {
        this.name = name;
        this.config = config;
        this.collectionName = config.collection || name;
        this.appPath = appPath;
        this.collection = null;
        this.migrator = new Migrator(config.migrations);
        
        // --- ИЗМЕНЕНИЕ: Проверяем, что экземпляр передан ---
        if (!dbInstance) {
            throw new Error("[WiseJsonConnector] CRITICAL: DB instance was not provided.");
        }
        this.dbInstance = dbInstance;
        // ----------------------------------------------------

        this.initPromise = this._initialize();
    }
    
    async _initialize() {
        // Мы больше не ждем глобальный промис, так как экземпляр уже инициализирован
        this.collection = await this.dbInstance.getCollection(this.collectionName);
    }

    async read() {
        await this.initPromise;
        
        const allDocs = await this.collection.getAll() || [];
        
        if (this.name === 'session') {
            return allDocs; 
        }

        const metaDoc = await this.collection.findOne({_id: '_meta'});
        const items = allDocs.filter(d => d._id !== '_meta');
        
        let data = { ...(this.config.initialState || {}), ...(metaDoc || {}), items: items };
        
        const migrationResult = this.migrator.migrate(data);
        if (migrationResult.changed) {
            console.log(`[Migrator] Data for '${this.name}' has been migrated. Resaving...`);
            await this.write(data);
        }

        this._runComputations(data);
        return data;
    }

    async write(newData) {
        await this.initPromise;
        
        if (this.name === 'session') {
             console.warn(`[WiseJsonConnector] Direct write to collection-type connector '${this.name}' is not supported. Use auth actions.`);
             return;
        }
        
        const dataToSave = { ...newData };
        const docsToSave = dataToSave.items || [];
        delete dataToSave.items;
        
        // --- ИЗМЕНЕНИЕ: Используем переданный dbInstance ---
        const txn = this.dbInstance.beginTransaction();
        // ------------------------------------------------
        try {
            const txnCollection = txn.collection(this.collectionName);

            await txnCollection.clear(); 
            
            if (docsToSave.length > 0) {
                await txnCollection.insertMany(docsToSave);
            }
            
            const metaData = { ...dataToSave };
            delete metaData._id;

            if (Object.keys(metaData).length > 0) {
                await txnCollection.insert({_id: '_meta', ...metaData});
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
            
            if (formula) {
                const result = parser.evaluate(formula);
                if (typeof result !== 'undefined' && !isNaN(result)) {
                    data[target] = result;
                    parser.context[target] = result;
                } else {
                    data[target] = rule.defaultValue !== undefined ? rule.defaultValue : 0;
                }
            }
            
            if (format && data.hasOwnProperty(target)) {
                const value = parseFloat(data[target]);
                if (!isNaN(value)) {
                    if (format === 'toFixed(2)') {
                        data[target] = value.toFixed(2);
                    }
                }
            }
        });
    }
}

module.exports = { WiseJsonConnector };