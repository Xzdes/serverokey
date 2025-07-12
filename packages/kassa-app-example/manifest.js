// packages/kassa-app-example/manifest.js

// Импортируем наш макрос для пересчета
const recalculateReceiptSteps = require('./app/actions/recalculateReceipt.js');

module.exports = {
  globals: {
    appName: "Атомарная Касса",
    appVersion: "1.0.0",
    injectData: ['user'] 
  },

  connectors: {
    user: {
      type: 'wise-json',
      collection: 'user',
      initialState: { name: "Гость", role: "Посетитель" }
    },
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
      }
    },
    positions: { 
      type: 'wise-json',
      collection: 'positions',
      initialState: { items: [] }
    },
    viewState: { 
      type: 'in-memory',
      initialState: { query: '', filtered: [] } 
    }
  },
  
  components: {
    mainLayout: 'main-layout.html',
    receipt: {
      template: 'receipt.html',
      style: 'receipt.css'
    },
    positionsList: {
      template: 'positionsList.html',
      style: 'positionsList.css'
    }
  },

  routes: {
    'GET /': {
      type: 'view',
      layout: 'mainLayout',
      reads: ['user', 'receipt', 'viewState'],
      inject: { 'receipt': 'receipt', 'positionsList': 'positionsList' }
    },
    'POST /action/addItem': {
      type: 'action',
      steps: [
        { "set": "context.productToAdd", "to": "positions.items.find(p => p.id == body.id)" },
        { "set": "context.itemInReceipt", "to": "receipt.items.find(i => i.id == body.id)" },
        {
          "if": "context.itemInReceipt",
          "then": [
            { "set": "context.itemInReceipt.quantity", "to": "context.itemInReceipt.quantity + 1" }
          ],
          "else": [
            { "set": "context.productToAdd.quantity", "to": "1" },
            { "set": "receipt.items", "to": "receipt.items.concat([context.productToAdd])" }
          ]
        },
        { "set": "receipt.statusMessage", "to": "''" },
        ...recalculateReceiptSteps
      ],
      reads: ['positions', 'receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/clearReceipt': {
      type: 'action',
      steps: [
        { "set": "receipt.items", "to": "[]" },
        { "set": "receipt.discountPercent", "to": "10" },
        { "set": "receipt.statusMessage", "to": "'Чек очищен. Скидка сброшена.'" },
        { "set": "receipt.bonusApplied", "to": "false" },
        ...recalculateReceiptSteps
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/removeItem': {
      type: 'action',
      steps: [
        { "set": "context.itemInReceipt", "to": "receipt.items.find(i => i.id == body.itemId)" },
        {
          "if": "context.itemInReceipt",
          "then": [
            {
              "if": "context.itemInReceipt.quantity > 1",
              "then": [
                { "set": "context.itemInReceipt.quantity", "to": "context.itemInReceipt.quantity - 1" }
              ],
              "else": [
                { "set": "receipt.items", "to": "receipt.items.filter(i => i.id != body.itemId)" }
              ]
            }
          ]
        },
        { "set": "receipt.statusMessage", "to": "''" },
        ...recalculateReceiptSteps
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/filterPositions': {
      type: 'action',
      handler: 'filterPositions',
      reads: ['positions', 'viewState'],
      writes: ['viewState'],
      update: 'positionsList'
    },
    'POST /action/applyCoupon': {
      type: 'action',
      steps: [
        // Шаг 1: Устанавливаем сообщение по умолчанию и сбрасываем скидку
        { "set": "receipt.statusMessage", "to": "'Неверный купон! Скидка сброшена.'" },
        { "set": "receipt.discountPercent", "to": 0 },

        // Шаг 2: Проверяем купон 'SALE15'
        {
            "if": "body.coupon_code === 'SALE15'",
            "then": [
                { "set": "receipt.discountPercent", "to": 15 },
                { "set": "receipt.statusMessage", "to": "'Купон SALE15 применен!'" }
            ]
        },
        
        // Шаг 3: Проверяем купон 'BIGSALE50'
        {
            "if": "body.coupon_code === 'BIGSALE50'",
             "then": [
                { "set": "receipt.discountPercent", "to": 50 },
                { "set": "receipt.statusMessage", "to": "'Купон BIGSALE50 применен!'" }
            ]
        },

        // Шаг 4: В любом случае вызываем пересчет
        ...recalculateReceiptSteps
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/applyBonus': {
      type: 'action',
      steps: [
        {
          "if": "receipt.total > 300 && !receipt.bonusApplied", 
          "then": [
            { "set": "receipt.discountPercent", "to": "receipt.discountPercent + 5" },
            { "set": "receipt.bonusApplied", "to": "true" },
            { "set": "receipt.statusMessage", "to": "'Применен бонус +5% за большой заказ!'" }
          ],
          "else": [
            {
              "if": "receipt.bonusApplied",
              "then": [{ "set": "receipt.statusMessage", "to": "'Бонус уже был применен.'" }],
              "else": [{ "set": "receipt.statusMessage", "to": "'Бонус не применен. Сумма заказа < 300 руб.'" }]
            }
          ]
        },
        ...recalculateReceiptSteps,
        {
          "http:get": {
            "url": "'http://numbersapi.com/' + receipt.itemCount + '?json'", 
            "saveTo": "context.fact"
          }
        },
        {
          "if": "context.fact && !context.fact.error",
          "then": [
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