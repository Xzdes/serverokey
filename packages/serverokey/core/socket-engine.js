// core/socket-engine.js
const WebSocket = require('ws');

class SocketEngine {
    constructor(httpServer, manifest, connectorManager) {
        this.wss = new WebSocket.Server({ server: httpServer });
        this.manifest = manifest;
        this.connectorManager = connectorManager;
        this.channels = new Map(); // Хранит информацию о каналах и подписчиках
        this.clients = new Set();

        if (this.manifest.sockets) {
            this._initializeChannels();
        }

        this.wss.on('connection', (ws) => this._handleConnection(ws));
        console.log('[SocketEngine] WebSocket server initialized.');
    }

    _initializeChannels() {
        for (const channelName in this.manifest.sockets) {
            this.channels.set(channelName, {
                config: this.manifest.sockets[channelName],
                subscribers: new Set()
            });
            console.log(`[SocketEngine] Channel '${channelName}' registered.`);
        }
    }

    _handleConnection(ws) {
        console.log('[SocketEngine] Client connected.');
        this.clients.add(ws);

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'subscribe' && this.channels.has(data.channel)) {
                    this.channels.get(data.channel).subscribers.add(ws);
                    console.log(`[SocketEngine] Client subscribed to channel '${data.channel}'`);
                }
            } catch (e) {
                console.warn('[SocketEngine] Received invalid message from client:', message);
            }
        });

        ws.on('close', () => {
            console.log('[SocketEngine] Client disconnected.');
            this.clients.delete(ws);
            // Удаляем клиента из всех подписок
            this.channels.forEach(channel => {
                channel.subscribers.delete(ws);
            });
        });

        ws.on('error', (error) => {
            console.error('[SocketEngine] WebSocket error:', error);
        });
    }

    async notifyOnWrite(connectorName) {
        if (!this.manifest.sockets) return;

        for (const [channelName, channel] of this.channels.entries()) {
            if (channel.config.watch === connectorName) {
                console.log(`[SocketEngine] Notifying channel '${channelName}' due to write on '${connectorName}'`);
                
                const context = await this.connectorManager.getContext([connectorName]);
                const payloadExpression = channel.config.emit.payload;
                
                let payload = null;
                // Упрощенное вычисление, так как у нас нет полного контекста ActionEngine
                if (context[payloadExpression]) {
                    payload = context[payloadExpression];
                } else {
                    console.warn(`[SocketEngine] Could not resolve payload expression '${payloadExpression}'. Sending full connector data.`);
                    payload = context[connectorName];
                }

                const message = JSON.stringify({
                    event: channel.config.emit.event,
                    payload: payload
                });

                channel.subscribers.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(message);
                    }
                });
            }
        }
    }
}

module.exports = { SocketEngine };