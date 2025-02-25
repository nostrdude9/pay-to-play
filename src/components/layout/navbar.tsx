"use client";

import { useNostr } from "@/components/providers/nostr-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export function Navbar() {
  const { publicKey, profileData, isLoading: nostrLoading, login } = useNostr();
  const router = useRouter();

  const handleLogin = async () => {
    await login();
  };

  return (
    <nav className="border-b">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold">
              Pay to Play
            </Link>
            <Badge variant="destructive">Warning! Alpha Software! Use responsibly. Don&apos;t get rekt!</Badge>
          </div>

          <div>
            {nostrLoading ? (
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : publicKey ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
              <div className="h-8 w-8">
                <Avatar className="cursor-pointer">
                  <AvatarImage src={profileData?.picture} alt={profileData?.name || "Profile"} />
                  <AvatarFallback>{publicKey.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/settings")}>
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={handleLogin}>
                Login
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
