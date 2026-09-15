const express = require('express');
const router = express.Router();
const controller = require('../controllers/note.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/share', controller.share);
router.delete('/:id/share/:targetUserId', controller.unshare);

module.exports = router;
