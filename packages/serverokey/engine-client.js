// s:\serverokey\packages\serverokey\core\engine-client.js

const isDebugMode = document.body.hasAttribute('data-debug-mode');

function getActionBody(element) {
    const form = element.closest('form');
    const data = {};
    if (form) {
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
    } else if (element.name) {
        data[element.name] = element.value;
    }
    if (element.tagName === 'BUTTON' && element.name) {
        data[element.name] = element.value;
    }
    return JSON.stringify(data);
}

function updateStyles(componentName, newStyles) {
    if (!newStyles || !componentName) return;
    const styleId = `style-for-${componentName}`;
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.setAttribute('data-component-name', componentName);
        document.head.appendChild(styleTag);
    }
    if (styleTag.textContent !== newStyles) {
        styleTag.textContent = newStyles;
    }
}

function executeScripts(scripts) {
    if (!scripts || !Array.isArray(scripts)) return;
    scripts.forEach(scriptInfo => {
        try {
            new Function(scriptInfo.code)();
        } catch (e) {
            console.error(`[Engine] Error executing script for component ${scriptInfo.id}:`, e);
        }
    });
}

async function handleAction(event) {
    // --- ИЗМЕНЕНИЕ: Проверяем, не нужно ли игнорировать эту форму ---
    const form = event.target.closest('form');
    if (form && form.hasAttribute('data-native-submit')) {
        // Если у формы есть этот атрибут, мы ничего не делаем,
        // позволяя браузеру выполнить стандартную отправку.
        return;
    }
    
    const element = event.target.closest('[atom-action]');
    if (!element) return;

    const requiredEventType = element.getAttribute('atom-event') || 'click';
    // Для сабмита формы, триггером является сама форма, а не кнопка
    const triggerElement = event.type === 'submit' ? event.target : element;
    
    if (event.type !== requiredEventType && triggerElement.tagName !== 'FORM') return;

    event.preventDefault();

    const action = element.getAttribute('atom-action');
    const targetSelector = element.getAttribute('atom-target');
    if (!action || !targetSelector) {
        console.error('[Engine] Missing atom-action or atom-target attribute.', element);
        return;
    }

    const [method, url] = action.split(' ');
    const body = getActionBody(element);

    try {
        if (isDebugMode) {
            console.groupCollapsed(`[DEBUG] Action Triggered: ${action}`);
            console.log('DOM Element:', element);
            try {
                console.log('Body Sent:', JSON.parse(body));
            } catch {
                console.log('Body Sent (raw):', body);
            }
            console.groupEnd();
        }
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: body
        });

        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

        const payload = await response.json();
        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) throw new Error(`[Engine] Target element "${targetSelector}" not found.`);

        if (isDebugMode) {
            console.groupCollapsed(`[DEBUG] Received Payload for: ${action}`);
            console.log('Target Element:', targetElement);
            console.log('Payload:', payload);
            console.groupEnd();
        }

        const activeElement = document.activeElement;
        const shouldPreserveFocus = activeElement && targetElement.contains(activeElement) && activeElement.id;
        const activeElementId = shouldPreserveFocus ? activeElement.id : null;
        const selectionStart = activeElement?.selectionStart ?? null;
        const selectionEnd = activeElement?.selectionEnd ?? null;

        updateStyles(payload.componentName, payload.styles);
        targetElement.innerHTML = payload.html;
        executeScripts(payload.scripts);

        if (activeElementId) {
            const newActiveElement = document.getElementById(activeElementId);
            if (newActiveElement) {
                newActiveElement.focus();
                if (selectionStart !== null && typeof newActiveElement.setSelectionRange === 'function') {
                    newActiveElement.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    } catch (error) {
        console.error(`[Engine] Action failed for "${action}":`, error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const supportedEvents = ['click', 'input', 'change', 'submit'];
    supportedEvents.forEach(eventType => {
        document.body.addEventListener(eventType, handleAction, true);
    });

    if (isDebugMode) {
        console.log('✔️ [Engine] Client initialized in Debug Mode.');
    }
});