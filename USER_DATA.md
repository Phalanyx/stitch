# User Data Collection & AI Enhancement

This document describes how Stitch collects and uses user data to improve the AI agent experience and output quality.

## Overview

Stitch uses several types of user data to personalize the AI video editing assistant:

| Data Type | Storage | Purpose |
|-----------|---------|---------|
| Likes/Dislikes | `Profile.userLikes`, `Profile.userDislikes` | Guide editing style preferences |
| Message Feedback | `MessageFeedback` table | Learn from liked/disliked responses |
| Tool Edit History | `ToolEditHistory` table | Track parameter adjustments for analytics |
| Command History | In-memory (session) | Detect workflow patterns |

---

## 1. Likes & Dislikes

**Location:** `src/components/ui/PreferencesModal.tsx`, `src/app/api/preferences/`

Users can manually specify their video editing preferences:

- **Likes:** Preferred editing styles (e.g., "smooth transitions, cinematic color grading, fast-paced edits")
- **Dislikes:** Styles to avoid (e.g., "abrupt cuts, shaky footage, overused effects")

These preferences are stored as comma-separated text in the user's profile and can be used to inform AI responses about editing recommendations.

---

## 2. Message Feedback System

**Location:** `src/app/api/feedback/route.ts`, `src/app/api/preferences/analyze/route.ts`

### Collection
When users provide feedback on assistant messages (thumbs up/down), the system:
1. Records the feedback type, message content, and optional feedback text
2. Triggers background preference analysis

### Analysis
The `/api/preferences/analyze` endpoint uses an LLM to:
- Extract new editing preferences from liked messages
- Identify styles to avoid from disliked messages
- Merge extracted preferences with existing ones (avoiding duplicates)

**Example flow:**
```
User likes: "I added a smooth crossfade transition between clips"
  → Extracted: likes = ["smooth crossfade transitions"]
  → Merged into Profile.userLikes
```

---

## 3. Tool Edit History

**Location:** `src/app/api/tool-edits/route.ts`

### What's Tracked
When users modify tool parameters before execution (via Tool Options Preview), the system records:
- `toolName`: Which tool was used (e.g., `search_videos`, `create_transition`)
- `paramName`: Which parameter was edited
- `originalValue`: The AI-suggested value
- `editedValue`: The user's modification
- `userContext`: Optional context about why the edit was made

### Purpose
This data enables future analytics to understand:
- How often users modify AI suggestions
- Which tools/parameters need improvement
- Common user corrections patterns

---

## 4. Tool Options Preview

**Location:** `src/lib/agents/client/generateVariations.ts`, `src/lib/agents/client/chatOrchestrator.ts`

### Feature
When enabled (`Profile.showToolOptionsPreview`), users see multiple parameter variations before tool execution:

```
Tool: search_videos
Parameter: query

Variations:
1. "cinematic sunset timelapse" (Original suggestion)
2. "sunset time lapse golden hour" (More specific)
3. "dramatic sunset clouds" (Different angle)
4. "orange sky timelapse footage" (Keyword variation)
```

### How Variations Are Generated
The `generateVariations` function creates 3-4 alternatives using:
- The original tool call and parameter
- The user's request message
- Recent conversation context

---

## 5. Command History & Pattern Detection

**Location:** `src/lib/agents/historyAgent/`

### In-Session Analysis
The History Agent monitors editing commands during a session to detect patterns:

**Serialized Format:**
```
Stats: 15 cmds, 3 undos (20%) | Recent: video:add, video:trim, audio:add | Types: video:8 audio:3 layer:1
```

### Detected Patterns

| Pattern | Trigger | Implication |
|---------|---------|-------------|
| `high_undo_rate` | >30% undo rate after 5+ commands | User may be experimenting or making mistakes |
| `repeated_{type}` | Same action 4+ times in last 10 commands | Repetitive workflow detected |
| `add_then_undo` | 2+ add-then-remove cycles | Indecision about content |

### Pattern Observations
The system generates actionable observations:

```typescript
{
  type: 'efficiency',
  title: 'High Undo Rate',
  description: 'You have undone 35% of your actions',
  suggestion: 'Consider using preview before committing changes',
  confidence: 0.85
}
```

High-confidence observations (>0.7) are surfaced to the user via chat responses.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                             │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ Edit Prefs    │  │ Feedback on     │  │ Modify Tool      │
│ (likes/       │  │ Messages        │  │ Parameters       │
│ dislikes)     │  │ (thumbs up/down)│  │ (before execute) │
└───────┬───────┘  └────────┬────────┘  └────────┬─────────┘
        │                   │                    │
        ▼                   ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ Profile       │  │ MessageFeedback │  │ ToolEditHistory  │
│ (PostgreSQL)  │  │ + LLM Analysis  │  │ (PostgreSQL)     │
└───────┬───────┘  └────────┬────────┘  └──────────────────┘
        │                   │
        └─────────┬─────────┘
                  ▼
        ┌─────────────────┐
        │ Merged User     │
        │ Preferences     │
        └─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SESSION ACTIVITY                            │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────┐
│ Command History   │
│ (in-memory)       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌─────────────────┐
│ Pattern Detection │────▶│ Observations    │
│ (serializer.ts)   │     │ surfaced in     │
└───────────────────┘     │ chat responses  │
                          └─────────────────┘
```

---

## Database Schema

```prisma
model Profile {
  id                     String   @id @db.Uuid
  userLikes              String   @default("") @db.Text
  userDislikes           String   @default("") @db.Text
  showToolOptionsPreview Boolean  @default(false)
  // ... other fields
}

model MessageFeedback {
  id             String   @id @db.Uuid
  userId         String   @db.Uuid
  feedbackType   String   // "like" | "dislike"
  messageContent String   @db.Text
  feedbackText   String?  @db.Text
  createdAt      DateTime @default(now())
}

model ToolEditHistory {
  id            String   @id @db.Uuid
  userId        String   @db.Uuid
  toolName      String
  paramName     String
  originalValue String   @db.Text
  editedValue   String   @db.Text
  userContext   String?  @db.Text
  createdAt     DateTime @default(now())
}
```

---

## Privacy Considerations

- All user data is scoped to individual user accounts via `userId`
- Command history is session-only (not persisted to database)
- Preference analysis happens server-side; raw conversations are not stored
- Users can manually edit/clear their likes and dislikes at any time
