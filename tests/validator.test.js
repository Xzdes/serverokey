const path = require('path');
const fs = require('fs/promises');

// Определяем корень проекта
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очищаем кэш для валидатора
const VALIDATOR_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/validator/index.js');
if (require.cache[VALIDATOR_PATH]) {
    delete require.cache[VALIDATOR_PATH];
}

// Вспомогательные функции, скопированные из renderer.test.js для консистентности
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
    }
}

function check(condition, description, actual) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual !== undefined) {
            console.error('     ACTUAL VALUE:', actual);
        }
        throw new Error(`Assertion failed: ${description}`);
    }
}

// --- Тестовые Сценарии ---

async function runValidManifestTest(appPath) {
    const validateManifest = require(VALIDATOR_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));
    
    // Создадим фейковый компонент, чтобы проверка существования файла прошла
    await fs.writeFile(path.join(appPath, 'app', 'components', 'main.html'), '<div></div>');
    
    log('Running validation for a valid manifest...');
    const issues = validateManifest(manifest, appPath);
    log('Validation issues found:', issues);

    check(issues.length === 0, 'Expected 0 issues for a valid manifest.');
}

async function runMissingSectionsTest(appPath) {
    const validateManifest = require(VALIDATOR_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));

    log('Running validation for a manifest with missing sections...');
    const issues = validateManifest(manifest, appPath);
    log('Validation issues found:', issues);

    check(issues.length > 0, 'Expected at least one issue for missing sections.');
    check(
        issues.some(issue => issue.level === 'error' && issue.message.includes("'routes' is missing")),
        'Expected an error about the missing "routes" section.'
    );
}

async function runConnectorNoTypeTest(appPath) {
    const validateManifest = require(VALIDATOR_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));

    log('Running validation for a connector with no type...');
    const issues = validateManifest(manifest, appPath);
    log('Validation issues found:', issues);
    
    check(issues.length === 1, 'Expected exactly one issue.');
    check(issues[0].level === 'error', 'Issue level should be "error".');
    check(
        issues[0].message.includes("missing the 'type' property"),
        'Error message should mention the missing "type" property.'
    );
}

async function runTypoSuggestionTest(appPath) {
    const validateManifest = require(VALIDATOR_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));

    log('Running validation for a manifest with a typo...');
    const issues = validateManifest(manifest, appPath);
    log('Validation issues found:', issues);

    const relevantIssue = issues.find(issue => issue.category.includes('GET /'));
    check(relevantIssue, 'An issue for the route "GET /" should exist.');
    check(
        relevantIssue.suggestion.includes('Did you mean "myComponent"?'),
        'Expected a suggestion for the typo.',
        relevantIssue.suggestion
    );
}


// --- Экспорт Тестов ---

module.exports = {
    'Validator: A valid manifest should pass': {
        options: {
            manifest: {
                components: { main: 'main.html' },
                connectors: { db: { type: 'in-memory', initialState: {} } },
                routes: { 'GET /': { type: 'view', layout: 'main', reads: ['db'] } }
            },
            // Файл компонента создается в самом тесте, т.к. это специфично для этого сценария
        },
        run: runValidManifestTest
    },
    'Validator: Missing required sections should fail': {
        options: {
            manifest: {
                components: { main: 'main.html' },
                connectors: { db: { type: 'in-memory', initialState: {} } },
                // `routes` намеренно пропущена
            }
        },
        run: runMissingSectionsTest
    },
    'Validator: Connector with missing type should fail': {
        options: {
            manifest: {
                components: {},
                connectors: { db: { initialState: {} } }, // `type` пропущен
                routes: {}
            }
        },
        run: runConnectorNoTypeTest
    },
    'Validator: Typo in component name should provide a suggestion': {
        options: {
            manifest: {
                components: { myComponent: 'my.html' },
                connectors: {},
                routes: {
                    'GET /': { type: 'view', layout: 'myComponant' } // Опечатка
                }
            }
        },
        run: runTypoSuggestionTest
    }
};