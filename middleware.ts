import { middleware } from "./lib/supabase/middleware";

export default middleware;

// Keep the config definition in this file so Next.js can statically parse it.
export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|apple-touch-icon\\.png|apple-touch-icon-precomposed\\.png|api/|login).*)",
  ],
};

