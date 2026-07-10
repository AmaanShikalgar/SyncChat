import { WebSocket, WebSocketServer } from 'ws';
import { addMessage, getMessages, addMembership, getRoomIdsForUser } from './db';

const wss = new WebSocketServer({ port: 8080 });

interface Member {
    socket: WebSocket;
    room: string;
    username: string;
}

// Live, in-memory list of who is connected to which room right now — used
// only for real-time broadcast. Actual message history and room membership
// live in db.ts and survive server restarts.
let members: Member[] = [];

function broadcastToRoom(roomId: string, data: string, excludeSocket: WebSocket) {
    for (let i = 0; i < members.length; i++) {
        if (members[i].room === roomId && members[i].socket !== excludeSocket) {
            members[i].socket.send(data);
        }
    }
}

wss.on("connection", function (socket) {

    socket.on("message", (raw) => {
        let parsedMessage: any;
        try {
            parsedMessage = JSON.parse(raw.toString());
        } catch {
            return; // ignore malformed messages instead of crashing the server
        }

        if (parsedMessage.type === "get-rooms") {
            const { username } = parsedMessage.payload;
            const roomIds = getRoomIdsForUser(username);
            socket.send(JSON.stringify({
                type: "rooms",
                payload: { roomIds },
            }));
            return;
        }

        if (parsedMessage.type === "join") {
            const { roomId, username } = parsedMessage.payload;

            addMembership(username, roomId);

            const alreadyLive = members.some(
                (m) => m.socket === socket && m.room === roomId
            );
            if (!alreadyLive) {
                members.push({ socket, room: roomId, username });
            }

            // Send this socket the full stored history for the room it just joined.
            const history = getMessages(roomId);
            socket.send(JSON.stringify({
                type: "history",
                payload: { roomId, messages: history },
            }));
            return;
        }

        if (parsedMessage.type === "chat") {
            const { roomId, message } = parsedMessage.payload;

            const sender = members.find(
                (m) => m.socket === socket && m.room === roomId
            );
            if (!sender) return; // must join a room before chatting in it

            const stored = addMessage(roomId, sender.username, message);

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
        }
    });

    socket.on("close", () => {
        members = members.filter((m) => m.socket !== socket);
    });
});
