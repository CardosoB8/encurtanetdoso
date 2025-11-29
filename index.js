// index.js
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações de Segurança
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors());

// Rate Limit mais agressivo
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

const SESSION_SECRET_KEY = process.env.SESSION_SECRET_KEY || crypto.randomBytes(64).toString('hex');
if (!process.env.SESSION_SECRET_KEY) {
    console.warn('AVISO: Usando SESSION_SECRET_KEY gerada automaticamente. Configure uma variável de ambiente para produção.');
}

const STEP_TIME_MS = 15000; // 15 segundos por etapa
const MIN_TIME_TOLERANCE = 2000;
const TOKEN_EXPIRATION_MS = 10 * 60 * 1000;

const linksData = { links: require('./data/links.js') };

// Cache para tokens usados
const usedTokens = new Map();
const TOKEN_CLEANUP_INTERVAL = 5 * 60 * 1000;

// Limpeza periódica de tokens usados
setInterval(() => {
    const now = Date.now();
    for (const [token, expiry] of usedTokens.entries()) {
        if (now > expiry) {
            usedTokens.delete(token);
        }
    }
}, TOKEN_CLEANUP_INTERVAL);

// --- Criptografia Melhorada ---
function signToken(payload, ip) {
    const payloadSec = {
        ...payload,
        ip: ip,
        iat: Date.now(), // Momento de criação deste token específico
        exp: Date.now() + TOKEN_EXPIRATION_MS,
        nonce: crypto.randomBytes(16).toString('hex')
    };
    
    const data = JSON.stringify(payloadSec);
    const hmac = crypto.createHmac('sha384', SESSION_SECRET_KEY);
    hmac.update(data);
    const signature = hmac.digest('hex');
    
    return `${Buffer.from(data).toString('base64url')}.${signature}`;
}

function verifyToken(token, reqIp) {
    try {
        if (usedTokens.has(token)) {
            return null;
        }

        const [encodedData, signature] = token.split('.');
        if (!encodedData || !signature) return null;

        const data = Buffer.from(encodedData, 'base64url').toString('utf8');
        const payload = JSON.parse(data);

        if (Date.now() > payload.exp) {
            return null;
        }

        if (payload.ip !== reqIp) {
            return null;
        }

        const hmac = crypto.createHmac('sha384', SESSION_SECRET_KEY);
        hmac.update(data);
        const expectedSignature = hmac.digest('hex');

        if (!crypto.timingSafeEqual(
            Buffer.from(signature), 
            Buffer.from(expectedSignature)
        )) {
            return null;
        }

        return payload;
    } catch (e) {
        return null;
    }
}

function markTokenUsed(token) {
    const [encodedData] = token.split('.');
    const data = Buffer.from(encodedData, 'base64url').toString('utf8');
    const payload = JSON.parse(data);
    usedTokens.set(token, payload.exp);
}

// Middleware de validação
app.use(express.static(path.join(__dirname, 'public')));

// --- Rota Home ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Rota das Páginas de Etapa ---
app.get('/page:step', (req, res) => {
    const step = parseInt(req.params.step);
    const token = req.query.token;

    if (isNaN(step) || !token) {
        return res.redirect('/');
    }

    const payload = verifyToken(token, req.ip);
    if (!payload) {
        return res.redirect('/');
    }

    // Validar consistência do passo
    const link = linksData.links.find(l => l.alias === payload.alias);
    if (!link) {
        return res.redirect('/');
    }

    const totalSteps = link.steps || 3;
    
    // Validar sequência de passos
    if (step !== payload.step) {
        return res.redirect('/');
    }

    res.sendFile(path.join(__dirname, 'public', 'step.html'));
});

// --- API: Avançar Etapa ---
app.get('/api/next-step', (req, res) => {
    const sessionToken = req.query.token;
    const clientStep = parseInt(req.query.currentStep);
    const clientIp = req.ip;

    if (!sessionToken || isNaN(clientStep)) {
        return res.status(400).json({ error: 'Dados inválidos', redirect: '/' });
    }

    const payload = verifyToken(sessionToken, clientIp);
    if (!payload) {
        return res.status(403).json({ error: 'Sessão inválida ou expirada', redirect: '/' });
    }

    const link = linksData.links.find(l => l.alias === payload.alias);
    if (!link) {
        return res.status(404).json({ error: 'Link não encontrado', redirect: '/' });
    }

    const TOTAL_STEPS_FOR_LINK = link.steps || 3;

    // CORREÇÃO: Cada etapa tem exatamente 15 segundos, sem acumulação
    const timeElapsed = Date.now() - payload.iat;
    
    if (timeElapsed < (STEP_TIME_MS - MIN_TIME_TOLERANCE)) {
        const remainingTime = Math.max(0, STEP_TIME_MS - timeElapsed);
        return res.status(429).json({ 
            error: `Aguarde mais ${Math.ceil(remainingTime/1000)} segundos`, 
            resetTimer: true,
            remainingTime: remainingTime
        });
    }

    // Validar sequência
    if (payload.step !== clientStep) {
        markTokenUsed(sessionToken);
        return res.status(400).json({ error: 'Sequência inválida', redirect: '/' });
    }

    // Lógica de decisão
    if (clientStep >= TOTAL_STEPS_FOR_LINK) {
        markTokenUsed(sessionToken);
        return res.json({ redirect: link.original_url });
    } else {
        const nextStep = clientStep + 1;
        // CORREÇÃO: Criar novo token com timestamp atual (sem acumulação)
        const newToken = signToken({ 
            alias: payload.alias, 
            step: nextStep
        }, clientIp);

        markTokenUsed(sessionToken);
        
        return res.json({ 
            redirect: `/page${nextStep}?token=${newToken}`,
            total: TOTAL_STEPS_FOR_LINK
        });
    }
});

// --- API: Obter Total de Etapas ---
app.get('/api/get-total', (req, res) => {
    const token = req.query.token;
    const clientIp = req.ip;

    if (!token) {
        return res.status(400).json({ error: 'Token ausente' });
    }

    const payload = verifyToken(token, clientIp);
    if (!payload) {
        return res.status(403).json({ error: 'Token inválido' });
    }

    const link = linksData.links.find(l => l.alias === payload.alias);
    if (!link) {
        return res.status(404).json({ error: 'Link não encontrado' });
    }

    const totalSteps = link.steps || 3;
    
    res.json({ total: totalSteps });
});

// --- Rota de Entrada (Start) ---
app.get('/:alias', (req, res) => {
    const alias = req.params.alias;
    const link = linksData.links.find(l => l.alias === alias);
    
    if (link) {
        const totalSteps = link.steps || 3;
        const token = signToken({ 
            alias: alias, 
            step: 1 
        }, req.ip);
        
        res.redirect(`/page1?token=${token}`);
    } else {
        res.redirect('/');
    }
});

// Middleware de erro
app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).redirect('/');
});

app.listen(PORT, () => {
    console.log(`Servidor seguro rodando na porta ${PORT}`);
});