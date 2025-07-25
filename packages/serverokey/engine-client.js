// packages/serverokey/engine-client.js

const isDebugMode = document.body.hasAttribute('data-debug-mode');
let socketId = null;

function getActionBody(element) {
    const form = element.closest('form');
    const data = {};
    if (form) {
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
            if (value || element.type === 'submit' || element.type === 'button') {
                data[key] = value;
            }
        }
    }
    if (element.name && element.value !== undefined) {
        data[element.name] = element.value;
    }
    return JSON.stringify(data);
}

/**
 * Управляет стилями при SPA-переходе.
 * Удаляет старые стили компонентов и добавляет новые.
 * @param {Array<object>} styles - Массив объектов стилей от сервера.
 */
function updateStylesForSpa(styles) {
    // Удаляем все старые стили компонентов
    document.querySelectorAll('style[data-component-name]').forEach(tag => tag.remove());
    
    // Добавляем все новые
    (styles || []).forEach(styleInfo => {
        const styleTag = document.createElement('style');
        styleTag.id = `style-for-${styleInfo.id}`;
        styleTag.setAttribute('data-component-name', styleInfo.name);
        styleTag.textContent = styleInfo.css;
        document.head.appendChild(styleTag);
    });
}

/**
 * Управляет стилями при обновлении одного компонента.
 * Находит и заменяет стиль для конкретного компонента.
 * @param {string} componentName - Имя обновляемого компонента.
 * @param {string} newCss - Новый CSS для компонента.
 * @param {string} newComponentId - Новый ID компонента, для которого сгенерирован CSS.
 */
function updateStyleForAction(componentName, newCss, newComponentId) {
    if (!newCss || !componentName) return;
    
    // Ищем старый стиль по имени компонента
    const oldStyleTag = document.querySelector(`style[data-component-name="${componentName}"]`);
    
    if (oldStyleTag) {
        // Если нашли - просто обновляем его содержимое и ID
        oldStyleTag.id = `style-for-${newComponentId}`;
        oldStyleTag.textContent = newCss;
    } else {
        // Если по какой-то причине его нет - создаем новый
        const newStyleTag = document.createElement('style');
        newStyleTag.id = `style-for-${newComponentId}`;
        newStyleTag.setAttribute('data-component-name', componentName);
        newStyleTag.textContent = newCss;
        document.head.appendChild(newStyleTag);
    }
}


async function handleAction(event) {
    const element = event.target.closest('[atom-action]');
    if (!element) return;
    
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
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json', 'X-Socket-Id': socketId },
    };
    if (fetchOptions.method !== 'GET' && fetchOptions.method !== 'HEAD') {
        fetchOptions.body = getActionBody(element);
    }

    try {
        if (isDebugMode) console.log(`[ACTION] Trigger: ${action}`, { body: fetchOptions.body });
        const response = await fetch(url, fetchOptions);
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const payload = await response.json();
        if (isDebugMode) console.log(`[ACTION] Response:`, payload);

        if (payload.redirect) {
            if (typeof payload.redirect === 'object' && payload.redirect.full) {
                window.location.href = payload.redirect.url;
            } else {
                const redirectUrl = typeof payload.redirect === 'string' ? payload.redirect : payload.redirect.url;
                handleSpaRedirect(redirectUrl);
            }
            return;
        }
        
        if (payload.html && targetSelector) {
            const targetElement = document.querySelector(targetSelector);
            if (!targetElement) throw new Error(`Target element "${targetSelector}" not found.`);

            const activeElement = document.activeElement;
            const shouldPreserveFocus = activeElement && targetElement.contains(activeElement) && activeElement.id;
            const activeElementId = shouldPreserveFocus ? activeElement.id : null;
            const selectionStart = activeElement?.selectionStart ?? null;
            const selectionEnd = activeElement?.selectionEnd ?? null;
            
            const newComponentId = (payload.html.match(/data-component-id="([^"]+)"/) || [])[1];
            if (payload.styles && newComponentId) {
                updateStyleForAction(payload.componentName, payload.styles, newComponentId);
            }

            targetElement.innerHTML = payload.html;

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

function handleSpaRedirect(url) {
    const targetUrl = new URL(url, window.location.origin);
    const fakeLink = document.createElement('a');
    fakeLink.href = targetUrl.href;
    fakeLink.setAttribute('atom-link', 'spa');
    const fakeEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(fakeEvent, 'target', { writable: false, value: fakeLink });
    handleSpaNavigation(fakeEvent);
}

async function handleSpaNavigation(event) {
    const link = event.target.closest('a[atom-link="spa"]');
    if (!link) return;

    event.preventDefault();
    const targetUrl = new URL(link.href);
    if (window.location.href === targetUrl.href) return;

    try {
        if (isDebugMode) console.log(`[SPA] Navigating to: ${targetUrl.href}`);
        const response = await fetch(targetUrl.href, {
            headers: { 'X-Requested-With': 'ServerokeySPA' }
        });
        if (!response.ok) throw new Error(`SPA navigation failed: ${response.status}`);
        
        const payload = await response.json();
        if (isDebugMode) console.log('[SPA] Received payload:', payload);

        if (payload.redirect) {
            if (typeof payload.redirect === 'object' && payload.redirect.full) {
                 window.location.href = payload.redirect.url;
            } else {
                 const redirectUrl = typeof payload.redirect === 'string' ? payload.redirect : payload.redirect.url;
                 handleSpaRedirect(redirectUrl);
            }
            return;
        }
        
        document.title = payload.title || document.title;
        updateStylesForSpa(payload.styles);

        const mainContainerId = 'pageContent-container';
        const mainContainer = document.getElementById(mainContainerId);
        const mainContentHtml = payload.injectedParts?.pageContent;

        if (mainContainer && mainContentHtml !== undefined) {
             mainContainer.innerHTML = mainContentHtml;
        } else {
             console.warn(`[SPA] Main container #${mainContainerId} or main content not found in payload.`);
             window.location.href = targetUrl.href;
             return;
        }

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
            if (isDebugMode) console.log(`[WS] Event received: ${data.event}`);
            
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
        if(isDebugMode) console.log('[Engine] WebSocket connection closed. Reconnecting in 3 seconds...');
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
    if (isDebugMode) console.log('✔️ [Engine] Client initialized in Debug Mode.');
});

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.spaUrl) {
       handleSpaRedirect(event.state.spaUrl);
    }
});