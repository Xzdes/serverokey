# 8. Аутентификация и Управление Пользователями

Аутентификация — одна из важнейших частей любого веб-приложения. В Serverokey этот процесс полностью управляется через декларативные `action`-роуты, что делает его прозрачным, гибким и безопасным. Вы больше не привязаны к "магическим" типам роутов — вся логика регистрации, входа и выхода описывается вами в `steps`.

## Шаг 1: Настройка в `manifest.js`

Прежде чем реализовывать логику, необходимо настроить две секции в `manifest.js`: `auth` и `connectors`.

### Секция `auth`
Эта секция сообщает движку основные параметры вашей системы пользователей.

```javascript
// manifest.js
auth: {
  // `userConnector`: Имя коннектора, где хранятся данные пользователей.
  // Это имя должно точно совпадать с ключом в секции `connectors`.
  "userConnector": "user", 
  
  // `identityField`: Поле в объекте пользователя, которое используется 
  // как уникальный логин (например, 'login', 'email').
  "identityField": "login",
  
  // `passwordField`: Поле, в котором хранится **хэш** пароля.
  // Никогда не храните пароли в открытом виде!
  "passwordField": "passwordHash"
}
```

### Секция `connectors`
Вам понадобятся как минимум два коннектора для системы аутентификации:

1.  **Коннектор для пользователей:** Хранит список всех пользователей.
2.  **Коннектор для сессий:** Хранит активные сессии. Движок управляет им автоматически.

```javascript
// manifest.js
connectors: {
  "user": { 
    "type": "wise-json", 
    "collection": "user", 
    "initialState": { "items": [] } // Обязательно должен быть массив `items`
  },
  "session": { 
    "type": "wise-json", 
    "collection": "sessions" 
  },
  // ... другие коннекторы
}
```
**Важно:** Имя коннектора для пользователей (`"user"`) должно совпадать со значением `userConnector` из секции `auth`.

## Шаг 2: Реализация Логики через `steps`

Теперь самое интересное — мы описываем всю логику в виде `action`-роутов.

### Регистрация (`POST /auth/register`)
Этот роут принимает данные из формы регистрации, проверяет, не занят ли логин, хэширует пароль и создает нового пользователя.

```javascript
// manifest.js
'POST /auth/register': {
  type: 'action',
  // Для регистрации нам нужно прочитать всех существующих пользователей.
  reads: ['user'],
  // После успешной регистрации мы записываем изменения в коннектор пользователей.
  writes: ['user'],
  steps: [
    // 1. Проверяем, существует ли уже пользователь с таким логином.
    { "set": "context.userExists", "to": "data.user.items.some(u => u.login === body.login)" },
    {
      "if": "context.userExists",
      // 2. Если да, перенаправляем обратно на страницу регистрации с флагом ошибки.
      "then": [{ "client:redirect": "'/register?error=1'" }],
      // 3. Если логин свободен, начинаем создание пользователя.
      "else": [
        // 3.1. Загружаем библиотеку bcrypt (она доступна в контексте require).
        { "set": "context.bcrypt", "to": "require('bcrypt')" },
        { "set": "context.saltRounds", "to": "10" },
        // 3.2. Создаем хэш пароля.
        { "set": "context.passwordHash", "to": "context.bcrypt.hashSync(body.password, context.saltRounds)" },
        // 3.3. Формируем объект нового пользователя из данных формы (body) и хэша.
        { "set": "context.newUser", "to": "{ login: body.login, name: body.name, role: 'Кассир', passwordHash: context.passwordHash }" },
        // 3.4. Добавляем нового пользователя в массив.
        { "set": "data.user.items", "to": "data.user.items.concat([context.newUser])" },
        // 3.5. Перенаправляем на страницу входа с флагом успеха.
        { "client:redirect": "'/login?registered=true'" }
      ]
    }
  ]
}
```

### Вход (`POST /auth/login`)
Этот роут ищет пользователя по логину, сверяет хэш пароля и, в случае успеха, создает сессию.

```javascript
// manifest.js
'POST /auth/login': {
  type: 'action',
  reads: ['user'], // Нужен доступ ко всем пользователям для поиска.
  steps: [
    // 1. Ищем пользователя по логину из тела запроса.
    { "set": "context.userToLogin", "to": "data.user.items.find(u => u.login === body.login)" },
    { "set": "context.bcrypt", "to": "require('bcrypt')" },
    // 2. Проверяем: пользователь найден И хэш пароля совпадает.
    {
      "if": "context.userToLogin && context.bcrypt.compareSync(body.password, context.userToLogin.passwordHash)",
      "then": [
        // 3. Успех! Используем служебный шаг `auth:login` для создания сессии и установки cookie.
        { "auth:login": "context.userToLogin" },
        // 4. Перенаправляем на главную страницу.
        { "client:redirect": "'/'" }
      ],
      "else": [
        // 5. Неудача. Перенаправляем обратно с флагом ошибки.
        { "client:redirect": "'/login?error=1'" }
      ]
    }
  ]
}
```

### Выход (`GET /auth/logout`)
Самый простой роут: удаляет сессию и перенаправляет на страницу входа.

```javascript
// manifest.js
'GET /auth/logout': {
  type: 'action',
  // Этот роут должен быть доступен только авторизованным пользователям.
  auth: { required: true },
  reads: ['user'], // `reads` нужен, т.к. `auth:required` проверяет пользователя.
  steps: [
    { "auth:logout": true },       // Служебный шаг для удаления сессии и cookie.
    { "client:redirect": "'/login'" } // Перенаправление.
  ]
}
```

## Шаг 3: Защита Роутов

Чтобы ограничить доступ к определенным страницам или экшенам, добавьте блок `auth` в их определение.

```javascript
// manifest.js
'GET /admin': {
  type: 'view',
  layout: 'adminLayout',
  // Добавляем этот блок для защиты
  auth: { 
    "required": true, // Требуется аутентификация
    "failureRedirect": "/login" // Куда перенаправить, если пользователь не авторизован
  },
  reads: ['...']
}
```

Эта полностью декларативная система аутентификации является мощной, гибкой и легко расширяемой под ваши нужды.