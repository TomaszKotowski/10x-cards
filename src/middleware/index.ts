import { defineMiddleware } from "astro:middleware";

import { supabaseClient } from "../db/supabase.client.ts";

export const onRequest = defineMiddleware(async (context, next) => {
  // Make Supabase client available in context
  context.locals.supabase = supabaseClient;

  // In mock mode, use a fake user for development
  const useMockData = import.meta.env.USE_MOCK_DATA === "true";

  if (useMockData) {
    // Mock user for development
    context.locals.user = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      // Additional required User fields with mock values
      updated_at: new Date().toISOString(),
      email_confirmed_at: new Date().toISOString(),
    };
  } else {
    // Extract JWT token from Authorization header
    const authHeader = context.request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    // Verify token and set user in context
    if (token) {
      const { data, error } = await supabaseClient.auth.getUser(token);
      context.locals.user = error ? null : data.user;
    } else {
      context.locals.user = null;
    }
  }

  return next();
});
