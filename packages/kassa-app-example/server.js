// packages/kassa-app-example/server.js
require('dotenv').config(); // Для будущей работы с переменными окружения (например, для БД)
const { createServer } = require('serverokey');

const PORT = process.env.PORT || 3000;
const appPath = __dirname;

try {
  const server = createServer(appPath);

  server.listen(PORT, () => {
    console.log(`🚀 Kassa App running on http://localhost:${PORT}`);
    console.log(`[Serverokey] Application root: ${appPath}`);
  });
} catch (error) {
  console.error('💥 [Serverokey] Failed to start server:');
  console.error(error);
  process.exit(1);
}