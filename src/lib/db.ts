import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// ── Schema init (idempotent) ──────────────────────────────────────────────
let initialized = false;

export async function initDB() {
  if (initialized) return;

  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'chat',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at)`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)`,
      args: [],
    },
    // ── Auth tables ──
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        image TEXT,
        created_at INTEGER NOT NULL DEFAULT 0
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'oauth',
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id)`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      args: [],
    },
  ]);

  initialized = true;
}

// ── 30-day cleanup ────────────────────────────────────────────────────────
export async function cleanupOldConversations() {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Delete messages belonging to old conversations first, then conversations
  await db.batch([
    {
      sql: `DELETE FROM messages WHERE conversation_id IN (
        SELECT id FROM conversations WHERE updated_at < ?
      )`,
      args: [thirtyDaysAgo],
    },
    {
      sql: `DELETE FROM conversations WHERE updated_at < ?`,
      args: [thirtyDaysAgo],
    },
  ]);
}

// ── Conversations CRUD ────────────────────────────────────────────────────

export async function listConversations(userId: string) {
  await initDB();

  const result = await db.execute({
    sql: `SELECT id, title, mode, created_at, updated_at FROM conversations
          WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    args: [userId],
  });

  return result.rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    mode: r.mode as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }));
}

export async function createConversation(
  id: string,
  userId: string,
  title: string,
  mode: string
) {
  await initDB();
  const now = Date.now();

  await db.execute({
    sql: `INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, userId, title, mode, now, now],
  });

  return { id, title, mode, createdAt: now, updatedAt: now };
}

export async function updateConversationTitle(id: string, title: string) {
  await db.execute({
    sql: `UPDATE conversations SET title = ? WHERE id = ?`,
    args: [title, id],
  });
}

export async function touchConversation(id: string) {
  await db.execute({
    sql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
    args: [Date.now(), id],
  });
}

export async function deleteConversation(id: string) {
  await db.batch([
    { sql: `DELETE FROM messages WHERE conversation_id = ?`, args: [id] },
    { sql: `DELETE FROM conversations WHERE id = ?`, args: [id] },
  ]);
}

// ── Messages CRUD ─────────────────────────────────────────────────────────

export async function getMessages(conversationId: string) {
  await initDB();

  const result = await db.execute({
    sql: `SELECT id, role, content, sources, created_at FROM messages
          WHERE conversation_id = ? ORDER BY created_at ASC`,
    args: [conversationId],
  });

  return result.rows.map((r) => ({
    id: r.id as string,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    sources: r.sources ? JSON.parse(r.sources as string) : undefined,
    timestamp: r.created_at as number,
  }));
}

export async function addMessage(
  conversationId: string,
  message: {
    id: string;
    role: string;
    content: string;
    sources?: { title: string; url: string }[];
  }
) {
  await initDB();
  const now = Date.now();

  await db.batch([
    {
      sql: `INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        message.id,
        conversationId,
        message.role,
        message.content,
        message.sources ? JSON.stringify(message.sources) : null,
        now,
      ],
    },
    {
      sql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
      args: [now, conversationId],
    },
  ]);
}

export async function updateMessage(
  messageId: string,
  content: string,
  sources?: { title: string; url: string }[]
) {
  await db.execute({
    sql: `UPDATE messages SET content = ?, sources = ? WHERE id = ?`,
    args: [content, sources ? JSON.stringify(sources) : null, messageId],
  });
}

// ── Users CRUD (for NextAuth) ─────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  await initDB();
  const result = await db.execute({
    sql: `SELECT id, name, email, password, image FROM users WHERE email = ?`,
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id as string,
    name: r.name as string | null,
    email: r.email as string,
    password: r.password as string | null,
    image: r.image as string | null,
  };
}

export async function getUserById(id: string) {
  await initDB();
  const result = await db.execute({
    sql: `SELECT id, name, email, image FROM users WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id as string,
    name: r.name as string | null,
    email: r.email as string,
    image: r.image as string | null,
  };
}

export async function createUser(user: {
  id: string;
  name: string;
  email: string;
  password?: string;
  image?: string;
}) {
  await initDB();
  await db.execute({
    sql: `INSERT INTO users (id, name, email, password, image, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [user.id, user.name, user.email, user.password || null, user.image || null, Date.now()],
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password || null,
    image: user.image || null,
  };
}

export async function linkAccount(account: {
  userId: string;
  provider: string;
  providerAccountId: string;
  type: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}) {
  await initDB();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO accounts (id, user_id, provider, provider_account_id, type, access_token, refresh_token, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      account.userId,
      account.provider,
      account.providerAccountId,
      account.type,
      account.accessToken || null,
      account.refreshToken || null,
      account.expiresAt || null,
    ],
  });
}

export async function getAccountByProvider(provider: string, providerAccountId: string) {
  await initDB();
  const result = await db.execute({
    sql: `SELECT user_id FROM accounts WHERE provider = ? AND provider_account_id = ?`,
    args: [provider, providerAccountId],
  });
  if (result.rows.length === 0) return null;
  return { userId: result.rows[0].user_id as string };
}

export default db;
