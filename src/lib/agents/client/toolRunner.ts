import { ToolCall, ToolRegistry, ToolResult, AgentContext } from './types';

export async function runToolCall(
  tools: ToolRegistry,
  context: AgentContext,
  call: ToolCall
): Promise<ToolResult> {
  const toolFn = tools[call.tool];
  if (!toolFn) {
    return {
      tool: call.tool,
      ok: false,
      error: 'Tool not found',
    };
  }

  try {
    const output = await toolFn(call.args ?? {}, context);
    const changed = Boolean(output && output.changed);
    if (output.status === 'error') {
      return {
        tool: call.tool,
        ok: false,
        error: output.error || 'Tool failed',
        changed,
        output: output.output,
      };
    }
    return {
      tool: call.tool,
      ok: true,
      output: output.output,
      changed,
    };
  } catch (error) {
    return {
      tool: call.tool,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function runToolsSequentially(
  tools: ToolRegistry,
  context: AgentContext,
  calls: ToolCall[]
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const call of calls) {
    results.push(await runToolCall(tools, context, call));
  }

  return results;
}
