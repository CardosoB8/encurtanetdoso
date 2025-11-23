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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Rate Limit
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, 
    message: { error: 'Muitas requisições. Acalme-se.' }
});
app.use(limiter);

const SESSION_SECRET_KEY = process.env.SESSION_SECRET_KEY || 'f1b39bd1a7d06564e0e9b5e3c17a50ac7a276c8836367e4a92d643de598a93291651139273ec5aed04269fca3383f03970814973f9c3cc7e6712e5f17543e06c';
const DEFAULT_STEPS = 3; // Padrão se não estiver no link.js
const STEP_TIME_MS = 15000; // 15 Segundos
const MIN_TIME_TOLERANCE = 2000; 

const linksData = { links: require('./data/links.js') };

// --- Criptografia ---
function signToken(payload, ip) {
    const payloadSec = {
        ...payload,
        ip: ip,
        iat: Date.now(),
        nonce: crypto.randomBytes(8).toString('hex')
    };
    const data = JSON.stringify(payloadSec);
    const hmac = crypto.createHmac('sha256', SESSION_SECRET_KEY);
    hmac.update(data);
    const signature = hmac.digest('hex');
    return `${Buffer.from(data).toString('base64url')}.${signature}`;
}

function verifyToken(token, reqIp) {
    try {
        const [encodedData, signature] = token.split('.');
        if (!encodedData || !signature) return null;

        const data = Buffer.from(encodedData, 'base64url').toString('utf8');
        const hmac = crypto.createHmac('sha256', SESSION_SECRET_KEY);
        hmac.update(data);
        const expectedSignature = hmac.digest('hex');

        const a = Buffer.from(signature);
        const b = Buffer.from(expectedSignature);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

        const payload = JSON.parse(data);
        if (payload.ip !== reqIp) return null;

        return payload;
    } catch (e) {
        return null;
    }
}

app.use(express.static(path.join(__dirname, 'public')));

// --- Rota Home (Limpa) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Rota das Páginas de Etapa ---
app.get('/page:step', (req, res) => {
    const step = parseInt(req.params.step);
    const token = req.query.token;

    if (isNaN(step) || !token) return res.redirect('/');
    
    // Serve o template único
    res.sendFile(path.join(__dirname, 'public', 'step.html'));
});

// --- API: Avançar Etapa ---
app.get('/api/next-step', (req, res) => {
    const sessionToken = req.query.token;
    const clientStep = parseInt(req.query.currentStep);
    const clientIp = req.ip;

    if (!sessionToken) return res.status(400).json({ error: 'Token ausente' });

    const payload = verifyToken(sessionToken, clientIp);

    // 1. Validação de Token e IP
    if (!payload) return res.status(403).json({ error: 'Sessão inválida.', redirect: '/' });

    // 2. Busca o Link para saber quantos passos ele tem
    const link = linksData.links.find(l => l.alias === payload.alias);
    if (!link) return res.status(404).json({ error: 'Link perdido.', redirect: '/' });

    const TOTAL_STEPS_FOR_LINK = link.steps || DEFAULT_STEPS;

    // 3. Validação de Tempo
    const timeElapsed = Date.now() - payload.iat;
    if (timeElapsed < (STEP_TIME_MS - MIN_TIME_TOLERANCE)) {
        return res.status(429).json({ error: 'Muito rápido! Aguarde o contador.', resetTimer: true });
    }

    // 4. Validação de Sequência
    if (payload.step !== clientStep) {
        return res.status(400).json({ error: 'Passo incorreto.', redirect: '/' });
    }

    // --- Lógica de Decisão ---
    if (clientStep >= TOTAL_STEPS_FOR_LINK) {
        // Chegou ao fim!
        return res.json({ redirect: link.original_url });
    } else {
        // Vai para o próximo
        const nextStep = clientStep + 1;
        const newToken = signToken({ 
            alias: payload.alias, 
            step: nextStep,
            exp: Date.now() + 3600000 
        }, clientIp);

        // Passamos o 'total' na URL para o frontend saber mostrar "2/5"
        return res.json({ redirect: `/page${nextStep}?token=${newToken}&total=${TOTAL_STEPS_FOR_LINK}` });
    }
});

// --- Rota de Entrada (Start) ---
app.get('/:alias', (req, res) => {
    const alias = req.params.alias;
    const link = linksData.links.find(l => l.alias === alias);
    
    if (link) {
        const totalSteps = link.steps || DEFAULT_STEPS;
        const token = signToken({ alias: alias, step: 1, exp: Date.now() + 3600000 }, req.ip);
        
        // Redireciona para a página 1, avisando que o total é X
        res.redirect(`/page1?token=${token}&total=${totalSteps}`);
    } else {
        res.redirect('/');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});