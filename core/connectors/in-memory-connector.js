// core/connectors/in-memory-connector.js

class InMemoryConnector {
    constructor(name, config) {
        this.name = name;
        this.config = config;
        this.data = JSON.parse(JSON.stringify(config.initialState || {}));
        console.log(`[InMemoryConnector] Initialized '${this.name}' with initial state.`);
    }

    async read() {
        // Возвращаем глубокую копию, чтобы предотвратить случайные мутации
        return JSON.parse(JSON.stringify(this.data));
    }

    async write(newData) {
        this.data = newData;
        // Для этого простого коннектора вычисления ('computed') не поддерживаются.
        // Он просто хранит то, что ему передали.
        console.log(`[InMemoryConnector] Data for '${this.name}' updated in memory.`);
    }
}

module.exports = { InMemoryConnector };