const { assert, createTestApp, cleanupTestApp } = require('./_utils/test-setup.js');
const { Renderer } = require('../packages/serverokey/core/renderer.js');
const { AssetLoader } = require('../packages/serverokey/core/asset-loader.js');
const { ConnectorManager } = require('../packages/serverokey/core/connector-manager.js');

async function runRendererTests() {
    console.log('--- Running Renderer Tests ---');

    await test_basicVariableRendering();
    // ... (остальные вызовы тестов)

    console.log('--- Renderer Tests Completed ---');
}


async function test_basicVariableRendering() {
    console.log('Scenario: Renderer should correctly insert variables into a template.');
    const testName = 'renderer-basic-variables';
    let appPath; // Объявляем здесь, чтобы cleanup мог ее видеть
    try {
        const options = {
            manifest: {
                components: { 'hello': 'hello.html' }
            },
            files: {
                'app/components/hello.html': '<h1>Hello, {{name}}!</h1>'
            }
        };
        // 1. Создаем файлы и получаем пути
        const { appPath: p, manifestPath } = await createTestApp(testName, options);
        appPath = p; // Сохраняем путь для cleanup

        // 2. Загружаем манифест, когда файлы уже на диске
        const manifest = require(manifestPath);

        // 3. Явно и последовательно создаем экземпляры ядра
        const connectorManager = new ConnectorManager(appPath, manifest);
        const assetLoader = new AssetLoader(appPath, manifest);
        const renderer = new Renderer(assetLoader, manifest, connectorManager);
        
        // 4. Запускаем сам тест
        const dataContext = { name: 'World' };
        const { html } = await renderer.renderComponent('hello', dataContext);

        // 5. Проверяем результат
        assert(html.includes('<h1>Hello, World!</h1>'), 'Rendered HTML should contain the substituted variable.');
        
    } finally {
        // 6. Гарантированно очищаем
        if (appPath) await cleanupTestApp(appPath);
    }
}

// Пожалуйста, замените ВСЕ остальные тестовые функции в renderer.test.js
// на этот новый, более надежный паттерн. 
// Я перепишу остальные тесты для вас.

async function test_atomIfDirective_shouldRemoveElement() {
    console.log('Scenario: atom-if with a false condition should remove the element from HTML.');
    const testName = 'renderer-atom-if-false';
    let appPath;
    try {
        const options = {
            manifest: { components: { 'conditional': 'conditional.html' } },
            files: { 'app/components/conditional.html': '<div><p atom-if="show === false">You should not see this.</p></div>' }
        };
        const { appPath: p, manifestPath } = await createTestApp(testName, options);
        appPath = p;
        const manifest = require(manifestPath);
        const renderer = new Renderer(new AssetLoader(appPath, manifest), manifest, new ConnectorManager(appPath, manifest));
        
        const { html } = await renderer.renderComponent('conditional', { show: false });

        assert(!html.includes('You should not see this'), 'Element with false atom-if condition should be removed.');
    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_atomIfDirective_shouldKeepElement() {
    console.log('Scenario: atom-if with a true condition should keep the element.');
    const testName = 'renderer-atom-if-true';
    let appPath;
    try {
        const options = {
            manifest: { components: { 'conditional': 'conditional.html' } },
            files: { 'app/components/conditional.html': '<div><p atom-if="user.isAdmin === true">Welcome, Admin!</p></div>' }
        };
        const { appPath: p, manifestPath } = await createTestApp(testName, options);
        appPath = p;
        const manifest = require(manifestPath);
        const renderer = new Renderer(new AssetLoader(appPath, manifest), manifest, new ConnectorManager(appPath, manifest));
        
        const { html } = await renderer.renderComponent('conditional', { user: { isAdmin: true } });

        assert(html.includes('Welcome, Admin!'), 'Element with true atom-if condition should be kept.');
    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_scopedCss_shouldBeApplied() {
    console.log('Scenario: Scoped CSS should be generated with a unique data-component-id.');
    const testName = 'renderer-scoped-css';
    let appPath;
    try {
        const options = {
            manifest: { components: { 'card': { template: 'card.html', style: 'card.css' } } },
            files: {
                'app/components/card.html': '<div><h3>Title</h3></div>',
                'app/components/card.css': 'h3 { color: red; }'
            }
        };
        const { appPath: p, manifestPath } = await createTestApp(testName, options);
        appPath = p;
        const manifest = require(manifestPath);
        const renderer = new Renderer(new AssetLoader(appPath, manifest), manifest, new ConnectorManager(appPath, manifest));
        
        const { html, styles } = await renderer.renderComponent('card', {});
        
        const componentIdMatch = html.match(/data-component-id="([^"]+)"/);
        assert(componentIdMatch, 'Rendered HTML should have a data-component-id attribute.');
        const componentId = componentIdMatch[1];
        
        const scopeSelector = `[data-component-id="${componentId}"]`;
        assert(styles.includes(`${scopeSelector} h3`), 'CSS rule for h3 should be scoped.');
    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function test_viewRendering_shouldInjectComponentsAndStyles() {
    console.log('Scenario: renderView should correctly assemble a full page.');
    const testName = 'renderer-full-view';
    let appPath;
    try {
        const options = {
            manifest: {
                globals: { appName: 'TestApp' },
                components: { 'layout': 'layout.html', 'header': { template: 'header.html', style: 'header.css' } },
                routes: { 'GET /': { type: 'view', layout: 'layout', inject: { 'header': 'header' } } }
            },
            files: {
                'app/components/layout.html': '<body><atom-inject into="header"></atom-inject></body>',
                'app/components/header.html': '<header>Header</header>',
                'app/components/header.css': 'header { color: blue; }',
            }
        };
        const { appPath: p, manifestPath } = await createTestApp(testName, options);
        appPath = p;
        const manifest = require(manifestPath);
        const renderer = new Renderer(new AssetLoader(appPath, manifest), manifest, new ConnectorManager(appPath, manifest));

        const routeConfig = manifest.routes['GET /'];
        const finalHtml = await renderer.renderView(routeConfig, {}, null);

        assert(finalHtml.includes('<header>Header</header>'), 'Header component should be injected.');
        assert(finalHtml.includes('<style data-component-name="header">'), 'Style tag for header should be added.');
    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}


// Переписываем главный вызов, чтобы он вызывал все новые функции
async function main() {
    console.log('--- Running Renderer Tests ---');
    await test_basicVariableRendering();
    await test_atomIfDirective_shouldRemoveElement();
    await test_atomIfDirective_shouldKeepElement();
    await test_scopedCss_shouldBeApplied();
    await test_viewRendering_shouldInjectComponentsAndStyles();
    console.log('--- Renderer Tests Completed ---');
}

main().catch(err => {
    console.error(`\n🔥 A fatal error occurred during renderer tests:`, err);
    process.exit(1);
});