"use client";

import { useNostr } from "@/components/providers/nostr-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UploadForm } from "@/components/music/upload-form";
import { MusicFeed } from "@/components/music/track-list";

export default function DashboardPage() {
  const { publicKey, isLoading } = useNostr();
  const router = useRouter();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !publicKey) {
      router.push("/");
    }
  }, [isLoading, publicKey, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Loading...</h1>
        </div>
      </div>
    );
  }

  if (!publicKey) {
    return null; // Will redirect
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <h2 className="text-2xl font-semibold mb-4">Upload Track</h2>
              <UploadForm />
            </div>
          </div>
          
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <h2 className="text-2xl font-semibold mb-4">Your Tracks</h2>
            <MusicFeed userOnly />
          </div>
        </div>
      </div>
    </main>
  );
}
