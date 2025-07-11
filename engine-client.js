// engine-client.js - маленький, но мощный.
// Теперь поддерживает live-search с помощью atom-event="input"

// Таймер для устранения "дребезга" при вводе в поиске
let debounceTimer;

// Основная функция для выполнения действия
async function performAction(actionElement) {
    const [method, url] = actionElement.getAttribute('atom-action').split(' ');
    const targetSelector = actionElement.getAttribute('atom-target');
    const targetElement = targetSelector ? document.querySelector(targetSelector) : null;
    
    if (!targetElement) {
        console.error(`[AtomEngine] Target element "${targetSelector}" not found.`);
        return;
    }

    // Собираем данные. Теперь мы можем быть и инпутом, и кнопкой внутри формы.
    const form = actionElement.closest('form');
    let body = {};
    if (form) {
        const formData = new FormData(form);
        // Если триггер - кнопка с name/value, добавляем их
        if (actionElement.tagName === 'BUTTON' && actionElement.name && actionElement.value) {
            formData.append(actionElement.name, actionElement.value);
        }
        formData.forEach((value, key) => { body[key] = value; });
    } else if (actionElement.name && actionElement.value) {
        // Если это одиночный элемент (например, наш input)
        body[actionElement.name] = actionElement.value;
    }

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: Object.keys(body).length ? JSON.stringify(body) : null
        });

        if (!response.ok) throw new Error(`Request failed: ${response.status}`);

        const newHtml = await response.text();
        targetElement.innerHTML = newHtml;

    } catch (err) {
        console.error(`[AtomEngine] Action failed:`, err);
        targetElement.style.outline = '2px solid red';
    }
}

// Универсальный обработчик событий
function handleEvent(e) {
    const actionElement = e.target.closest('[atom-action]');
    if (!actionElement) return;

    // Определяем, на какое событие должен реагировать элемент. По умолчанию 'click'.
    const triggerEvent = actionElement.getAttribute('atom-event') || 'click';

    // Если тип события не совпадает с тем, что нам нужно, ничего не делаем.
    if (e.type !== triggerEvent) return;
    
    // Для кликов и сабмитов отменяем стандартное поведение
    if (e.type === 'click' || e.type === 'submit') {
        e.preventDefault();
    }

    // Если это событие ввода, используем debouncing
    if (e.type === 'input') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performAction(actionElement);
        }, 300); // Задержка в 300 мс
    } else {
        // Для всех остальных событий (кликов) выполняем действие немедленно
        performAction(actionElement);
    }
}

// Регистрируем обработчик на несколько типов событий
document.addEventListener('click', handleEvent);
document.addEventListener('input', handleEvent);