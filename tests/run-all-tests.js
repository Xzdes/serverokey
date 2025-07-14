#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { createTestAppStructure, cleanupTestApp } = require('./_utils/test-setup.js');

const C_RESET = '\x1b[0m';
const C_RED = '\x1b[31m';
const C_GREEN = '\x1b[32m';

// Временный файл, который будет запускаться в дочернем процессе
const RUNNER_SCRIPT_PATH = path.join(__dirname, '_runner.js');

/**
 * Запускает один тестовый сценарий.
 * @param {string} testName - Имя сценария.
 * @param {object} testCase - Объект с опциями и функцией `run`.
 */
async function runTest(testName, testCase) {
    console.log(`\n--- Running test: ${testName} ---`);
    let appPath;
    try {
        // 1. Создаем временное приложение для теста
        appPath = await createTestAppStructure(testName.replace(/[:\s]/g, '-'), testCase.options);

        // 2. Создаем временный скрипт-запускальщик
        const runnerScriptContent = `
            const path = require('path');
            // Передаем путь к приложению и импортируем тест-функцию
            const appPath = ${JSON.stringify(appPath)};
            const testFunc = require(${JSON.stringify(path.resolve(__dirname, testCase.testFile))})['${testName}'].run;

            // Запускаем тест-функцию
            testFunc(appPath).catch(err => {
                console.error('Test function failed:', err);
                process.exit(1);
            });
        `;
        await fs.writeFile(RUNNER_SCRIPT_PATH, runnerScriptContent);
        
        // 3. Запускаем этот скрипт в дочернем процессе
        await new Promise((resolve, reject) => {
            const child = spawn('node', [RUNNER_SCRIPT_PATH], { stdio: 'inherit' });
            child.on('close', code => code === 0 ? resolve() : reject(new Error(`Test process exited with code ${code}`)));
            child.on('error', reject);
        });

        console.log(`${C_GREEN}✓ PASSED${C_RESET}`);

    } finally {
        // 4. Гарантированно очищаем всё
        if (appPath) await cleanupTestApp(appPath);
        try { await fs.unlink(RUNNER_SCRIPT_PATH); } catch (e) {}
    }
}

async function main() {
    console.log('🚀 Starting all tests...');
    
    const testDir = __dirname;
    const testFiles = (await fs.readdir(testDir)).filter(f => f.endsWith('.test.js'));

    let totalTests = 0;
    
    // Проходим по каждому файлу-описанию тестов
    for (const file of testFiles) {
        const filePath = path.join(testDir, file);
        const testSuite = require(filePath);
        
        // Проходим по каждому сценарию в файле
        for (const testName in testSuite) {
            totalTests++;
            // Добавляем путь к файлу в объект теста, чтобы runner знал, откуда импортировать
            testSuite[testName].testFile = filePath; 
            await runTest(testName, testSuite[testName]);
        }
    }
    
    console.log(`\n======================================`);
    console.log(`🏆 All ${totalTests} tests passed successfully!`);
    console.log(`======================================`);
}

main().catch(error => {
    console.error(`\n======================================`);
    console.error(`${C_RED}🔥 A test run failed. Aborting.${C_RESET}`);
    console.error(error.message);
    console.error(`======================================`);
    process.exit(1);
});