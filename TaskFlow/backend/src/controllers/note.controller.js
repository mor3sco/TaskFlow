const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Retorna todas as notas que o usuário pode ver: as suas + as compartilhadas com ele
exports.list = async (req, res) => {
  try {
    const userId = req.userId;

    const notes = await prisma.note.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { shares: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, username: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = notes.map(n => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      isOwner: n.ownerId === userId,
      owner: n.owner,
    }));

    res.json({ notes: result });
  } catch (err) {
    console.error('Erro ao listar notas:', err);
    res.status(500).json({ error: 'Erro ao carregar notas' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const note = await prisma.note.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, username: true, email: true } },
        shares: { include: { user: { select: { id: true, username: true, email: true } } } },
      },
    });

    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });

    const isOwner  = note.ownerId === userId;
    const isShared = note.shares.some(s => s.userId === userId);
    if (!isOwner && !isShared) return res.status(403).json({ error: 'Sem acesso a esta nota' });

    res.json({
      note: {
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        isOwner,
        owner: note.owner,
        sharedWith: isOwner ? note.shares.map(s => s.user) : undefined,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar nota:', err);
    res.status(500).json({ error: 'Erro ao carregar nota' });
  }
};

exports.create = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, content } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ error: 'Título é obrigatório' });

    const note = await prisma.note.create({
      data: { title: title.trim(), content: content || '', ownerId: userId },
    });

    res.status(201).json({ note });
  } catch (err) {
    console.error('Erro ao criar nota:', err);
    res.status(500).json({ error: 'Erro ao criar nota' });
  }
};

exports.update = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { title, content } = req.body;

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });
    if (note.ownerId !== userId) return res.status(403).json({ error: 'Só o dono pode editar esta nota' });

    const updated = await prisma.note.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(content !== undefined ? { content } : {}),
      },
    });

    res.json({ note: updated });
  } catch (err) {
    console.error('Erro ao atualizar nota:', err);
    res.status(500).json({ error: 'Erro ao atualizar nota' });
  }
};

exports.remove = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });
    if (note.ownerId !== userId) return res.status(403).json({ error: 'Só o dono pode excluir esta nota' });

    await prisma.note.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir nota:', err);
    res.status(500).json({ error: 'Erro ao excluir nota' });
  }
};

// Convida alguém pra ver a nota (por e-mail)
exports.share = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { email } = req.body;

    if (!email || !email.trim()) return res.status(400).json({ error: 'Informe o e-mail da pessoa' });

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });
    if (note.ownerId !== userId) return res.status(403).json({ error: 'Só o dono pode compartilhar esta nota' });

    const targetUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!targetUser) return res.status(404).json({ error: 'Nenhum usuário encontrado com esse e-mail' });
    if (targetUser.id === userId) return res.status(400).json({ error: 'Você já é o dono desta nota' });

    const share = await prisma.noteShare.upsert({
      where: { noteId_userId: { noteId: id, userId: targetUser.id } },
      update: {},
      create: { noteId: id, userId: targetUser.id },
      include: { user: { select: { id: true, username: true, email: true } } },
    });

    res.status(201).json({ share });
  } catch (err) {
    console.error('Erro ao compartilhar nota:', err);
    res.status(500).json({ error: 'Erro ao compartilhar nota' });
  }
};

// Remove o acesso de alguém
exports.unshare = async (req, res) => {
  try {
    const userId = req.userId;
    const { id, targetUserId } = req.params;

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });
    if (note.ownerId !== userId) return res.status(403).json({ error: 'Só o dono pode gerenciar o acesso' });

    await prisma.noteShare.deleteMany({ where: { noteId: id, userId: targetUserId } });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover acesso:', err);
    res.status(500).json({ error: 'Erro ao remover acesso' });
  }
};
