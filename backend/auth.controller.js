'use strict';

const bcrypt               = require('bcryptjs');
const jwt                  = require('jsonwebtoken');
const { OAuth2Client }     = require('google-auth-library');
const prisma               = require('../config/prisma');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Helpers ──────────────────────────────────────────────────

function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function setCookieAndRespond(res, userId, userPayload) {
  const token = generateToken(userId);

  // Cookie httpOnly (mais seguro — não acessível por JS)
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dias
  });

  // Também retorna no body para quem prefere usar no header
  res.json({ token, user: userPayload });
}

// ── Registrar (email + senha) ─────────────────────────────────

async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    if (username) {
      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) {
        return res.status(409).json({ error: 'Nome de usuário já existe.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username: username || null, email, passwordHash },
    });

    setCookieAndRespond(res, user.id, {
      id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl,
    });
  } catch (err) { next(err); }
}

// ── Login (email + senha) ─────────────────────────────────────

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    setCookieAndRespond(res, user.id, {
      id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl,
    });
  } catch (err) { next(err); }
}

// ── Google OAuth ──────────────────────────────────────────────

async function googleAuth(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken não fornecido.' });

    // Verifica o token do Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Busca ou cria usuário
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { googleId, email, username: name, avatarUrl: picture },
      });
    } else if (!user.googleId) {
      // Usuário existe com email mas sem Google vinculado → vincula
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl: picture },
      });
    }

    setCookieAndRespond(res, user.id, {
      id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl,
    });
  } catch (err) { next(err); }
}

// ── Logout ───────────────────────────────────────────────────

function logout(_req, res) {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado com sucesso.' });
}

// ── Perfil do usuário logado ──────────────────────────────────

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user });
  } catch (err) { next(err); }
}

module.exports = { register, login, googleAuth, logout, me };
