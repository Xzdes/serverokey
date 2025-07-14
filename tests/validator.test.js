const path = require('path');
const { assert, createTestApp, cleanupTestApp } = require('./_utils/test-setup.js');

// Импортируем сам валидатор из ядра. Путь указан относительно корня проекта.
const validateManifest = require('../packages/serverokey/core/validator');

/**
 * Главная асинхронная функция, которая запускает все тестовые сценарии для валидатора.
 */
async function runValidatorTests() {
    console.log('--- Running Validator Tests ---');

    // Список всех тестовых сценариев.
    // Мы будем вызывать их последовательно.
    await test_validManifest_shouldPass();
    await test_missingRequiredSections_shouldFail();
    await test_connectorWithMissingType_shouldFail();
    await test_routeWithUndefinedComponent_shouldFail();
    await test_routeWithTypo_shouldSuggestCorrection();
    await test_actionRouteMissingUpdateOrRedirect_shouldFail();
    await test_actionRouteWithValidRedirect_shouldPass();
    
    console.log('--- Validator Tests Completed ---');
}

// --- Сценарии Тестирования ---

async function test_validManifest_shouldPass() {
    console.log('Scenario: A completely valid manifest should produce zero issues.');
    const testName = 'validator-valid-manifest';
    let appPath;
    try {
        const manifest = {
            components: { main: 'main.html' },
            connectors: { db: { type: 'in-memory', initialState: {} } },
            routes: {
                'GET /': { type: 'view', layout: 'main' }
            }
        };
        appPath = await createTestApp(testName, manifest);
        // Создадим фейковый компонент, чтобы проверка существования файла прошла
        await require('fs/promises').writeFile(path.join(appPath, 'app', 'components', 'main.html'), '<div></div>');

        const issues = validateManifest(manifest, appPath);

        assert(issues.length === 0, 'Expected 0 issues for a valid manifest.');

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_missingRequiredSections_shouldFail() {
    console.log('Scenario: A manifest missing a required section (e.g., "routes") should fail.');
    const testName = 'validator-missing-sections';
    let appPath;
    try {
        // Заведомо некорректный манифест без секции `routes`
        const manifest = {
            components: { main: 'main.html' },
            connectors: { db: { type: 'in-memory', initialState: {} } },
        };
        appPath = await createTestApp(testName, manifest);

        const issues = validateManifest(manifest, appPath);

        assert(issues.length > 0, 'Expected at least one issue for missing sections.');
        assert(
            issues.some(issue => issue.level === 'error' && issue.message.includes("'routes' is missing")),
            'Expected an error message about the missing "routes" section.'
        );

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_connectorWithMissingType_shouldFail() {
    console.log('Scenario: A connector missing the "type" property should fail.');
    const testName = 'validator-connector-no-type';
    let appPath;
    try {
        const manifest = {
            components: {},
            // Некорректный коннектор
            connectors: { db: { initialState: {} } }, 
            routes: {}
        };
        appPath = await createTestApp(testName, manifest);

        const issues = validateManifest(manifest, appPath);
        
        assert(issues.length === 1, 'Expected exactly one issue.');
        assert(issues[0].level === 'error', 'Issue level should be "error".');
        assert(
            issues[0].message.includes("missing the 'type' property"),
            'Error message should mention the missing "type" property.'
        );

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_routeWithUndefinedComponent_shouldFail() {
    console.log('Scenario: A view route using a non-existent layout component should fail.');
    const testName = 'validator-undefined-component';
    let appPath;
    try {
        const manifest = {
            components: { correctLayout: 'correct.html' },
            connectors: {},
            routes: {
                'GET /': { type: 'view', layout: 'wrongLayout' } // Используем несуществующий layout
            }
        };
        appPath = await createTestApp(testName, manifest);

        const issues = validateManifest(manifest, appPath);
        
        assert(issues.length > 0, 'Expected issues for an undefined component.');
        assert(
            issues.some(issue => issue.message.includes("'wrongLayout' is not defined")),
            'Error message should mention the undefined layout component.'
        );

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_routeWithTypo_shouldSuggestCorrection() {
    console.log('Scenario: The validator should suggest corrections for common typos.');
    const testName = 'validator-typo-suggestion';
    let appPath;
    try {
        const manifest = {
            components: { myComponent: 'my.html' },
            connectors: {},
            routes: {
                'GET /': { type: 'view', layout: 'myComponant' } // Опечатка в имени
            }
        };
        appPath = await createTestApp(testName, manifest);

        const issues = validateManifest(manifest, appPath);
        
        assert(issues.length > 0, 'Expected issues for a typo.');
        const relevantIssue = issues.find(issue => issue.category.includes('GET /'));
        assert(relevantIssue, 'An issue for the route "GET /" should exist.');
        assert(
            relevantIssue.suggestion.includes('Did you mean "myComponent"?'),
            'Expected a suggestion for the typo.'
        );

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_actionRouteMissingUpdateOrRedirect_shouldFail() {
    console.log('Scenario: An action route without "update" or "client:redirect" should fail.');
    const testName = 'validator-action-no-update';
    let appPath;
    try {
        const manifest = {
            components: {},
            connectors: {},
            routes: {
                'POST /do': {
                    type: 'action',
                    steps: [] // Нет ни update, ни редиректа
                }
            }
        };
        appPath = await createTestApp(testName, manifest);

        const issues = validateManifest(manifest, appPath);

        assert(issues.length > 0, 'Expected an issue for the action route.');
        assert(
            issues.some(i => i.message.includes("missing 'update' property and does not perform a 'client:redirect'")),
            'Error message should state that "update" or "redirect" is required.'
        );
        
    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_actionRouteWithValidRedirect_shouldPass() {
    console.log('Scenario: An action route with a "client:redirect" step should pass validation.');
    const testName = 'validator-action-with-redirect';
    let appPath;
    try {
        const manifest = {
            components: {},
            connectors: {},
            routes: {
                'POST /do': {
                    type: 'action',
                    steps: [
                        { "client:redirect": "'/somewhere'" } // Есть редирект, 'update' не нужен
                    ]
                }
            }
        };
        appPath = await createTestApp(testName, manifest);

        const issues = validateManifest(manifest, appPath);

        assert(issues.length === 0, 'Expected 0 issues for a valid action route with redirect.');
        
    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}


// Запускаем все тесты
runValidatorTests().catch(err => {
    console.error(`\n🔥 A fatal error occurred during validator tests:`, err);
    process.exit(1);
});