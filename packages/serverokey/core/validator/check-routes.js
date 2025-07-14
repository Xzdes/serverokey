// core/validator/check-routes.js
const fs = require('fs');
const path = require('path');
const { addIssue, checkFileExists } = require('./utils');

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

function getSuggestion(str, validOptions) {
    if (!str || !Array.isArray(validOptions) || validOptions.length === 0) return '';
    let bestMatch = '';
    let minDistance = Math.floor(str.length / 2); // Дистанция не более половины длины слова
    if (minDistance < 2) minDistance = 2;


    for (const option of validOptions) {
        const d = levenshtein(str, option);
        if (d < minDistance) {
            minDistance = d;
            bestMatch = option;
        }
    }
    return bestMatch ? `Did you mean "${bestMatch}"?` : '';
}

function validateRoutes(manifest, appPath) {
  const routes = manifest.routes || {};
  const componentNames = Object.keys(manifest.components || {});
  const connectorNames = Object.keys(manifest.connectors || {});

  for (const routeKey in routes) {
    const route = routes[routeKey];
    const category = `Route '${routeKey}'`;

    const validTypes = ['view', 'action'];
    if (!route.type || !validTypes.includes(route.type)) {
      addIssue('error', category, `Route is missing or has invalid 'type'. Must be one of: ${validTypes.join(', ')}.`);
      continue;
    }

    if (route.type === 'view') {
      validateViewRoute(route, category, componentNames, connectorNames);
    } else if (route.type === 'action') {
      validateActionRoute(route, category, componentNames, connectorNames, appPath, manifest);
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

function validateActionRoute(route, category, componentNames, connectorNames, appPath, manifest) {
  if (route.internal === true) {
      return;
  }

  if (!route.steps) {
    addIssue('error', category, `Action route must have a 'steps' property.`);
    return;
  }

  const reads = new Set(route.reads || []);

  (route.reads || []).forEach(name => {
    if (!connectorNames.includes(name)) addIssue('error', category, `Read connector '${name}' is not defined.`, getSuggestion(name, connectorNames));
  });
  
  (route.writes || []).forEach(name => {
    if (!connectorNames.includes(name)) addIssue('error', category, `Write connector '${name}' is not defined.`, getSuggestion(name, connectorNames));
  });
  
  const hasRedirect = route.steps && JSON.stringify(route.steps).includes('"client:redirect"');

  if (!route.update && !hasRedirect) {
    addIssue('error', category, `Action route is missing 'update' property and does not perform a 'client:redirect'. You must specify which component to re-render.`);
  } else if (route.update && !componentNames.includes(route.update)) {
    addIssue('error', category, `Update component '${route.update}' is not defined.`, getSuggestion(route.update, componentNames));
  }

  if (Array.isArray(route.steps)) {
    checkSteps(route.steps, category, reads, appPath, manifest);
  }
}

function checkSteps(steps, category, availableReads, appPath, manifest) {
    steps.forEach(step => {
        if (!step) return;
        if(step.run) {
             const runPath = path.join(appPath, 'app', 'actions', step.run + '.js');
             if (!fs.existsSync(runPath)) {
                 const allActions = fs.readdirSync(path.join(appPath, 'app', 'actions')).map(f => f.replace('.js', ''));
                 addIssue('error', category, `File not found for run script '${step.run}'. Looked in: ${runPath}`, getSuggestion(step.run, allActions));
             }
        }
        if(step.then) checkSteps(step.then, category, availableReads, appPath, manifest);
        if(step.else) checkSteps(step.else, category, availableReads, appPath, manifest);
        if(step.steps) checkSteps(step.steps, category, availableReads, appPath, manifest);
        if(step.if) checkExpression(step.if, category, availableReads);
        if(step.forEach) checkExpression(step.forEach, category, availableReads);
        if(step['http:get']) {
            const httpConfig = step['http:get'];
            if (!httpConfig.url) addIssue('error', category, `Step 'http:get' is missing required 'url' property.`);
            if (!httpConfig.saveTo) addIssue('error', category, `Step 'http:get' is missing required 'saveTo' property.`);
            if(httpConfig.saveTo && !httpConfig.saveTo.startsWith('context.')) addIssue('warning', category, `In 'http:get', it is recommended to save results to 'context.' (e.g., 'context.myVar' instead of '${httpConfig.saveTo}').`);
        }
        if(step['action:run'] && step['action:run'].name) {
            const actionName = step['action:run'].name;
            if (!manifest.routes[actionName]) {
                addIssue('error', category, `Internal action '${actionName}' for 'action:run' is not defined in routes.`, getSuggestion(actionName, Object.keys(manifest.routes)));
            }
        }
    });
}

function checkExpression(expression, category, availableReads) {
    const varRegex = /(?<!['"])\b[a-zA-Z_][\w.]*\b(?!['"])/g;
    const potentialVars = String(expression).match(varRegex) || [];
    const allowedGlobals = ['true', 'false', 'null', 'undefined', 'context', 'body', 'user', 'require', 'zod', 'Math', 'Number', 'String', 'Object', 'Array', 'Date', 'JSON', 'bcrypt'];

    potentialVars.forEach(v => {
        const rootVar = v.split('.')[0];
        if (allowedGlobals.includes(rootVar)) return;
        
        if (rootVar === 'data') {
            const connectorName = v.split('.')[1];
            if (!availableReads.has(connectorName)) {
                 addIssue('error', category, `Expression "${expression}" uses variable "${v}" but its source connector "${connectorName}" is not listed in 'reads'.`, `Available reads: [${Array.from(availableReads).join(', ')}]`);
            }
        } else {
            addIssue('warning', category, `Expression "${expression}" uses variable "${v}" which is not a known global or part of the 'data' context. Did you mean 'data.${v}'?`);
        }
    });
}

module.exports = validateRoutes;