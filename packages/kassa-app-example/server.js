// packages/kassa-app-example/server.js
require('dotenv').config();
const { createServer } = require('serverokey');

const appPath = __dirname;

try {
  const debugMode = process.argv.includes('--debug');

  // Мы больше не передаем порт в createServer. Ядро само решит, какой порт использовать.
  // Мы также больше не храним результат, так как логика запуска теперь внутри ядра.
  createServer(appPath, { debug: debugMode });

  // Логирование перенесено внутрь движка, здесь оно больше не нужно.
  // Это делает код приложения-примера чище.
  console.log(`[Kassa App] Application startup initiated by Serverokey...`);
  if (debugMode) {
    console.log('🐞 [Debug Mode] ON. Verbose logging is enabled.');
  }

} catch (error) {
  console.error('💥 [Serverokey] Failed to start server:');
  console.error(error);
  process.exit(1);
}