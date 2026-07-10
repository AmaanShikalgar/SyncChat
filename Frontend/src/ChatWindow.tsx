import { useEffect, useRef, useState } from 'react';
import type { RoomData, ConnectionStatus } from './types';

const TYPING_STOP_DELAY_MS = 1500;

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatWindow({
  room,
  currentUsername,
  connectionStatus,
  onBack,
  onSend,
  onLeave,
  onTyping,
  onEditMessage,
  onDeleteMessage,
}: {
  room: RoomData;
  currentUsername: string;
  connectionStatus: ConnectionStatus;
  onBack: () => void;
  onSend: (text: string) => void;
  onLeave: () => void;
  onTyping: (isTyping: boolean) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onDeleteMessage: (messageId: string) => void;
}) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages.length]);

  useEffect(() => {
    return () => {
      if (typingActiveRef.current) onTyping(false);
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  function handleTextChange(value: string) {
    setText(value);

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTyping(true);
    }

    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      onTyping(false);
    }, TYPING_STOP_DELAY_MS);
  }

  function handleSend() {
    if (!text.trim()) return;
    onSend(text);
    setText("");
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTyping(false);
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    }
  }

  function startEdit(messageId: string, currentText: string) {
    setEditingId(messageId);
    setEditText(currentText);
  }

  function saveEdit() {
    if (!editingId) return;
    if (editText.trim()) onEditMessage(editingId, editText.trim());
    setEditingId(null);
    setEditText("");
  }

  const others = room.onlineUsers.filter(u => u !== currentUsername);
  const typingOthers = room.typingUsers.filter(u => u !== currentUsername);

  let statusLine = others.length > 0 ? `${others.length} online` : "no one else online";
  if (typingOthers.length > 0) {
    statusLine = typingOthers.length === 1 ? `${typingOthers[0]} is typing…` : `${typingOthers.join(", ")} are typing…`;
  }

  return (
    <div className='h-full w-full flex flex-col bg-[#E5DDD5]'>
      <div className='bg-[#075E54] text-white px-4 py-3 flex items-center gap-3 shrink-0'>
        <button onClick={onBack} className='md:hidden text-white text-lg leading-none' aria-label="Back to chat list">
          &larr;
        </button>
        <div className='w-9 h-9 rounded-full bg-[#128C7E] flex items-center justify-center text-sm font-medium shrink-0'>
          {room.id.slice(0, 2).toUpperCase()}
        </div>
        <div className='flex-1 min-w-0'>
          <p className='text-sm font-medium leading-tight truncate'>Room: {room.id}</p>
          <p className='text-xs text-green-100 truncate'>{statusLine}</p>
        </div>
        <button
          className='text-xs bg-white/10 px-3 py-1.5 rounded shrink-0'
          onClick={onLeave}
        >
          Leave
        </button>
      </div>

      {connectionStatus !== "connected" && (
        <div className={`text-xs text-center py-1.5 shrink-0 ${connectionStatus === "connecting" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
          {connectionStatus === "connecting" ? "Connecting…" : "Disconnected — messages will resume once reconnected"}
        </div>
      )}

      <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-1.5'>
        {room.messages.map((message) => (
          <div
            key={message.id}
            className={`group max-w-[75%] px-3 py-2 text-sm rounded-lg shadow-sm break-words ${
              message.self
                ? 'self-end bg-[#DCF8C6] text-black rounded-br-none'
                : 'self-start bg-white text-black rounded-bl-none'
            }`}
          >
            {!message.self && (
              <p className='text-xs font-medium text-[#075E54] mb-0.5'>{message.sender}</p>
            )}

            {message.deleted ? (
              <p className='italic text-gray-500 text-sm'>This message was deleted</p>
            ) : editingId === message.id ? (
              <div className='flex flex-col gap-1'>
                <input
                  className='border rounded px-2 py-1 text-black text-sm'
                  value={editText}
                  autoFocus
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <div className='flex gap-2 text-xs'>
                  <button className='text-[#075E54] font-medium' onClick={saveEdit}>Save</button>
                  <button className='text-gray-500' onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p>{message.text}</p>
            )}

            <div className='flex items-center gap-2 mt-1'>
              <span className='text-[10px] text-gray-500'>
                {formatTime(message.timestamp)}{message.editedAt ? " (edited)" : ""}
              </span>
              {message.self && !message.deleted && editingId !== message.id && (
                <span className='hidden group-hover:flex gap-2 text-[10px]'>
                  <button className='text-gray-600 underline' onClick={() => startEdit(message.id, message.text)}>edit</button>
                  <button className='text-red-600 underline' onClick={() => onDeleteMessage(message.id)}>delete</button>
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className='bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 shrink-0'>
        <input
          className='flex-1 rounded-full px-4 py-2 bg-white text-black outline-none'
          type="text"
          placeholder="Type a message"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className='w-9 h-9 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0'
          onClick={handleSend}
          aria-label="Send message"
        >
          &#10148;
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;
