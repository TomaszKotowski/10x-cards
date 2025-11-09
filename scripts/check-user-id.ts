import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUserId() {
  console.log("🔍 Checking user ID...\n");

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "test@example.com",
    password: "test123456",
  });

  if (authError) {
    console.error("❌ Error signing in:", authError);
    return;
  }

  console.log("✅ Signed in as:", authData.user.email);
  console.log("👤 User ID (auth.uid()):", authData.user.id);
  console.log("\n📦 Checking deck ownership...");

  const { data: decks, error: decksError } = await supabase
    .from("decks")
    .select("id, name, user_id")
    .is("deleted_at", null)
    .limit(3);

  if (decksError) {
    console.error("❌ Error fetching decks:", decksError);
    return;
  }

  if (decks && decks.length > 0) {
    console.log("\nSample decks in database:");
    decks.forEach((deck) => {
      console.log(`  - ${deck.name}`);
      console.log(`    user_id: ${deck.user_id}`);
      console.log(`    matches auth.uid(): ${deck.user_id === authData.user.id ? "✅ YES" : "❌ NO"}`);
    });
  }
}

checkUserId().catch(console.error);
