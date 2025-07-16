// tests/action-engine-advanced.test.js

const path = require('path');
const http = require('http');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша
const ACTION_ENGINE_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/action-engine.js');
if (require.cache[ACTION_ENGINE_PATH]) delete require.cache[ACTION_ENGINE_PATH];

// Вспомогательные функции
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        const replacer = (key, value) => (key === 'zod' ? '[Zod Object]' : value);
        console.log(JSON.stringify(data, replacer, 2));
    }
}

function check(condition, description, actual) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual !== undefined) console.error('     ACTUAL VALUE:', actual);
        throw new Error(`Assertion failed: ${description}`);
    }
}

function setupActionEngine(initialContext) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const engine = new ActionEngine(initialContext, PROJECT_ROOT, null, null, true);
    return engine;
}

// --- Тестовые Сценарии ---

async function runHttpGetStepTest(appPath) {
    log('--- Test: Step "http:get" ---');
    
    const MOCK_API_PORT = 3002;
    const mockApiServer = http.createServer((req, res) => {
        if (req.url === '/fact/42') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ text: 'The answer to life, the universe, and everything.' }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    await new Promise(resolve => mockApiServer.listen(MOCK_API_PORT, resolve));
    log(`Mock API server running on port ${MOCK_API_PORT}`);

    try {
        const initialContext = { data: {}, body: {} };
        const engine = setupActionEngine(initialContext);

        const steps = [
            {
                "http:get": {
                    "url": `'http://localhost:${MOCK_API_PORT}/fact/42'`,
                    "saveTo": "context.apiResponse"
                }
            },
            {
                "set": "data.fact",
                "to": "context.apiResponse.text"
            }
        ];

        await engine.run(steps);
        const finalContext = engine.context;
        log('Final context after http:get:', finalContext);

        check(finalContext.data.fact.includes('The answer'), 'Should fetch data from mock API and save it to context.');

    } finally {
        await new Promise(resolve => mockApiServer.close(resolve));
        log('Mock API server stopped.');
    }
}


async function runZodValidationStepTest(appPath) {
    log('--- Test: Zod validation in a step ---');
    const engine = setupActionEngine({
        data: {},
        body: { itemId: "123", itemName: "ValidName" }
    });

    const steps = [
        {
            "set": "context.validatedId",
            "to": "zod.string().regex(/^\\d+$/).transform(Number).parse(body.itemId)"
        }
    ];

    try {
        await engine.run(steps);
        const finalContext = engine.context;
        log('Context after successful validation:', finalContext);
        check(finalContext.context.validatedId === 123, 'Zod should successfully parse and transform the string to a number.');
    } catch (e) {
        check(false, 'Successful Zod validation should not throw an error.', e);
    }

    const failingEngine = setupActionEngine({
        data: {},
        body: { itemName: { not: "a string" } } 
    });
    
    const failingSteps = [
        { "set": "context.validatedName", "to": "zod.string().min(3).parse(body.itemName)"}
    ];

    try {
        await failingEngine.run(failingSteps);
        check(false, 'Zod validation with invalid data should have thrown an error.');
    } catch (error) {
        log('Caught expected error:', error.message);
        check(error, 'Zod validation should fail as expected.');
        check(error.message.includes('Step execution failed'), 'The error message should originate from the ActionEngine step failure.');
        check(error.message.includes('Invalid input: expected string, received object'), 'The error message should contain the Zod error details.');
    }
}


// --- Экспорт Тестов для Runner'а ---

module.exports = {
    'ActionEngine Advanced: Step "http:get" should fetch from an external URL': {
        options: {},
        run: runHttpGetStepTest
    },
    'ActionEngine Advanced: Should be able to use "zod" for validation': {
        options: {},
        run: runZodValidationStepTest
    }
};