"use client";

import { MusicFeed } from "@/components/music/track-list";
import { AudioPlayer } from "@/components/audio/player";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, X } from "lucide-react";
import { useState } from "react";

export default function HomePage() {
  const [showAlert, setShowAlert] = useState(true);
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        {showAlert && (
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              To get started, connect NWC (Nostr Waller Connect) in Settings. Be sure to set a low spending limit on your connection!
            </AlertDescription>
            <button 
              onClick={() => setShowAlert(false)} 
              className="absolute right-2 top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </Alert>
        )}
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold">Discover Tracks</h2>
          </div>
          <MusicFeed id="home-all-tracks" />
        </div>
      </div>
      <AudioPlayer />
    </main>
  );
}
