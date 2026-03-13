"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { LogIn, LogOut, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function UserMenu() {
  const { data: session, status } = useSession();
  const { t } = useI18n();

  if (status === "loading") {
    return (
      <div className="size-8 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!session?.user) {
    return (
      <Link
        href="/auth/signin"
        className="flex items-center justify-center gap-1.5 rounded-lg border bg-primary text-primary-foreground size-8 sm:size-auto sm:px-3 sm:py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <LogIn className="size-4 sm:hidden" />
        <span className="hidden sm:inline">{t.authSignIn}</span>
      </Link>
    );
  }

  const initials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="relative group">
      {/* Avatar button */}
      <button className="flex items-center gap-2 cursor-pointer">
        {session.user.image ? (
          <img
            src={session.user.image}
            alt=""
            className="size-8 rounded-full border"
          />
        ) : (
          <div className="size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
            {initials}
          </div>
        )}
      </button>

      {/* Dropdown */}
      <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border bg-background shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        <div className="p-3 border-b">
          <p className="text-sm font-medium truncate">
            {session.user.name || t.authUser}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {session.user.email}
          </p>
        </div>
        <div className="p-1">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            <LogOut className="size-4" />
            {t.authSignOut}
          </button>
        </div>
      </div>
    </div>
  );
}
