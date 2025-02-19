import { Suspense } from "react";
import { AudioPlayer } from "@/components/audio/player";
import HomePage from "@/components/pages/home";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <HomePage />
      <AudioPlayer />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900" />
    </div>
  );
}
