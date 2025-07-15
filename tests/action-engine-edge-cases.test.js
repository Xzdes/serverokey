const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очищаем кэш для ActionEngine
const ACTION_ENGINE_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/action-engine.js');
if (require.cache[ACTION_ENGINE_PATH]) delete require.cache[ACTION_ENGINE_PATH];

// Вспомогательные функции log и check
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        const replacer = (key, value) => {
            if (key === 'zod') return '[Zod Object]';
            if (typeof value === 'bigint') return value.toString();
            return value;
        };
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

/**
 * Инициализирует ActionEngine.
 */
function setupActionEngine(initialContext) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    // Включаем debug: true, чтобы видеть предупреждения от evaluate
    const engine = new ActionEngine(initialContext, PROJECT_ROOT, null, null, true);
    return engine;
}


// --- Тестовые Сценарии Пограничных Случаев ---

async function runAccessingNonexistentVariableTest(appPath) {
    log('--- Test: Accessing a nonexistent variable ---');
    const initialContext = { data: { user: { name: 'Alice' } } };
    const engine = setupActionEngine(initialContext);

    const steps = [
        { "set": "context.age", "to": "data.user.age" },
        { "set": "context.badAccess", "to": "data.nonexistent.property" },
        { "set": "context.goodAccess", "to": "(data.nonexistent && data.nonexistent.property) || 'fallback'" }
    ];

    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context:', finalContext);

    check(finalContext.context.age === undefined, 'Accessing a non-existent property (data.user.age) should result in undefined.');
    check(finalContext.context.badAccess === undefined, 'Accessing a deep non-existent property (data.nonexistent.property) should be caught and result in undefined.');
    check(finalContext.context.goodAccess === 'fallback', 'A safe expression with fallback should work correctly.');
}

async function runInvalidDataTypeOperationTest(appPath) {
    log('--- Test: Operating on invalid data types ---');
    const initialContext = { data: { value: 'not_an_array' } };
    const engine = setupActionEngine(initialContext);

    const steps = [
        { "set": "data.value", "to": "data.value.concat([1])" }
    ];

    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context:', finalContext);
    
    check(finalContext.data.value === 'not_an_array1', 'Engine should perform string concatenation as per standard JS behavior.');
}

async function runSyntaxErrorInExpressionTest(appPath) {
    log('--- Test: Syntax error in an expression ---');
    const initialContext = { data: { count: 10 } };
    const engine = setupActionEngine(initialContext);

    const steps = [
        { "set": "data.count", "to": "data.count ++ 1" }
    ];

    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context:', finalContext);
    
    // Проверяем, что значение стало undefined, так как evaluate вернул undefined
    // из-за синтаксической ошибки, и ActionEngine присвоил это значение.
    check(finalContext.data.count === undefined, 'Value should become undefined on syntax error.');
}

async function runFalsyValuesInIfConditionTest(appPath) {
    log('--- Test: Falsy values in "if" condition ---');
    const initialContext = {
        data: {
            zero: 0,
            emptyString: '',
            nullValue: null,
            undef: undefined
        }
    };
    const engine = setupActionEngine(initialContext);

    const steps = [
        { "if": "data.zero", "then": [{ "set": "context.zeroTest", "to": "'truthy'" }], "else": [{ "set": "context.zeroTest", "to": "'falsy'" }] },
        { "if": "data.emptyString", "then": [{ "set": "context.stringTest", "to": "'truthy'" }], "else": [{ "set": "context.stringTest", "to": "'falsy'" }] },
        { "if": "data.nullValue", "then": [{ "set": "context.nullTest", "to": "'truthy'" }], "else": [{ "set": "context.nullTest", "to": "'falsy'" }] },
        { "if": "data.undef", "then": [{ "set": "context.undefTest", "to": "'truthy'" }], "else": [{ "set": "context.undefTest", "to": "'falsy'" }] }
    ];

    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context:', finalContext);

    check(finalContext.context.zeroTest === 'falsy', '0 should be treated as a falsy value.');
    check(finalContext.context.stringTest === 'falsy', 'An empty string should be treated as a falsy value.');
    check(finalContext.context.nullTest === 'falsy', 'null should be treated as a falsy value.');
    check(finalContext.context.undefTest === 'falsy', 'undefined should be treated as a falsy value.');
}


// --- Экспорт Тестов для Runner'а ---

module.exports = {
    'ActionEngine Edge Cases: Accessing non-existent variables': {
        options: {},
        run: runAccessingNonexistentVariableTest
    },
    'ActionEngine Edge Cases: Operating on invalid data types': {
        options: {},
        run: runInvalidDataTypeOperationTest
    },
    'ActionEngine Edge Cases: Handling syntax errors in expressions': {
        options: {},
        run: runSyntaxErrorInExpressionTest
    },
    'ActionEngine Edge Cases: Correctly handling falsy values in "if"': {
        options: {},
        run: runFalsyValuesInIfConditionTest
    }
};