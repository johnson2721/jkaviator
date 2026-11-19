"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AppProviders";

export default function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="h-10 w-10 animate-spin-slow rounded-full border-2 border-brand-red border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-black text-white sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-mist">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}
