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
    }
    if (element.name && element.value) {
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

    const requiredEventType = element.getAttribute('atom-event') || (element.tagName === 'FORM' ? 'submit' : 'click');
    
    if (event.type !== requiredEventType) {
        if (!(event.type === 'click' && element.type === 'submit' && element.closest('form')?.getAttribute('atom-action'))) {
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
        
        const existingStyleNames = new Set();
        document.querySelectorAll('style[data-component-name]').forEach(tag => {
            existingStyleNames.add(tag.getAttribute('data-component-name'));
        });
        const newStyleNames = new Set((payload.styles || []).map(s => s.name));
        (payload.styles || []).forEach(styleInfo => updateStyles(styleInfo.name, styleInfo.css));
        existingStyleNames.forEach(oldName => {
            if (!newStyleNames.has(oldName)) {
                document.getElementById(`style-for-${oldName}`)?.remove();
            }
        });

        const mainContainer = document.getElementById('pageContent-container');
        if (mainContainer) {
            let newContent = '';
            // Собираем HTML из всех присланных частей, оборачивая в контейнеры
            for (const placeholder in payload.injectedParts) {
                const html = payload.injectedParts[placeholder];
                newContent += `<div id="${placeholder}-container">${html}</div>`;
            }
            mainContainer.innerHTML = newContent;
        }
        
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

    ws.onopen = () => {
        if (isDebugMode) console.log('[Engine] WebSocket connection established.');
    };

    ws.onmessage = (message) => {
        try {
            const data = JSON.parse(message.data);
            if (data.type === 'socket_id_assigned') {
                socketId = data.id;
                if (isDebugMode) console.log(`[Engine] WebSocket ID assigned: ${socketId}`);
                document.querySelectorAll('[atom-socket]').forEach(element => {
                    const channelName = element.getAttribute('atom-socket');
                    if (channelName) {
                        ws.send(JSON.stringify({ type: 'subscribe', channel: channelName }));
                    }
                });
                return;
            }
            if (isDebugMode) {
                console.groupCollapsed(`[DEBUG] WebSocket Event Received: ${data.event}`);
                console.log('Payload:', data.payload);
                console.groupEnd();
            }
            document.querySelectorAll(`[atom-on-event="${data.event}"]`).forEach(element => {
                const action = element.getAttribute('atom-action');
                if (action) {
                    const fakeEvent = new Event('click', { bubbles: true, cancelable: true });
                    Object.defineProperty(fakeEvent, 'target', { writable: false, value: element });
                    handleAction(fakeEvent);
                }
            });
        } catch (e) {
            console.error('[Engine] Failed to handle WebSocket message:', e);
        }
    };

    ws.onclose = () => {
        console.log('[Engine] WebSocket connection closed. Reconnecting in 3 seconds...');
        socketId = null;
        setTimeout(initializeWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('[Engine] WebSocket error:', error);
        ws.close();
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const supportedEvents = ['click', 'input', 'change', 'submit'];
    supportedEvents.forEach(eventType => {
        document.body.addEventListener(eventType, handleAction, true);
    });
    document.body.addEventListener('click', handleSpaNavigation, true);
    initializeWebSocket();

    if (isDebugMode) {
        console.log('✔️ [Engine] Client initialized in Debug Mode.');
    }
});

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.spaUrl) {
       const fakeLink = document.createElement('a');
       fakeLink.href = event.state.spaUrl;
       fakeLink.setAttribute('atom-link', 'spa');
       const fakeEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
       Object.defineProperty(fakeEvent, 'target', { writable: false, value: fakeLink });
       handleSpaNavigation(fakeEvent);
    }
});