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
    const form = event.target.closest('form');
    if (form && form.hasAttribute('data-native-submit')) {
        return;
    }
    
    const element = event.target.closest('[atom-action]');
    if (!element) return;

    const requiredEventType = element.getAttribute('atom-event') || (element.tagName === 'FORM' ? 'submit' : 'click');
    
    if (event.type === 'submit') {
         // for forms, the event target is the form itself, which has the action
    } else if (event.type !== requiredEventType) {
        return;
    }

    event.preventDefault();

    const action = element.getAttribute('atom-action');
    const targetSelector = element.getAttribute('atom-target');
    
    if (!action) {
        console.error('[Engine] Missing atom-action attribute.', element);
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

        if (isDebugMode) {
            console.groupCollapsed(`[DEBUG] Received Payload for: ${action}`);
            console.log('Payload:', payload);
            console.groupEnd();
        }

        // 1. Проверяем, не нужно ли сделать редирект
        if (payload.redirectUrl) {
            window.location.href = payload.redirectUrl;
            return; // Прерываем выполнение
        }
        
        // 2. Если редиректа нет, обновляем компонент
        if (payload.html && targetSelector) {
            const targetElement = document.querySelector(targetSelector);
            if (!targetElement) throw new Error(`[Engine] Target element "${targetSelector}" not found.`);

            const activeElement = document.activeElement;
            const shouldPreserveFocus = activeElement && targetElement.contains(activeElement) && activeElement.id;
            const activeElementId = shouldPreserveFocus ? activeElement.id : null;
            const selectionStart = activeElement?.selectionStart ?? null;
            const selectionEnd = activeElement?.selectionEnd ?? null;

            if (payload.styles) updateStyles(payload.componentName, payload.styles);
            targetElement.innerHTML = payload.html;
            if (payload.scripts) executeScripts(payload.scripts);

            if (activeElementId) {
                const newActiveElement = document.getElementById(activeElementId);
                if (newActiveElement) {
                    newActiveElement.focus();
                    if (selectionStart !== null && typeof newActiveElement.setSelectionRange === 'function') {
                        newActiveElement.setSelectionRange(selectionStart, selectionEnd);
                    }
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