import type { NextRequest } from "next/server";

/** The visitor's IP as Vercel reports it (first entry of x-forwarded-for). */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip");
}
