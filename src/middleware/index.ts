import { defineMiddleware } from "astro:middleware";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../db/database.types";

/**
 * Astro middleware for Supabase integration.
 *
 * Creates a per-request Supabase client with cookie-based session management.
 * This ensures that authentication state is properly maintained across requests.
 *
 * The middleware:
 * - Extracts authentication cookies from the request
 * - Creates a Supabase client configured to use these cookies
 * - Attaches the client to context.locals for use in routes
 * - Handles cookie updates in the response
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.SUPABASE_KEY;

  // Create a Supabase client for this request
  // This client will use cookies from the request for authentication
  context.locals.supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Store JWT in cookies for persistence across requests
      storage: {
        getItem: (key: string) => {
          const cookies = context.cookies.get(key);
          return cookies?.value ?? null;
        },
        setItem: (key: string, value: string) => {
          context.cookies.set(key, value, {
            path: "/",
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7, // 7 days
          });
        },
        removeItem: (key: string) => {
          context.cookies.delete(key, {
            path: "/",
          });
        },
      },
      // Don't automatically refresh tokens - we'll handle this manually
