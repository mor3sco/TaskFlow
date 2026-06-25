/**
 * TaskFlow — server.js
 * Evandro Moresco · Oggi Sec · https://oggisec.com
 */

'use strict';

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middlewares globais ──────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── Rate limiting ────────────────────────────────────────────

// Geral: 100 requisições por IP a cada 15 minutos
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

// Auth: 10 tentativas de login/cadastro por IP a cada 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' },
  skipSuccessfulRequests: true, // não conta requisições bem-sucedidas
});

app.use('/api', generalLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google',   authLimiter);

// ── Rotas ────────────────────────────────────────────────────
app.use('/api/auth',  authRoutes);
app.use('/api/tasks', taskRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Rota não encontrada ──────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// ── Error handler global ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ TaskFlow API rodando na porta ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
});