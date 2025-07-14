const path = require('path');
const fs = require('fs/promises');

// ANSI-коды для цветного вывода в консоли
const C_RESET = '\x1b[0m';
const C_RED = '\x1b[31m';
const C_GREEN = '\x1b[32m';
const C_YELLOW = '\x1b[33m';
const C_GRAY = '\x1b[90m';

/**
 * Простая функция для проверки утверждений.
 * В случае провала выводит детальное сообщение и завершает процесс с ошибкой.
 * @param {boolean} condition - Условие, которое должно быть истинным.
 * @param {string} message - Сообщение, описывающее, что проверяется.
 */
function assert(condition, message) {
    if (condition) {
        // Если проверка прошла, выводим зеленое сообщение
        console.log(`  ${C_GREEN}✓${C_RESET} ${message}`);
    } else {
        // Если проверка провалена, выводим красное сообщение и завершаем тест
        console.error(`\n  ${C_RED}✗ FAILED: ${message}${C_RESET}\n`);
        // Завершаем процесс с ненулевым кодом, чтобы run-all-tests.js поймал ошибку
        process.exit(1);
    }
}


/**
 * Создает временную структуру приложения для одного теста.
 * Гарантирует, что директория будет чистой перед началом.
 * @param {string} testName - Уникальное имя для папки теста (например, 'validator-base-checks').
 * @param {object} manifest - JS-объект манифеста, который будет записан в manifest.js.
 * @returns {Promise<string>} - Промис, который разрешается путем к созданной временной директории.
 */
async function createTestApp(testName, manifest = {}) {
    const tempAppPath = path.join(__dirname, '..', '_temp', testName);
    const manifestPath = path.join(tempAppPath, 'manifest.js');

    try {
        // 1. Гарантируем чистую среду: удаляем папку, если она существовала
        await fs.rm(tempAppPath, { recursive: true, force: true });

        // 2. Создаем структуру папок, которую ожидает ядро Serverokey
        await fs.mkdir(path.join(tempAppPath, 'app', 'components'), { recursive: true });
        await fs.mkdir(path.join(tempAppPath, 'app', 'actions'), { recursive: true });

        // 3. Создаем файл manifest.js из переданного объекта
        const manifestContent = `module.exports = ${JSON.stringify(manifest, null, 2)};`;
        await fs.writeFile(manifestPath, manifestContent, 'utf-8');
        
        // 4. Создаем пустой package.json, чтобы Node.js считал это пакетом
        await fs.writeFile(path.join(tempAppPath, 'package.json'), '{ "name": "test-app" }');

        return tempAppPath;
    } catch (error) {
        console.error(`${C_RED}FATAL: Could not create test application environment at ${tempAppPath}${C_RESET}`, error);
        throw error;
    }
}

/**
 * Удаляет временную директорию приложения, созданную для теста.
 * @param {string} appPath - Путь к временной директории для удаления.
 */
async function cleanupTestApp(appPath) {
    try {
        await fs.rm(appPath, { recursive: true, force: true });
    } catch (error) {
        // Не фатальная ошибка, но стоит о ней знать
        console.warn(`${C_YELLOW}Warning: Could not fully clean up test app at ${appPath}${C_RESET}`, error);
    }
}

module.exports = {
    assert,
    createTestApp,
    cleanupTestApp,
};