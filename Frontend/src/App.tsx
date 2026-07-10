import { useEffect, useRef, useState } from 'react';
import './App.css'
import Login from './Login';
import RoomList from './RoomList';
import ChatWindow from './ChatWindow';
import type { ChatMessage, RoomData, ConnectionStatus } from './types';

const USERNAME_KEY = "ws-chat-username";
const RECONNECT_DELAY_MS = 2000;
const TYPING_TIMEOUT_MS = 3000;

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function emptyRoom(id: string): RoomData {
  return { id, messages: [], unread: 0, onlineUsers: [], typingUsers: [] };
}

function App() {
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem(USERNAME_KEY)
  );
  const [rooms, setRooms] = useState<Record<string, RoomData>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const usernameRef = useRef<string | null>(username);
  const activeRoomIdRef = useRef<string | null>(null);
  const shouldReconnectRef = useRef(true);
  const typingTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  function joinRoom(roomId: string) {
    wsRef.current?.send(JSON.stringify({
      type: "join",
      payload: { roomId, username: usernameRef.current },
    }));
    setRooms(prev => (prev[roomId] ? prev : { ...prev, [roomId]: emptyRoom(roomId) }));
  }

  function notifyIfNeeded(roomId: string, sender: string, text: string) {
    if (roomId === activeRoomIdRef.current) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(`${sender} (${roomId})`, { body: text });
  }

  useEffect(() => {
    if (!username) return;
    shouldReconnectRef.current = true;

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    function connect() {
      setConnectionStatus(prev => (prev === "connected" ? prev : "connecting"));
      const ws = new WebSocket("ws://localhost:8080");
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        ws.send(JSON.stringify({ type: "get-rooms", payload: { username: usernameRef.current } }));
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        if (shouldReconnectRef.current) {
          setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => {
        ws.close();
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
            messages: { id: string; username: string; message: string; timestamp: number; editedAt?: number; deleted?: boolean }[];
          };
          setRooms(prev => {
            const existing = prev[roomId] ?? emptyRoom(roomId);
            const loaded: ChatMessage[] = messages.map(m => ({
              id: m.id,
              text: m.message,
              sender: m.username,
              self: m.username === usernameRef.current,
              timestamp: m.timestamp,
              editedAt: m.editedAt,
              deleted: m.deleted,
            }));
            return { ...prev, [roomId]: { ...existing, messages: loaded } };
          });
          return;
        }

        if (data.type === "presence") {
          const { roomId, onlineUsers } = data.payload as { roomId: string; onlineUsers: string[] };
          setRooms(prev => {
            const existing = prev[roomId];
            if (!existing) return prev;
            return { ...prev, [roomId]: { ...existing, onlineUsers } };
          });
          return;
        }

        if (data.type === "typing") {
          const { roomId, username: typer, isTyping } = data.payload as {
            roomId: string; username: string; isTyping: boolean;
          };
          setRooms(prev => {
            const existing = prev[roomId];
            if (!existing) return prev;
            const set = new Set(existing.typingUsers);
            if (isTyping) set.add(typer); else set.delete(typer);
            return { ...prev, [roomId]: { ...existing, typingUsers: Array.from(set) } };
          });

          const timerKey = `${roomId}:${typer}`;
          const existingTimer = typingTimersRef.current[timerKey];
          if (existingTimer) window.clearTimeout(existingTimer);
          if (isTyping) {
            typingTimersRef.current[timerKey] = window.setTimeout(() => {
              setRooms(prev => {
                const existing = prev[roomId];
                if (!existing) return prev;
                return { ...prev, [roomId]: { ...existing, typingUsers: existing.typingUsers.filter(u => u !== typer) } };
              });
            }, TYPING_TIMEOUT_MS);
          }
          return;
        }

        if (data.type === "chat") {
          const { roomId, message, username: sender, timestamp, id } = data.payload;

          const newMsg: ChatMessage = { id, text: message, sender, self: false, timestamp };

          setRooms(prev => {
            const existing = prev[roomId] ?? emptyRoom(roomId);
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

          notifyIfNeeded(roomId, sender, message);
          return;
        }

        if (data.type === "edit") {
          const { roomId, messageId, newText, editedAt } = data.payload;
          setRooms(prev => {
            const existing = prev[roomId];
            if (!existing) return prev;
            return {
              ...prev,
              [roomId]: {
                ...existing,
                messages: existing.messages.map(m => m.id === messageId ? { ...m, text: newText, editedAt } : m),
              },
            };
          });
          return;
        }

        if (data.type === "delete") {
          const { roomId, messageId } = data.payload;
          setRooms(prev => {
            const existing = prev[roomId];
            if (!existing) return prev;
            return {
              ...prev,
              [roomId]: {
                ...existing,
                messages: existing.messages.map(m => m.id === messageId ? { ...m, deleted: true, text: "" } : m),
              },
            };
          });
          return;
        }
      };
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function handleLogin(name: string) {
    localStorage.setItem(USERNAME_KEY, name);
    setUsername(name);
  }

  function handleLogout() {
    shouldReconnectRef.current = false;
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

  function handleLeaveRoom(roomId: string) {
    wsRef.current?.send(JSON.stringify({
      type: "leave",
      payload: { roomId, username: usernameRef.current },
    }));
    setRooms(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    if (activeRoomId === roomId) setActiveRoomId(null);
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
      const existing = prev[activeRoomId] ?? emptyRoom(activeRoomId);
      return { ...prev, [activeRoomId]: { ...existing, messages: [...existing.messages, newMsg] } };
    });
  }

  function handleTyping(roomId: string, isTyping: boolean) {
    wsRef.current?.send(JSON.stringify({
      type: "typing",
      payload: { roomId, username: usernameRef.current, isTyping },
    }));
  }

  function handleEditMessage(roomId: string, messageId: string, newText: string) {
    wsRef.current?.send(JSON.stringify({
      type: "edit",
      payload: { roomId, messageId, newText },
    }));
    setRooms(prev => {
      const existing = prev[roomId];
      if (!existing) return prev;
      return {
        ...prev,
        [roomId]: {
          ...existing,
          messages: existing.messages.map(m => m.id === messageId ? { ...m, text: newText, editedAt: Date.now() } : m),
        },
      };
    });
  }

  function handleDeleteMessage(roomId: string, messageId: string) {
    wsRef.current?.send(JSON.stringify({
      type: "delete",
      payload: { roomId, messageId },
    }));
    setRooms(prev => {
      const existing = prev[roomId];
      if (!existing) return prev;
      return {
        ...prev,
        [roomId]: {
          ...existing,
          messages: existing.messages.map(m => m.id === messageId ? { ...m, deleted: true, text: "" } : m),
        },
      };
    });
  }

  if (!username) {
    return <Login onLogin={handleLogin} />;
  }

  const activeRoom = activeRoomId ? rooms[activeRoomId] : undefined;

  return (
    <div className='h-screen flex bg-white overflow-hidden'>
      <div className={`w-full md:w-80 md:border-r md:border-gray-200 flex-shrink-0 ${activeRoomId ? 'hidden md:block' : 'block'}`}>
        <RoomList
          username={username}
          rooms={Object.values(rooms)}
          connectionStatus={connectionStatus}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onSelectRoom={handleSelectRoom}
          onLogout={handleLogout}
        />
      </div>

      <div className={`flex-1 min-w-0 ${activeRoomId ? 'block' : 'hidden md:flex'}`}>
        {activeRoom ? (
          <ChatWindow
            room={activeRoom}
            currentUsername={username}
            connectionStatus={connectionStatus}
            onBack={() => setActiveRoomId(null)}
            onSend={handleSend}
            onLeave={() => handleLeaveRoom(activeRoom.id)}
            onTyping={(isTyping) => handleTyping(activeRoom.id, isTyping)}
            onEditMessage={(messageId, newText) => handleEditMessage(activeRoom.id, messageId, newText)}
            onDeleteMessage={(messageId) => handleDeleteMessage(activeRoom.id, messageId)}
          />
        ) : (
          <div className='hidden md:flex flex-1 items-center justify-center text-gray-400 text-sm'>
            Select a chat to start messaging
          </div>
        )}
      </div>
    </div>
  );
}

export default App
