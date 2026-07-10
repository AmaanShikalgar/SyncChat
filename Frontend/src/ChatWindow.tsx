import { useEffect, useRef, useState } from 'react';
import type { RoomData } from './types';

function ChatWindow({
  room,
  onBack,
  onSend,
}: {
  room: RoomData;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages.length]);

  function handleSend() {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <div className='h-screen flex flex-col bg-[#E5DDD5]'>
      <div className='bg-[#075E54] text-white px-4 py-3 flex items-center gap-3 shrink-0'>
        <button onClick={onBack} className='text-white text-lg leading-none' aria-label="Back to chat list">
          &larr;
        </button>
        <div className='w-9 h-9 rounded-full bg-[#128C7E] flex items-center justify-center text-sm font-medium shrink-0'>
          {room.id.slice(0, 2).toUpperCase()}
        </div>
        <div className='flex-1'>
          <p className='text-sm font-medium leading-tight'>Room: {room.id}</p>
          <p className='text-xs text-green-100'>share this code to invite others</p>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-1.5'>
        {room.messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[75%] px-3 py-2 text-sm rounded-lg shadow-sm break-words ${
              message.self
                ? 'self-end bg-[#DCF8C6] text-black rounded-br-none'
                : 'self-start bg-white text-black rounded-bl-none'
            }`}
          >
            {!message.self && (
              <p className='text-xs font-medium text-[#075E54] mb-0.5'>{message.sender}</p>
            )}
            {message.text}
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
          onChange={(e) => setText(e.target.value)}
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
