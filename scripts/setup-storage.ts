import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

async function createBucket(supabase: ReturnType<typeof createClient>, bucketId: string, options: {
  public: boolean;
  fileSizeLimit: number;
  allowedMimeTypes: string[];
}) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error(`Error listing buckets for ${bucketId}:`, listError);
    return;
  }

  const bucketExists = buckets?.some(b => b.id === bucketId);

  if (bucketExists) {
    console.log(`✅ ${bucketId} bucket already exists`);
    return;
  }

  const { data, error } = await supabase.storage.createBucket(bucketId, options);

  if (error) {
    console.error(`❌ Error creating ${bucketId} bucket:`, error);
  } else {
    console.log(`✅ Successfully created ${bucketId} bucket:`, data);
  }
}

async function setupStorage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Create raw-videos bucket
  await createBucket(supabase, 'raw-videos', {
    public: true,
    fileSizeLimit: 524288000, // 500MB
    allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
  });

  // Create raw-audio bucket
  await createBucket(supabase, 'raw-audio', {
    public: true,
    fileSizeLimit: 524288000, // 500MB
    allowedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a'],
  });
}

setupStorage();
