import { useEffect, useRef, useState } from 'react';
import type { RoomData, ConnectionStatus, ChatMessage, ReplyTo } from './types';

const TYPING_STOP_DELAY_MS = 1500;

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "…" : text;
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
  onSend: (text: string, replyTo?: ReplyTo) => void;
  onLeave: () => void;
  onTyping: (isTyping: boolean) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onDeleteMessage: (messageId: string) => void;
}) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyingTo, setReplyingTo] = useState<ReplyTo | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages.length]);

  useEffect(() => {
    setReplyingTo(null);
    setActiveActionsId(null);
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
    onSend(text, replyingTo ?? undefined);
    setText("");
    setReplyingTo(null);
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

  function startReply(message: ChatMessage) {
    setReplyingTo({ id: message.id, sender: message.sender, text: message.text });
  }

  function scrollToMessage(messageId: string) {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(room.id);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore, code is still visible to select manually
    }
  }

  const others = room.onlineUsers.filter(u => u !== currentUsername);
  const typingOthers = room.typingUsers.filter(u => u !== currentUsername);
  const isConnected = connectionStatus === "connected";

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
          {room.name.slice(0, 2).toUpperCase()}
        </div>
        <div className='flex-1 min-w-0'>
          <p className='text-sm font-medium leading-tight truncate'>{room.name}</p>
          <p className='text-xs text-green-100 truncate'>{statusLine}</p>
        </div>
        <button
          className='text-[10px] bg-white/10 px-2 py-1 rounded shrink-0 font-mono tracking-wide'
          onClick={handleCopyCode}
          title="Copy room code to share"
        >
          {codeCopied ? "Copied!" : room.id}
        </button>
        <button
          className='text-xs bg-white/10 px-3 py-1.5 rounded shrink-0'
          onClick={onLeave}
        >
          Leave
        </button>
      </div>

      {connectionStatus !== "connected" && (
        <div className={`text-xs text-center py-1.5 shrink-0 ${connectionStatus === "connecting" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
          {connectionStatus === "connecting" ? "Connecting…" : "Disconnected — reconnecting, sending is paused"}
        </div>
      )}

      <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-1.5'>
        {room.messages.length === 0 && (
          <div className='flex-1 flex items-center justify-center'>
            <p className='text-sm text-gray-500 bg-white/60 rounded-full px-4 py-2'>
              No messages yet — say hi 👋
            </p>
          </div>
        )}

        {room.messages.map((message) => (
          <div
            key={message.id}
            ref={(el) => { messageRefs.current[message.id] = el; }}
            onClick={() => {
              if (message.deleted || editingId === message.id) return;
              setActiveActionsId(prev => (prev === message.id ? null : message.id));
            }}
            className={`group max-w-[75%] px-3 py-2 text-sm rounded-lg shadow-sm break-words cursor-pointer ${
              message.self
                ? 'self-end bg-[#DCF8C6] text-black rounded-br-none'
                : 'self-start bg-white text-black rounded-bl-none'
            }`}
          >
            {!message.self && (
              <p className='text-xs font-medium text-[#075E54] mb-0.5'>{message.sender}</p>
            )}

            {message.replyTo && !message.deleted && (
              <div
                className='border-l-2 border-[#075E54]/50 bg-black/5 rounded px-2 py-1 mb-1 cursor-pointer'
                onClick={(e) => { e.stopPropagation(); scrollToMessage(message.replyTo!.id); }}
              >
                <p className='text-[11px] font-medium text-[#075E54]'>{message.replyTo.sender}</p>
                <p className='text-[11px] text-gray-600 truncate'>{truncate(message.replyTo.text, 60)}</p>
              </div>
            )}

            {message.deleted ? (
              <p className='italic text-gray-500 text-sm'>This message was deleted</p>
            ) : editingId === message.id ? (
              <div className='flex flex-col gap-1' onClick={(e) => e.stopPropagation()}>
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
              {!message.deleted && editingId !== message.id && (
                <span
                  className={`gap-2 text-[10px] ${activeActionsId === message.id ? 'flex' : 'hidden md:group-hover:flex'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className='text-gray-600 underline' onClick={() => { startReply(message); setActiveActionsId(null); }}>reply</button>
                  {message.self && (
                    <>
                      <button className='text-gray-600 underline' onClick={() => { startEdit(message.id, message.text); setActiveActionsId(null); }}>edit</button>
                      <button className='text-red-600 underline' onClick={() => { onDeleteMessage(message.id); setActiveActionsId(null); }}>delete</button>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {replyingTo && (
        <div className='bg-[#F0F0F0] px-3 pt-2 flex items-start gap-2 shrink-0 border-t border-gray-300'>
          <div className='flex-1 border-l-2 border-[#075E54] bg-white rounded px-2 py-1.5 min-w-0'>
            <p className='text-xs font-medium text-[#075E54]'>Replying to {replyingTo.sender}</p>
            <p className='text-xs text-gray-600 truncate'>{truncate(replyingTo.text, 80)}</p>
          </div>
          <button
            className='text-gray-500 text-lg leading-none px-1'
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
          >
            &times;
          </button>
        </div>
      )}

      <div className='bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 shrink-0'>
        <input
          className='flex-1 rounded-full px-4 py-2 bg-white text-black outline-none disabled:bg-gray-100 disabled:text-gray-400'
          type="text"
          placeholder={isConnected ? "Type a message" : "Reconnecting…"}
          value={text}
          disabled={!isConnected}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className='w-9 h-9 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0 disabled:opacity-40'
          onClick={handleSend}
          disabled={!isConnected}
          aria-label="Send message"
        >
          &#10148;
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;
