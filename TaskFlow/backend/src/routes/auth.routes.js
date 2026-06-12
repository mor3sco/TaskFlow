'use strict';

const router     = require('express').Router();
const auth       = require('../middleware/auth.middleware');
const controller = require('../controllers/auth.controller');

router.post('/register',   controller.register);
router.post('/login',      controller.login);
router.post('/google',     controller.googleAuth);
router.post('/logout',     controller.logout);
router.get('/me',          auth, controller.me);

module.exports = router;
