#!/usr/bin/env node
// validate-manifest.js
const fs = require('fs');
const path = require('path');

console.log('🔍 [Validator] Starting manifest validation...');

const appPath = process.cwd(); 
const manifestPath = path.join(appPath, 'manifest.js');

const issues = [];
const C_RESET = '\x1b[0m';
const C_RED = '\x1b[31m';
const C_YELLOW = '\x1b[33m';
const C_CYAN = '\x1b[36m';
const C_GRAY = '\x1b[90m';


function getSuggestion(str, validOptions) {
    if (!str || !Array.isArray(validOptions) || validOptions.length === 0) return '';
    for (const option of validOptions) {
        const d = levenshtein(str, option);
        if (d > 0 && d <= 2) {
            return `Did you mean "${option}"?`;
        }
    }
    return '';
}

function levenshtein(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator,
            );
        }
    }
    return matrix[b.length][a.length];
}

function addIssue(level, category, message, suggestion = '') {
    issues.push({ level, category, message, suggestion });
}

function checkFileExists(filePath, category, description) {
    if (!fs.existsSync(filePath)) {
        addIssue('error', category, `File not found for ${description}:`, `  Path: ${filePath}`);
        return false;
    }
    return true;
}

// --- НОВАЯ ФУНКЦИЯ ПРОВЕРКИ №1 ---
function validateComputedFields(manifest) {
    const connectors = manifest.connectors || {};
    for (const connectorName in connectors) {
        const connector = connectors[connectorName];
        if (!Array.isArray(connector.computed)) continue;

        const category = `Connector '${connectorName}'`;
        const initialStateKeys = Object.keys(connector.initialState || {});

        connector.computed.forEach(rule => {
            const formula = rule.formula;
            if (!formula) return;
            
            // Простая проверка для sum(items, 'price') и count(items)
            const match = formula.match(/(?:sum|count)\(([\w\.]+)/);
            if (match) {
                const sourceArray = match[1].split('.')[0]; // Берем только первую часть (например, 'items' из 'items, 'price'')
                if (!initialStateKeys.includes(sourceArray)) {
                    addIssue('warning', category, `Computed formula "${formula}" uses source array "${sourceArray}" which is not defined in initialState.`, getSuggestion(sourceArray, initialStateKeys));
                }
            }
        });
    }
}

// --- НОВАЯ ФУНКЦИЯ ПРОВЕРКИ №2 ---
function validateActionReads(manifest) {
    const routes = manifest.routes || {};
    for (const routeKey in routes) {
        const route = routes[routeKey];
        if (route.type !== 'action' || !Array.isArray(route.steps)) continue;

        const category = `Route '${routeKey}'`;
        const availableReads = new Set(route.reads || []);

        function checkExpression(expression) {
            if (typeof expression !== 'string') return;
            // Находим все "слова", которые могут быть переменными
            const potentialVars = expression.match(/[\w\.]+/g) || [];
            potentialVars.forEach(v => {
                // Игнорируем числа и булевы значения
                if (!isNaN(v) || v === 'true' || v === 'false') return;
                
                const rootVar = v.split('.')[0];
                if (rootVar === 'context' || rootVar === 'body') return; // Игнорируем специальные переменные

                if (!availableReads.has(rootVar)) {
                    addIssue('error', category, `Expression "${expression}" uses variable "${v}" but its source "${rootVar}" is not listed in 'reads'.`, `Available reads: [${Array.from(availableReads).join(', ')}]`);
                }
            });
        }
        
        function traverseSteps(steps) {
            if (!Array.isArray(steps)) return;
            steps.forEach(step => {
                if (step.if) checkExpression(step.if);
                if (step.then) traverseSteps(step.then);
                if (step.else) traverseSteps(step.else);
                if (step.forEach) checkExpression(step.forEach);
                if (step.steps) traverseSteps(step.steps);
            });
        }

        traverseSteps(route.steps);
    }
}


try {
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`manifest.js not found in the current directory: ${appPath}`);
    }

    const manifest = require(manifestPath);
    const connectorNames = Object.keys(manifest.connectors || {});
    const componentNames = Object.keys(manifest.components || {});

    // 1. Validate 'globals' section
    (manifest.globals?.injectData || []).forEach(name => {
        if(!connectorNames.includes(name)) {
             addIssue('error', 'Globals', `Injected connector '${name}' is not defined in 'manifest.connectors'.`, getSuggestion(name, connectorNames));
        }
    });

    // 2. Validate 'components' section
    for (const name of componentNames) {
        const config = manifest.components[name];
        const template = typeof config === 'string' ? config : config.template;
        const style = config.style;
        if (template) {
            checkFileExists(path.join(appPath, 'app', 'components', template), 'Components', `template for component '${name}'`);
        } else {
             addIssue('error', 'Components', `Component '${name}' is missing a 'template' definition.`);
        }
        if (style) {
            checkFileExists(path.join(appPath, 'app', 'components', style), 'Components', `style for component '${name}'`);
        }
    }

    // 3. Validate 'routes' section
    for (const routeKey in manifest.routes) {
        const route = manifest.routes[routeKey];
        const category = `Route '${routeKey}'`;

        if (route.type === 'view') {
            (route.reads || []).forEach(name => {
                if (!connectorNames.includes(name)) addIssue('error', category, `Read connector '${name}' is not defined in 'manifest.connectors'.`, getSuggestion(name, connectorNames));
            });

            if (!componentNames.includes(route.layout)) {
                addIssue('error', category, `Layout component '${route.layout}' is not defined in 'manifest.components'.`, getSuggestion(route.layout, componentNames));
            }
            for (const placeholder in route.inject) {
                const componentName = route.inject[placeholder];
                if (!componentNames.includes(componentName)) {
                    addIssue('error', category, `Injected component '${componentName}' is not defined in 'manifest.components'.`, getSuggestion(componentName, componentNames));
                }
            }
        } else if (route.type === 'action') {
            (route.reads || []).forEach(name => {
                if (!connectorNames.includes(name)) addIssue('error', category, `Read connector '${name}' is not defined in 'manifest.connectors'.`, getSuggestion(name, connectorNames));
            });
            (route.writes || []).forEach(name => {
                if (!connectorNames.includes(name)) addIssue('error', category, `Write connector '${name}' is not defined in 'manifest.connectors'.`, getSuggestion(name, connectorNames));
            });
             if (route.update && !componentNames.includes(route.update)) {
                addIssue('error', category, `Update component '${route.update}' is not defined in 'manifest.components'.`, getSuggestion(route.update, componentNames));
            }

            const logicTypes = ['handler', 'manipulate', 'steps'].filter(t => route[t]);
            if (logicTypes.length === 0) {
                 addIssue('error', category, `Action route must have one of 'handler', 'manipulate', or 'steps'.`);
            } else if (logicTypes.length > 1) {
                 addIssue('warning', category, `Multiple logic types defined (${logicTypes.join(', ')}). Priority is: steps > manipulate > handler.`);
            }

            if (route.handler) {
                 checkFileExists(path.join(appPath, 'app', 'actions', `${route.handler}.js`), category, `handler '${route.handler}'`);
            }
            if (route.manipulate && route.manipulate.operation?.startsWith('custom:')) {
                const opName = route.manipulate.operation.substring(7);
                 checkFileExists(path.join(appPath, 'app', 'operations', `${opName}.js`), category, `custom operation '${opName}'`);
            }
        }
    }
    
    // --- НОВЫЙ БЛОК: Запускаем новые проверки ---
    validateComputedFields(manifest);
    validateActionReads(manifest);


} catch (e) {
    addIssue('critical', 'Manifest', `Could not load or parse manifest.js: ${e.message}`);
}

if (issues.length === 0) {
    console.log(`✅ ${C_CYAN}[Validator] Manifest validation successful. No issues found.${C_RESET}`);
} else {
    console.log(`\n🚨 ${C_YELLOW}[Validator] Found ${issues.length} issues:${C_RESET}\n`);
    issues.forEach((issue, i) => {
        const color = issue.level === 'error' || issue.level === 'critical' ? C_RED : C_YELLOW;
        console.log(` ${i + 1}. ${color}[${issue.level.toUpperCase()}]${C_RESET} in ${C_CYAN}${issue.category}${C_RESET}`);
        console.log(`    ${issue.message}`);
        if (issue.suggestion) {
            console.log(`    ${C_GRAY}${issue.suggestion}${C_RESET}`);
        }
        console.log('');
    });
    process.exit(1);
}