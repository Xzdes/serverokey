// tests/connectors-edge-cases.test.js
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Пути к модулям и очистка кэша
const CONNECTOR_MANAGER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js');
if (require.cache[CONNECTOR_MANAGER_PATH]) delete require.cache[CONNECTOR_MANAGER_PATH];
['connectors/wise-json-connector.js', 'migrator.js'].forEach(file => {
    const modulePath = path.join(PROJECT_ROOT, 'packages/serverokey/core', file);
    if (require.cache[modulePath]) delete require.cache[modulePath];
});

// Вспомогательные функции
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
        if (actual !== undefined) console.error('     ACTUAL VALUE:', actual);
        throw new Error(`Assertion failed: ${description}`);
    }
}

// --- Тестовые Сценарии ---

async function runComplexMigrationTest(appPath) {
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);
    
    // --- Шаг 1: Записываем данные в "старом" формате ---
    const oldManifest = {
        connectors: {
            profiles: { type: 'wise-json', collection: 'complex_profiles' }
        }
    };
    log('Initializing with OLD manifest to write initial data...');
    const oldConnectorManager = new ConnectorManager(appPath, oldManifest);
    // --- ИСПРАВЛЕНИЕ: Ждем полной загрузки коннекторов ---
    await oldConnectorManager.loadAll();
    
    const oldProfilesConnector = oldConnectorManager.getConnector('profiles');
    
    const oldData = {
        items: [
            { id: 1, name: 'Charlie', info: { address: { street: 'Main St.' } } },
            { id: 2, name: 'Dana', active: false, info: { address: { street: 'Side St.', city: 'Oldtown' } } },
            { id: 3, name: 'Eve', info: {} }
        ]
    };
    log('Writing old data format:', oldData);
    await oldProfilesConnector.write(oldData);

    // --- Шаг 2: Читаем данные с "новым" манифестом ---
    const newManifest = {
        connectors: {
            profiles: {
                type: 'wise-json',
                collection: 'complex_profiles',
                migrations: [
                    { "if_not_exists": "active", "set": { "active": true } },
                    { "if_not_exists": "updatedBy", "set": { "updatedBy": "migration_script" } }
                ]
            }
        }
    };
    log('Re-initializing with NEW manifest containing complex migration rules...');
    const newConnectorManager = new ConnectorManager(appPath, newManifest);
    // --- ИСПРАВЛЕНИЕ: Ждем полной загрузки коннекторов ---
    await newConnectorManager.loadAll();
    
    const newProfilesConnector = newConnectorManager.getConnector('profiles');
    
    log('Reading data, expecting migrations to run...');
    const migratedData = await newProfilesConnector.read();
    log('Migrated data:', migratedData);
    
    // --- Шаг 3: Проверяем результат ---
    const charlie = migratedData.items.find(u => u.id === 1);
    const dana = migratedData.items.find(u => u.id === 2);
    const eve = migratedData.items.find(u => u.id === 3);
    
    check(charlie, 'Profile Charlie should exist.');
    check(dana, 'Profile Dana should exist.');
    check(eve, 'Profile Eve should exist.');

    check(charlie.active === true, 'Charlie should have `active: true` added by migration.');
    check(dana.active === false, 'Dana\'s `active` status should remain unchanged (false).');
    check(eve.active === true, 'Eve should have `active: true` added by migration.');

    check(charlie.updatedBy === 'migration_script', 'Charlie should have `updatedBy` field added.');
    check(dana.updatedBy === 'migration_script', 'Dana should have `updatedBy` field added.');
    check(eve.updatedBy === 'migration_script', 'Eve should have `updatedBy` field added.');
}

module.exports = {
    'Connectors Edge Cases: Should handle multiple migrations correctly': {
        options: {},
        run: runComplexMigrationTest
    },
};