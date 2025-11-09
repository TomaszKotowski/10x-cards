import { createClient } from "@supabase/supabase-js";
import { defineMiddleware } from "astro:middleware";

import type { Database } from "../db/database.types.ts";
import { supabaseClient } from "../db/supabase.client.ts";

export const onRequest = defineMiddleware(async (context, next) => {
  const useMockData = import.meta.env.USE_MOCK_DATA === "true";

  if (useMockData) {
    // Mock mode: use global client and fake user
    context.locals.supabase = supabaseClient;
    context.locals.user = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      updated_at: new Date().toISOString(),
      email_confirmed_at: new Date().toISOString(),
    };
  } else {
    // Real mode: extract JWT token and create authenticated client
    const authHeader = context.request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (token) {
      // Verify token and get user
      const { data, error } = await supabaseClient.auth.getUser(token);

      if (!error && data.user) {
        // Create authenticated Supabase client with user's token
        // This ensures RLS policies work correctly
        context.locals.supabase = createClient<Database>(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_KEY, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        });
        context.locals.user = data.user;
      } else {
        // No valid token: use anon client
        context.locals.supabase = supabaseClient;
        context.locals.user = null;
      }
    } else {
      // No token: use anon client
      context.locals.supabase = supabaseClient;
      context.locals.user = null;
    }
  }

  return next();
});
