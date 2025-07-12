// engine-client.js
let debounceTimer;

function executeClientScripts(containerElement) {
    const scriptTag = containerElement.querySelector('[data-atom-scripts]');
    if (!scriptTag) return;

    try {
        const scriptsToRun = JSON.parse(scriptTag.textContent);
        
        scriptsToRun.forEach(scriptInfo => {
            const componentElement = document.querySelector(`[data-component-id="${scriptInfo.id}"]`);
            if (componentElement) {
                try {
                    // Создаем и вызываем функцию, передавая ей корневой элемент компонента как 'this'
                    new Function(scriptInfo.code).call(componentElement);
                } catch (e) {
                    console.error(`[AtomEngine] Error executing client script for component ${scriptInfo.id}:`, e);
                }
            }
        });
    } catch (e) {
        console.error('[AtomEngine] Failed to parse client scripts JSON:', e);
    }
    
    scriptTag.remove(); // Удаляем тег после выполнения
}

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
        const activeElement = document.activeElement;
        let activeElementId = null;
        let selectionStart, selectionEnd;

        if (activeElement && targetElement.contains(activeElement) && activeElement.id) {
            activeElementId = activeElement.id;
            if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                selectionStart = activeElement.selectionStart;
                selectionEnd = activeElement.selectionEnd;
            }
        }

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: Object.keys(body).length ? JSON.stringify(body) : null
        });

        if (!response.ok) throw new Error(`Request failed: ${response.status}`);

        const newHtml = await response.text();
        targetElement.innerHTML = newHtml;

        // ВЫПОЛНЯЕМ КЛИЕНТСКИЕ СКРИПТЫ
        executeClientScripts(targetElement);

        if (activeElementId) {
            const elementToFocus = document.getElementById(activeElementId);
            if (elementToFocus) {
                elementToFocus.focus();
                if (typeof selectionStart !== 'undefined') {
                    elementToFocus.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }

    } catch (err) {
        console.error(`[AtomEngine] Action failed:`, err);
        targetElement.style.outline = '2px solid red';
    }
}

function handleEvent(e) {
    const actionElement = e.target.closest('[atom-action]');
    if (!actionElement) return;

    const triggerEvent = actionElement.getAttribute('atom-event') || (actionElement.tagName === 'FORM' ? 'submit' : 'click');

    if (e.type !== triggerEvent) return;
    
    if (e.type === 'click' || e.type === 'submit') {
        e.preventDefault();
    }

    if (e.type === 'input') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performAction(actionElement);
        }, 300);
    } else {
        performAction(actionElement);
    }
}

// Слушаем события на уровне документа
document.addEventListener('click', handleEvent);
document.addEventListener('submit', handleEvent); // Добавляем submit
document.addEventListener('input', handleEvent);

// Выполняем скрипты при первоначальной загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    executeClientScripts(document.body);
});