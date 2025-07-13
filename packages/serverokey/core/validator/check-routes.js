// core/validator/check-routes.js
const path = require('path');
const { addIssue, checkFileExists } = require('./utils');

// --- УТИЛИТА ДЛЯ ПОДСКАЗОК (LEVENSHTEIN DISTANCE) ---
function getSuggestion(str, validOptions) {
    if (!str || !Array.isArray(validOptions) || validOptions.length === 0) return '';
    let bestMatch = '';
    let minDistance = 3; // Искать опечатки на расстоянии не более 2 символов

    for (const option of validOptions) {
        const d = levenshtein(str, option);
        if (d < minDistance) {
            minDistance = d;
            bestMatch = option;
        }
    }
    return bestMatch ? `Did you mean "${bestMatch}"?` : '';
}

function levenshtein(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
        }
    }
    return matrix[b.length][a.length];
}


function validateRoutes(manifest, appPath) {
  const routes = manifest.routes || {};
  const componentNames = Object.keys(manifest.components || {});
  const connectorNames = Object.keys(manifest.connectors || {});

  for (const routeKey in routes) {
    const route = routes[routeKey];
    const category = `Route '${routeKey}'`;

    if (!route.type || !['view', 'action'].includes(route.type)) {
      addIssue('error', category, `Route is missing or has invalid 'type'. Must be 'view' or 'action'.`);
      continue;
    }
    if (route.type === 'view') {
      validateViewRoute(route, category, componentNames, connectorNames);
    }
    if (route.type === 'action') {
      validateActionRoute(route, category, componentNames, connectorNames, appPath);
    }
  }
}

function validateViewRoute(route, category, componentNames, connectorNames) {
  if (!route.layout) {
    addIssue('error', category, `View route is missing 'layout' property.`);
  } else if (!componentNames.includes(route.layout)) {
    addIssue('error', category, `Layout component '${route.layout}' is not defined in 'manifest.components'.`, getSuggestion(route.layout, componentNames));
  }

  (route.reads || []).forEach(name => {
    if (!connectorNames.includes(name)) {
      addIssue('error', category, `Read connector '${name}' is not defined in 'manifest.connectors'.`, getSuggestion(name, connectorNames));
    }
  });

  for (const placeholder in route.inject) {
    const componentName = route.inject[placeholder];
    if (!componentNames.includes(componentName)) {
      addIssue('error', category, `Injected component '${componentName}' is not defined in 'manifest.components'.`, getSuggestion(componentName, componentNames));
    }
  }
}

function validateActionRoute(route, category, componentNames, connectorNames, appPath) {
  const logicTypes = ['handler', 'manipulate', 'steps'].filter(t => route[t]);
  if (logicTypes.length === 0) {
    addIssue('error', category, `Action route must have one of 'handler', 'manipulate', or 'steps'.`);
  } else if (logicTypes.length > 1) {
    addIssue('warning', category, `Multiple logic types defined (${logicTypes.join(', ')}). Priority is: steps > manipulate > handler.`);
  }
  
  const reads = new Set(route.reads || []);

  if (route.handler) {
    checkFileExists(path.join(appPath, 'app', 'actions', `${route.handler}.js`), category, `handler '${route.handler}'`);
  }
  
  if (route.manipulate) {
    if (route.manipulate.operation?.startsWith('custom:')) {
      const opName = route.manipulate.operation.substring(7);
      checkFileExists(path.join(appPath, 'app', 'operations', `${opName}.js`), category, `custom operation '${opName}'`);
    }
    if (route.manipulate.operation === 'push' && route.manipulate.source) {
        const sourceConnector = route.manipulate.source.split('.')[0];
        if (!reads.has(sourceConnector)) {
            addIssue('error', category, `manipulate.source "${route.manipulate.source}" requires connector "${sourceConnector}" to be listed in 'reads'.`, getSuggestion(sourceConnector, connectorNames));
        }
    }
  }
  
  (route.reads || []).forEach(name => {
    if (!connectorNames.includes(name)) addIssue('error', category, `Read connector '${name}' is not defined.`, getSuggestion(name, connectorNames));
  });
  
  (route.writes || []).forEach(name => {
    if (!connectorNames.includes(name)) addIssue('error', category, `Write connector '${name}' is not defined.`, getSuggestion(name, connectorNames));
  });
  
  if (!route.update) {
    addIssue('error', category, `Action route is missing 'update' property, which specifies which component to re-render.`);
  } else if (!componentNames.includes(route.update)) {
    addIssue('error', category, `Update component '${route.update}' is not defined.`, getSuggestion(route.update, componentNames));
  }

  if (Array.isArray(route.steps)) {
    checkSteps(route.steps, category, reads, appPath);
  }
}

function checkSteps(steps, category, availableReads, appPath) {
    steps.forEach(step => {
        if (!step) return;
        if(step.then) checkSteps(step.then, category, availableReads, appPath);
        if(step.else) checkSteps(step.else, category, availableReads, appPath);
        if(step.steps) checkSteps(step.steps, category, availableReads, appPath);
        if(step.if) checkExpression(step.if, category, availableReads);
        if(step.forEach) checkExpression(step.forEach, category, availableReads);
        if(step['http:get']) {
            const httpConfig = step['http:get'];
            if (!httpConfig.url) addIssue('error', category, `Step 'http:get' is missing required 'url' property.`);
            if (!httpConfig.saveTo) addIssue('error', category, `Step 'http:get' is missing required 'saveTo' property.`);
            if(httpConfig.saveTo && !httpConfig.saveTo.startsWith('context.')) addIssue('warning', category, `In 'http:get', it is recommended to save results to 'context.' (e.g., 'context.myVar' instead of '${httpConfig.saveTo}').`);
        }
    });
}

function checkExpression(expression, category, availableReads) {
    const varRegex = /(?<!['"])\b[a-zA-Z_][\w.]*\b(?!['"])/g;
    const potentialVars = String(expression).match(varRegex) || [];

    potentialVars.forEach(v => {
        if (['true', 'false', 'null', 'undefined'].includes(v)) return;
        
        const rootVar = v.split('.')[0];
        if (rootVar === 'context' || rootVar === 'body') return;
        
        if (!availableReads.has(rootVar)) {
            addIssue('error', category, `Expression "${expression}" uses variable "${v}" but its source "${rootVar}" is not listed in 'reads'.`, `Available reads: [${Array.from(availableReads).join(', ')}]`);
        }
    });
}

module.exports = validateRoutes;