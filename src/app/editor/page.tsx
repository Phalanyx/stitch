import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Editor } from '@/components/editor/Editor';

export default async function EditorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  return <Editor />;
}
