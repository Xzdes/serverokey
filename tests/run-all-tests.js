#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { createTestAppStructure, cleanupTestApp } = require('./_utils/test-setup.js');

const C_RESET = '\x1b[0m';
const C_RED = '\x1b[31m';
const C_GREEN = '\x1b[32m';

const RUNNER_SCRIPT_PATH = path.join(__dirname, '_runner.js');

async function runTest(testName, testCase) {
    console.log(`\n--- Running test: ${testName} ---`);
    let appPath;
    try {
        // *** ИСПРАВЛЕНИЕ ЗДЕСЬ: Добавляем кавычки в регулярное выражение ***
        const safeTestName = testName.replace(/[:\s"]/g, '-');
        appPath = await createTestAppStructure(safeTestName, testCase.options);

        const runnerScriptContent = `
            const path = require('path');
            const appPath = ${JSON.stringify(appPath)};
            const testFunc = require(${JSON.stringify(path.resolve(__dirname, testCase.testFile))})['${testName}'].run;
            testFunc(appPath).catch(err => {
                console.error('Test function failed:', err);
                process.exit(1);
            });
        `;
        await fs.writeFile(RUNNER_SCRIPT_PATH, runnerScriptContent);
        
        await new Promise((resolve, reject) => {
            const child = spawn('node', [RUNNER_SCRIPT_PATH], { stdio: 'inherit' });
            child.on('close', code => code === 0 ? resolve() : reject(new Error(`Test process exited with code ${code}`)));
            child.on('error', reject);
        });

        console.log(`${C_GREEN}✓ PASSED${C_RESET}`);

    } finally {
        if (appPath) await cleanupTestApp(appPath);
        try { await fs.unlink(RUNNER_SCRIPT_PATH); } catch (e) {}
    }
}

async function main() {
    console.log('🚀 Starting all tests...');
    
    const testDir = __dirname;
    const testFiles = (await fs.readdir(testDir)).filter(f => f.endsWith('.test.js'));

    let totalTests = 0;
    
    for (const file of testFiles) {
        const filePath = path.join(testDir, file);
        const testSuite = require(filePath);
        
        for (const testName in testSuite) {
            totalTests++;
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