import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { APP_CONFIG } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  const { url, publishableKey } = APP_CONFIG.supabase;
  if (!url || !publishableKey) {
    return null;
  }
  client ??= createClient(url, publishableKey);
  return client;
}
