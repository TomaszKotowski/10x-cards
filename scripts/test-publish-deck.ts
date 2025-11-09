import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPublishDeck() {
  console.log("🧪 Testing POST /api/decks/:deckId/publish with real database...\n");

  // Sign in as test user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "test@example.com",
    password: "test123456",
  });

  if (authError) {
    console.error("❌ Error signing in:", authError);
    return;
  }

  const token = authData.session.access_token;
  console.log("✅ Signed in as:", authData.user.email);
  console.log("🔑 Token:", token.substring(0, 20) + "...\n");

  // Step 1: Create a test deck with cards
  console.log("📝 Step 1: Creating test deck with cards...");

  // Create deck
  const { data: deck, error: deckError } = await supabase
    .from("decks")
    .insert({
      name: "Test Deck for Publishing",
      user_id: authData.user.id,
      status: "draft",
    })
    .select()
    .single();

  if (deckError || !deck) {
    console.error("❌ Error creating deck:", deckError);
    return;
  }

  console.log(`✅ Created deck: ${deck.id}`);

  // Create 5 test cards
  const cards = Array.from({ length: 5 }, (_, i) => ({
    deck_id: deck.id,
    front: `Front ${i + 1}`,
    back: `Back ${i + 1}`,
    position: i + 1,
  }));

  const { error: cardsError } = await supabase.from("cards").insert(cards);

  if (cardsError) {
    console.error("❌ Error creating cards:", cardsError);
    return;
  }

  console.log(`✅ Created ${cards.length} cards\n`);

  // Test 1: Publish the deck (SUCCESS)
  console.log("📋 Test 1: POST /api/decks/:deckId/publish (SUCCESS)");
  const response1 = await fetch(`http://localhost:3000/api/decks/${deck.id}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data1 = await response1.json();
  console.log(`Status: ${response1.status}`);
  console.log("Response:", JSON.stringify(data1, null, 2));
  console.log();

  // Test 2: Try to publish again (SHOULD FAIL - deck not draft)
  console.log("📋 Test 2: POST /api/decks/:deckId/publish (FAIL - already published)");
  const response2 = await fetch(`http://localhost:3000/api/decks/${deck.id}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data2 = await response2.json();
  console.log(`Status: ${response2.status}`);
  console.log("Response:", JSON.stringify(data2, null, 2));
  console.log();

  // Test 3: Invalid UUID format
  console.log("📋 Test 3: POST /api/decks/:deckId/publish (FAIL - invalid UUID)");
  const response3 = await fetch("http://localhost:3000/api/decks/invalid-uuid/publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data3 = await response3.json();
  console.log(`Status: ${response3.status}`);
  console.log("Response:", JSON.stringify(data3, null, 2));
  console.log();

  // Test 4: Non-existent deck
  console.log("📋 Test 4: POST /api/decks/:deckId/publish (FAIL - deck not found)");
  const response4 = await fetch("http://localhost:3000/api/decks/00000000-0000-0000-0000-000000000999/publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data4 = await response4.json();
  console.log(`Status: ${response4.status}`);
  console.log("Response:", JSON.stringify(data4, null, 2));
  console.log();

  // Test 5: Create deck with 0 cards and try to publish
  console.log("📋 Test 5: POST /api/decks/:deckId/publish (FAIL - no cards)");

  const { data: emptyDeck, error: emptyDeckError } = await supabase
    .from("decks")
    .insert({
      name: "Empty Deck",
      user_id: authData.user.id,
      status: "draft",
    })
    .select()
    .single();

  if (emptyDeckError || !emptyDeck) {
    console.error("❌ Error creating empty deck:", emptyDeckError);
    return;
  }

  const response5 = await fetch(`http://localhost:3000/api/decks/${emptyDeck.id}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data5 = await response5.json();
  console.log(`Status: ${response5.status}`);
  console.log("Response:", JSON.stringify(data5, null, 2));
  console.log();

  // Test 6: Unauthorized (no token)
  console.log("📋 Test 6: POST /api/decks/:deckId/publish (FAIL - unauthorized)");
  const response6 = await fetch(`http://localhost:3000/api/decks/${deck.id}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data6 = await response6.json();
  console.log(`Status: ${response6.status}`);
  console.log("Response:", JSON.stringify(data6, null, 2));
  console.log();

  // Cleanup: Delete test decks
  console.log("🧹 Cleaning up test data...");
  await supabase.from("decks").delete().eq("id", deck.id);
  await supabase.from("decks").delete().eq("id", emptyDeck.id);
  console.log("✅ Cleanup complete");

  console.log("\n✅ All tests completed!");
}

testPublishDeck().catch(console.error);
