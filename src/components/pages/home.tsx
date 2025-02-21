"use client";

import { MusicFeed } from "@/components/music/track-list";
import { AudioPlayer } from "@/components/audio/player";
export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold">Discover Tracks</h2>
          </div>
          <MusicFeed />
        </div>
      </div>
      <AudioPlayer />
    </main>
  );
}
