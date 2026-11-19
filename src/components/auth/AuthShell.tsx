"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[1.05fr_minmax(0,460px)] lg:py-14">
      <div className="relative hidden overflow-hidden rounded-3xl border border-[#1e2739] lg:block">
        <Image
          src="/images/aviator-hero.jpg"
          alt="Red airplane climbing through a night sky"
          width={1200}
          height={1400}
          priority
          className="h-[620px] w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-[#05070d]/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden="true">
              <path
                fill="#e50539"
                d="M6 34c14-2 24-8 31-17l3-4 2 5c2 5 5 9 9 12l4 3-5 2c-6 2-11 6-14 11l-2 4-3-4c-4-6-9-10-16-12l-9-3z"
              />
            </svg>
            <span className="font-display text-2xl font-black text-white">
              AVIATOR<span className="text-brand-red">BET</span>
            </span>
          </div>
          <h2 className="mt-3 max-w-md text-3xl font-black leading-tight text-white">
            The plane flies. <span className="text-brand-red-soft">You cash out.</span>
          </h2>
          <ul className="mt-4 grid gap-2 text-sm text-slate-300">
            {[
              "Live multipliers streamed in real time",
              "Auto cash-out settled on the server",
              "Instant M-PESA deposits & operator-approved payouts",
              "Bonus requests reviewed by the operator desk",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-400">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel animate-fly-in p-6 sm:p-7">
        <Link href="/" className="mb-4 flex items-center gap-2 lg:hidden">
          <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden="true">
            <path
              fill="#e50539"
              d="M6 34c14-2 24-8 31-17l3-4 2 5c2 5 5 9 9 12l4 3-5 2c-6 2-11 6-14 11l-2 4-3-4c-4-6-9-10-16-12l-9-3z"
            />
          </svg>
          <span className="font-display text-xl font-black text-white">
            AVIATOR<span className="text-brand-red">BET</span>
          </span>
        </Link>
        <h1 className="font-display text-2xl font-black text-white">{title}</h1>
        <p className="mt-1 text-sm text-mist">{subtitle}</p>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-5 text-center text-sm text-mist">{footer}</div> : null}
      </div>
    </div>
  );
}
