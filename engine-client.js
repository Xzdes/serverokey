// engine-client.js - финальная версия с сохранением фокуса. Zero-dependency.

// Таймер для устранения "дребезга" при вводе
let debounceTimer;

// Основная функция для выполнения серверного действия
async function performAction(actionElement) {
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
        if (actionElement.tagName === 'BUTTON' && actionElement.name && actionElement.value) {
            formData.append(actionElement.name, actionElement.value);
        }
        formData.forEach((value, key) => { body[key] = value; });
    } else if (actionElement.name && actionElement.value) {
        body[actionElement.name] = actionElement.value;
    }

    try {
        // --- Логика сохранения фокуса и позиции курсора ---
        const activeElement = document.activeElement;
        let activeElementId = null;
        let selectionStart, selectionEnd;

        // 1. Проверяем, есть ли активный элемент внутри обновляемого контейнера
        if (activeElement && targetElement.contains(activeElement) && activeElement.id) {
            activeElementId = activeElement.id;
            // Сохраняем позицию курсора только для полей ввода
            if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                selectionStart = activeElement.selectionStart;
                selectionEnd = activeElement.selectionEnd;
            }
        }
        // --- Конец секции сохранения ---

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: Object.keys(body).length ? JSON.stringify(body) : null
        });

        if (!response.ok) throw new Error(`Request failed: ${response.status}`);

        const newHtml = await response.text();
        
        // 2. Обновляем DOM
        targetElement.innerHTML = newHtml;

        // --- Логика восстановления фокуса ---
        if (activeElementId) {
            const elementToFocus = document.getElementById(activeElementId);
            if (elementToFocus) {
                // 3. Восстанавливаем фокус
                elementToFocus.focus();
                // 4. Восстанавливаем позицию курсора, если она была сохранена
                if (typeof selectionStart !== 'undefined') {
                    elementToFocus.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
        // --- Конец секции восстановления ---

    } catch (err) {
        console.error(`[AtomEngine] Action failed:`, err);
        targetElement.style.outline = '2px solid red';
    }
}

// Универсальный обработчик для всех отслеживаемых событий
function handleEvent(e) {
    const actionElement = e.target.closest('[atom-action]');
    if (!actionElement) return;

    const triggerEvent = actionElement.getAttribute('atom-event') || 'click';

    if (e.type !== triggerEvent) return;
    
    if (e.type === 'click' || e.type === 'submit') {
        e.preventDefault();
    }

    if (e.type === 'input') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performAction(actionElement);
        }, 300); // Задержка 300мс
    } else {
        performAction(actionElement);
    }
}

// Слушаем события на уровне документа
document.addEventListener('click', handleEvent);
document.addEventListener('input', handleEvent);