// core/auth-engine.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cookie = require('cookie');

class AuthEngine {
    constructor(manifest, userCol, sessionCol) {
        this.config = manifest.auth;
        this.userCollection = userCol;
        this.sessionCollection = sessionCol;

        if (!this.config) {
            throw new Error("[AuthEngine] 'auth' section is missing in manifest.js");
        }
        if (!this.userCollection) {
             throw new Error("[AuthEngine] User collection was not provided.");
        }
        if (!this.sessionCollection) {
            throw new Error("[AuthEngine] Session collection was not provided.");
        }
    }

    async createSession(user) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        
        // --- КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        // Сессия теперь хранит ТОЛЬКО ID пользователя. 
        // Больше никакого копирования полей.
        const sessionData = {
            _id: sessionId,
            userId: user._id,
            login: user[this.config.identityField]
        };
        
        await this.sessionCollection.insert(sessionData);
        return sessionId;
    }

    async getSession(req) {
        const cookies = cookie.parse(req.headers.cookie || '');
        const sessionId = cookies.session_id;
        if (!sessionId) return null;
        
        const sessionData = await this.sessionCollection.getById(sessionId);
        return sessionData;
    }

    async clearSession(req, res) {
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
            ...body, // Копируем все поля из формы (name, etc.)
            [identityField]: identity,
            [passwordField]: passwordHash
        };
        delete newUser.password;

        await this.userCollection.insert(newUser);
        
        return true;
    }

    async login(body) {
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
        res.writeHead(302, { 'Location': location });
        res.end();
    }
}

module.exports = { AuthEngine };