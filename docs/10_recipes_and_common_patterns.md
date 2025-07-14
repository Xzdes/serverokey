# 10. Рецепты и Частые Паттерны

Этот раздел представляет собой сборник готовых "рецептов" для решения распространенных задач в Serverokey. Используйте их как отправную точку для вашей собственной логики.

## Паттерн 1: "Живой" Поиск

**Задача:** Создать поле ввода, которое при каждом нажатии клавиши фильтрует список на сервере и обновляет его на клиенте.

**Ключевые моменты:**
*   Используется `atom-event="input"` для срабатывания на каждое изменение.
*   Состояние поля ввода хранится в `in-memory` коннекторе `viewState`.
*   Фильтрация происходит в `run`-шаге (JS-файл), так как это чистая логика работы с данными.

**`manifest.js`:**
```javascript
// connectors:
viewState: { 
  type: 'in-memory',
  initialState: { query: '', filtered: [] } 
},
positions: { /* ... */ }

// routes:
'POST /action/filterPositions': {
  type: 'action',
  steps: [{ "run": "filterPositions" }],
  reads: ['positions', 'viewState'], // Читаем все позиции и текущее состояние
  writes: ['viewState'],           // Записываем отфильтрованный результат
  update: 'positionsList'          // Обновляем компонент списка
}
```

**`app/components/positionsList.html`:**
```html
<input 
  id="search-input"
  type="text" 
  name="query" 
  placeholder="Найти товар..." 
  value="{{data.viewState.query}}"
  atom-action="POST /action/filterPositions"
  atom-target="#positionsList-container"
  atom-event="input"
>

<ul>
  {{#data.viewState.filtered}}
    <li>{{name}}</li>
  {{/data.viewState.filtered}}
</ul>
```

**`app/actions/filterPositions.js`:**
```javascript
module.exports = (context, body) => {
  const { positions, viewState } = context.data;
  const query = (body.query || '').toLowerCase().trim();

  viewState.query = body.query; // Сохраняем текст в инпуте

  const sourceArray = positions.items || [];

  if (!query) {
    viewState.filtered = sourceArray;
  } else {
    viewState.filtered = sourceArray.filter(item => 
      item.name && item.name.toLowerCase().includes(query)
    );
  }
};
```

---
## Паттерн 2: Условное отображение кнопки

**Задача:** Показать кнопку "Применить бонус" только если сумма заказа превышает 300 рублей.

**Ключевые моменты:**
*   Используется серверная директива `atom-if`.
*   Условие напрямую обращается к полю `data.receipt.total`.

**`app/components/receipt.html`:**
```html
<!-- ... остальной код чека ... -->

<!-- Кнопка будет отрендерена на сервере только если условие истинно -->
<button 
    id="bonus-btn"
    class="action-button"
    atom-action="POST /action/applyBonus"
    atom-target="#receipt-container"
    atom-if="data.receipt.total > 300"
>
    Применить Бонус (+5%)
</button>
```

---
## Паттерн 3: Переиспользуемая логика (`action:run`)

**Задача:** Логика пересчета итогов чека используется в 5 разных экшенах (`addItem`, `removeItem`, `clearReceipt` и т.д.). Нужно вынести ее в одно место, чтобы избежать дублирования кода.

**Ключевые моменты:**
*   Создается внутренний (`internal: true`) `action`-роут, который содержит только логику.
*   Другие роуты вызывают его с помощью шага `action:run`.

**`manifest.js`:**
```javascript
routes: {
  // 1. Определяем переиспользуемый экшен
  "recalculateReceiptLogic": {
      type: 'action',
      internal: true, // Недоступен из веба, не требует update/redirect
      steps: [
          { "set": "data.receipt.total", "to": "data.receipt.items.reduce(...)" },
          // ... другая логика пересчета
      ]
  },

  // 2. Вызываем его из другого экшена
  'POST /action/addItem': {
    type: 'action',
    steps: [
      // ... логика добавления товара в `data.receipt.items` ...
      
      // Вызываем пересчет. Весь `data`-контекст передается автоматически.
      { "action:run": { "name": "recalculateReceiptLogic" } }
    ],
    reads: ['positions', 'receipt'],
    writes: ['receipt'],
    update: 'receipt'
  },
  
  'POST /action/clearReceipt': {
    type: 'action',
    steps: [
      { "set": "data.receipt.items", "to": "[]" },
      { "action:run": { "name": "recalculateReceiptLogic" } }
    ],
    // ...
  }
}
```

---
## Паттерн 4: Запрос к внешнему API

**Задача:** После применения бонуса получить с внешнего API интересный факт о количестве товаров в чеке.

**Ключевые моменты:**
*   Используется шаг `http:get`.
*   URL формируется динамически с использованием данных из контекста.
*   Результат сохраняется во временную переменную `context.fact`.

**`manifest.js` (`applyBonus` action):**
```javascript
'POST /action/applyBonus': {
  type: 'action',
  steps: [
    // ... логика применения бонуса ...
    { "action:run": { "name": "recalculateReceiptLogic" } },

    // Выполняем GET-запрос
    { 
      "http:get": {
        "url": "'http://numbersapi.com/' + data.receipt.itemCount + '?json'", 
        "saveTo": "context.fact"
      }
    },

    // Проверяем, что запрос был успешным, и добавляем факт к сообщению
    { 
      "if": "context.fact && !context.fact.error",
      "then": [
        { "set": "data.receipt.statusMessage", "to": "data.receipt.statusMessage + ' Факт дня: ' + context.fact.text" }
      ]
    }
  ],
  // ...
}
```
---

Эта коллекция рецептов может быть дополнена по мере развития проекта, служа отличным справочником для быстрого решения типовых задач.