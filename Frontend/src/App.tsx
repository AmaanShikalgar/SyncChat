import { useEffect, useRef, useState } from 'react';
import './App.css'
import AuthPage from './AuthPage';
import RoomList from './RoomList';
import ChatWindow from './ChatWindow';
import type { ChatMessage, RoomData, ConnectionStatus, ReplyTo } from './types';
import { SITE_NAME } from './siteConfig';

const USERNAME_KEY = "ws-chat-username";
const TOKEN_KEY = "ws-chat-token";
const RECONNECT_DELAY_MS = 2000;
const TYPING_TIMEOUT_MS = 3000;
const UNAUTHORIZED_CLOSE_CODE = 4001;

// Set these in the deployed environment:
//   VITE_API_URL = https://your-backend.onrender.com
//   VITE_WS_URL  = wss://your-backend.onrender.com
// Both fall back to the local dev backend when unset.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function emptyRoom(id: string, name?: string): RoomData {
  return { id, name: name ?? id, messages: [], unread: 0, onlineUsers: [], typingUsers: [] };
}

function App() {
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem(USERNAME_KEY)
  );
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  );
  const [rooms, setRooms] = useState<Record<string, RoomData>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [initialLoadDone, setInitialLoadDone] = useState(false);

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

  // Register the open-room view in browser history so a phone's back
  // gesture/button closes the room instead of navigating away from the app.
  useEffect(() => {
    function handlePopState() {
      setActiveRoomId(null);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function openRoom(roomId: string) {
    window.history.pushState({ syncchatRoom: roomId }, '');
    setActiveRoomId(roomId);
  }

  function closeActiveRoom() {
    if (window.history.state?.syncchatRoom) {
      window.history.back();
    } else {
      setActiveRoomId(null);
    }
  }

  function joinRoom(roomId: string, name?: string) {
    wsRef.current?.send(JSON.stringify({ type: "join", payload: { roomId } }));
    setRooms(prev => (prev[roomId] ? prev : { ...prev, [roomId]: emptyRoom(roomId, name) }));
  }

  function notifyIfNeeded(roomId: string, sender: string, text: string) {
    if (roomId === activeRoomIdRef.current) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(`${sender} (${roomId})`, { body: text });
  }

  function forceLogout() {
    shouldReconnectRef.current = false;
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUsername(null);
    setToken(null);
    setRooms({});
    setActiveRoomId(null);
  }

  useEffect(() => {
    if (!username || !token) return;
    shouldReconnectRef.current = true;
    setInitialLoadDone(false);

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    function connect() {
      setConnectionStatus(prev => (prev === "connected" ? prev : "connecting"));
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token as string)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        ws.send(JSON.stringify({ type: "get-rooms" }));
      };

      ws.onclose = (event) => {
        setConnectionStatus("disconnected");

        if (event.code === UNAUTHORIZED_CLOSE_CODE) {
          forceLogout();
          return;
        }

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
          const { rooms: roomSummaries } = data.payload as { rooms: { roomId: string; name: string }[] };
          roomSummaries.forEach(({ roomId, name }) => joinRoom(roomId, name));
          setInitialLoadDone(true);
          return;
        }

        if (data.type === "room-info") {
          const { roomId, name } = data.payload as { roomId: string; name: string };
          setRooms(prev => {
            const existing = prev[roomId] ?? emptyRoom(roomId, name);
            return { ...prev, [roomId]: { ...existing, name } };
          });
          return;
        }

        if (data.type === "history") {
          const { roomId, messages } = data.payload as {
            roomId: string;
            messages: {
              id: string; username: string; message: string; timestamp: number;
              editedAt?: number; deleted?: boolean; replyTo?: ReplyTo;
            }[];
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
              replyTo: m.replyTo,
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
          const { roomId, message, username: sender, timestamp, id, replyTo } = data.payload;

          const newMsg: ChatMessage = { id, text: message, sender, self: false, timestamp, replyTo };

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
  }, [username, token]);

  function handleAuthenticated(name: string, authToken: string) {
    localStorage.setItem(USERNAME_KEY, name);
    localStorage.setItem(TOKEN_KEY, authToken);
    setUsername(name);
    setToken(authToken);
  }

  function handleLogout() {
    forceLogout();
    wsRef.current?.close();
  }

  function handleCreateRoom(name: string) {
    const code = makeRoomCode();
    wsRef.current?.send(JSON.stringify({ type: "create-room", payload: { roomId: code, name } }));
    setRooms(prev => ({ ...prev, [code]: emptyRoom(code, name) }));
    openRoom(code);
  }

  function handleJoinRoom(roomId: string) {
    joinRoom(roomId);
    openRoom(roomId);
  }

  function handleSelectRoom(roomId: string) {
    openRoom(roomId);
    setRooms(prev => (prev[roomId] ? { ...prev, [roomId]: { ...prev[roomId], unread: 0 } } : prev));
  }

  function handleLeaveRoom(roomId: string) {
    wsRef.current?.send(JSON.stringify({ type: "leave", payload: { roomId } }));
    setRooms(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    if (activeRoomId === roomId) setActiveRoomId(null);
  }

  function handleSend(text: string, replyTo?: ReplyTo) {
    if (!activeRoomId) return;

    wsRef.current?.send(JSON.stringify({
      type: "chat",
      payload: { roomId: activeRoomId, message: text, replyTo },
    }));

    const newMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      sender: username ?? "you",
      self: true,
      timestamp: Date.now(),
      replyTo,
    };

    setRooms(prev => {
      const existing = prev[activeRoomId] ?? emptyRoom(activeRoomId);
      return { ...prev, [activeRoomId]: { ...existing, messages: [...existing.messages, newMsg] } };
    });
  }

  function handleTyping(roomId: string, isTyping: boolean) {
    wsRef.current?.send(JSON.stringify({
      type: "typing",
      payload: { roomId, isTyping },
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

  if (!username || !token) {
    return <AuthPage apiUrl={API_URL} onAuthenticated={handleAuthenticated} />;
  }

  if (!initialLoadDone && connectionStatus !== "disconnected") {
    return (
      <div
        className='h-screen flex flex-col items-center justify-center gap-3'
        style={{ background: 'linear-gradient(135deg, #054d43 0%, #075E54 45%, #128C7E 100%)' }}
      >
        <div className='w-10 h-10 border-[3px] border-white/30 border-t-white rounded-full animate-spin' />
        <p className='text-white/80 text-sm'>Loading {SITE_NAME}…</p>
      </div>
    );
  }

  const activeRoom = activeRoomId ? rooms[activeRoomId] : undefined;

  return (
    <div className='h-screen md:bg-[#DAD8D8] md:flex md:items-center md:justify-center md:p-6'>
      <div className='h-full w-full md:max-w-6xl md:h-[92vh] flex bg-white overflow-hidden md:rounded-xl md:shadow-2xl'>
        <div className={`w-full md:w-[340px] md:border-r md:border-gray-200 flex-shrink-0 ${activeRoomId ? 'hidden md:block' : 'block'}`}>
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
              onBack={closeActiveRoom}
              onSend={handleSend}
              onLeave={() => handleLeaveRoom(activeRoom.id)}
              onTyping={(isTyping) => handleTyping(activeRoom.id, isTyping)}
              onEditMessage={(messageId, newText) => handleEditMessage(activeRoom.id, messageId, newText)}
              onDeleteMessage={(messageId) => handleDeleteMessage(activeRoom.id, messageId)}
            />
          ) : (
            <div className='hidden md:flex flex-1 flex-col items-center justify-center gap-4 bg-[#F7F7F7] text-center px-8'>
              <div className='w-20 h-20 rounded-full bg-[#075E54]/10 flex items-center justify-center'>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#075E54" strokeWidth="1.6">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className='text-gray-700 font-medium'>No chat selected</p>
                <p className='text-sm text-gray-400 mt-1 max-w-xs'>
                  Pick a room from the list, or create a new one to start messaging
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App