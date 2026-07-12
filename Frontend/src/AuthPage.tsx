import { useState } from 'react';
import Footer from './Footer';
import { SITE_NAME } from './siteConfig';

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
    <div
      className='h-screen flex flex-col items-center justify-center px-4'
      style={{ background: 'linear-gradient(135deg, #054d43 0%, #075E54 45%, #128C7E 100%)' }}
    >
      <div className='flex-1 flex flex-col items-center justify-center w-full'>
        <div className='mb-6 text-center'>
          <div className='inline-flex items-center gap-2 text-white'>
            <div className='w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center'>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className='text-2xl font-semibold tracking-tight'>{SITE_NAME}</span>
          </div>
          <p className='text-white/70 text-sm mt-2'>Real-time rooms, no clutter</p>
        </div>

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

      <Footer variant="dark" />
    </div>
  );
}

export default AuthPage;
