# Serverokey 🚀 v4.1 — Архитектура вместо Кода

**Serverokey** (Сервер-окей) — это атомарный, декларативный движок для бэкенда на Node.js, спроектированный для создания веб-приложений с помощью LLM (Large Language Models). Его главная задача — превратить LLM из "программиста" в "архитектора", который описывает **ЧТО** нужно сделать, а не **КАК**.

Serverokey построен на принципе **"HTML-over-the-wire"**, но с интеллектуальным подходом, позволяющим создавать сложные, интерактивные интерфейсы без написания единой строчки JavaScript на фронтенде.

*   **Автор:** Xzdes
*   **Контакт:** [xzdes@yandex.ru](mailto:xzdes@yandex.ru)
*   **Репозиторий:** [https://github.com/Xzdes/serverokey](httpss://github.com/Xzdes/serverokey)

---

## 🎯 Философия: Архитектура вместо Кода

Современные LLM отлично генерируют код, но часто ошибаются в деталях, требующих контекста. Serverokey решает эту проблему, заменяя написание императивного кода на заполнение декларативных структур в центральном файле — `manifest.js`.

Это позволяет LLM сосредоточиться на своих сильных сторонах — проектировании архитектуры и потоков данных, — минимизируя вероятность ошибок и повышая предсказуемость результата.

1.  **Декларативные Коннекторы:** Вместо написания кода для подключения к БД, вы описываете подключение: `{"type": "pg", "connection": "..."}`. Это позволяет менять источник данных (с JSON на PostgreSQL, например), не переписывая логику приложения.

2.  **Декларативная Логика:** Вместо `if/else` в отдельном JS-файле, вы описываете условные шаги прямо в манифесте: `{"if": "receipt.total > 300", "then": [...]}`. Это делает бизнес-логику прозрачной и легко читаемой.

3.  **Вычисляемые Данные:** Вместо ручного пересчета зависимых полей (например, итоговой суммы заказа), вы описываете их как формулы: `{"target": "total", "formula": "sum(items, 'price')"}`. Движок сам следит за их актуальностью.

4.  **Полная Изоляция:** Движок абстрагирует всю сложную "обвязку". Он сам находит файлы, обновляет DOM на клиенте (сохраняя фокус и состояние), управляет состоянием на сервере и обеспечивает безопасность. LLM не имеет прямого доступа к файловой системе или опасным API.

> **Результат:** LLM работает с **единой точкой входа** (`manifest.js`), генерируя предсказуемые, безопасные и легко проверяемые веб-приложения.

---

## 🛠️ С чего начать: Ваш первый проект за 5 минут

Это руководство покажет, как создать новое приложение с нуля.

### 1. Подготовка

Убедитесь, что у вас установлен Node.js (версия 18 или выше).

### 2. Создание проекта

```bash
# 1. Создаем папку для нового проекта и переходим в нее
mkdir my-serverokey-app
cd my-serverokey-app

# 2. Инициализируем Node.js проект
npm init -y

# 3. Устанавливаем Serverokey и nodemon (для горячей перезагрузки)
npm install serverokey
npm install nodemon --save-dev
```

### 3. Структура папок

Создайте внутри проекта папку `app` со следующей структурой:

```
my-serverokey-app/
├── app/
│   ├── components/  # Здесь будут лежать HTML и CSS компоненты
│   └── data/        # Здесь JSON-коннекторы будут хранить свои данные
├── node_modules/
├── package.json
└── ...
```

### 4. Создание главных файлов

Создайте три основных файла в корне вашего проекта:

**1. `server.js` (Точка входа)**
```javascript
// server.js
const { createServer } = require('serverokey');

const PORT = process.env.PORT || 3000;
const appPath = __dirname; // Указываем, что корень приложения здесь

// Проверяем, запущен ли сервер с флагом --debug
const debugMode = process.argv.includes('--debug');

// Создаем и запускаем сервер
const server = createServer(appPath, { debug: debugMode });

server.listen(PORT, () => {
  console.log(`🚀 My App is running on http://localhost:${PORT}`);
  if (debugMode) {
    console.log('🐞 Debug Mode is ON.');
  }
});
```

**2. `manifest.js` (Сердце приложения)**
```javascript
// manifest.js
module.exports = {
  globals: {
    appName: "Мое Первое Приложение"
  },
  connectors: {},
  components: {
    mainLayout: 'main-layout.html'
  },
  routes: {
    'GET /': {
      type: 'view',
      layout: 'mainLayout',
      reads: [], // Пока не читаем никаких данных
      inject: {} // Пока не вставляем никаких компонентов
    }
  }
};
```

**3. `app/components/main-layout.html` (Главный шаблон)**
```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>{{appName}}</title>
    <style>
        body { font-family: sans-serif; padding: 2em; }
    </style>
</head>
<body>
    <h1>Добро пожаловать в Serverokey!</h1>
</body>
</html>
```

### 5. Настройка скриптов

Откройте `package.json` и добавьте секцию `"scripts"`:

```json
{
  "name": "my-serverokey-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "dev:debug": "nodemon server.js -- --debug",
    "validate": "serverokey-validate"
  },
  "dependencies": {
    "serverokey": "^4.0.2"
  },
  "devDependencies": {
    "nodemon": "^3.1.10"
  }
}
```

### 6. Запуск!

Теперь вы готовы к запуску. Выполните в терминале:
```bash
npm run dev
```
Откройте `http://localhost:3000` в браузере. Вы должны увидеть страницу "Добро пожаловать в Serverokey!". Поздравляем, ваше первое приложение работает!

---

## 💻 Процесс разработки

Рабочий цикл с Serverokey очень прост.

#### Шаг 1: Запустите сервер в режиме разработки
Эта команда использует `nodemon` для автоматического перезапуска сервера при изменении любого файла проекта (`.js`, `.html`, `.css`, `manifest.js`).
```bash
npm run dev
```

Для получения максимальной информации используйте режим отладки. Он выводит подробные логи на сервер и в консоль браузера, а также добавляет отладочные комментарии в HTML.
```bash
npm run dev:debug
```

#### Шаг 2: Вносите изменения
Редактируйте `manifest.js`, добавляйте и меняйте компоненты в `app/components/`, создавайте экшены.

#### Шаг 3: Сохраните файл
`nodemon` автоматически перезапустит сервер.

#### Шаг 4: Проверьте валидность (опционально, но рекомендуется)
Перед сложными изменениями или если что-то пошло не так, запустите валидатор. Он найдет потенциальные проблемы за вас.
```bash
npm run validate
```
---

## 📖 Справочник по `manifest.js`

`manifest.js` — это единый источник правды для всего приложения.

### `globals`
Глобальные переменные, доступные во всех шаблонах.

```javascript
globals: {
  appName: "Моя Касса",
  appVersion: "1.0.1",
  // Делает коннектор 'user' доступным глобально во всех шаблонах
  injectData: ['user'] 
}
```

### `connectors`
Описывает все источники данных.

*   `type: 'json'`: Хранит состояние в JSON-файле в `app/data/`. Данные **сохраняются** между перезапусками.
*   `type: 'in-memory'`: Хранит состояние в оперативной памяти. Данные **сбрасываются** при каждом перезапуске.

```javascript
connectors: {
  receipt: {
    type: 'json',
    initialState: { 
        items: [], 
        total: 0,
        discountPercent: 10
    },
    // Поля, которые вычисляются автоматически при каждом изменении данных
    computed: [
      { "target": "itemCount", "formula": "count(items)" },
      { "target": "total", "formula": "sum(items, 'price')", "format": "toFixed(2)" },
      { "target": "finalTotal", "formula": "total * (1 - discountPercent / 100)", "format": "toFixed(2)" }
    ]
  },
  viewState: {
    type: 'in-memory',
    initialState: { filterQuery: '' }
  }
}
```

### `components`
Регистрирует UI-компоненты. Стили, указанные здесь, автоматически становятся изолированными (scoped).

```javascript
components: {
  // Простой синтаксис (только HTML)
  mainLayout: 'main-layout.html',
  // Расширенный синтаксис (HTML и CSS)
  receipt: {
    template: 'receipt.html',   // Шаблон компонента
    style: 'receipt.css'        // Связанный файл стилей
  }
}
```
В CSS-файле используйте псевдоселектор `:host` для стилизации корневого элемента компонента.

### `routes`
Связывает URL и HTTP-метод с действием в системе.

#### `type: 'view'`
Рендерит целую HTML-страницу.
```javascript
'GET /': {
  type: 'view',
  layout: 'mainLayout', // Компонент, используемый как основной макет
  reads: ['user', 'receipt'], // Явно указывает, какие данные нужны для рендеринга
  inject: {
    // В какой <atom-inject into="placeholderName"> вставить какой компонент
    'receiptPlaceholder': 'receipt',
    'itemsPlaceholder': 'itemsList'
  }
}
```

#### `type: 'action'`
Выполняет серверную логику и возвращает обновленный HTML-фрагмент. Имеет три взаимоисключающих способа определения логики (приоритет: `steps` > `manipulate` > `handler`).

1.  **`handler` (Императивный запасной вариант)**
    Ссылка на JS-файл в `app/actions/`. Используется, когда логику невозможно описать декларативно.
    `"handler": "filterPositions"` -> `require('app/actions/filterPositions.js')`

2.  **`manipulate` (Простые CRUD-операции)**
    Декларативное описание одной операции.
    ```javascript
    "manipulate": {
      "operation": "push", // "push" или "removeFirstWhere"
      "target": "receipt.items", // Целевой массив для изменения
      "source": "products.all",  // Откуда брать элемент (для push)
      "findBy": { "id": "body.id" } // Как найти элемент в source
    }
    ```
    Также поддерживает кастомные операции из `app/operations/`: `"operation": "custom:applyCoupon"`.

3.  **`steps` (Декларативная бизнес-логика)**
    Самый мощный способ. Описывает сложную логику как последовательность шагов.
    ```javascript
    'POST /action/applyBonus': {
      type: 'action',
      steps: [
        // 1. Условный блок (IF / THEN / ELSE)
        {
          "if": "receipt.total > 500 && !receipt.bonusApplied",
          "then": [ 
            { "set": "receipt.discountPercent", "to": "receipt.discountPercent + 5" },
            { "set": "receipt.bonusApplied", "to": "true" }
          ],
          "else": [ { "set": "receipt.statusMessage", "to": "'Бонус не применен'" } ]
        },
        // 2. HTTP-запрос
        {
          "http:get": {
            "url": "'https://api.example.com/data?id=' + body.id",
            "saveTo": "context.apiData" // Сохраняем результат во временную переменную
          }
        },
        // 3. Цикл
        {
          "forEach": "receipt.items",
          "as": "item", // Имя переменной для элемента
          "steps": [
            { "if": "item.price > 100", "then": [{ "set": "item.isExpensive", "to": "true" }] }
          ]
        }
      ],
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt' // Компонент, который нужно перерисовать на клиенте
    }
    ```

---

## 템 Шаблоны и Клиентская часть

Движок использует **Mustache.js** для рендеринга. Дополнительно предоставляются свои директивы.

### Атрибуты для взаимодействия

*   `atom-action="METHOD /url"`: Указывает, какой экшен вызвать.
*   `atom-target="#css-selector"`: Указывает, какой контейнер на странице обновить.
*   `atom-event="input"`: (Опционально) Указывает, по какому событию вызывать экшен (по умолчанию `click` или `submit`).

### Условный рендеринг: `atom-if`
Полностью удаляет элемент из DOM, если JavaScript-условие в его значении ложно.

```html
<div class="empty-state" atom-if="!receipt.items.length">
    <p>Чек пуст</p>
</div>
```

### Клиентские скрипты: `<script atom-run>`
"Предохранительный клапан" для случаев, когда необходим JavaScript на клиенте (например, для интеграции с библиотекой графиков).

```html
<div id="chart-container-{{_internal.id}}"></div>
<script atom-run>
  // `this` указывает на корневой элемент компонента (div)
  const container = this.querySelector('#chart-container-{{_internal.id}}');
  // Безопасная передача данных с сервера
  const data = {{{ asJSON(chartData.values) }}};
  // Вызов внешней библиотеки
  renderMyCoolChart(container, data);
</script>
```

---

## 🔮 Будущее развитие

*   [ ] **Декларативная аутентификация:** Добавление встроенных `auth` роутов для регистрации/логина.
*   [ ] **Расширенные коннекторы данных:** Добавление встроенных коннекторов для **PostgreSQL**, **SQLite** и декларативного выполнения SQL-запросов.
*   [ ] **Интерактивный CLI-помощник:** Утилита командной строки (`npm run new component ...`) для быстрого создания "атомов" приложения, которая автоматически обновляет `manifest.js`.
*   [ ] **Декларативные WebSocket'ы:** Описание каналов и событий для real-time обновлений.

---

Этот проект — эксперимент в области взаимодействия человека и машины, направленный на создание надежных и предсказуемых программных систем. Буду рад вашим идеям и вкладу!

**Xzdes**