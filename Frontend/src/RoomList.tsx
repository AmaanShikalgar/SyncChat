import { useEffect, useRef, useState } from 'react';
import type { RoomData, ConnectionStatus } from './types';
import Footer from './Footer';
import { SITE_NAME } from './siteConfig';

function RoomList({
  username,
  rooms,
  connectionStatus,
  onCreateRoom,
  onJoinRoom,
  onSelectRoom,
  onLogout,
}: {
  username: string;
  rooms: RoomData[];
  connectionStatus: ConnectionStatus;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomId: string) => void;
  onSelectRoom: (roomId: string) => void;
  onLogout: () => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  function handleJoin() {
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase());
    setJoinCode("");
  }

  function handleCreate() {
    if (!newRoomName.trim()) return;
    onCreateRoom(newRoomName.trim());
    setNewRoomName("");
    setCreating(false);
  }

  return (
    <div className='h-full flex flex-col bg-white'>
      <div className='bg-[#075E54] text-white px-4 py-3 flex items-center justify-between shrink-0'>
        <div>
          <p className='text-[10px] uppercase tracking-wide text-green-200/80'>{SITE_NAME}</p>
          <p className='font-medium leading-tight'>{username}</p>
        </div>

        <div className='relative' ref={menuRef}>
          <button
            className='w-8 h-8 flex items-center justify-center rounded hover:bg-white/10'
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          {menuOpen && (
            <div className='absolute right-0 top-10 bg-white rounded-lg shadow-xl overflow-hidden w-40 z-10'>
              <button
                className='w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50'
                onClick={() => { setMenuOpen(false); onLogout(); }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {connectionStatus !== "connected" && (
        <div className={`text-xs text-center py-1.5 shrink-0 ${connectionStatus === "connecting" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
          {connectionStatus === "connecting" ? "Connecting…" : "Disconnected — retrying…"}
        </div>
      )}

      <div className='p-3 flex flex-col gap-2 border-b shrink-0'>
        {creating ? (
          <div className='flex flex-col gap-2 bg-gray-50 border rounded-lg p-3'>
            <label className='text-xs font-medium text-gray-600'>Room name</label>
            <input
              className='border rounded p-2 text-black'
              type="text"
              placeholder="e.g. Weekend Trip Planning"
              value={newRoomName}
              autoFocus
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className='flex gap-2'>
              <button className='flex-1 bg-[#075E54] text-white p-2 rounded font-medium' onClick={handleCreate}>
                Create
              </button>
              <button
                className='px-3 text-gray-500 text-sm'
                onClick={() => { setCreating(false); setNewRoomName(""); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className='bg-[#075E54] text-white p-2 rounded font-medium'
            onClick={() => setCreating(true)}
          >
            + Create new room
          </button>
        )}

        <div className='flex gap-2'>
          <input
            className='flex-1 border rounded p-2 text-black'
            type="text"
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <button className='bg-gray-200 text-black px-4 rounded' onClick={handleJoin}>
            Join
          </button>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto'>
        {rooms.length === 0 && (
          <p className='text-center text-gray-400 mt-8 text-sm px-6'>
            No chats yet — create a room or join one with a code to get started
          </p>
        )}
        {rooms.map(room => {
          const last = room.messages[room.messages.length - 1];
          const isOnline = room.onlineUsers.some(u => u !== username);
          return (
            <div
              key={room.id}
              className='flex items-center gap-3 px-4 py-3 border-b cursor-pointer hover:bg-gray-50'
              onClick={() => onSelectRoom(room.id)}
            >
              <div className='relative shrink-0'>
                <div className='w-10 h-10 rounded-full bg-[#128C7E] text-white flex items-center justify-center text-sm font-medium'>
                  {room.name.slice(0, 2).toUpperCase()}
                </div>
                {isOnline && (
                  <div className='absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white' />
                )}
              </div>
              <div className='flex-1 min-w-0'>
                <p className='font-medium text-black text-sm truncate'>{room.name}</p>
                <p className='text-xs text-gray-500 truncate'>
                  {last
                    ? (last.deleted ? "Message deleted" : `${last.self ? "You" : last.sender}: ${last.text}`)
                    : "No messages yet"}
                </p>
              </div>
              {room.unread > 0 && (
                <div className='bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0'>
                  {room.unread}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className='border-t shrink-0'>
        <Footer variant="light" />
      </div>
    </div>
  );
}

export default RoomList;
