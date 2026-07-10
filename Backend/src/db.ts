import fs from 'fs';
import path from 'path';

export interface StoredMessage {
    id: string;
    roomId: string;
    username: string;
    message: string;
    timestamp: number;
}

interface Membership {
    username: string;
    roomId: string;
    joinedAt: number;
}

interface DBShape {
    messages: StoredMessage[];
    memberships: Membership[];
}

// Kept intentionally simple (a single JSON file) so the project has zero
// native dependencies to install/build. The read/write logic below is the
// only place that touches the file, so swapping this for a real database
// later just means rewriting this module, not the rest of the app.
const DB_PATH = path.join(__dirname, '..', 'data', 'chat-db.json');

function load(): DBShape {
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(raw) as DBShape;
    } catch {
        return { messages: [], memberships: [] };
    }
}

let db: DBShape = load();

function persist() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function addMessage(roomId: string, username: string, message: string): StoredMessage {
    const msg: StoredMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        roomId,
        username,
        message,
        timestamp: Date.now(),
    };
    db.messages.push(msg);
    persist();
    return msg;
}

export function getMessages(roomId: string): StoredMessage[] {
    return db.messages.filter((m) => m.roomId === roomId);
}

export function addMembership(username: string, roomId: string): void {
    const exists = db.memberships.some(
        (m) => m.username === username && m.roomId === roomId
    );
    if (!exists) {
        db.memberships.push({ username, roomId, joinedAt: Date.now() });
        persist();
    }
}

export function getRoomIdsForUser(username: string): string[] {
    return db.memberships
        .filter((m) => m.username === username)
        .map((m) => m.roomId);
}
