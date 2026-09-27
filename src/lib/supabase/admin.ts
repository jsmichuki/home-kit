import "server-only";

import { createClient } from "@supabase/supabase-js";

function requireServerEnvironment(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Supabase server access.`);
  }

  return value;
}

export function createSupabaseAdminClient() {
  return createClient(
    requireServerEnvironment("SUPABASE_URL"),
    requireServerEnvironment("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
