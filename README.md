This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

Before running the development server, ensure you have:

1. **Node.js** (v18 or higher recommended)
2. **FFmpeg** installed on your system (required for video export)

   See [FFMPEG_SETUP.md](./FFMPEG_SETUP.md) for detailed installation instructions.
   
   **Quick install:**
   - **Windows:** `winget install --id=Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements`
   - **macOS:** `brew install ffmpeg`
   - **Linux:** `sudo apt install ffmpeg` (Ubuntu/Debian) or `sudo dnf install ffmpeg` (Fedora)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables (if needed):
   - Create `.env.local` in the root directory
   - See environment variable requirements below

3. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment Variables

The application can use the following environment variables (optional):

- `FFMPEG_PATH` - Full path to ffmpeg executable (only needed if FFmpeg is not in your PATH)
  - Example (Windows): `FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe`
  - Example (macOS/Linux): `FFMPEG_PATH=/usr/local/bin/ffmpeg`

If `FFMPEG_PATH` is not set, the application will try to auto-detect FFmpeg from your system PATH or common installation locations.

## Video Export

The video export feature requires FFmpeg to be installed. If export fails:
1. Verify FFmpeg is installed (see [FFMPEG_SETUP.md](./FFMPEG_SETUP.md))
2. Restart your dev server after installing FFmpeg
3. Check server console for `[FFmpeg] Using path: ...` message

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
