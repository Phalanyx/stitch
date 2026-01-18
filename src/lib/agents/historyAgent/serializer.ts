import { SerializableHistory, SerializedCommand } from './types';

type CommandTypeCategory = 'video' | 'audio' | 'layer' | 'batch';

function getCommandCategory(type: string): CommandTypeCategory {
  if (type.startsWith('video:')) return 'video';
  if (type.startsWith('audio:')) return 'audio';
  if (type.startsWith('layer:')) return 'layer';
  return 'batch';
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function serializeHistoryForPrompt(history: SerializableHistory): string {
  const { commands, undoCount, redoCount, totalExecuted } = history;

  if (commands.length === 0) {
    return 'No commands in history yet.';
  }

  const lines: string[] = [];

  // Summary statistics
  lines.push('=== History Statistics ===');
  lines.push(`Total commands executed: ${totalExecuted}`);
  lines.push(`Commands in undo stack: ${commands.length}`);
  lines.push(`Undo count: ${undoCount}`);
  lines.push(`Redo count: ${redoCount}`);

  // Calculate undo rate
  if (totalExecuted > 0) {
    const undoRate = ((undoCount / totalExecuted) * 100).toFixed(1);
    lines.push(`Undo rate: ${undoRate}%`);
  }

  lines.push('');
  lines.push('=== Command History (chronological) ===');

  // Group commands by time proximity for pattern detection
  const commandGroups = groupCommandsByTimeProximity(commands, 5000); // 5 second groups

  for (const group of commandGroups) {
    const startTime = formatTimestamp(group[0].timestamp);
    const types = group.map((c) => c.type);
    const uniqueTypes = [...new Set(types)];

    if (group.length > 1) {
      lines.push(`[${startTime}] Batch (${group.length} commands):`);
      for (const cmd of group) {
        lines.push(`  - ${cmd.type}: ${cmd.description}`);
      }
      if (uniqueTypes.length === 1) {
        lines.push(`  (repeated action: ${uniqueTypes[0]})`);
      }
    } else {
      const cmd = group[0];
      lines.push(`[${startTime}] ${cmd.type}: ${cmd.description}`);
    }
  }

  // Calculate session duration
  if (commands.length > 1) {
    const sessionDuration = commands[commands.length - 1].timestamp - commands[0].timestamp;
    lines.push('');
    lines.push(`Session duration: ${formatDuration(sessionDuration)}`);
  }

  // Add category breakdown
  lines.push('');
  lines.push('=== Command Breakdown ===');
  const categoryCounts = getCategoryCounts(commands);
  for (const [category, count] of Object.entries(categoryCounts)) {
    lines.push(`${category}: ${count} commands`);
  }

  return lines.join('\n');
}

function groupCommandsByTimeProximity(
  commands: SerializedCommand[],
  thresholdMs: number
): SerializedCommand[][] {
  if (commands.length === 0) return [];

  const groups: SerializedCommand[][] = [];
  let currentGroup: SerializedCommand[] = [commands[0]];

  for (let i = 1; i < commands.length; i++) {
    const timeDiff = commands[i].timestamp - commands[i - 1].timestamp;
    if (timeDiff <= thresholdMs) {
      currentGroup.push(commands[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [commands[i]];
    }
  }
  groups.push(currentGroup);

  return groups;
}

function getCategoryCounts(commands: SerializedCommand[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cmd of commands) {
    const category = getCommandCategory(cmd.type);
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
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
