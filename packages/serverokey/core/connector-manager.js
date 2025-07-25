// packages/serverokey/core/connector-manager.js
const path = require('path');
const WiseJSON = require('wise-json-db/wise-json');
const { JsonConnector } = require('./connectors/json-connector.js');
const { InMemoryConnector } = require('./connectors/in-memory-connector.js');
const { WiseJsonConnector } = require('./connectors/wise-json-connector.js');

class ConnectorManager {
    constructor(appPath, manifest) {
        this.appPath = appPath;
        this.manifest = manifest;
        this.connectors = {};
        
        const dbPath = path.join(this.appPath, 'wise-db-data');
        this.dbInstance = new WiseJSON(dbPath);
        this.dbInitPromise = this.dbInstance.init().catch(err => {
            console.error("[ConnectorManager] CRITICAL: Failed to initialize WiseJSON DB.", err);
            this.dbInstance = null;
            throw err;
        });
    }

    async loadAll() {
        console.log('[Engine] Initializing connectors...');
        await this.dbInitPromise;

        for (const name in this.manifest.connectors) {
            const config = this.manifest.connectors[name];
            switch (config.type) {
                case 'json':
                    this.connectors[name] = new JsonConnector(name, config, this.appPath);
                    console.log(`[ConnectorManager] Initialized 'json' connector for '${name}'`);
                    break;
                
                case 'in-memory':
                    this.connectors[name] = new InMemoryConnector(name, config);
                    console.log(`[ConnectorManager] Initialized 'in-memory' connector for '${name}'`);
                    break;

                case 'wise-json':
                    if (this.dbInstance) {
                        this.connectors[name] = new WiseJsonConnector(name, config, this.appPath, this.dbInstance);
                        console.log(`[ConnectorManager] Initialized 'wise-json' connector for '${name}'`);
                    } else {
                        console.error(`[ConnectorManager] Cannot initialize 'wise-json' connector '${name}' because DB failed to start.`);
                    }
                    break;

                default:
                    throw new Error(`Unknown connector type '${config.type}' for connector '${name}'.`);
            }
        }
    }

    getConnector(name) {
        if (!this.connectors[name]) {
            // --- ВОЗВРАЩАЕМ СТАРОЕ ПОВЕДЕНИЕ ---
            throw new Error(`Connector '${name}' not found. Available: [${Object.keys(this.connectors).join(', ')}]`);
        }
        return this.connectors[name];
    }

    async getContext(keys) {
        const context = {};
        for (const key of keys) {
            const connector = this.getConnector(key);
            if (connector) {
                context[key] = await connector.read();
            }
        }
        return context;
    }
}

module.exports = { ConnectorManager };