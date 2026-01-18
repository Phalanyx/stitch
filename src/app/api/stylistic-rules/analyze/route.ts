import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';

type ExtractedRule = {
  ruleType: 'addition' | 'replacement' | 'style';
  pattern: string;
  replacement?: string;
  description: string;
};

type AnalysisResult = {
  rules: ExtractedRule[];
};

// POST: Analyze edit history to extract stylistic rules
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { toolName, paramName } = body;

    // Build query for edit history
    const where: { userId: string; toolName?: string; paramName?: string } = { userId: user.id };
    if (toolName) where.toolName = toolName;
    if (paramName) where.paramName = paramName;

    // Fetch recent edit history
    const edits = await prisma.toolEditHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50, // Analyze last 50 edits
    });

    if (edits.length < 2) {
      return NextResponse.json({
        success: true,
        message: 'Not enough edit history to analyze',
        rulesCreated: 0,
        rulesUpdated: 0,
      });
    }

    // Fetch existing rules to check for duplicates and update occurrences
    const existingRules = await prisma.stylisticRule.findMany({
      where: { userId: user.id },
    });

    // Format edits for the LLM
    const editsText = edits
      .map((e, i) => `${i + 1}. Tool: ${e.toolName}, Param: ${e.paramName}
   Original: "${e.originalValue}"
   Edited to: "${e.editedValue}"
   Context: ${e.userContext || 'N/A'}`)
      .join('\n\n');

    const existingRulesText = existingRules.length > 0
      ? existingRules.map(r => `- ${r.description} (pattern: ${r.pattern})`).join('\n')
      : 'None';

    const prompt = `You are analyzing a user's edit history for a video editing assistant.
The user has been editing tool parameter values - identify patterns in their edits.

Edit History:
${editsText}

Existing Rules (do NOT duplicate):
${existingRulesText}

Look for patterns such as:
1. "addition" - User consistently ADDS something to the end (e.g., always adds "with color grading")
2. "replacement" - User consistently REPLACES one phrase with another (e.g., changes "fade" to "smooth fade")
3. "style" - User has a consistent style preference (e.g., prefers specific adjectives or descriptions)

IMPORTANT:
- Only extract patterns that appear in 2+ edits
- Be specific about what the pattern is
- For "addition" type: pattern is what's being added
- For "replacement" type: pattern is original, replacement is what they change it to
- For "style" type: pattern describes the style, replacement is optional
- Return valid JSON only

Return JSON format:
{"rules": [
  {"ruleType": "addition", "pattern": "with color grading", "description": "Always adds 'with color grading' to transition descriptions"},
  {"ruleType": "replacement", "pattern": "fade", "replacement": "smooth fade", "description": "Changes 'fade' to 'smooth fade'"},
  {"ruleType": "style", "pattern": "uses cinematic adjectives", "description": "Prefers cinematic descriptors like 'dramatic', 'elegant'"}
]}

If no patterns found, return: {"rules": []}`;

    const response = await callGeminiText(prompt);
    const analysis = parseJsonFromText<AnalysisResult>(response);

    if (!analysis || !analysis.rules || analysis.rules.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No patterns detected in edit history',
        rulesCreated: 0,
        rulesUpdated: 0,
      });
    }

    let rulesCreated = 0;
    let rulesUpdated = 0;

    for (const rule of analysis.rules) {
      // Check if a similar rule already exists
      const existingRule = existingRules.find(
        (r) =>
          r.pattern.toLowerCase() === rule.pattern.toLowerCase() &&
          r.ruleType === rule.ruleType
      );

      if (existingRule) {
        // Increment occurrence count and potentially activate
        const newOccurrences = existingRule.occurrences + 1;
        const shouldActivate = newOccurrences >= 3 && !existingRule.isActive;

        await prisma.stylisticRule.update({
          where: { id: existingRule.id },
          data: {
            occurrences: newOccurrences,
            isActive: shouldActivate ? true : existingRule.isActive,
          },
        });
        rulesUpdated++;
      } else {
        // Create new rule (inactive by default)
        // Use the toolName and paramName from the most recent edit matching this pattern
        const relevantEdit = edits.find(
          (e) =>
            e.editedValue.toLowerCase().includes(rule.pattern.toLowerCase()) ||
            (rule.replacement &&
              e.editedValue.toLowerCase().includes(rule.replacement.toLowerCase()))
        );

        await prisma.stylisticRule.create({
          data: {
            userId: user.id,
            toolName: relevantEdit?.toolName || toolName || 'unknown',
            paramName: relevantEdit?.paramName || paramName || 'unknown',
            ruleType: rule.ruleType,
            pattern: rule.pattern,
            replacement: rule.replacement || null,
            description: rule.description,
            occurrences: 1,
            isActive: false,
          },
        });
        rulesCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      rulesCreated,
      rulesUpdated,
      detectedPatterns: analysis.rules,
    });
  } catch (error) {
    console.error('[StylisticRules Analyze] Error:', error);
    return NextResponse.json({ error: 'Failed to analyze edit history' }, { status: 500 });
  }
}
