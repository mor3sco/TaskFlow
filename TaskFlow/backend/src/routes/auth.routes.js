'use strict';

const router     = require('express').Router();
const auth       = require('../middleware/auth.middleware');
const controller = require('../controllers/auth.controller');

// POST /api/auth/register   — cadastro com email+senha
router.post('/register',   controller.register);

// POST /api/auth/login      — login com email+senha
router.post('/login',      controller.login);

// POST /api/auth/google     — login/cadastro via Google OAuth (recebe idToken)
router.post('/google',     controller.googleAuth);

// POST /api/auth/logout     — limpa o cookie
router.post('/logout',     controller.logout);

// GET  /api/auth/me         — dados do usuário logado (requer token)
router.get('/me',          auth, controller.me);

// PUT  /api/auth/profile    — atualizar nome, foto e/ou senha
router.put('/profile',     auth, controller.updateProfile);

module.exports = router;
