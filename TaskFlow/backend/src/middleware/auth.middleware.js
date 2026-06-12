'use strict';

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token =
    (authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null) || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido. Faça login.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = authMiddleware;
