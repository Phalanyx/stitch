'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;
        setError('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        window.location.href = '/editor';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p className={`text-sm ${error.includes('Check your email') ? 'text-blue-400' : 'text-red-400'}`}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-600/50 text-white rounded-md transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {mode === 'signin' ? 'Signing in...' : 'Signing up...'}
            </>
          ) : (
            mode === 'signin' ? 'Sign In' : 'Sign Up'
          )}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
