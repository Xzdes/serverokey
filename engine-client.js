// engine-client.js - маленький, но мощный.
// Делает сайт "живым", слушая atom-атрибуты.
document.addEventListener('click', async (e) => {
    const actionElement = e.target.closest('[atom-action]');
    if (!actionElement) return;
    
    e.preventDefault();

    const [method, url] = actionElement.getAttribute('atom-action').split(' ');
    const targetSelector = actionElement.getAttribute('atom-target');
    const targetElement = targetSelector ? document.querySelector(targetSelector) : null;
    
    if (!targetElement) {
        console.error(`[AtomEngine] Target element "${targetSelector}" not found.`);
        return;
    }

    const form = actionElement.closest('form');
    let body = {};
    if (form) {
        const formData = new FormData(form);
        if (actionElement.name && actionElement.value) {
            formData.append(actionElement.name, actionElement.value);
        }
        formData.forEach((value, key) => { body[key] = value; });
    } else if (actionElement.name && actionElement.value) {
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
        
        // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ---
        // Заменяем только ВНУТРЕННЕЕ содержимое элемента.
        // Это более стабильная и безопасная операция, чем outerHTML.
        targetElement.innerHTML = newHtml;

    } catch (err) {
        console.error(`[AtomEngine] Action failed:`, err);
        targetElement.style.outline = '2px solid red';
    }
});