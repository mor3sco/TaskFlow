const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth'); // ajuste pro nome real do seu arquivo

router.get('/stats', authMiddleware, getStats);

module.exports = router;