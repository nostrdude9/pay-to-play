"use client";

import { MusicFeed } from "@/components/music/track-list";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Discover Tracks</h2>
          <MusicFeed />
        </div>
      </div>
    </main>
  );
}
