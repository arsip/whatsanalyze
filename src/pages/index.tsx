import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/analysis');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">Loading WhatsApp Analysis...</h1>
        <p className="mt-2 text-gray-600">Please wait while we redirect you to the analysis page.</p>
      </div>
    </div>
  );
}
