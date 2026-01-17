import { OrchestratorContext, ToolCall, ToolRegistry, ToolResult } from './types';

export async function runToolsSequentially(
  tools: ToolRegistry,
  context: OrchestratorContext,
  calls: ToolCall[]
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const call of calls) {
    const toolFn = tools[call.tool];
    if (!toolFn) {
      results.push({
        tool: call.tool,
        ok: false,
        error: 'Tool not found',
      });
      continue;
    }

    try {
      const output = await toolFn(call.args, context);
      results.push({ tool: call.tool, ok: true, output });
    } catch (error) {
      results.push({
        tool: call.tool,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
