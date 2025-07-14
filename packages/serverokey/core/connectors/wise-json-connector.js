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
        
        // --- ИЗМЕНЕНИЕ: Только 'session' имеет особое поведение ---
        if (this.name === 'session') {
            return allDocs; 
        }

        // Все остальные коннекторы, включая 'user', работают по единому правилу
        const metaDoc = await this.collection.findOne({_id: '_meta'});
        const items = allDocs.filter(d => d._id !== '_meta');
        
        const data = { ...(this.config.initialState || {}), ...(metaDoc || {}), items: items };
        
        this._runComputations(data);
        return data;
    }

    async write(newData) {
        await this.initPromise;
        
        // --- ИЗМЕНЕНИЕ: Убираем проверку на 'user' ---
        if (this.name === 'session') {
             console.warn(`[WiseJsonConnector] Direct write to collection-type connector '${this.name}' is not supported. Use auth actions.`);
             return;
        }
        
        const dataToSave = { ...newData };
        const docsToSave = dataToSave.items || [];
        delete dataToSave.items;
        
        const txn = dbInstance.beginTransaction();
        try {
            const txnCollection = txn.collection(this.collectionName);

            await txnCollection.clear(); 
            
            if (docsToSave.length > 0) {
                await txnCollection.insertMany(docsToSave);
            }
            
            if (Object.keys(dataToSave).length > 0) {
                await txnCollection.insert({_id: '_meta', ...dataToSave});
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