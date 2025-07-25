// packages/kassa-app-example/server.js
require('dotenv').config();
const { createServer } = require('serverokey');

const appPath = __dirname;

// --- ИЗМЕНЕНИЕ: Оборачиваем запуск в async-функцию ---
async function main() {
  try {
    const debugMode = process.argv.includes('--debug');

    console.log(`[Kassa App] Initiating Serverokey startup...`);
    if (debugMode) {
      console.log('🐞 [Debug Mode] ON. Verbose logging is enabled.');
    }

    // Ждем, пока createServer полностью отработает и запустит сервер
    await createServer(appPath, { debug: debugMode });

  } catch (error) {
    console.error('💥 [Serverokey] Failed to start server:');
    console.error(error);
    process.exit(1);
  }
}

// Запускаем нашу главную функцию
main();