import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Message = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "chat.db");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

type MessageRow = {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  created_at: string;
};

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
  };
}

export function getOrCreateConversation(id?: number): number {
  const database = getDb();

  if (id !== undefined) {
    // Garante que a conversa existe: insere ignorando conflito e retorna o id pedido.
    database.prepare("INSERT OR IGNORE INTO conversations (id) VALUES (?)").run(id);
    return id;
  }

  const result = database.prepare("INSERT INTO conversations DEFAULT VALUES").run();
  return Number(result.lastInsertRowid);
}

export function listMessages(conversationId: number): Message[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY id ASC`
    )
    .all(conversationId) as MessageRow[];

  return rows.map(toMessage);
}

export function addMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string
): Message {
  const database = getDb();

  const result = database
    .prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)")
    .run(conversationId, role, content);

  const row = database
    .prepare("SELECT id, conversation_id, role, content, created_at FROM messages WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as MessageRow | undefined;

  if (!row) {
    throw new Error(
      `Falha ao recuperar a mensagem recém-criada (id=${result.lastInsertRowid})`
    );
  }

  return toMessage(row);
}
