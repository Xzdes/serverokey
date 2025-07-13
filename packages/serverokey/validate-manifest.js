#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const validateManifest = require('./core/validator');

console.log('🔍 [Validator] Starting manifest validation...');

const appPath = process.cwd();
const manifestPath = path.join(appPath, 'manifest.js');

const C_RESET = '\x1b[0m';
const C_RED = '\x1b[31m';
const C_YELLOW = '\x1b[33m';
const C_CYAN = '\x1b[36m';
const C_GRAY = '\x1b[90m';

let manifest;
let manifestContent = '';
try {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.js not found in the current directory: ${appPath}`);
  }
  manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  manifest = require(manifestPath);
} catch (e) {
  console.error(`${C_RED}[CRITICAL] Could not load or parse manifest.js: ${e.message}${C_RESET}`);
  process.exit(1);
}

function validateRequires(content, appPath) {
    const { addIssue } = require('./core/validator/utils');
    const requireRegex = /require\(['"](.+?)['"]\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
        const requiredPath = match[1];
        try {
            // Используем resolve, чтобы Node.js сам нашел файл (.js, .json, etc.)
            require.resolve(requiredPath, { paths: [appPath] });
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') {
                addIssue('error', 'Manifest Dependencies', `Required file or module not found: ${requiredPath}`);
            }
        }
    }
}

const issues = validateManifest(manifest, appPath);
validateRequires(manifestContent, appPath);


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
    
    if (issues.some(i => i.level === 'error' || i.level === 'critical')) {
      process.exit(1);
    }
}