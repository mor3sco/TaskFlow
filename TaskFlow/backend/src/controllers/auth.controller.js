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

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { googleId, email, username: name, avatarUrl: picture },
      });
    } else if (!user.googleId) {
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

// ── Atualizar perfil (nome, foto, senha) ───────────────────────

async function updateProfile(req, res, next) {
  try {
    const { username, avatarUrl, currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const data = {};

    if (username !== undefined) {
      const trimmed = username.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Nome de usuário não pode ficar vazio.' });
      }
      if (trimmed !== user.username) {
        const taken = await prisma.user.findUnique({ where: { username: trimmed } });
        if (taken && taken.id !== user.id) {
          return res.status(409).json({ error: 'Nome de usuário já está em uso.' });
        }
      }
      data.username = trimmed;
    }

    if (avatarUrl !== undefined) {
      data.avatarUrl = avatarUrl || null;
    }

    // Troca de senha exige a senha atual (apenas para contas com senha definida)
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }
      if (user.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Informe a senha atual para definir uma nova.' });
        }
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ error: 'Senha atual incorreta.' });
        }
      }
      data.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true, passwordHash: true },
    });

    const { passwordHash: _ph, ...safeUser } = updated;
    res.json({ user: { ...safeUser, hasPassword: !!updated.passwordHash } });
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
      select: { id: true, username: true, email: true, avatarUrl: true, createdAt: true, passwordHash: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { passwordHash, ...safeUser } = user;
    res.json({ user: { ...safeUser, hasPassword: !!passwordHash } });
  } catch (err) { next(err); }
}

module.exports = { register, login, googleAuth, logout, me, updateProfile };
