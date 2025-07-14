const path = require('path');

// Определяем корень проекта один раз, чтобы использовать в путях
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Вспомогательная функция для логирования. Делает вывод заметнее.
 * @param {string} message - Сообщение для вывода.
 * @param {any} [data] - Необязательные данные для вывода.
 */
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data) {
        // Используем JSON.stringify для красивого вывода объектов
        console.log(JSON.stringify(data, null, 2));
    }
}

/**
 * Вспомогательная функция для проверки.
 * @param {boolean} condition - Условие.
 * @param {string} description - Описание проверки.
 * @param {any} [actual] - Фактическое значение для вывода в случае ошибки.
 */
function check(condition, description, actual) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual) {
            console.error('     ACTUAL VALUE:', actual);
        }
        // Выбрасываем ошибку, чтобы остановить тест
        throw new Error(`Assertion failed: ${description}`);
    }
}

/**
 * Инициализирует полное тестовое окружение.
 */
function setupEnvironment(appPath) {
    log('Setting up test environment...');
    const { Renderer } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/renderer.js'));
    const { AssetLoader } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js'));
    const { ConnectorManager } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js'));
    
    const manifest = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifest);
    const assetLoader = new AssetLoader(appPath, manifest);
    const renderer = new Renderer(assetLoader, manifest, connectorManager);
    log('Environment setup complete.');
    return { manifest, renderer };
}


// --- Тестовые Сценарии ---

async function runBasicRenderingTest(appPath) {
    const { renderer } = setupEnvironment(appPath);

    const dataContext = { name: 'World' };
    log('Calling renderComponent with context:', dataContext);
    const { html } = await renderer.renderComponent('hello', dataContext);
    log('Received HTML:', html);

    check(
        /<h1[^>]*>Hello, World!<\/h1>/.test(html),
        'Rendered HTML should contain "<h1>Hello, World!</h1>" with any attributes.'
    );
}

async function runAtomIfRemovesElementTest(appPath) {
    const { renderer } = setupEnvironment(appPath);

    const dataContext = { show: false };
    log('Calling renderComponent with context:', dataContext);
    const { html } = await renderer.renderComponent('conditional', dataContext);
    log('Received HTML:', html);

    check(!html.includes('You should not see this'), 'Element with false atom-if condition should be removed.', html);
    check(html.includes('<div></div>'), 'The parent element should remain.', html);
}

async function runAtomIfKeepsElementTest(appPath) {
    const { renderer } = setupEnvironment(appPath);

    const dataContext = { user: { isAdmin: true } };
    log('Calling renderComponent with context:', dataContext);
    const { html } = await renderer.renderComponent('conditional', dataContext);
    log('Received HTML:', html);
    
    check(html.includes('Welcome, Admin!'), 'Element with true atom-if condition should be kept.', html);
    check(!html.includes('atom-if'), 'The atom-if attribute itself should be removed after processing.', html);
}

async function runScopedCssTest(appPath) {
    const { renderer } = setupEnvironment(appPath);
    
    log('Calling renderComponent to test scoped CSS...');
    const { html, styles } = await renderer.renderComponent('card', {});
    log('Received HTML:', html);
    log('Received Styles:', styles);

    const componentIdMatch = html.match(/data-component-id="([^"]+)"/);
    check(componentIdMatch, 'Rendered HTML should have a data-component-id attribute.');
    const componentId = componentIdMatch[1];
    log(`Extracted component ID: ${componentId}`);

    const scopeSelector = `[data-component-id="${componentId}"]`;
    check(styles.includes(`${scopeSelector} h3`), 'CSS rule for h3 should be scoped.', styles);
    check(styles.includes(`${scopeSelector} {`), 'CSS rule for :host should be scoped to the component ID.', styles);
    check(styles.includes('color: red;'), 'CSS content should be preserved.', styles);
}

async function runViewRenderingTest(appPath) {
    const { manifest, renderer } = setupEnvironment(appPath);
    
    const routeConfig = manifest.routes['GET /'];
    log('Calling renderView for route:', routeConfig);
    const finalHtml = await renderer.renderView(routeConfig, {}, null);
    log('Received final page HTML (first 200 chars):', finalHtml.substring(0, 200) + '...');

    check(finalHtml.includes('<title>TestApp</title>'), 'Global variables should be rendered in layout.', finalHtml);
    check(finalHtml.includes('<header>Header</header>'), 'Header component should be injected.', finalHtml);
    check(finalHtml.includes('<footer><p>© 2024</p></footer>'), 'Footer component should be injected.', finalHtml);
    check(finalHtml.includes('<style data-component-name="header">'), 'Style tag for header component should be added to head.', finalHtml);
    check(finalHtml.includes('font-size: 24px;'), 'Header CSS content should be present.', finalHtml);
    check(finalHtml.includes('/engine-client.js'), 'Client engine script should be included.', finalHtml);
}


// --- Экспорт Тестов ---

module.exports = {
    'Renderer: Basic variable rendering': {
        options: {
            manifest: { components: { 'hello': 'hello.html' } },
            files: { 'app/components/hello.html': '<h1>Hello, {{name}}!</h1>' }
        },
        run: runBasicRenderingTest
    },
    'Renderer: atom-if with false condition should remove element': {
        options: {
            manifest: { components: { 'conditional': 'conditional.html' } },
            files: { 'app/components/conditional.html': '<div><p atom-if="show === false">You should not see this.</p></div>' }
        },
        run: runAtomIfRemovesElementTest
    },
    'Renderer: atom-if with true condition should keep element': {
        options: {
            manifest: { components: { 'conditional': 'conditional.html' } },
            files: { 'app/components/conditional.html': '<div><p atom-if="user.isAdmin === true">Welcome, Admin!</p></div>' }
        },
        run: runAtomIfKeepsElementTest
    },
    'Renderer: Scoped CSS should be applied': {
        options: {
            manifest: {
                components: { 'card': { template: 'card.html', style: 'card.css' } }
            },
            files: {
                'app/components/card.html': '<div><h3>Title</h3></div>',
                'app/components/card.css': 'h3 { color: red; } :host { border: 1px solid black; }'
            }
        },
        run: runScopedCssTest
    },
    'Renderer: View rendering should inject components and styles': {
        options: {
            manifest: {
                globals: { appName: 'TestApp' },
                components: {
                    'layout': 'layout.html',
                    'header': { template: 'header.html', style: 'header.css' },
                    'footer': 'footer.html'
                },
                routes: {
                    'GET /': {
                        type: 'view',
                        layout: 'layout',
                        inject: { 'header': 'header', 'footer': 'footer' }
                    }
                }
            },
            files: {
                'app/components/layout.html': '<!DOCTYPE html><html><head><title>{{appName}}</title></head><body><atom-inject into="header"></atom-inject><main>Content</main><atom-inject into="footer"></atom-inject></body></html>',
                'app/components/header.html': '<header>Header</header>',
                'app/components/header.css': 'h1 { font-size: 24px; }',
                'app/components/footer.html': '<footer><p>© 2024</p></footer>'
            }
        },
        run: runViewRenderingTest
    }
};