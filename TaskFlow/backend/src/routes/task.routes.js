'use strict';

const router     = require('express').Router();
const auth       = require('../middleware/auth.middleware');
const controller = require('../controllers/task.controller');

// Todas as rotas de tarefa exigem autenticação
router.use(auth);

// GET  /api/tasks/all              — todas as tarefas do usuário
router.get('/all',                  controller.getAll);

// GET  /api/tasks/date/:date       — tarefas de uma data (YYYY-MM-DD)
router.get('/date/:date',           controller.getByDate);

// GET  /api/tasks/range?from=&to=&priority=&status=  — tarefas em um intervalo (dashboard/calendário)
router.get('/range',                controller.getRange);

// POST /api/tasks                  — criar tarefa
router.post('/',                    controller.create);

// PUT  /api/tasks/:id              — atualizar tarefa
router.put('/:id',                  controller.update);

// DELETE /api/tasks/:id            — deletar tarefa
router.delete('/:id',               controller.remove);

// POST /api/tasks/carry-over       — transportar pendentes para uma data
router.post('/carry-over',          controller.carryOver);

module.exports = router;
