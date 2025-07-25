// tests/connectors.test.js
const path = require('path');
const fs = require('fs/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const CONNECTOR_MANAGER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js');
if (require.cache[CONNECTOR_MANAGER_PATH]) delete require.cache[CONNECTOR_MANAGER_PATH];
const WISE_JSON_CONNECTOR_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/connectors/wise-json-connector.js');
if (require.cache[WISE_JSON_CONNECTOR_PATH]) delete require.cache[WISE_JSON_CONNECTOR_PATH];

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

async function runInMemoryConnectorTest(appPath) {
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));
    log('Initializing ConnectorManager with in-memory connector...');
    const connectorManager = new ConnectorManager(appPath, manifest);
    // --- ИСПРАВЛЕНИЕ ---
    await connectorManager.loadAll();

    const stateConnector = connectorManager.getConnector('viewState');
    check(stateConnector, 'Connector "viewState" should be initialized.');
    let currentState = await stateConnector.read();
    check(currentState.filter === 'none', 'Initial state should match the one defined in manifest.');
    const newState = { filter: 'active', count: 10, items: [1, 2, 3] };
    await stateConnector.write(newState);
    currentState = await stateConnector.read();
    check(currentState.filter === 'active', 'Filter should be updated to "active".');
}

async function runWiseJsonBasicTest(appPath) {
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));
    
    log('Initializing ConnectorManager with wise-json connector...');
    const connectorManager = new ConnectorManager(appPath, manifest);
    // --- ИСПРАВЛЕНИЕ ---
    await connectorManager.loadAll();

    const productsConnector = connectorManager.getConnector('products');
    
    const dbPath = path.join(appPath, 'wise-db-data', 'products-storage');
    log(`Checking for DB directory at: ${dbPath}`);
    const dirExists = await fs.stat(dbPath).then(s => s.isDirectory()).catch(() => false);
    check(dirExists, 'Database directory should be created on initialization.');

    log('Reading initial state from wise-json connector...');
    let data = await productsConnector.read();
    log('Initial state:', data);
    check(data.items.length === 0, 'Initially, items array should be empty.');
    check(data.version === '1.0', 'Initially, metadata "version" should be "1.0".');

    const newData = {
        version: '1.1',
        lastUpdate: '2024',
        items: [{ id: 1, name: 'Milk' }]
    };
    log('Writing new data to wise-json connector...', newData);
    await productsConnector.write(newData);
    
    log('Re-initializing ConnectorManager to read saved data...');
    const newConnectorManager = new ConnectorManager(appPath, manifest);
    // --- ИСПРАВЛЕНИЕ ---
    await newConnectorManager.loadAll();
    const reloadedConnector = newConnectorManager.getConnector('products');
    
    data = await reloadedConnector.read();
    log('Reloaded data:', data);
    check(data.items.length === 1, 'Saved item should be present after reload.');
    check(data.items[0].name === 'Milk', 'Saved item should have correct data.');
    check(data.version === '1.1', 'Saved metadata "version" should be "1.1".');
}

async function runWiseJsonMigrationTest(appPath) {
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);
    
    const oldManifest = {
        connectors: {
            users: { type: 'wise-json', collection: 'users' }
        }
    };
    log('Initializing with OLD manifest to write initial data...');
    const oldConnectorManager = new ConnectorManager(appPath, oldManifest);
    // --- ИСПРАВЛЕНИЕ ---
    await oldConnectorManager.loadAll();
    const oldUsersConnector = oldConnectorManager.getConnector('users');
    
    const oldData = {
        items: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob', status: 'active' }
        ]
    };
    log('Writing old data format:', oldData);
    await oldUsersConnector.write(oldData);

    const newManifest = {
        connectors: {
            users: {
                type: 'wise-json',
                collection: 'users',
                migrations: [
                    {
                        "if_not_exists": "status",
                        "set": { "status": "pending" }
                    }
                ]
            }
        }
    };
    log('Re-initializing with NEW manifest containing migration rules...');
    const newConnectorManager = new ConnectorManager(appPath, newManifest);
    // --- ИСПРАВЛЕНИЕ ---
    await newConnectorManager.loadAll();
    const newUsersConnector = newConnectorManager.getConnector('users');
    
    log('Reading data, expecting migration to run...');
    const migratedData = await newUsersConnector.read();
    log('Migrated data:', migratedData);
    
    const alice = migratedData.items.find(u => u.id === 1);
    const bob = migratedData.items.find(u => u.id === 2);
    
    check(alice, 'User Alice should exist.');
    check(bob, 'User Bob should exist.');
    check(alice.status === 'pending', 'User Alice should have "status" field added by migration.');
    check(bob.status === 'active', 'User Bob\'s status should remain unchanged.');
}

module.exports = {
    'Connectors: in-memory connector should read initial state and write new data': {
        options: {
            manifest: {
                connectors: { viewState: { type: 'in-memory', initialState: { filter: 'none', count: 0, items: [] } } }
            }
        },
        run: runInMemoryConnectorTest
    },
    'Connectors: wise-json connector should handle basic read/write and persistence': {
        options: {
            manifest: {
                connectors: {
                    products: {
                        type: 'wise-json',
                        collection: 'products-storage',
                        initialState: { version: '1.0', items: [] }
                    }
                }
            }
        },
        run: runWiseJsonBasicTest
    },
    'Connectors: wise-json connector should apply migrations on read': {
        options: {},
        run: runWiseJsonMigrationTest
    }
};