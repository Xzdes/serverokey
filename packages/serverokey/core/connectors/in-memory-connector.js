// core/connectors/in-memory-connector.js

class InMemoryConnector {
    constructor(name, config) {
        this.name = name;
        this.config = config;
        // Глубокое клонирование, чтобы избежать мутаций initialState
        this.data = JSON.parse(JSON.stringify(config.initialState || {}));
        console.log(`[InMemoryConnector] Initialized '${this.name}' with initial state.`);
    }

    async read() {
        // Возвращаем глубокую копию, чтобы предотвратить случайные мутации
        // извне. Структура полностью совместима с wise-json.
        return JSON.parse(JSON.stringify(this.data));
    }

    async write(newData) {
        // Просто заменяем старые данные новыми.
        // Так как это in-memory, транзакции не нужны.
        this.data = JSON.parse(JSON.stringify(newData));
        // Для этого простого коннектора вычисления ('computed') не поддерживаются.
        // Он просто хранит то, что ему передали.
        console.log(`[InMemoryConnector] Data for '${this.name}' updated in memory.`);
    }

    // Добавляем пустой initPromise для совместимости с wise-json-connector
    get initPromise() {
        return Promise.resolve();
    }
}

module.exports = { InMemoryConnector };