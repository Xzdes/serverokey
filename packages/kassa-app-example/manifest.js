// packages/kassa-app-example/manifest.js

module.exports = {
  globals: {
    appName: "Атомарная Касса",
    appVersion: "1.0.0",
  },
  sockets: {
    "receipt-updates": {
      "watch": "receipt",
      "emit": {
        "event": "receipt-changed",
        "payload": "receipt"
      }
    }
  },
  auth: {
    userConnector: 'user', 
    identityField: 'login',
    passwordField: 'passwordHash'
  },
  connectors: {
    session: { type: 'wise-json', collection: 'sessions' },
    user: { type: 'wise-json', collection: 'user', initialState: { items: [] } },
    receipt: {
      type: 'wise-json',
      collection: 'receipt',
      initialState: { 
        items: [], itemCount: 0, total: 0, discountPercent: 10,
        discount: 0, finalTotal: 0, statusMessage: '', bonusApplied: false
      },
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
    mainLayout: 'main-layout.html', authLayout: 'auth-layout.html',
    loginForm: 'login-form.html', registerForm: 'register-form.html',
    receipt: { template: 'receipt.html', style: 'receipt.css' },
    positionsList: { template: 'positionsList.html', style: 'positionsList.css' }
  },
  routes: {
    "recalculateReceiptLogic": {
        type: 'action',
        internal: true,
        steps: [
            { "set": "data.receipt.total", "to": "data.receipt.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0)" },
            { "set": "data.receipt.itemCount", "to": "data.receipt.items.reduce((sum, item) => sum + item.quantity, 0)" },
            { "set": "data.receipt.discount", "to": "Math.round((data.receipt.total * (data.receipt.discountPercent / 100)) * 100) / 100" },
            { "set": "data.receipt.finalTotal", "to": "Math.round((data.receipt.total - data.receipt.discount) * 100) / 100" }
        ]
    },
    'GET /': {
      type: 'view', layout: 'mainLayout', reads: ['user', 'receipt', 'viewState', 'positions'],
      inject: { 'receipt': 'receipt', 'positionsList': 'positionsList' }, auth: { required: true, failureRedirect: '/login' }
    },
    'GET /login': { type: 'view', layout: 'authLayout', inject: { 'form': 'loginForm' } },
    'GET /register': { type: 'view', layout: 'authLayout', inject: { 'form': 'registerForm' } },
    
    'POST /auth/login': {
      type: 'action',
      steps: [
        { "set": "context.userToLogin", "to": "data.user.items.find(u => u.login === body.login)" },
        { "set": "context.bcrypt", "to": "require('bcrypt')" },
        {
          "if": "context.userToLogin && context.bcrypt.compareSync(body.password, context.userToLogin.passwordHash)",
          "then": [
            { "auth:login": "context.userToLogin" },
            { "client:redirect": "'/'" }
          ],
          "else": [
            { "client:redirect": "'/login?error=1'" }
          ]
        }
      ],
      reads: ['user']
    },
    'POST /auth/register': {
      type: 'action',
      steps: [
        { "set": "context.userExists", "to": "data.user.items.some(u => u.login === body.login)" },
        {
          "if": "context.userExists",
          "then": [{ "client:redirect": "'/register?error=1'" }],
          "else": [
            { "set": "context.bcrypt", "to": "require('bcrypt')" },
            { "set": "context.saltRounds", "to": "10" },
            { "set": "context.passwordHash", "to": "context.bcrypt.hashSync(body.password, context.saltRounds)" },
            { "set": "context.newUser", "to": "{ login: body.login, name: body.name, role: 'Кассир', passwordHash: context.passwordHash }" },
            { "set": "data.user.items", "to": "data.user.items.concat([context.newUser])" },
            { "client:redirect": "'/login?registered=true'" }
          ]
        }
      ],
      reads: ['user'],
      writes: ['user']
    },
    'GET /auth/logout': {
      type: 'action',
      steps: [
        { "auth:logout": true },
        { "client:redirect": "'/login'" }
      ],
      reads: ['user'],
      auth: { required: true }
    },
    'POST /action/addItem': {
      type: 'action',
      steps: [
        { "set": "context.productToAdd", "to": "data.positions.items.find(p => p.id == body.id)" },
        { "set": "context.itemInReceipt", "to": "data.receipt.items.find(i => i.id == body.id)" },
        {
          "if": "context.itemInReceipt",
          "then": [ { "set": "context.itemInReceipt.quantity", "to": "context.itemInReceipt.quantity + 1" } ],
          "else": [
            { "set": "context.productToAdd.quantity", "to": "1" },
            { "set": "data.receipt.items", "to": "data.receipt.items.concat([context.productToAdd])" }
          ]
        },
        { "set": "data.receipt.statusMessage", "to": "''" },
        { "action:run": { "name": "recalculateReceiptLogic" } }
      ],
      reads: ['positions', 'receipt', 'user'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/clearReceipt': {
      type: 'action',
      steps: [
        { "set": "data.receipt.items", "to": "[]" },
        { "set": "data.receipt.discountPercent", "to": "10" },
        { "set": "data.receipt.statusMessage", "to": "'Чек очищен. Скидка сброшена.'" },
        { "set": "data.receipt.bonusApplied", "to": "false" },
        { "action:run": { "name": "recalculateReceiptLogic" } }
      ],
      reads: ['receipt', 'user'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/removeItem': {
      type: 'action',
      steps: [
        { "set": "context.validatedItemId", "to": "zod.string().regex(/^\\d+$/).transform(Number).parse(body.itemId)" },
        { "set": "context.itemInReceipt", "to": "data.receipt.items.find(i => i.id === context.validatedItemId)" },
        {
          "if": "context.itemInReceipt",
          "then": [
            { "if": "context.itemInReceipt.quantity > 1",
              "then": [ { "set": "context.itemInReceipt.quantity", "to": "context.itemInReceipt.quantity - 1" } ],
              "else": [ { "set": "data.receipt.items", "to": "data.receipt.items.filter(i => i.id !== context.validatedItemId)" } ]
            }
          ]
        },
        { "set": "data.receipt.statusMessage", "to": "''" },
        { "action:run": { "name": "recalculateReceiptLogic" } }
      ],
      reads: ['receipt', 'user'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/filterPositions': {
      type: 'action',
      steps: [{ "run": "filterPositions" }],
      reads: ['positions', 'viewState', 'user'],
      writes: ['viewState'],
      update: 'positionsList'
    },
    'POST /action/applyCoupon': {
      type: 'action',
      steps: [
        { "set": "data.receipt.statusMessage", "to": "'Неверный купон! Скидка сброшена.'" },
        { "set": "data.receipt.discountPercent", "to": 0 },
        { "if": "body.coupon_code === 'SALE15'",
          "then": [
            { "set": "data.receipt.discountPercent", "to": 15 },
            { "set": "data.receipt.statusMessage", "to": "'Купон SALE15 применен!'" }
          ]
        },
        { "if": "body.coupon_code === 'BIGSALE50'",
          "then": [
            { "set": "data.receipt.discountPercent", "to": 50 },
            { "set": "data.receipt.statusMessage", "to": "'Купон BIGSALE50 применен!'" }
          ]
        },
        { "action:run": { "name": "recalculateReceiptLogic" } }
      ],
      reads: ['receipt', 'user'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/applyBonus': {
      type: 'action',
      steps: [
        {
          "if": "data.receipt.total > 300 && !data.receipt.bonusApplied", 
          "then": [
            { "set": "data.receipt.discountPercent", "to": "data.receipt.discountPercent + 5" },
            { "set": "data.receipt.bonusApplied", "to": "true" },
            { "set": "data.receipt.statusMessage", "to": "'Применен бонус +5% за большой заказ!'" }
          ],
          "else": [
            { "if": "data.receipt.bonusApplied",
              "then": [{ "set": "data.receipt.statusMessage", "to": "'Бонус уже был применен.'" }],
              "else": [{ "set": "data.receipt.statusMessage", "to": "'Бонус не применен. Сумма заказа < 300 руб.'" }]
            }
          ]
        },
        { "action:run": { "name": "recalculateReceiptLogic" } },
        { "http:get": {
            "url": "'http://numbersapi.com/' + data.receipt.itemCount + '?json'", 
            "saveTo": "context.fact"
          }
        },
        { "if": "context.fact && !context.fact.error",
          "then": [
            { "set": "data.receipt.statusMessage", "to": "data.receipt.statusMessage + ' Факт дня: ' + context.fact.text" }
          ]
        }
      ],
      reads: ['receipt', 'user'],
      writes: ['receipt'],
      update: 'receipt'
    },
    "POST /action/soft-refresh-receipt": {
        type: "action",
        steps: [],
        reads: ["receipt", "user"],
        update: "receipt"
    }
  }
};