// index.js
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// *** SEGURANÇA ***
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false, // Desativado temporariamente para permitir scripts de ads externos
}));

// Limita requisições (Anti-DDoS)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200, 
    message: { error: 'Muitas requisições. Acalme-se.' }
});
app.use(limiter);

const SESSION_SECRET_KEY = process.env.SESSION_SECRET_KEY || 'CHAVE_SUPER_SECRETA_DEV';
const TOTAL_STEPS = 6; // Agora são 6 passos
const STEP_TIME_MS = 15000; // 15 Segundos (deve bater com o contador do frontend)
const MIN_TIME_TOLERANCE = 2000; // Tolerância de 2s (para conexões lentas)

// Carrega Links
const linksData = { links: require('./data/links.js') };

// *** FUNÇÕES DE CRIPTOGRAFIA ***
function signToken(payload, ip) {
    const payloadSec = {
        ...payload,
        ip: ip,
        iat: Date.now(),
        nonce: crypto.randomBytes(8).toString('hex') // Nonce maior para entropia
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

        // Comparação segura contra Timing Attacks
        const a = Buffer.from(signature);
        const b = Buffer.from(expectedSignature);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

        const payload = JSON.parse(data);

        // Validação de IP (Anti-Link Sharing)
        if (payload.ip !== reqIp) return null;

        return payload;
    } catch (e) {
        return null;
    }
}

app.use(express.static(path.join(__dirname, 'public')));

// Rota Inicial (Home)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// *** ROTA GENÉRICA PARA PÁGINAS 1 a 6 ***
// Serve o MESMO arquivo HTML, o JS resolve o resto.
app.get('/page:step', (req, res) => {
    const step = parseInt(req.params.step);
    const token = req.query.token;

    // Validação básica antes de entregar o HTML
    if (isNaN(step) || step < 1 || step > TOTAL_STEPS) {
        return res.redirect('/');
    }
    
    // Se não tiver token, manda pra home
    if (!token) return res.redirect('/');

    // Serve o arquivo de template dos passos
    res.sendFile(path.join(__dirname, 'public', 'step.html'));
});

// *** API DE VALIDAÇÃO (A PARTE INTELIGENTE) ***
app.get('/api/next-step', (req, res) => {
    const sessionToken = req.query.token;
    const clientStep = parseInt(req.query.currentStep);
    const clientIp = req.ip;

    if (!sessionToken) return res.status(400).json({ error: 'Token ausente' });

    const payload = verifyToken(sessionToken, clientIp);

    // 1. Checagem de Integridade
    if (!payload) {
        return res.status(403).json({ error: 'Sessão inválida ou IP alterado.', redirect: '/' });
    }

    // 2. Checagem de Tempo (Anti-Speedrun)
    // O usuário não pode requisitar o próximo passo antes de (15s - tolerância)
    const timeElapsed = Date.now() - payload.iat;
    const minRequiredTime = STEP_TIME_MS - MIN_TIME_TOLERANCE;

    if (timeElapsed < minRequiredTime) {
        console.warn(`[CHEAT] Tentativa rápida: ${timeElapsed}ms. IP: ${clientIp}`);
        return res.status(429).json({ error: 'Você está muito rápido. Aguarde o contador.', resetTimer: true });
    }

    // 3. Checagem de Sequência
    if (payload.step !== clientStep) {
        return res.status(400).json({ error: 'Passo incorreto.', redirect: '/' });
    }

    const link = linksData.links.find(l => l.alias === payload.alias);
    if (!link) return res.status(404).json({ error: 'Link não encontrado.', redirect: '/' });

    // LÓGICA FINAL
    if (clientStep >= TOTAL_STEPS) {
        // Chegou no final (Passo 6)
        return res.json({ redirect: link.original_url });
    } else {
        // Avança para o próximo
        const nextStep = clientStep + 1;
        const newToken = signToken({ 
            alias: payload.alias, 
            step: nextStep,
            exp: Date.now() + 3600000 
        }, clientIp);

        return res.json({ redirect: `/page${nextStep}?token=${newToken}` });
    }
});

// Rota de Entrada (ex: /youtube-canal)
app.get('/:alias', (req, res) => {
    const alias = req.params.alias;
    const link = linksData.links.find(l => l.alias === alias);
    
    if (link) {
        const token = signToken({ alias: alias, step: 1, exp: Date.now() + 3600000 }, req.ip);
        res.redirect(`/page1?token=${token}`);
    } else {
        res.redirect('/');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor Blindado rodando na porta ${PORT}`);
});