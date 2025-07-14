const path = require('path');
const fs = require('fs/promises');

// Определяем корень проекта для надежных путей
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очищаем кэш для валидатора перед запуском, чтобы гарантировать свежесть кода
const VALIDATOR_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/validator/index.js');
if (require.cache[VALIDATOR_PATH]) {
    delete require.cache[VALIDATOR_PATH];
}

/**
 * Вспомогательная функция для логирования.
 */
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        // Используем JSON.stringify для красивого вывода объектов
        console.log(JSON.stringify(data, null, 2));
    }
}

/**
 * Вспомогательная функция для проверки утверждений.
 */
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
    
    check(issues.length > 0, 'Expected at least one issue.');
    const issue = issues[0];
    check(issue.level === 'error', 'Issue level should be "error".');
    check(
        issue.message.includes("missing the 'type' property"),
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


// --- Экспорт Тестов для Runner'а ---

module.exports = {
    'Validator: A valid manifest should pass': {
        options: {
            manifest: {
                components: { main: 'main.html' },
                connectors: { db: { type: 'in-memory', initialState: {} } },
                routes: { 'GET /': { type: 'view', layout: 'main', reads: ['db'] } }
            },
            files: {
                'app/components/main.html': '<div>Hello</div>'
            }
        },
        run: runValidManifestTest
    },
    'Validator: Missing required sections should fail': {
        options: {
            manifest: {
                components: { main: 'main.html' },
                connectors: { db: { type: 'in-memory', initialState: {} } },
            },
            files: {} 
        },
        run: runMissingSectionsTest
    },
    'Validator: Connector with missing type should fail': {
        options: {
            manifest: {
                components: {},
                connectors: { db: { initialState: {} } },
                routes: {}
            },
            files: {}
        },
        run: runConnectorNoTypeTest
    },
    'Validator: Typo in component name should provide a suggestion': {
        options: {
            manifest: {
                components: { myComponent: 'my.html' },
                connectors: {},
                routes: {
                    'GET /': { type: 'view', layout: 'myComponant' } 
                }
            },
            files: {
                'app/components/my.html': ' '
            }
        },
        run: runTypoSuggestionTest
    }
};