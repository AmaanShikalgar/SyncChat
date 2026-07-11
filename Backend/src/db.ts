import { Pool } from 'pg';

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

export interface StoredMessage {
    id: string;
    roomId: string;
    username: string;
    message: string;
    timestamp: number;
    editedAt?: number;
    deleted?: boolean;
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
    };
}

export async function addMessage(roomId: string, username: string, message: string): Promise<StoredMessage> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timestamp = Date.now();
    const result = await pool.query(
        `INSERT INTO messages (id, room_id, username, message, timestamp)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, roomId, username, message, timestamp]
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

export async function getRoomIdsForUser(username: string): Promise<string[]> {
    const result = await pool.query(
        `SELECT room_id FROM memberships WHERE username = $1`,
        [username]
    );
    return result.rows.map((r) => r.room_id);
}
