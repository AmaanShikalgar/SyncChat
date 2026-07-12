import { useState } from 'react';

function AuthPage({
  apiUrl,
  onAuthenticated,
}: {
  apiUrl: string;
  onAuthenticated: (username: string, token: string) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetFields() {
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);

    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/${mode === "signin" ? "signin" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      onAuthenticated(data.username, data.token);
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='bg-black h-screen flex items-center justify-center px-4'>
      <div className='bg-white rounded-xl p-8 flex flex-col gap-4 w-full max-w-sm shadow-2xl'>
        <div>
          <h1 className='text-black text-xl font-semibold'>
            {mode === "signin" ? "Welcome back" : "Create an account"}
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            {mode === "signin" ? "Sign in to continue chatting" : "Sign up to start chatting"}
          </p>
        </div>

        <div className='flex flex-col gap-3'>
          <div>
            <label className='text-xs font-medium text-gray-600'>Username</label>
            <input
              className='w-full border rounded-lg p-2.5 text-black mt-1 outline-none focus:ring-2 focus:ring-[#075E54]/30 focus:border-[#075E54]'
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>

          <div>
            <label className='text-xs font-medium text-gray-600'>Password</label>
            <input
              className='w-full border rounded-lg p-2.5 text-black mt-1 outline-none focus:ring-2 focus:ring-[#075E54]/30 focus:border-[#075E54]'
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {mode === "signup" && (
            <div>
              <label className='text-xs font-medium text-gray-600'>Confirm password</label>
              <input
                className='w-full border rounded-lg p-2.5 text-black mt-1 outline-none focus:ring-2 focus:ring-[#075E54]/30 focus:border-[#075E54]'
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          )}
        </div>

        {error && (
          <p className='text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2'>{error}</p>
        )}

        <button
          className='bg-[#075E54] text-white p-2.5 rounded-lg font-medium disabled:opacity-60'
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>

        <p className='text-sm text-gray-500 text-center'>
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            className='text-[#075E54] font-medium'
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              resetFields();
            }}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
