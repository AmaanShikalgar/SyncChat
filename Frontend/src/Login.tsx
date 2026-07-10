import { useState } from 'react';

function Login({ onLogin }: { onLogin: (name: string) => void }) {
  const [name, setName] = useState("");

  function handleSubmit() {
    if (!name.trim()) return;
    onLogin(name.trim());
  }

  return (
    <div className='bg-black h-screen flex items-center justify-center'>
      <div className='bg-white rounded p-6 flex flex-col gap-3 w-80'>
        <h1 className='text-black text-lg font-semibold'>Welcome</h1>
        <p className='text-sm text-gray-600'>Enter a display name to start chatting</p>
        <input
          className='border rounded p-2 text-black'
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoFocus
        />
        <button
          className='bg-[#075E54] text-white p-2 rounded'
          onClick={handleSubmit}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export default Login;
