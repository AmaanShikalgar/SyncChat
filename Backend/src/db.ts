import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "Set it to your Postgres connection string (e.g. from Neon)."
    );
}

// Neon (and most managed Postgres hosts) require SSL. Local Postgres during
// development typically doesn't, so we only turn it on when the connection
// string signals it's needed.
const needsSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech');

const pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export async function initDb(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at BIGINT NOT NULL
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS rooms (
            room_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at BIGINT NOT NULL
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp BIGINT NOT NULL,
            edited_at BIGINT,
            deleted BOOLEAN NOT NULL DEFAULT FALSE
        );
    `);
    // ADD COLUMN IF NOT EXISTS so this is safe to run against a database that
    // already has the older messages table (e.g. an existing deployment).
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender TEXT;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_text TEXT;`);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS memberships (
            username TEXT NOT NULL,
            room_id TEXT NOT NULL,
            joined_at BIGINT NOT NULL,
            PRIMARY KEY (username, room_id)
        );
    `);
}

export interface ReplyTo {
    id: string;
    sender: string;
    text: string;
}

export interface StoredMessage {
    id: string;
    roomId: string;
    username: string;
    message: string;
    timestamp: number;
    editedAt?: number;
    deleted?: boolean;
    replyTo?: ReplyTo;
}

function rowToMessage(row: any): StoredMessage {
    return {
        id: row.id,
        roomId: row.room_id,
        username: row.username,
        message: row.message,
        timestamp: Number(row.timestamp),
        ...(row.edited_at != null ? { editedAt: Number(row.edited_at) } : {}),
        deleted: row.deleted,
        ...(row.reply_to_id != null
            ? { replyTo: { id: row.reply_to_id, sender: row.reply_to_sender, text: row.reply_to_text } }
            : {}),
    };
}

export async function addMessage(
    roomId: string,
    username: string,
    message: string,
    replyTo?: ReplyTo
): Promise<StoredMessage> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timestamp = Date.now();
    const result = await pool.query(
        `INSERT INTO messages (id, room_id, username, message, timestamp, reply_to_id, reply_to_sender, reply_to_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
            id, roomId, username, message, timestamp,
            replyTo?.id ?? null, replyTo?.sender ?? null, replyTo?.text ?? null,
        ]
    );
    return rowToMessage(result.rows[0]);
}

export async function getMessages(roomId: string): Promise<StoredMessage[]> {
    const result = await pool.query(
        `SELECT * FROM messages WHERE room_id = $1 ORDER BY timestamp ASC`,
        [roomId]
    );
    return result.rows.map(rowToMessage);
}

export async function editMessage(
    roomId: string,
    messageId: string,
    username: string,
    newText: string
): Promise<StoredMessage | null> {
    const result = await pool.query(
        `UPDATE messages SET message = $1, edited_at = $2
         WHERE id = $3 AND room_id = $4 AND username = $5 AND deleted = FALSE
         RETURNING *`,
        [newText, Date.now(), messageId, roomId, username]
    );
    if (result.rowCount === 0) return null;
    return rowToMessage(result.rows[0]);
}

export async function deleteMessage(roomId: string, messageId: string, username: string): Promise<boolean> {
    const result = await pool.query(
        `UPDATE messages SET deleted = TRUE, message = ''
         WHERE id = $1 AND room_id = $2 AND username = $3
         RETURNING id`,
        [messageId, roomId, username]
    );
    return (result.rowCount ?? 0) > 0;
}

export async function addMembership(username: string, roomId: string): Promise<void> {
    await pool.query(
        `INSERT INTO memberships (username, room_id, joined_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (username, room_id) DO NOTHING`,
        [username, roomId, Date.now()]
    );
}

export async function removeMembership(username: string, roomId: string): Promise<void> {
    await pool.query(
        `DELETE FROM memberships WHERE username = $1 AND room_id = $2`,
        [username, roomId]
    );
}

export interface RoomSummary {
    roomId: string;
    name: string;
}

export async function getRoomsForUser(username: string): Promise<RoomSummary[]> {
    const result = await pool.query(
        `SELECT m.room_id, COALESCE(r.name, m.room_id) AS name
         FROM memberships m
         LEFT JOIN rooms r ON r.room_id = m.room_id
         WHERE m.username = $1`,
        [username]
    );
    return result.rows.map((row) => ({ roomId: row.room_id, name: row.name }));
}

export async function createRoom(roomId: string, name: string, createdBy: string): Promise<RoomSummary> {
    const result = await pool.query(
        `INSERT INTO rooms (room_id, name, created_by, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_id) DO NOTHING
         RETURNING room_id, name`,
        [roomId, name, createdBy, Date.now()]
    );
    if (result.rowCount && result.rowCount > 0) {
        return { roomId: result.rows[0].room_id, name: result.rows[0].name };
    }
    // Room already existed (e.g. a rare code collision) — just return its real name.
    const existing = await getRoomName(roomId);
    return { roomId, name: existing ?? roomId };
}

export async function getRoomName(roomId: string): Promise<string | null> {
    const result = await pool.query(`SELECT name FROM rooms WHERE room_id = $1`, [roomId]);
    if (result.rowCount === 0) return null;
    return result.rows[0].name;
}

// --- Auth ---

export interface User {
    id: number;
    username: string;
}

export class UsernameTakenError extends Error {}

export async function createUser(username: string, password: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, created_at)
             VALUES ($1, $2, $3) RETURNING id, username`,
            [username, passwordHash, Date.now()]
        );
        return result.rows[0];
    } catch (err: any) {
        if (err.code === '23505') throw new UsernameTakenError(`Username "${username}" is already taken`);
        throw err;
    }
}

export async function verifyUser(username: string, password: string): Promise<User | null> {
    const result = await pool.query(
        `SELECT id, username, password_hash FROM users WHERE username = $1`,
        [username]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return null;
    return { id: row.id, username: row.username };
}
