#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

/**
 * Асинхронно запускает один тестовый файл в отдельном процессе.
 * @param {string} filePath - Полный путь к тестовому файлу.
 * @returns {Promise<void>} Промис, который разрешается при успешном завершении теста
 *                          или отклоняется при ошибке.
 */
async function runTest(filePath) {
    return new Promise((resolve, reject) => {
        const testName = path.basename(filePath);
        console.log(`\n\n===== Running test: ${testName} =====\n`);
        
        // Запускаем тест в дочернем процессе. Это обеспечивает полную изоляцию.
        // Ошибка или падение в одном тесте не повлияет на другие.
        const child = spawn('node', [filePath], {
            // Наследуем stdio, чтобы видеть вывод теста (включая цвета) в реальном времени.
            // Это делает лог таким же, как если бы мы запускали каждый файл вручную.
            stdio: 'inherit' 
        });

        // Обработчик завершения процесса
        child.on('close', (code) => {
            if (code !== 0) {
                // Если код выхода ненулевой, значит, тест упал.
                // Отклоняем промис с ошибкой, что прервет выполнение всего тестового набора.
                reject(new Error(`Test failed: ${testName} (exited with code ${code})`));
            } else {
                // Если все хорошо (код выхода 0), разрешаем промис.
                console.log(`\n✅ PASSED: ${testName}`);
                resolve();
            }
        });
        
        // Обработчик ошибок самого процесса (например, если не удалось запустить 'node')
        child.on('error', (err) => {
             reject(new Error(`Failed to start test process for ${testName}: ${err.message}`));
        });
    });
}

/**
 * Основная функция-оркестратор.
 */
async function main() {
    console.log('🚀 Starting all tests...');
    
    const testDir = __dirname;
    const allFilesInDir = await fs.readdir(testDir);
    
    // Автоматически находим все нужные тестовые файлы по соглашению об именовании.
    // Мы будем называть наши тестовые файлы `*.test.js`.
    // Исключаем сам этот скрипт.
    const testFiles = allFilesInDir
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.join(testDir, f));

    if (testFiles.length === 0) {
        console.warn('⚠️ No test files found to run. Test files should end with ".test.js".');
        return;
    }

    console.log(`Found ${testFiles.length} test files to run:`);
    testFiles.forEach(file => console.log(`  - ${path.basename(file)}`));

    // Запускаем тесты последовательно один за другим.
    // Если любой из `await runTest(file)` выбросит ошибку (reject),
    // цикл `for...of` прервется, и выполнение перейдет в блок `catch` ниже.
    for (const file of testFiles) {
        await runTest(file);
    }
    
    // Этот блок выполнится, только если все тесты в цикле прошли успешно.
    console.log('\n\n======================================');
    console.log(`🏆 All ${testFiles.length} tests passed successfully!`);
    console.log('======================================');
}

// Запускаем основную логику и ловим любые ошибки из `main`.
main().catch(error => {
    console.error('\n\n======================================');
    console.error(`🔥 A test run failed. Aborting.`);
    // Сообщение об ошибке уже будет выведено в runTest, здесь просто констатируем факт.
    console.error('======================================');
    // Завершаем процесс с кодом ошибки, чтобы CI/CD системы поняли, что сборка провалена.
    process.exit(1); 
});