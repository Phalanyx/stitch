#!/bin/bash
set -e

echo "=== Stitch Local Supabase Setup ==="

# Initialize Supabase if not already done
if [ ! -f "supabase/config.toml" ]; then
    echo "Initializing Supabase project..."
    npx supabase init
fi

# Start local Supabase
echo "Starting local Supabase..."
npx supabase start

# Run Prisma migrations
echo "Running Prisma migrations..."
npx prisma migrate dev --name init

# Apply Supabase-specific SQL (RLS policies, triggers)
echo "Applying RLS policies and triggers..."
npx supabase db query < supabase/migrations/00001_initial_schema.sql

# Create storage bucket
echo "Creating raw-videos storage bucket..."
npx supabase db query "
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'raw-videos',
    'raw-videos',
    false,
    524288000,
    ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
) ON CONFLICT (id) DO NOTHING;
"

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Display status
echo ""
echo "=== Setup Complete ==="
npx supabase status
