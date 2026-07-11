import { useState } from 'react';
import type { RoomData, ConnectionStatus } from './types';

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
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string) => void;
  onSelectRoom: (roomId: string) => void;
  onLogout: () => void;
}) {
  const [joinCode, setJoinCode] = useState("");

  function handleJoin() {
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase());
    setJoinCode("");
  }

  return (
    <div className='h-full flex flex-col bg-white'>
      <div className='bg-[#075E54] text-white px-4 py-3 flex items-center justify-between shrink-0'>
        <div>
          <p className='text-xs text-green-100'>Signed in as</p>
          <p className='font-medium leading-tight'>{username}</p>
        </div>
        <button className='text-xs bg-white/10 px-3 py-1.5 rounded' onClick={onLogout}>
          Log out
        </button>
      </div>

      {connectionStatus !== "connected" && (
        <div className={`text-xs text-center py-1.5 shrink-0 ${connectionStatus === "connecting" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
          {connectionStatus === "connecting" ? "Connecting…" : "Disconnected — retrying…"}
        </div>
      )}

      <div className='p-3 flex flex-col gap-2 border-b shrink-0'>
        <button
          className='bg-[#075E54] text-white p-2 rounded font-medium'
          onClick={onCreateRoom}
        >
          + Create new room
        </button>
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
                  {room.id.slice(0, 2)}
                </div>
                {isOnline && (
                  <div className='absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white' />
                )}
              </div>
              <div className='flex-1 min-w-0'>
                <p className='font-medium text-black text-sm'>{room.id}</p>
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
    </div>
  );
}

export default RoomList;
