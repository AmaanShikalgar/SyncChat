import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import {
    initDb,
    addMessage,
    getMessages,
    addMembership,
    removeMembership,
    getRoomsForUser,
    getRoomName,
    createRoom,
    editMessage,
    deleteMessage,
    createUser,
    verifyUser,
    UsernameTakenError,
} from './db';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

if (!process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not set — using an insecure default. Set it in production.');
}

function signToken(username: string): string {
    return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token: string): { username: string } | null {
    try {
        return jwt.verify(token, JWT_SECRET) as { username: string };
    } catch {
        return null;
    }
}

// --- HTTP API (signup / signin) ---

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'username and password are required' });
    }
    if (username.trim().length < 3) {
        return res.status(400).json({ error: 'username must be at least 3 characters' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    try {
        const user = await createUser(username.trim(), password);
        const token = signToken(user.username);
        res.json({ token, username: user.username });
    } catch (err) {
        if (err instanceof UsernameTakenError) {
            return res.status(409).json({ error: err.message });
        }
        console.error('Signup error:', err);
        res.status(500).json({ error: 'signup failed' });
    }
});

app.post('/api/signin', async (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'username and password are required' });
    }

    try {
        const user = await verifyUser(username.trim(), password);
        if (!user) {
            return res.status(401).json({ error: 'invalid username or password' });
        }
        const token = signToken(user.username);
        res.json({ token, username: user.username });
    } catch (err) {
        console.error('Signin error:', err);
        res.status(500).json({ error: 'signin failed' });
    }
});

// --- WebSocket chat, sharing the same HTTP server/port ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

interface Member {
    socket: WebSocket;
    room: string;
    username: string;
}

let members: Member[] = [];
const socketUsernames = new Map<WebSocket, string>();

function broadcastToRoom(roomId: string, data: string, excludeSocket: WebSocket) {
    for (let i = 0; i < members.length; i++) {
        if (members[i].room === roomId && members[i].socket !== excludeSocket) {
            members[i].socket.send(data);
        }
    }
}

function broadcastPresence(roomId: string) {
    const online = Array.from(
        new Set(members.filter((m) => m.room === roomId).map((m) => m.username))
    );
    const data = JSON.stringify({
        type: "presence",
        payload: { roomId, onlineUsers: online },
    });
    for (let i = 0; i < members.length; i++) {
        if (members[i].room === roomId) {
            members[i].socket.send(data);
        }
    }
}

function findMember(socket: WebSocket, roomId: string): Member | undefined {
    return members.find((m) => m.socket === socket && m.room === roomId);
}

async function main() {
    await initDb();
    console.log("Database schema ready");

    wss.on("connection", function (socket, req) {
        // Authenticate the socket using the JWT passed as a query param,
        // e.g. wss://host?token=xxxx. The username is taken from the
        // verified token from here on — never trusted from message payloads.
        const url = new URL(req.url ?? '', 'http://localhost');
        const token = url.searchParams.get('token');
        const decoded = token ? verifyToken(token) : null;

        if (!decoded) {
            socket.close(4001, 'Unauthorized');
            return;
        }

        socketUsernames.set(socket, decoded.username);

        socket.on("message", async (raw) => {
            const username = socketUsernames.get(socket);
            if (!username) return; // shouldn't happen, but be defensive

            let parsedMessage: any;
            try {
                parsedMessage = JSON.parse(raw.toString());
            } catch {
                return; // ignore malformed messages instead of crashing the server
            }

            try {
                if (parsedMessage.type === "get-rooms") {
                    const rooms = await getRoomsForUser(username);
                    socket.send(JSON.stringify({
                        type: "rooms",
                        payload: { rooms },
                    }));
                    return;
                }

                if (parsedMessage.type === "create-room") {
                    const { roomId, name } = parsedMessage.payload;
                    const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : roomId;

                    const room = await createRoom(roomId, cleanName, username);
                    await addMembership(username, roomId);

                    const alreadyLive = members.some(
                        (m) => m.socket === socket && m.room === roomId
                    );
                    if (!alreadyLive) {
                        members.push({ socket, room: roomId, username });
                    }

                    socket.send(JSON.stringify({
                        type: "room-info",
                        payload: { roomId: room.roomId, name: room.name },
                    }));
                    socket.send(JSON.stringify({
                        type: "history",
                        payload: { roomId, messages: [] },
                    }));

                    broadcastPresence(roomId);
                    return;
                }

                if (parsedMessage.type === "join") {
                    const { roomId } = parsedMessage.payload;

                    await addMembership(username, roomId);

                    const alreadyLive = members.some(
                        (m) => m.socket === socket && m.room === roomId
                    );
                    if (!alreadyLive) {
                        members.push({ socket, room: roomId, username });
                    }

                    const [name, history] = await Promise.all([
                        getRoomName(roomId),
                        getMessages(roomId),
                    ]);

                    socket.send(JSON.stringify({
                        type: "room-info",
                        payload: { roomId, name: name ?? roomId },
                    }));
                    socket.send(JSON.stringify({
                        type: "history",
                        payload: { roomId, messages: history },
                    }));

                    broadcastPresence(roomId);
                    return;
                }

                if (parsedMessage.type === "leave") {
                    const { roomId } = parsedMessage.payload;
                    await removeMembership(username, roomId);
                    members = members.filter(
                        (m) => !(m.socket === socket && m.room === roomId)
                    );
                    broadcastPresence(roomId);
                    return;
                }

                if (parsedMessage.type === "typing") {
                    const { roomId, isTyping } = parsedMessage.payload;
                    const sender = findMember(socket, roomId);
                    if (!sender) return;

                    broadcastToRoom(roomId, JSON.stringify({
                        type: "typing",
                        payload: { roomId, username: sender.username, isTyping },
                    }), socket);
                    return;
                }

                if (parsedMessage.type === "chat") {
                    const { roomId, message, replyTo } = parsedMessage.payload;

                    const sender = findMember(socket, roomId);
                    if (!sender) return; // must join a room before chatting in it

                    const cleanReplyTo = replyTo && typeof replyTo.id === 'string' && typeof replyTo.sender === 'string' && typeof replyTo.text === 'string'
                        ? { id: replyTo.id, sender: replyTo.sender, text: replyTo.text }
                        : undefined;

                    const stored = await addMessage(roomId, sender.username, message, cleanReplyTo);

                    const outgoing = JSON.stringify({
                        type: "chat",
                        payload: {
                            id: stored.id,
                            roomId,
                            message: stored.message,
                            username: stored.username,
                            timestamp: stored.timestamp,
                            replyTo: stored.replyTo,
                        },
                    });

                    broadcastToRoom(roomId, outgoing, socket);
                    return;
                }

                if (parsedMessage.type === "edit") {
                    const { roomId, messageId, newText } = parsedMessage.payload;
                    const sender = findMember(socket, roomId);
                    if (!sender) return;

                    const updated = await editMessage(roomId, messageId, sender.username, newText);
                    if (!updated) return;

                    broadcastToRoom(roomId, JSON.stringify({
                        type: "edit",
                        payload: { roomId, messageId, newText: updated.message, editedAt: updated.editedAt },
                    }), socket);
                    return;
                }

                if (parsedMessage.type === "delete") {
                    const { roomId, messageId } = parsedMessage.payload;
                    const sender = findMember(socket, roomId);
                    if (!sender) return;

                    const ok = await deleteMessage(roomId, messageId, sender.username);
                    if (!ok) return;

                    broadcastToRoom(roomId, JSON.stringify({
                        type: "delete",
                        payload: { roomId, messageId },
                    }), socket);
                    return;
                }
            } catch (err) {
                console.error("Error handling message:", err);
            }
        });

        socket.on("close", () => {
            const affectedRooms = Array.from(
                new Set(members.filter((m) => m.socket === socket).map((m) => m.room))
            );
            members = members.filter((m) => m.socket !== socket);
            socketUsernames.delete(socket);
            affectedRooms.forEach(broadcastPresence);
        });
    });

    server.listen(PORT, () => {
        console.log(`HTTP + WebSocket server listening on port ${PORT}`);
    });
}

main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
