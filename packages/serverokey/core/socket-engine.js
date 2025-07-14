// core/socket-engine.js
const WebSocket = require('ws');
const crypto = require('crypto');

class SocketEngine {
    constructor(httpServer, manifest, connectorManager) {
        this.wss = new WebSocket.Server({ server: httpServer });
        this.manifest = manifest;
        this.connectorManager = connectorManager;
        this.channels = new Map();
        this.clients = new Map();

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
        const clientId = crypto.randomBytes(16).toString('hex');
        ws.id = clientId;
        this.clients.set(clientId, ws);
        console.log(`[SocketEngine] Client connected with ID: ${clientId}`);

        // --- ДОБАВЛЕНИЕ: Отправляем клиенту его ID ---
        ws.send(JSON.stringify({ type: 'socket_id_assigned', id: clientId }));

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'subscribe' && this.channels.has(data.channel)) {
                    this.channels.get(data.channel).subscribers.add(clientId);
                    console.log(`[SocketEngine] Client ${clientId} subscribed to channel '${data.channel}'`);
                }
            } catch (e) {
                console.warn('[SocketEngine] Received invalid message from client:', message);
            }
        });

        ws.on('close', () => {
            console.log(`[SocketEngine] Client ${clientId} disconnected.`);
            this.clients.delete(clientId);
            this.channels.forEach(channel => {
                channel.subscribers.delete(clientId);
            });
        });

        ws.on('error', (error) => {
            console.error(`[SocketEngine] WebSocket error for client ${clientId}:`, error);
        });
    }

    async notifyOnWrite(connectorName, initiatorId = null) {
        if (!this.manifest.sockets) return;

        for (const [channelName, channel] of this.channels.entries()) {
            if (channel.config.watch === connectorName) {
                if (this.debug) console.log(`[SocketEngine] Notifying channel '${channelName}' due to write on '${connectorName}' (initiator: ${initiatorId})`);
                
                const context = await this.connectorManager.getContext([connectorName]);
                const payloadExpression = channel.config.emit.payload;
                
                let payload = null;
                if (context[payloadExpression]) {
                    payload = context[payloadExpression];
                } else {
                    payload = context[connectorName];
                }

                const message = JSON.stringify({
                    event: channel.config.emit.event,
                    payload: payload
                });

                channel.subscribers.forEach(subscriberId => {
                    if (subscriberId !== initiatorId) {
                        const ws = this.clients.get(subscriberId);
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(message);
                        }
                    }
                });
            }
        }
    }
}

module.exports = { SocketEngine };