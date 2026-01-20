# Stitch

An AI-powered video editing platform that combines a traditional timeline editor with natural language assistance.

## Overview

Stitch reimagines video editing by letting creators work the way they communicate. Instead of navigating complex timelines, tracks, and effects panels, users can describe edits in plain language. The AI assistant, **Lilo Agent**, directly modifies the timeline while respecting its structure and constraints, allowing seamless movement between hands-on editing and AI-assisted workflows.

## Features

- **Natural Language Editing** - Describe edits like trimming clips, rearranging scenes, adding audio, or generating transitions
- **Traditional Timeline Editor** - Full-featured browser-based timeline with familiar editing controls
- **Semantic Video Search** - Search across visual content, audio, and transcripts using Twelve Labs indexing
- **AI-Generated Transitions** - Create smooth, context-aware transitions between clips using VEO
- **Text-to-Speech Narration** - Generate voiceovers with ElevenLabs
- **Full Undo/Redo Support** - All edits (manual or AI-initiated) flow through the same command system
- **Preference Learning** - Lilo Agent adapts to individual editing styles over time

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Frontend | Next.js (App Router), React 19, TypeScript, Tailwind CSS |
| State Management | Zustand |
| Backend | Next.js API Routes, Prisma, PostgreSQL |
| Auth & Storage | Supabase |
| AI Services | Gemini, Twelve Labs, ElevenLabs, VEO |
| Video Processing | FFmpeg |

## Prerequisites

- **Node.js** v18 or higher
- **FFmpeg** installed on your system

### FFmpeg Installation

- **macOS:** `brew install ffmpeg`
- **Windows:** `winget install --id=Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements`
- **Linux (Ubuntu/Debian):** `sudo apt install ffmpeg`
- **Linux (Fedora):** `sudo dnf install ffmpeg`

See [FFMPEG_SETUP.md](./FFMPEG_SETUP.md) for detailed instructions.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up the database**
   ```bash
   npm run db:start      # Start Supabase locally
   npm run db:migrate    # Run migrations
   npm run db:generate   # Generate Prisma client
   ```

3. **Configure environment variables**

   Copy the sample environment file and fill in your API keys:
   ```bash
   cp sample.env .env
   ```

   See [sample.env](./sample.env) for all available configuration options.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:start` | Start local Supabase |
| `npm run db:stop` | Stop local Supabase |
| `npm run db:migrate` | Run database migrations |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:studio` | Open Prisma Studio |

## Architecture

### State Management

The timeline editor uses Zustand with dedicated stores for:
- Video clips
- Audio layers
- Selections
- Clipboard actions
- Undo/redo history

### AI Integration

1. **Video Indexing** - Uploaded videos are automatically indexed with Twelve Labs (Marengo), enabling semantic search across visual content, audio, and transcripts
2. **Lilo Agent** - Powered by LLMs that reason over timeline state and invoke structured editing tools
3. **Transition Generation** - VEO creates transitions by extracting the last frame of one clip and the first frame of the next, generating smooth context-aware video
4. **Text-to-Speech** - ElevenLabs generates narration audio

### Command System

Every timeline modification flows through a unified command system with full undo/redo support. This ensures AI actions are transparent, safe, and reversible.

## Troubleshooting

### Video Export Fails
1. Verify FFmpeg is installed: `ffmpeg -version`
2. Restart the dev server after installing FFmpeg
3. Check server console for `[FFmpeg] Using path: ...` message

### FFmpeg Not Found
Set the `FFMPEG_PATH` environment variable to the full path of your FFmpeg executable.

## License

Private project.
