// engine-client.js - маленький, но мощный.
// Делает сайт "живым", слушая atom-атрибуты.
document.addEventListener('click', async (e) => {
    // Ищем ближайший родительский элемент с атрибутом atom-action
    const actionElement = e.target.closest('[atom-action]');
    if (!actionElement) return;
    
    e.preventDefault(); // Предотвращаем стандартное поведение (отправку формы)

    const [method, url] = actionElement.getAttribute('atom-action').split(' ');
    const targetSelector = actionElement.getAttribute('atom-target');
    const targetElement = targetSelector ? document.querySelector(targetSelector) : null;
    
    if (!targetElement) {
        console.error(`[AtomEngine] Target element "${targetSelector}" not found.`);
        return;
    }

    // Собираем данные из формы, если кнопка внутри нее
    const form = actionElement.closest('form');
    let body = {};
    if (form) {
        const formData = new FormData(form);
        // Если у кнопки есть name и value, они тоже попадут в данные
        if (actionElement.name && actionElement.value) {
            formData.append(actionElement.name, actionElement.value);
        }
        formData.forEach((value, key) => { body[key] = value; });
    } else if (actionElement.name && actionElement.value) {
         // Если кнопка не в форме, но с данными
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
        // Заменяем ВЕСЬ целевой элемент, чтобы обновились и его data-атрибуты
        targetElement.outerHTML = newHtml;

    } catch (err) {
        console.error(`[AtomEngine] Action failed:`, err);
        targetElement.style.outline = '2px solid red'; // Визуальная обратная связь
    }
});