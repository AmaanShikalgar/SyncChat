import { useEffect, useRef, useState } from 'react';
import './App.css'
import Login from './Login';
import RoomList from './RoomList';
import ChatWindow from './ChatWindow';
import type { ChatMessage, RoomData } from './types';

const USERNAME_KEY = "ws-chat-username";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function App() {
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem(USERNAME_KEY)
  );
  const [rooms, setRooms] = useState<Record<string, RoomData>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  // A ref mirror of activeRoomId so the onmessage handler (set up once per
  // connection) always reads the CURRENT active room instead of a stale
  // value captured when the effect first ran.
  const activeRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    if (!username) return;

    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => {
      // Ask the server which rooms this username has previously joined,
      // so the chat list survives a refresh or a restart.
      ws.send(JSON.stringify({ type: "get-rooms", payload: { username } }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "rooms") {
        const { roomIds } = data.payload as { roomIds: string[] };
        roomIds.forEach((roomId: string) => joinRoom(roomId));
        return;
      }

      if (data.type === "history") {
        const { roomId, messages } = data.payload as {
          roomId: string;
          messages: { id: string; username: string; message: string; timestamp: number }[];
        };
        setRooms(prev => {
          const existing = prev[roomId] ?? { id: roomId, messages: [], unread: 0 };
          const loaded: ChatMessage[] = messages.map(m => ({
            id: m.id,
            text: m.message,
            sender: m.username,
            self: m.username === username,
            timestamp: m.timestamp,
          }));
          return {
            ...prev,
            [roomId]: { ...existing, messages: loaded },
          };
        });
        return;
      }

      if (data.type === "chat") {
        const { roomId, message, username: sender, timestamp, id } = data.payload;

        const newMsg: ChatMessage = {
          id,
          text: message,
          sender,
          self: false,
          timestamp,
        };

        setRooms(prev => {
          const existing = prev[roomId] ?? { id: roomId, messages: [], unread: 0 };
          const isActive = activeRoomIdRef.current === roomId;
          return {
            ...prev,
            [roomId]: {
              ...existing,
              messages: [...existing.messages, newMsg],
              unread: isActive ? 0 : existing.unread + 1,
            },
          };
        });
      }
    };

    return () => {
      ws.close();
    };
  }, [username]);

  function joinRoom(roomId: string) {
    wsRef.current?.send(JSON.stringify({
      type: "join",
      payload: { roomId, username },
    }));
    setRooms(prev => (prev[roomId] ? prev : { ...prev, [roomId]: { id: roomId, messages: [], unread: 0 } }));
  }

  function handleLogin(name: string) {
    localStorage.setItem(USERNAME_KEY, name);
    setUsername(name);
  }

  function handleLogout() {
    localStorage.removeItem(USERNAME_KEY);
    wsRef.current?.close();
    setUsername(null);
    setRooms({});
    setActiveRoomId(null);
  }

  function handleCreateRoom() {
    const code = makeRoomCode();
    joinRoom(code);
    setActiveRoomId(code);
  }

  function handleJoinRoom(roomId: string) {
    joinRoom(roomId);
    setActiveRoomId(roomId);
  }

  function handleSelectRoom(roomId: string) {
    setActiveRoomId(roomId);
    setRooms(prev => (prev[roomId] ? { ...prev, [roomId]: { ...prev[roomId], unread: 0 } } : prev));
  }

  function handleSend(text: string) {
    if (!activeRoomId) return;

    wsRef.current?.send(JSON.stringify({
      type: "chat",
      payload: { roomId: activeRoomId, message: text },
    }));

    const newMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      sender: username ?? "you",
      self: true,
      timestamp: Date.now(),
    };

    setRooms(prev => {
      const existing = prev[activeRoomId] ?? { id: activeRoomId, messages: [], unread: 0 };
      return {
        ...prev,
        [activeRoomId]: { ...existing, messages: [...existing.messages, newMsg] },
      };
    });
  }

  if (!username) {
    return <Login onLogin={handleLogin} />;
  }

  const activeRoom = activeRoomId ? rooms[activeRoomId] : undefined;

  if (activeRoom) {
    return (
      <ChatWindow
        room={activeRoom}
        onBack={() => setActiveRoomId(null)}
        onSend={handleSend}
      />
    );
  }

  return (
    <RoomList
      username={username}
      rooms={Object.values(rooms)}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onSelectRoom={handleSelectRoom}
      onLogout={handleLogout}
    />
  );
}

export default App
