import { createClient, type SupabaseClient as SupabaseClientType } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_KEY;

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Type-safe Supabase client type for the application.
 * Use this type instead of importing from @supabase/supabase-js directly.
 */
export type SupabaseClient = SupabaseClientType<Database>;
