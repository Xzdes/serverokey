// packages/kassa-app-example/seed.js

const path = require('path');
const WiseJSON = require('wise-json-db/wise-json');

const DB_PATH = path.resolve(__dirname, 'wise-db-data');

// --- Начальные данные для каждого коннектора ---

const positionsData = {
    _id: 'positions_state', // Статичный ID для документа состояния
    items: [
        { "id": 1, "name": "Хлеб Бородинский", "price": "45.50" },
        { "id": 2, "name": "Молоко 3.2%", "price": "80.00" },
        { "id": 3, "name": "Сыр Российский", "price": "250.75" },
        { "id": 4, "name": "Кефир 1%", "price": "75.00" },
        { "id": 5, "name": "Масло сливочное", "price": "180.00" }
    ]
};

const userData = {
    _id: 'user_state', // Статичный ID
    name: "Иванов И.И.",
    role: "Кассир"
};

const receiptData = {
    _id: 'receipt_state', // Статичный ID
    items: [],
    discountPercent: 10,
    statusMessage: 'Чек готов к работе',
    bonusApplied: false
};


async function seedDatabase() {
    console.log(`🌱 Запускаем наполнение базы данных в: ${DB_PATH}`);
    const db = new WiseJSON(DB_PATH);
    await db.init();

    try {
        // Вспомогательная функция для наполнения коллекции одним документом
        async function seedCollection(collectionName, data) {
            const collection = await db.getCollection(collectionName);
            await collection.clear(); // Полностью очищаем коллекцию
            await collection.insert(data); // Вставляем один документ-состояние
            console.log(`✅ Коллекция "${collectionName}" наполнена одним документом-состоянием.`);
        }

        // --- Наполняем все коллекции ---
        await seedCollection('positions', positionsData);
        await seedCollection('user', userData);
        await seedCollection('receipt', receiptData);

    } catch (error) {
        console.error('🔥 Ошибка во время наполнения базы:', error);
    } finally {
        await db.close();
        console.log('✨ Наполнение завершено. Соединение с БД закрыто.');
    }
}

seedDatabase();