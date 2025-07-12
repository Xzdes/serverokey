// core/connector-manager.js
const { JsonConnector } = require('./connectors/json-connector.js');
const { InMemoryConnector } = require('./connectors/in-memory-connector.js'); // <-- ДОБАВЛЕНО

class ConnectorManager {
    constructor(appPath, manifest) {
        this.appPath = appPath;
        this.manifest = manifest;
        this.connectors = {};
        this.loadAll();
    }

    loadAll() {
        console.log('[Engine] Initializing connectors...');
        for (const name in this.manifest.connectors) {
            const config = this.manifest.connectors[name];
            switch (config.type) {
                case 'json':
                    this.connectors[name] = new JsonConnector(name, config, this.appPath);
                    console.log(`[ConnectorManager] Initialized 'json' connector for '${name}'`);
                    break;
                
                // --- ДОБАВЛЕН НОВЫЙ БЛОК ---
                case 'in-memory':
                    this.connectors[name] = new InMemoryConnector(name, config);
                    console.log(`[ConnectorManager] Initialized 'in-memory' connector for '${name}'`);
                    break;

                default:
                    throw new Error(`Unknown connector type '${config.type}' for connector '${name}'.`);
            }
        }
    }

    getConnector(name) {
        if (!this.connectors[name]) {
            throw new Error(`Connector '${name}' not found.`);
        }
        return this.connectors[name];
    }

    async getContext(keys) {
        const context = {};
        for (const key of keys) {
            context[key] = await this.getConnector(key).read();
        }
        return context;
    }
}

module.exports = { ConnectorManager };