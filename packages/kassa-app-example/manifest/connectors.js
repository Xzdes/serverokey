// packages/kassa-app-example/manifest/connectors.js
// Этот файл описывает все источники данных, которые использует приложение.
// Такой подход позволяет легко заменять или настраивать источники данных,
// не затрагивая остальную логику манифеста.

module.exports = {
  // Коннектор для хранения сессий пользователей. Управляется AuthEngine.
  // Использует 'wise-json' для персистентного хранения на диске.
  session: { 
    type: 'wise-json', 
    collection: 'sessions' 
  },

  // Коннектор для данных пользователей (логины, хэши паролей и т.д.).
  // initialState определяет, что по умолчанию это будет коллекция объектов.
  user: { 
    type: 'wise-json', 
    collection: 'user', 
    initialState: { "items": [] } 
  },

  // Коннектор для текущего чека. Хранит все его данные:
  // товары, их количество, скидки, итоговые суммы и служебные сообщения.
  receipt: {
    type: 'wise-json',
    collection: 'receipt',
    initialState: { 
      items: [], 
      itemCount: 0, 
      total: 0, 
      discountPercent: 10,
      discount: 0, 
      finalTotal: 0, 
      statusMessage: '', 
      bonusApplied: false
    },
  },

  // Коннектор для хранения списка всех доступных товаров (позиций).
  positions: { 
    type: 'wise-json',
    collection: 'positions',
    initialState: { "items": [] }
  },

  // Коннектор для хранения временного состояния UI, например, текста в поле поиска.
  // Использует 'in-memory', так как эти данные не нужно сохранять между перезапусками сервера.
  viewState: { 
    type: 'in-memory',
    initialState: { 
      query: '', 
      filtered: [] 
    } 
  }
};