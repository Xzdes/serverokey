// packages/kassa-app-example/server.js
require('dotenv').config();
const { createServer } = require('serverokey');

const PORT = process.env.PORT || 3000;
const appPath = __dirname;

try {
  const debugMode = process.argv.includes('--debug');

  // Деструктурируем ответ от createServer, чтобы получить только экземпляр сервера.
  const { server } = createServer(appPath, { debug: debugMode });

  server.listen(PORT, () => {
    console.log(`🚀 Kassa App running on http://localhost:${PORT}`);
    console.log(`[Serverokey] Application root: ${appPath}`);
    if (debugMode) {
      console.log('🐞 [Debug Mode] ON. Verbose logging is enabled.');
    }
  });
} catch (error) {
  console.error('💥 [Serverokey] Failed to start server:');
  console.error(error);
  process.exit(1);
}