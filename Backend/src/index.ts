import { WebSocket, WebSocketServer } from 'ws';
import {
    initDb,
    addMessage,
    getMessages,
    addMembership,
    removeMembership,
    getRoomIdsForUser,
    editMessage,
    deleteMessage,
} from './db';

// Render (and most hosts) assign the port dynamically via PORT.
// Falls back to 8080 for local development.
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

interface Member {
    socket: WebSocket;
    room: string;
    username: string;
}

// Live, in-memory list of who is connected to which room right now — used
// for real-time broadcast and presence. Message history and room
// membership live in Postgres (db.ts) and survive server restarts.
let members: Member[] = [];

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

    const wss = new WebSocketServer({ port: PORT });
    console.log(`WebSocket server listening on port ${PORT}`);

    wss.on("connection", function (socket) {

        socket.on("message", async (raw) => {
            let parsedMessage: any;
            try {
                parsedMessage = JSON.parse(raw.toString());
            } catch {
                return; // ignore malformed messages instead of crashing the server
            }

            try {
                if (parsedMessage.type === "get-rooms") {
                    const { username } = parsedMessage.payload;
                    const roomIds = await getRoomIdsForUser(username);
                    socket.send(JSON.stringify({
                        type: "rooms",
                        payload: { roomIds },
                    }));
                    return;
                }

                if (parsedMessage.type === "join") {
                    const { roomId, username } = parsedMessage.payload;

                    await addMembership(username, roomId);

                    const alreadyLive = members.some(
                        (m) => m.socket === socket && m.room === roomId
                    );
                    if (!alreadyLive) {
                        members.push({ socket, room: roomId, username });
                    }

                    const history = await getMessages(roomId);
                    socket.send(JSON.stringify({
                        type: "history",
                        payload: { roomId, messages: history },
                    }));

                    broadcastPresence(roomId);
                    return;
                }

                if (parsedMessage.type === "leave") {
                    const { roomId, username } = parsedMessage.payload;
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
                    const { roomId, message } = parsedMessage.payload;

                    const sender = findMember(socket, roomId);
                    if (!sender) return; // must join a room before chatting in it

                    const stored = await addMessage(roomId, sender.username, message);

                    const outgoing = JSON.stringify({
                        type: "chat",
                        payload: {
                            id: stored.id,
                            roomId,
                            message: stored.message,
                            username: stored.username,
                            timestamp: stored.timestamp,
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
            affectedRooms.forEach(broadcastPresence);
        });
    });
}

main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
