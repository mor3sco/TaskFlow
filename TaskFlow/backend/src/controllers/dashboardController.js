const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

exports.getStats = async (req, res) => {
  try {
    const userId = req.userId; // vem do auth.middleware.js

    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const today = now.toISOString().slice(0, 10);
    const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);

    const [
      total, doing, done,
      totalThisMonth, totalLastMonth,
      doingThisMonth, doingLastMonth,
      doneThisMonth, doneLastMonth,
      prazoProximo,
      priorities
    ] = await Promise.all([
      prisma.task.count({ where: { userId } }),
      prisma.task.count({ where: { userId, status: 'DOING' } }),
      prisma.task.count({ where: { userId, status: 'DONE' } }),
      prisma.task.count({ where: { userId, createdAt: { gte: startThisMonth } } }),
      prisma.task.count({ where: { userId, createdAt: { gte: startLastMonth, lt: startThisMonth } } }),
      prisma.task.count({ where: { userId, status: 'DOING', createdAt: { gte: startThisMonth } } }),
      prisma.task.count({ where: { userId, status: 'DOING', createdAt: { gte: startLastMonth, lt: startThisMonth } } }),
      prisma.task.count({ where: { userId, status: 'DONE', createdAt: { gte: startThisMonth } } }),
      prisma.task.count({ where: { userId, status: 'DONE', createdAt: { gte: startLastMonth, lt: startThisMonth } } }),
      prisma.task.count({ where: { userId, status: { not: 'DONE' }, date: { gte: today, lte: in3Days } } }),
      prisma.task.groupBy({ by: ['priority', 'status'], where: { userId }, _count: true })
    ]);

    // monta progresso por prioridade (% concluído dentro de cada prioridade)
    const byPriority = { ALTA: { total: 0, done: 0 }, MEDIA: { total: 0, done: 0 }, BAIXA: { total: 0, done: 0 } };
    for (const row of priorities) {
      byPriority[row.priority].total += row._count;
      if (row.status === 'DONE') byPriority[row.priority].done += row._count;
    }
    const progressByPriority = Object.entries(byPriority).map(([priority, v]) => ({
      priority,
      percent: v.total === 0 ? 0 : Math.round((v.done / v.total) * 100)
    }));

    res.json({
      totalTarefas: { value: total, change: pctChange(totalThisMonth, totalLastMonth) },
      emAndamento: { value: doing, change: pctChange(doingThisMonth, doingLastMonth) },
      concluidas: { value: done, change: pctChange(doneThisMonth, doneLastMonth) },
      prazoProximo: { value: prazoProximo },
      progressByPriority
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    res.status(500).json({ error: 'Erro ao carregar estatísticas do dashboard' });
  }
};