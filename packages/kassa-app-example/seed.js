// packages/kassa-app-example/seed.js
const path = require('path');
const WiseJSON = require('wise-json-db/wise-json');
const bcrypt = require('bcrypt');

const DB_PATH = path.resolve(__dirname, 'wise-db-data');

const initialPositions = [
    { "id": 1, "name": "Хлеб Бородинский", "price": "45.50" },
    { "id": 2, "name": "Молоко 3.2%", "price": "80.00" },
    { "id": 3, "name": "Сыр Российский", "price": "250.75" },
    { "id": 4, "name": "Кефир 1%", "price": "75.00" },
    { "id": 5, "name": "Масло сливочное", "price": "180.00" }
];

async function seedDatabase() {
    console.log(`🌱 Запускаем наполнение базы данных в: ${DB_PATH}`);
    const db = new WiseJSON(DB_PATH);
    await db.init();

    try {
        const positionsCol = await db.getCollection('positions');
        await positionsCol.clear();
        await positionsCol.insertMany(initialPositions);
        console.log(`✅ Коллекция "positions" наполнена ${await positionsCol.count()} документами.`);

        console.log('👤 Создаем пользователя по умолчанию...');
        const userCol = await db.getCollection('user');
        await userCol.clear();
        
        const saltRounds = 10;
        const password = '123';
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const userData = {
            login: 'kassir',
            passwordHash: passwordHash,
            name: "Иванов И.И.",
            role: "Кассир"
        };
        await userCol.insert(userData);
        console.log(`✅ Пользователь "kassir" создан с паролем "${password}".`);

        const sessionCol = await db.getCollection('sessions');
        await sessionCol.clear();
        console.log(`✅ Коллекция "sessions" очищена.`);

        const receiptCol = await db.getCollection('receipt');
        await receiptCol.clear();
        console.log(`✅ Коллекция "receipt" очищена.`);

    } catch (error) {
        console.error('🔥 Ошибка во время наполнения базы:', error);
    } finally {
        await db.close();
        console.log('✨ Наполнение завершено.');
    }
}

seedDatabase();