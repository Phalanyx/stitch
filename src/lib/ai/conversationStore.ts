import { ModelMessage } from 'ai';

// In-memory conversation storage (MVP)
// For production, consider using Supabase or Redis
const conversations = new Map<string, ModelMessage[]>();

// Max messages to keep per session (for memory management)
const MAX_MESSAGES_PER_SESSION = 50;

// Session expiry time (30 minutes)
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

// Track session last access time
const sessionLastAccess = new Map<string, number>();

// Clean up expired sessions periodically
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, lastAccess] of sessionLastAccess.entries()) {
    if (now - lastAccess > SESSION_EXPIRY_MS) {
      conversations.delete(sessionId);
      sessionLastAccess.delete(sessionId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

/**
 * Get messages for a session
 */
export function getMessages(sessionId: string): ModelMessage[] {
  sessionLastAccess.set(sessionId, Date.now());
  return conversations.get(sessionId) || [];
}

/**
 * Add messages to a session
 */
export function addMessages(sessionId: string, messages: ModelMessage[]): void {
  sessionLastAccess.set(sessionId, Date.now());

  const existing = conversations.get(sessionId) || [];
  const updated = [...existing, ...messages];

  // Trim if over limit (keep most recent)
  if (updated.length > MAX_MESSAGES_PER_SESSION) {
    const trimmed = updated.slice(-MAX_MESSAGES_PER_SESSION);
    conversations.set(sessionId, trimmed);
  } else {
    conversations.set(sessionId, updated);
  }
}

/**
 * Clear messages for a session
 */
export function clearMessages(sessionId: string): void {
  conversations.delete(sessionId);
  sessionLastAccess.delete(sessionId);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}
