// s:\serverokey\packages\serverokey\core\engine-client.js

/**
 * Finds the closest form, collects its data, and includes the triggering button's value.
 * @param {HTMLElement} element - The element that triggered the action.
 * @returns {string} - A JSON string of the form data.
 */
function getActionBody(element) {
    // Find the closest form to the element.
    const form = element.closest('form');
    // Use a plain object to accumulate data.
    const data = {};

    if (form) {
        // If a form is found, use FormData to collect all its input values.
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
    } else if (element.name) {
        // If no form is found, get the data from the triggering element itself.
        // This is crucial for standalone inputs with atom-action.
        data[element.name] = element.value;
    }

    // If the trigger was a button with a name and value, its value should be included.
    if (element.tagName === 'BUTTON' && element.name) {
        data[element.name] = element.value;
    }

    // Convert the final data object to a JSON string.
    return JSON.stringify(data);
}

/**
 * Updates the component's styles in the document's <head>.
 * Creates a <style> tag if one doesn't exist for the component.
 * @param {string} componentName - The name of the component.
 * @param {string} newStyles - The new CSS string.
 */
function updateStyles(componentName, newStyles) {
    if (!newStyles || !componentName) return;

    const styleId = `style-for-${componentName}`;
    let styleTag = document.getElementById(styleId);

    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        // Use the same data-attribute as the server-side renderer for consistency.
        styleTag.setAttribute('data-component-name', componentName);
        document.head.appendChild(styleTag);
    }

    // Update content only if it has actually changed to prevent unnecessary style recalculations.
    if (styleTag.textContent !== newStyles) {
        styleTag.textContent = newStyles;
    }
}

/**
 * Executes client-side scripts that are part of a component's payload.
 * @param {Array<Object>} scripts - An array of script objects, e.g., [{ id, code }].
 */
function executeScripts(scripts) {
    if (!scripts || !Array.isArray(scripts)) return;

    scripts.forEach(scriptInfo => {
        try {
            // WARNING: Using new Function() can be a security risk if the script content
            // comes from an untrusted source. In this architecture, it's assumed to be
            // trusted code from the component itself.
            new Function(scriptInfo.code)();
        } catch (e) {
            console.error(`[Engine] Error executing script for component ${scriptInfo.id}:`, e);
        }
    });
}

/**
 * Main action handler for declarative events.
 * @param {Event} event - The DOM event.
 */
async function handleAction(event) {
    const element = event.target.closest('[atom-action]');
    if (!element) return;

    // Check if the event type matches the one specified in atom-event, default to 'click'.
    const requiredEventType = element.getAttribute('atom-event') || 'click';
    if (event.type !== requiredEventType) return;

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
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: body
        });

        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

        const payload = await response.json();
        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) throw new Error(`[Engine] Target element "${targetSelector}" not found.`);

        // --- УЛУЧШЕНИЕ: Сохраняем фокус и позицию курсора ---
        const activeElement = document.activeElement;
        // Проверяем, что активный элемент находится внутри обновляемого блока и у него есть ID
        const shouldPreserveFocus = activeElement && targetElement.contains(activeElement) && activeElement.id;
        const activeElementId = shouldPreserveFocus ? activeElement.id : null;
        const selectionStart = activeElement?.selectionStart ?? null;
        const selectionEnd = activeElement?.selectionEnd ?? null;

        updateStyles(payload.componentName, payload.styles);
        targetElement.innerHTML = payload.html;
        executeScripts(payload.scripts);

        // --- УЛУЧШЕНИЕ: Восстанавливаем фокус и позицию курсора ---
        if (activeElementId) {
            const newActiveElement = document.getElementById(activeElementId);
            if (newActiveElement) {
                newActiveElement.focus();
                // Восстанавливаем позицию курсора для текстовых полей
                if (selectionStart !== null && typeof newActiveElement.setSelectionRange === 'function') {
                    newActiveElement.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    } catch (error) {
        console.error(`[Engine] Action failed for "${action}":`, error);
    }
}

// Attach event listeners once the DOM is ready.
document.addEventListener('DOMContentLoaded', () => {
    const supportedEvents = ['click', 'input', 'change', 'submit'];
    supportedEvents.forEach(eventType => {
        document.body.addEventListener(eventType, handleAction, true);
    });
});