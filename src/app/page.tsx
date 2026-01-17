import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthForm } from '@/components/AuthForm';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/editor');
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Stitch</h1>
          <p className="text-gray-400">Video Editor Timeline</p>
        </div>
        <AuthForm />
      </div>
    </div>
  );
}
