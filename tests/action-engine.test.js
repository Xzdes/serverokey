const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ACTION_ENGINE_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/action-engine.js');
if (require.cache[ACTION_ENGINE_PATH]) {
    delete require.cache[ACTION_ENGINE_PATH];
}

/**
 * Улучшенная функция логирования с обработкой BigInt.
 */
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        // Добавляем replacer для обработки BigInt
        const replacer = (key, value) =>
            typeof value === 'bigint'
                ? value.toString() // Превращаем BigInt в строку
                : value;
        console.log(JSON.stringify(data, replacer, 2));
    }
}

function check(condition, description, actual, expected) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual !== undefined) console.error('     ACTUAL  :', actual);
        if (expected !== undefined) console.error('     EXPECTED:', expected);
        throw new Error(`Assertion failed: ${description}`);
    }
}

function setupActionEngine(initialContext) {
    log('Setting up ActionEngine with context:', initialContext);
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const engine = new ActionEngine(initialContext, PROJECT_ROOT, null, null, true);
    log('ActionEngine setup complete.');
    return engine;
}


// --- Тестовые Сценарии ---

async function runSetStepTest() {
    const initialContext = {
        data: {
            cart: { items: [], total: 0 }
        },
        body: {
            price: 150
        }
    };
    const engine = setupActionEngine(initialContext);

    const steps = [
        // *** ИСПРАВЛЕНИЕ: Явно приводим к числу, чтобы избежать BigInt ***
        { "set": "data.cart.total", "to": "Number(100)" },
        { "set": "data.cart.newPrice", "to": "body.price" },
        // Убедимся, что и здесь работаем с числами
        { "set": "data.cart.totalWithTax", "to": "Number(data.cart.total) * 1.2" },
        { "set": "context.newItem", "to": "{ id: 1, name: 'Product' }" },
        { "set": "data.cart.items", "to": "data.cart.items.concat([context.newItem])" }
    ];

    log('Running steps:', steps);
    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context:', finalContext);

    // Проверки теперь тоже должны сравнивать с Number, а не BigInt
    check(finalContext.data.cart.total === 100, 'Step "set" should assign a simple value.');
    check(finalContext.data.cart.newPrice === 150, 'Step "set" should assign a value from body.');
    check(finalContext.data.cart.totalWithTax === 120, 'Step "set" should perform calculations.');
    check(finalContext.data.cart.items.length === 1, 'Step "set" should add an item to the array.');
    check(finalContext.data.cart.items[0].name === 'Product', 'The added item should have correct properties.');
}

async function runIfThenElseStepTest() {
    const initialContext = {
        data: { user: { role: 'admin' }, config: { a: 10, b: 20 } },
        body: { action: 'approve' }
    };
    const engine = setupActionEngine(initialContext);

    const steps = [
        {
            "if": "data.user.role === 'admin' && body.action === 'approve'",
            "then": [ { "set": "context.decision", "to": "'approved'" } ],
            "else": [ { "set": "context.decision", "to": "'denied'" } ]
        },
        {
            "if": "data.config.a > data.config.b",
            "then": [ { "set": "context.comparison", "to": "'A is greater'" } ],
            "else": [ { "set": "context.comparison", "to": "'B is greater or equal'" } ]
        }
    ];

    log('Running steps:', steps);
    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context:', finalContext);
    
    check(finalContext.context.decision === 'approved', 'Step "if/then" should be executed when condition is true.');
    check(finalContext.context.comparison === 'B is greater or equal', 'Step "if/else" should be executed when condition is false.');
}


async function main() {
    console.log('--- Running ActionEngine Tests ---');
    await runSetStepTest();
    await runIfThenElseStepTest();
    console.log('\n🏆 All ActionEngine tests passed successfully!');
}

main().catch(err => {
    console.error(`\n🔥 A fatal error occurred during ActionEngine tests:`, err);
    process.exit(1);
});