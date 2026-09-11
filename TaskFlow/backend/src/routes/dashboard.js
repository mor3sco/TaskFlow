const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/stats', authMiddleware, getStats);

module.exports = router;