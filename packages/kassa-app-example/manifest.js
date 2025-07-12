// kassa-app/manifest.js
module.exports = {
  globals: {
    appName: "Атомарная Касса",
    appVersion: "1.0.0",
    injectData: ['user'] 
  },

  connectors: {
    user: {
      type: 'json',
      initialState: { 
        name: "Иванов И.И.",
        role: "Кассир" 
      }
    },
    receipt: {
      type: 'json',
      initialState: { 
        items: [], 
        total: '0.00',
        itemCount: 0,
        discountPercent: 10,
        discount: '0.00',
        finalTotal: '0.00',
        statusMessage: '',
        bonusApplied: false
      },
      computed: [
        { "target": "itemCount", "formula": "count(items)" },
        { "target": "total", "formula": "sum(items, 'price')", "format": "toFixed(2)" },
        { "target": "discount", "formula": "total * (discountPercent / 100)", "format": "toFixed(2)" },
        { "target": "finalTotal", "formula": "total - discount", "format": "toFixed(2)" }
      ]
    },
    positions: { 
      type: 'json',
      initialState: { all: [] } 
    },
    viewState: { 
      // для теста работы json или in-memory браузерная память
      // type: 'json', 
      type: 'in-memory',
      initialState: { 
        query: '', 
        filtered: [] 
      } 
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
      inject: {
        'receipt': 'receipt',
        'positionsList': 'positionsList'
      }
    },
    'POST /action/addItem': {
      type: 'action',
      manipulate: {
        target: 'receipt.items',
        operation: 'push',
        source: 'positions.all',
        findBy: { "id": "body.id" }
      },
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
        { "set": "receipt.bonusApplied", "to": "false" }
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/removeItem': {
      type: 'action',
      manipulate: {
        target: 'receipt.items',
        operation: 'removeFirstWhere',
        match: { "id": "body.itemId" }
      },
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
      manipulate: {
        operation: 'custom:applyCoupon',
        args: {
          couponCode: 'body.coupon_code'
        }
      },
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