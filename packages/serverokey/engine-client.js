// s:\serverokey\packages\serverokey\core\engine-client.js

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
    // Для кнопок с name и value, добавляем их в тело запроса
    if (element.tagName === 'BUTTON' && element.name && element.value) {
        data[element.name] = element.value;
    }
    // Если триггер - инпут внутри формы, но у него самого есть name/value
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
    const form = event.target.closest('form');
    if (form && form.hasAttribute('data-native-submit')) {
        return;
    }
    
    // Находим ближайший элемент с atom-action, начиная с цели события
    const element = event.target.closest('[atom-action]');

    // Если такой элемент не найден, ничего не делаем
    if (!element) {
        return;
    }

    const requiredEventType = element.getAttribute('atom-event') || (element.tagName === 'FORM' ? 'submit' : 'click');
    
    // Если тип события не совпадает с требуемым, выходим.
    // Исключение: для сабмита формы, событие submit может быть инициировано кликом по кнопке type="submit"
    if (event.type !== requiredEventType && !(event.type === 'click' && event.target.type === 'submit' && requiredEventType === 'submit')) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const action = element.getAttribute('atom-action');
    const targetSelector = element.getAttribute('atom-target');
    
    if (!action) {
        console.error('[Engine] Missing atom-action attribute.', element);
        return;
    }

    const [method, url] = action.split(' ');
    
    const fetchOptions = {
        method: method,
        headers: { 
            'Content-Type': 'application/json',
            'X-Socket-Id': socketId 
        },
    };

    if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        // Тело запроса всегда формируем от `element`, а не `event.target`
        fetchOptions.body = getActionBody(element);
    }

    try {
        if (isDebugMode) {
            console.groupCollapsed(`[DEBUG] Action Triggered: ${action}`);
            console.log('Element:', element);
            console.log('Event Target:', event.target);
            console.log('Socket ID:', socketId);
            if(fetchOptions.body) console.log('Body Sent:', JSON.parse(fetchOptions.body));
            console.groupEnd();
        }
        
        const response = await fetch(url, fetchOptions);

        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

        const payload = await response.json();

        if (isDebugMode) {
            console.groupCollapsed(`[DEBUG] Received Payload for: ${action}`);
            console.log('Payload:', payload);
            console.groupEnd();
        }

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

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('[Engine] WebSocket connection established.');
    };

    ws.onmessage = (message) => {
        try {
            const data = JSON.parse(message.data);
            if (data.type === 'socket_id_assigned') {
                socketId = data.id;
                console.log(`[Engine] WebSocket ID assigned: ${socketId}`);
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

    initializeWebSocket();

    if (isDebugMode) {
        console.log('✔️ [Engine] Client initialized in Debug Mode.');
    }
});