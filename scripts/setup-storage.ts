import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

async function createVideosBucket() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('Error listing buckets:', listError);
    return;
  }

  const bucketExists = buckets?.some(b => b.id === 'raw-videos');

  if (bucketExists) {
    console.log('✅ raw-videos bucket already exists');
    return;
  }

  const { data, error } = await supabase.storage.createBucket('raw-videos', {
    public: true,
    fileSizeLimit: 524288000, // 500MB
    allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
  });

  if (error) {
    console.error('❌ Error creating bucket:', error);
  } else {
    console.log('✅ Successfully created raw-videos bucket:', data);
  }
}

createVideosBucket();
