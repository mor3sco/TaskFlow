'use strict';

const prisma = require('../config/prisma');

// ── Listar tarefas de uma data ────────────────────────────────

async function getByDate(req, res, next) {
  try {
    const { date } = req.params; // 'YYYY-MM-DD'
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD.' });
    }

    const tasks = await prisma.task.findMany({
      where:   { userId: req.userId, date },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ tasks });
  } catch (err) { next(err); }
}

// ── Listar todas as tarefas do usuário (para carry-over) ──────

async function getAll(req, res, next) {
  try {
    const tasks = await prisma.task.findMany({
      where:   { userId: req.userId },
      orderBy: { date: 'asc' },
    });
    res.json({ tasks });
  } catch (err) { next(err); }
}

// ── Criar tarefa ──────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const { text, status, priority, date, carriedFrom } = req.body;

    if (!text || !date) {
      return res.status(400).json({ error: 'text e date são obrigatórios.' });
    }

    const task = await prisma.task.create({
      data: {
        text,
        status:      status      || 'TODO',
        priority:    priority    || 'MEDIA',
        date,
        carriedFrom: carriedFrom || null,
        userId:      req.userId,
      },
    });
    res.status(201).json({ task });
  } catch (err) { next(err); }
}

// ── Atualizar tarefa (status, texto, prioridade) ──────────────

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { text, status, priority, carriedTo } = req.body;

    // Garante que a tarefa pertence ao usuário
    const existing = await prisma.task.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Tarefa não encontrada.' });
    }

    // Define completedAt automaticamente ao mudar o status
    let completedAt;
    if (status !== undefined) {
      if (status === 'DONE' && existing.status !== 'DONE') {
        completedAt = new Date();       // marcou como concluída agora
      } else if (status !== 'DONE' && existing.status === 'DONE') {
        completedAt = null;             // voltou a ficar pendente
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(text        !== undefined && { text }),
        ...(status      !== undefined && { status }),
        ...(priority     !== undefined && { priority }),
        ...(carriedTo    !== undefined && { carriedTo }),
        ...(completedAt  !== undefined && { completedAt }),
      },
    });
    res.json({ task });
  } catch (err) { next(err); }
}

// ── Listar tarefas em um intervalo de datas (dashboard/calendário) ──

async function getRange(req, res, next) {
  try {
    const { from, to, priority, status } = req.query;

    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Parâmetros from e to são obrigatórios (formato YYYY-MM-DD).' });
    }

    const where = {
      userId: req.userId,
      date:   { gte: from, lte: to },
    };
    if (priority && ['ALTA', 'MEDIA', 'BAIXA'].includes(priority)) {
      where.priority = priority;
    }
    if (status && ['TODO', 'DOING', 'DONE'].includes(status)) {
      where.status = status;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    res.json({ tasks });
  } catch (err) { next(err); }
}

// ── Deletar tarefa ────────────────────────────────────────────

async function remove(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.task.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Tarefa não encontrada.' });
    }

    await prisma.task.delete({ where: { id } });
    res.json({ message: 'Tarefa removida.' });
  } catch (err) { next(err); }
}

// ── Carry-over: trazer pendentes de dias anteriores ───────────

async function carryOver(req, res, next) {
  try {
    const { targetDate } = req.body;
    if (!targetDate) {
      return res.status(400).json({ error: 'targetDate é obrigatório.' });
    }

    // Busca tarefas pendentes de datas anteriores ainda não transportadas
    const pending = await prisma.task.findMany({
      where: {
        userId:    req.userId,
        date:      { lt: targetDate },
        status:    { not: 'DONE' },
        carriedTo: null,
      },
    });

    if (pending.length === 0) {
      return res.json({ carried: [], message: 'Nenhuma tarefa pendente.' });
    }

    // Marca as originais como transportadas e cria cópias no targetDate
    const carried = await prisma.$transaction(
      pending.flatMap(t => [
        prisma.task.update({
          where: { id: t.id },
          data:  { carriedTo: targetDate },
        }),
        prisma.task.create({
          data: {
            text:        t.text,
            status:      'TODO',
            priority:    t.priority,
            date:        targetDate,
            carriedFrom: t.date,
            userId:      req.userId,
          },
        }),
      ])
    );

    // Retorna apenas as novas tarefas criadas (os creates retornam task)
    const newTasks = carried.filter(r => r.text); // updates retornam o objeto também, filtra pelo campo
    res.json({ carried: newTasks, count: pending.length });
  } catch (err) { next(err); }
}

module.exports = { getByDate, getAll, getRange, create, update, remove, carryOver };
