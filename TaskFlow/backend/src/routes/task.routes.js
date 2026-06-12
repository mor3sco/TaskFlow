'use strict';

const router     = require('express').Router();
const auth       = require('../middleware/auth.middleware');
const controller = require('../controllers/task.controller');

router.use(auth);

router.get('/all',          controller.getAll);
router.get('/date/:date',   controller.getByDate);
router.post('/',            controller.create);
router.put('/:id',          controller.update);
router.delete('/:id',       controller.remove);
router.post('/carry-over',  controller.carryOver);

module.exports = router;
