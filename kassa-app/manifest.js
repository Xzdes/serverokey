// manifest.js

module.exports = {
  // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И ДАННЫЕ ---
  // Доступны во всех компонентах.
  globals: {
    appName: "Атомарная Касса",
    appVersion: "1.0.0",
    // Автоматически внедряет источник данных 'user' в глобальный контекст.
    injectData: ['user'] 
  },

  // --- ИСТОЧНИКИ ДАННЫХ ---
  // Определяет все управляемые данные в приложении.
  data: {
    // Данные о текущем пользователе.
    user: {
      initialState: {
        name: "Иванов И.И.",
        role: "Кассир"
      }
    },
    // Данные о текущем чеке.
    receipt: {
      initialState: { 
        items: [], 
        total: '0.00',
        itemCount: 0,
        discountPercent: 10,
        discount: '0.00',
        finalTotal: '0.00',
        statusMessage: '',
        bonusApplied: false // Флаг, который показывает, был ли уже применен единоразовый бонус.
      },
      // Вычисляемые поля, которые обновляются автоматически при изменении `receipt`.
      computed: [
        {
          "target": "itemCount",
          "formula": "count(items)" // Встроенная функция: считает элементы в массиве.
        },
        {
          "target": "total",
          "formula": "sum(items, 'price')", // Встроенная функция: суммирует значения поля 'price' в массиве 'items'.
          "format": "toFixed(2)" // Форматирует результат до 2-х знаков после запятой.
        },
        {
          "target": "discount",
          "formula": "total * (discountPercent / 100)", // Простое JS-выражение.
          "format": "toFixed(2)"
        },
        {
          "target": "finalTotal",
          "formula": "total - discount", // Простое JS-выражение.
          "format": "toFixed(2)"
        }
      ]
    },
    // Список всех доступных товаров.
    positions: { 
      initialState: { 
        all: [] 
      } 
    },
    // Состояние интерфейса, не связанное напрямую с бизнес-данными.
    viewState: { 
      initialState: { 
        query: '', // Текст в поле поиска
        filtered: [] // Отфильтрованный список товаров для отображения
      } 
    }
  },
  
  // --- КОМПОНЕНТЫ ИНТЕРФЕЙСА ---
  // Определяет переиспользуемые блоки UI.
  components: {
    // Основной макет страницы.
    mainLayout: 'main-layout.html',
    // Компонент чека.
    receipt: {
      template: 'receipt.html',
      style: 'receipt.css'
    },
    // Компонент списка товаров.
    positionsList: {
      template: 'positionsList.html',
      style: 'positionsList.css'
    }
  },

  // --- МАРШРУТЫ ПРИЛОЖЕНИЯ ---
  // Связывает URL и HTTP-методы с действиями в системе.
  routes: {
    // Главная страница приложения.
    'GET /': {
      type: 'view',
      layout: 'mainLayout',
      inject: {
        'receipt': 'receipt',
        'positionsList': 'positionsList'
      }
    },
    // Действие: добавить товар в чек.
    'POST /action/addItem': {
      type: 'action',
      // Декларативная операция с данными.
      manipulate: {
        target: 'receipt.items', // Целевой массив.
        operation: 'push',       // Операция: добавить в конец.
        source: 'positions.all', // Исходный массив, откуда брать элемент.
        findBy: { "id": "body.id" } // Найти элемент по 'id', значение которого пришло в теле запроса.
      },
      reads: ['positions', 'receipt'], // Какие данные читает.
      writes: ['receipt'],             // Какие данные изменяет.
      update: 'receipt'                // Какой компонент обновить на клиенте.
    },
    // Действие: очистить чек.
    'POST /action/clearReceipt': {
      type: 'action',
      // Последовательность шагов для выполнения сложной логики.
      steps: [
        { "set": "receipt.items", "to": "[]" },
        { "set": "receipt.discountPercent", "to": "10" },
        { "set": "receipt.statusMessage", "to": "'Чек очищен. Скидка сброшена.'" },
        { "set": "receipt.bonusApplied", "to": "false" } // Сбрасываем флаг бонуса при очистке чека.
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // Действие: удалить товар из чека.
    'POST /action/removeItem': {
      type: 'action',
      manipulate: {
        target: 'receipt.items',
        operation: 'removeFirstWhere', // Операция: удалить первый найденный элемент.
        match: { "id": "body.itemId" }   // Найти элемент по 'id', значение которого пришло в теле запроса как 'itemId'.
      },
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // Действие: отфильтровать список товаров по поисковому запросу.
    'POST /action/filterPositions': {
      type: 'action',
      handler: 'filterPositions', // Использует JS-файл для сложной логики фильтрации.
      reads: ['positions', 'viewState'],
      writes: ['viewState'],
      update: 'positionsList'
    },
    // Действие: применить промокод.
    'POST /action/applyCoupon': {
      type: 'action',
      manipulate: {
        operation: 'custom:applyCoupon', // Использует кастомную операцию.
        args: { // Передает аргументы в операцию.
          couponCode: 'body.coupon_code' // Значение берется из тела запроса.
        }
      },
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // Действие: применить бонус за большой заказ и показать факт.
    'POST /action/applyBonus': {
      type: 'action',
      steps: [
        {
          // Условие: общая сумма больше 300 И бонус еще не был применен
          "if": "receipt.total > 300 && !receipt.bonusApplied", 
          "then": [ // Что делать, если условие истинно.
            { "set": "receipt.discountPercent", "to": "receipt.discountPercent + 5" },
            { "set": "receipt.bonusApplied", "to": "true" }, // Устанавливаем флаг, чтобы бонус не применялся повторно.
            { "set": "receipt.statusMessage", "to": "'Применен бонус +5% за большой заказ!'" }
          ],
          "else": [ // Что делать, если основное условие ложно.
             // Вложенное условие, чтобы дать пользователю более точную обратную связь.
            {
              "if": "receipt.bonusApplied",
              "then": [
                { "set": "receipt.statusMessage", "to": "'Бонус уже был применен.'" }
              ],
              "else": [
                { "set": "receipt.statusMessage", "to": "'Бонус не применен. Сумма заказа < 300 руб.'" }
              ]
            }
          ]
        },
        // Шаг 2: HTTP-запрос для получения интересного факта.
        {
          "http:get": {
            "url": "'http://numbersapi.com/' + receipt.itemCount + '?json'", 
            "saveTo": "context.fact" // Результат запроса сохраняется во временную переменную.
          }
        },
        // Шаг 3: Используем результат запроса.
        {
          "if": "context.fact && !context.fact.error", // Проверяем, что запрос успешен.
          "then": [
            // Добавляем полученный факт к существующему сообщению.
            { "set": "receipt.statusMessage", "to": "receipt.statusMessage + ' Факт дня: ' + context.fact.text" }
          ]
        }
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    }
  }
};