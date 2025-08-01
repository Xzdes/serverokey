# 7. "Живые" Приложения с WebSocket

Одной из самых мощных возможностей Serverokey является встроенная поддержка **real-time обновлений** через WebSocket. Это позволяет вашему серверу "проталкивать" изменения всем подключенным клиентам без необходимости перезагрузки страницы. Это делается полностью декларативно, без единой строчки сложного кода для управления соединениями.

## Сценарии Использования

*   **Системы совместной работы:** Несколько пользователей видят изменения друг друга в реальном времени.
*   **Чаты и уведомления:** Мгновенная доставка сообщений и оповещений.
*   **Финансовые дашборды:** Обновление котировок и графиков.
*   **Наш пример:** Синхронизация состояния чека между несколькими кассами или вкладками браузера. Если один кассир добавит товар, второй тут же это увидит.

## Архитектура Real-Time в Serverokey

Система работает на основе трех простых концепций:

1.  **Канал (`Channel`):** Вы объявляете на сервере именованный канал (например, `"receipt-updates"`).
2.  **Наблюдатель (`Watch`):** Вы привязываете этот канал к одному из ваших **коннекторов**. Движок начинает следить за этим коннектором.
3.  **Подписчик (`Subscriber`):** На клиенте вы "подписываете" HTML-компонент на этот канал.

Когда любой `action` производит запись (`writes`) в наблюдаемый коннектор, движок автоматически отправляет уведомление по связанному каналу всем его подписчикам.

## Шаг 1: Описание Канала в `manifest.js`

Всё начинается с добавления новой корневой секции `sockets` в `manifest.js`.

```javascript
// manifest.js
sockets: {
  // "receipt-updates" — это произвольное, но уникальное имя вашего канала.
  "receipt-updates": {

    // "watch": "receipt" — это ключевая инструкция.
    // Она говорит движку: "Следи за коннектором с именем 'receipt'.
    // Как только в него произойдет запись, активируй этот канал".
    "watch": "receipt",

    // "emit" описывает, какое сообщение нужно отправить клиентам.
    "emit": {
      // "event": "receipt-changed" — это имя события, которое получит клиент.
      // По этому имени клиентский компонент поймет, что это событие для него.
      "event": "receipt-changed", 
      
      // "payload": "receipt" — какие данные прикрепить к событию.
      // В данном случае, мы отправляем полное, обновленное состояние 
      // коннектора 'receipt'.
      "payload": "receipt"        
    }
  }
}
```

## Шаг 2: Подписка Компонента в HTML

Теперь нужно указать, какой компонент на странице должен получать эти real-time обновления. Это делается с помощью двух "атомарных" атрибутов, которые добавляются к корневому элементу компонента.

```html
<!-- app/components/receipt.html -->
<div 
  <!-- 1. Подписываем этот компонент на канал "receipt-updates" -->
  atom-socket="receipt-updates"

  <!-- 2. Указываем, что делать при получении события "receipt-changed" -->
  atom-on-event="receipt-changed"
  
  <!-- Действие: выполнить "мягкое" обновление -->
  atom-action="POST /action/soft-refresh-receipt"
  atom-target="#receipt-container"
>
    <h3>Чек</h3>
    <!-- ... остальная часть HTML-кода чека ... -->
</div>
```

**Как это читается:**
1.  **`atom-socket="receipt-updates"`**: "Когда этот `div` появляется на странице, установи WebSocket-соединение и подпишись на канал `receipt-updates`."
2.  **`atom-on-event="receipt-changed"`**: "Когда с сервера по этому сокету придет событие с именем `receipt-changed`..."
3.  **`atom-action="POST /action/soft-refresh-receipt"`**: "...автоматически, без клика пользователя, выполни этот `action`."

## Шаг 3: Создание "Мягкого" Экшена для Обновления

Зачем нужен `soft-refresh-receipt`? Когда клиент получает уведомление, он знает, что *что-то изменилось*, но не знает, *что именно*. Этот экшен служит для того, чтобы получить с сервера самую свежую версию данных и перерисовать компонент.

Ему не нужна никакая логика, только описание того, что нужно прочитать и что обновить.

```javascript
// manifest.js
"POST /action/soft-refresh-receipt": {
    "type": "action",
    // Ему не нужно ничего менять, только прочитать актуальные данные.
    // Мы читаем 'user' для консистентности, так как компонент может его использовать.
    "reads": ["receipt", "user"],
    // И обновить сам себя.
    "update": "receipt",
    // Логика не нужна, поэтому steps - пустой массив.
    "steps": []
}
```

## Исключение Инициатора (Self-Trigger)

Движок `SocketEngine` достаточно умен, чтобы **не отправлять уведомление обратно тому клиенту, который инициировал изменение**. Если вы в своем браузере добавляете товар, ваш `action` изменяет `receipt`, но ваш же браузер не получит WebSocket-событие. А все остальные подключенные клиенты — получат. Это предотвращает зацикливание и лишние перерисовки интерфейса.

С помощью этих трех декларативных шагов вы создали полноценную real-time систему, не написав ни строчки сложного кода для управления WebSocket'ами.