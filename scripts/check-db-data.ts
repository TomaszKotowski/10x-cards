import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log("🔍 Checking database data...\n");

  // Sign in as test user to bypass RLS
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "test@example.com",
    password: "test123456",
  });

  if (authError) {
    console.error("❌ Error signing in:", authError);
    return;
  }

  console.log("✅ Signed in as:", authData.user.email);

  // Check decks
  const {
    data: decks,
    error: decksError,
    count: decksCount,
  } = await supabase.from("decks").select("*", { count: "exact" }).is("deleted_at", null);

  if (decksError) {
    console.error("❌ Error fetching decks:", decksError);
    return;
  }

  console.log(`📦 Total decks: ${decksCount}`);

  if (decks && decks.length > 0) {
    console.log("\n📋 Sample decks:");
    decks.slice(0, 3).forEach((deck) => {
      console.log(`  - ${deck.name} (${deck.status})`);
    });
  } else {
    console.log("⚠️  No decks found in database!");
  }

  // Check cards
  const { count: cardsCount, error: cardsError } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null);

  if (cardsError) {
    console.error("❌ Error fetching cards:", cardsError);
    return;
  }

  console.log(`\n🃏 Total cards: ${cardsCount}`);

  // Check users (if we need to know user_id)
  const { data: users, error: usersError } = await supabase
    .from("decks")
    .select("user_id")
    .is("deleted_at", null)
    .limit(1);

  if (!usersError && users && users.length > 0) {
    console.log(`\n👤 Sample user_id: ${users[0].user_id}`);
  }
}

checkData().catch(console.error);
