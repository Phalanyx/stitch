-- This file contains Supabase-specific setup that runs AFTER Prisma migrations
-- Includes: RLS policies, triggers, and storage configuration

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Enable RLS on videos
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos" ON videos
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own videos" ON videos
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own videos" ON videos
    FOR DELETE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, session_video)
    VALUES (NEW.id, '[]'::jsonb);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Storage RLS policies
CREATE POLICY "Users can upload to own folder" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'raw-videos' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can read own files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'raw-videos' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'raw-videos' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );
