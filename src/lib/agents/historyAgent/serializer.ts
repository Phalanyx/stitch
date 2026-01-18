import { SerializableHistory, SerializedCommand } from './types';

type CommandTypeCategory = 'video' | 'audio' | 'layer' | 'batch';

function getCommandCategory(type: string): CommandTypeCategory {
  if (type.startsWith('video:')) return 'video';
  if (type.startsWith('audio:')) return 'audio';
  if (type.startsWith('layer:')) return 'layer';
  return 'batch';
}

function getCategoryCounts(commands: SerializedCommand[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cmd of commands) {
    const category = getCommandCategory(cmd.type);
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

export function serializeHistoryForPrompt(history: SerializableHistory): string {
  const { commands, undoCount, totalExecuted } = history;

  if (commands.length === 0) {
    return 'No commands in history yet.';
  }

  // Calculate undo rate
  const undoRate = totalExecuted > 0 ? Math.round((undoCount / totalExecuted) * 100) : 0;

  // Get last 5 command types
  const recentTypes = commands.slice(-5).map(c => c.type);

  // Get category breakdown
  const categoryCounts = getCategoryCounts(commands);
  const categoryParts = Object.entries(categoryCounts)
    .map(([cat, count]) => `${cat}:${count}`)
    .join(' ');

  // Build compact single-line output
  return `Stats: ${totalExecuted} cmds, ${undoCount} undos (${undoRate}%) | Recent: ${recentTypes.join(', ')} | Types: ${categoryParts}`;
}

export function detectRecentPatterns(history: SerializableHistory): string[] {
  const patterns: string[] = [];
  const { commands, undoCount, totalExecuted } = history;

  if (commands.length < 3) return patterns;

  // High undo rate
  if (totalExecuted > 5 && undoCount / totalExecuted > 0.3) {
    patterns.push('high_undo_rate');
  }

  // Check for repeated action types in recent commands
  const recentCommands = commands.slice(-10);
  const typeCounts: Record<string, number> = {};
  for (const cmd of recentCommands) {
    typeCounts[cmd.type] = (typeCounts[cmd.type] || 0) + 1;
  }

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count >= 4) {
      patterns.push(`repeated_${type}`);
    }
  }

  // Check for add-then-undo pattern (backtracking)
  const addThenUndoCount = countAddThenUndoPatterns(commands);
  if (addThenUndoCount >= 2) {
    patterns.push('add_then_undo');
  }

  return patterns;
}

function countAddThenUndoPatterns(commands: SerializedCommand[]): number {
  let count = 0;
  const addTypes = ['video:add', 'audio:add', 'layer:add'];

  for (let i = 0; i < commands.length - 1; i++) {
    // Look for add followed by the same item being potentially undone
    // Since we don't have direct undo tracking in commands, we look for
    // add followed by remove of similar type
    if (addTypes.includes(commands[i].type)) {
      const removeType = commands[i].type.replace(':add', ':remove');
      if (commands[i + 1]?.type === removeType) {
        count++;
      }
    }
  }

  return count;
}
