// packages/serverokey/core/connectors/wise-json-connector.js
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
        console.log(`[WiseJsonConnector] Initialized for collection '${this.collectionName}'.`);
    }

    async read() {
        await this.initPromise;

        const stateId = `${this.name}_state`;
        const stateDoc = await this.collection.getById(stateId);

        if (!stateDoc) {
            console.warn(`[WiseJsonConnector] No state document found for '${this.name}'. Returning initialState.`);
            const initialState = this.config.initialState || {};
            // Если initialState нужно, чтобы тоже были вычисления, запускаем их
            this._runComputations(initialState);
            return initialState;
        }

        // Удаляем служебные поля wise-json-db перед возвратом
        const { _id, createdAt, updatedAt, ...data } = stateDoc;
        
        // Добавляем поля из initialState, которых нет в сохраненных данных
        const finalData = { ...(this.config.initialState || {}), ...data };
        
        this._runComputations(finalData);
        return finalData;
    }

    async write(newData) {
        await this.initPromise;
        const stateId = `${this.name}_state`;
        
        // Удаляем вычисляемые поля перед записью, чтобы они не дублировались в БД.
        const dataToSave = { ...newData };
        if (this.config.computed && Array.isArray(this.config.computed)) {
            this.config.computed.forEach(rule => {
                delete dataToSave[rule.target];
            });
        }
        
        // Надежный "upsert" (update or insert) через транзакцию.
        const txn = dbInstance.beginTransaction();
        try {
            const txnCollection = txn.collection(this.collectionName);
            // Сначала пытаемся удалить старый документ, если он есть.
            // wise-json-db's remove не бросает ошибку, если документа нет.
            await txnCollection.remove(stateId);
            // Затем вставляем новый с тем же ID.
            await txnCollection.insert({ _id: stateId, ...dataToSave });
            await txn.commit();
        } catch (error) {
            console.error(`[WiseJsonConnector] Upsert transaction failed for collection '${this.collectionName}':`, error);
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