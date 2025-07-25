// packages/serverokey/core/auth-engine.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cookie = require('cookie');

class AuthEngine {
    // --- ИЗМЕНЕНИЕ: Принимаем коннекторы целиком ---
    constructor(manifest, userConnector, sessionConnector) {
        this.config = manifest.auth;
        
        // --- ИЗМЕНЕНИЕ: Сохраняем коннекторы и извлекаем коллекции из них ---
        this.userConnector = userConnector;
        this.sessionConnector = sessionConnector;
        this.userCollection = userConnector?.collection;
        this.sessionCollection = sessionConnector?.collection;

        if (!this.config) {
            throw new Error("[AuthEngine] 'auth' section is missing in manifest.js");
        }
        if (!this.userCollection) {
             throw new Error("[AuthEngine] User collection was not provided or connector is invalid.");
        }
        if (!this.sessionCollection) {
            throw new Error("[AuthEngine] Session collection was not provided or connector is invalid.");
        }
    }

    async createSession(user) {
        // ... (остальной код без изменений) ...
        const sessionId = crypto.randomBytes(32).toString('hex');
        
        const sessionData = {
            _id: sessionId,
            userId: user._id,
            login: user[this.config.identityField]
        };
        
        await this.sessionCollection.insert(sessionData);
        return sessionId;
    }

    async getSession(req) {
        // ... (остальной код без изменений) ...
        const cookies = cookie.parse(req.headers.cookie || '');
        const sessionId = cookies.session_id;
        if (!sessionId) return null;
        
        const sessionData = await this.sessionCollection.getById(sessionId);
        return sessionData;
    }

    async clearSession(req, res) {
        // ... (остальной код без изменений) ...
        const cookies = cookie.parse(req.headers.cookie || '');
        const sessionId = cookies.session_id;
        if (sessionId) {
            await this.sessionCollection.remove(sessionId);
        }
        res.setHeader('Set-Cookie', cookie.serialize('session_id', '', {
            httpOnly: true, maxAge: -1, path: '/',
        }));
    }

    async register(body) {
        // ... (остальной код без изменений) ...
        const { identityField, passwordField } = this.config;
        const identity = body[identityField];
        const password = body.password;

        if (!identity || !password) {
            throw new Error('Identity field or password not provided.');
        }
        
        const existingUser = await this.userCollection.findOne({ [identityField]: identity });
        if (existingUser) {
            throw new Error('User with this identity already exists.');
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const newUser = {
            ...body,
            [identityField]: identity,
            [passwordField]: passwordHash
        };
        delete newUser.password;

        await this.userCollection.insert(newUser);
        
        return true;
    }

    async login(body) {
        // ... (остальной код без изменений) ...
        const { identityField, passwordField } = this.config;
        const identity = body[identityField];
        const password = body.password;

        if (!identity || !password) {
            throw new Error('Identity or password not provided.');
        }
        
        const user = await this.userCollection.findOne({ [identityField]: identity });
        if (!user) {
            throw new Error('Invalid identity or password.');
        }

        const match = await bcrypt.compare(password, user[passwordField]);
        if (!match) {
            throw new Error('Invalid identity or password.');
        }
        
        return user;
    }

    redirect(res, location) {
        // ... (остальной код без изменений) ...
        res.writeHead(302, { 'Location': location });
        res.end();
    }
}

module.exports = { AuthEngine };