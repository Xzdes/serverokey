// packages/serverokey/engine-client.js

const isDebugMode = document.body.hasAttribute('data-debug-mode');
let socketId = null;

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
    if (element.tagName === 'BUTTON' && element.name && element.value) {
        data[element.name] = element.value;
    }
    if(element.form && element.name && element.value) {
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
    const element = event.target.closest('[atom-action]');
    if (!element) return;
    
    const form = element.closest('form');
    if (form && form.hasAttribute('data-native-submit')) return;

    const requiredEventType = element.getAttribute('atom-event') || (form ? 'submit' : 'click');
    if (event.type !== requiredEventType) {
        if (!(event.type === 'click' && element.type === 'submit' && requiredEventType === 'submit')) {
             return;
        }
    }

    event.preventDefault();
    event.stopPropagation();

    const action = element.getAttribute('atom-action');
    const targetSelector = element.getAttribute('atom-target');
    
    if (!action) return;

    const [method, url] = action.split(' ');
    
    const fetchOptions = {
        method: method,
        headers: { 
            'Content-Type': 'application/json',
            'X-Socket-Id': socketId 
        },
    };

    if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        fetchOptions.body = getActionBody(element);
    }

    try {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const payload = await response.json();

        if (payload.redirectUrl) {
            window.location.href = payload.redirectUrl;
            return;
        }
        
        if (payload.html && targetSelector) {
            const targetElement = document.querySelector(targetSelector);
            if (!targetElement) throw new Error(`[Engine] Target element "${targetSelector}" not found.`);

            const activeElement = document.activeElement;
            const shouldPreserveFocus = activeElement && targetElement.contains(activeElement) && activeElement.id;
            const activeElementId = shouldPreserveFocus ? activeElement.id : null;
            const selectionStart = activeElement?.selectionStart ?? null;

            if (payload.styles) updateStyles(payload.componentName, payload.styles);
            targetElement.innerHTML = payload.html;
            if (payload.scripts) executeScripts(payload.scripts);

            if (activeElementId) {
                const newActiveElement = document.getElementById(activeElementId);
                if (newActiveElement) {
                    newActiveElement.focus();
                    if (selectionStart !== null && typeof newActiveElement.setSelectionRange === 'function') {
                        newActiveElement.setSelectionRange(selectionStart, selectionStart);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`[Engine] Action failed for "${action}":`, error);
    }
}

// --- КЛЮЧЕВЫЕ ИЗМЕНЕНИЯ ЗДЕСЬ ---
async function handleSpaNavigation(event) {
    const link = event.target.closest('a[atom-link="spa"]');
    if (!link) return;

    event.preventDefault();
    const targetUrl = new URL(link.href);

    if (window.location.pathname === targetUrl.pathname && window.location.search === targetUrl.search) return;

    try {
        const response = await fetch(targetUrl.href, {
            headers: { 'X-Requested-With': 'ServerokeySPA' }
        });

        if (!response.ok) throw new Error(`SPA navigation failed: ${response.status}`);
        
        const payload = await response.json();

        document.title = payload.title || document.title;
        
        // Обновляем все стили, которые прислал сервер
        (payload.styles || []).forEach(styleInfo => {
            updateStyles(styleInfo.name, styleInfo.css);
        });

        // Находим главный контейнер и вставляем в него ГОТОВЫЙ HTML
        const mainContainer = document.getElementById('pageContent-container');
        if (mainContainer && payload.content) {
            mainContainer.innerHTML = payload.content;
        } else if (!mainContainer) {
            console.error('[Engine] SPA Error: Main content container #pageContent-container not found.');
        }
        
        // Выполняем все скрипты
        executeScripts(payload.scripts);

        if (window.location.href !== targetUrl.href) {
            history.pushState({ spaUrl: targetUrl.href }, payload.title, targetUrl.href);
        }

    } catch (error) {
        console.error('[Engine] SPA Navigation failed:', error);
        window.location.href = targetUrl.href;
    }
}

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('[Engine] WebSocket connection established.');
    ws.onmessage = (message) => { /* ... */ };
    ws.onclose = () => { /* ... */ };
    ws.onerror = (error) => { /* ... */ };
}

document.addEventListener('DOMContentLoaded', () => {
    const supportedEvents = ['click', 'input', 'change', 'submit'];
    supportedEvents.forEach(eventType => {
        document.body.addEventListener(eventType, handleAction, true);
    });
    document.body.addEventListener('click', handleSpaNavigation, true);
    initializeWebSocket();
});

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.spaUrl) {
       const fakeLink = document.createElement('a');
       fakeLink.href = event.state.spaUrl;
       const fakeEvent = new MouseEvent('click', { bubbles: false });
       Object.defineProperty(fakeEvent, 'target', { writable: false, value: fakeLink });
       handleSpaNavigation(fakeEvent);
    }
});