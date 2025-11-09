import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/db/database.types";

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseServiceKey = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"; // Service role key for admin operations

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

// Test user ID (you can change this to match your auth.users table)
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

async function seedDatabase() {
  console.log("🌱 Seeding database with test data...\n");

  try {
    // First, ensure we have a test user (create if doesn't exist)
    const { data: existingUser } = await supabase.auth.admin.getUserById(TEST_USER_ID);

    if (!existingUser.user) {
      console.log("👤 Creating test user...");
      const { error: userError } = await supabase.auth.admin.createUser({
        id: TEST_USER_ID,
        email: "test@example.com",
        password: "test123456",
        email_confirm: true,
      });

      if (userError) {
        console.error("❌ Error creating user:", userError);
        return;
      }
      console.log("✅ Test user created");
    } else {
      console.log("✅ Test user already exists");
    }

    // Create test decks
    console.log("\n📦 Creating test decks...");

    const decks = [
      {
        user_id: TEST_USER_ID,
        name: "Historia Polski - Średniowiecze",
        slug: "historia-polski-sredniowiecze",
        status: "draft" as const,
        published_at: null,
        rejected_at: null,
        rejected_reason: null,
      },
      {
        user_id: TEST_USER_ID,
        name: "Matematyka - Pochodne",
        slug: "matematyka-pochodne",
        status: "draft" as const,
        published_at: null,
        rejected_at: null,
        rejected_reason: null,
      },
      {
        user_id: TEST_USER_ID,
        name: "Angielski - Phrasal Verbs",
        slug: "angielski-phrasal-verbs",
        status: "draft" as const,
        published_at: null,
        rejected_at: null,
        rejected_reason: null,
      },
      {
        user_id: TEST_USER_ID,
        name: "Fizyka - Mechanika",
        slug: "fizyka-mechanika",
        status: "published" as const,
        published_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        rejected_at: null,
        rejected_reason: null,
      },
      {
        user_id: TEST_USER_ID,
        name: "Chemia - Układ Okresowy",
        slug: "chemia-uklad-okresowy",
        status: "published" as const,
        published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        rejected_at: null,
        rejected_reason: null,
      },
      {
        user_id: TEST_USER_ID,
        name: "Geografia - Stolice Europy",
        slug: "geografia-stolice-europy",
        status: "published" as const,
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        rejected_at: null,
        rejected_reason: null,
      },
      {
        user_id: TEST_USER_ID,
        name: "Biologia - Komórka",
        slug: "biologia-komorka",
        status: "rejected" as const,
        published_at: null,
        rejected_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        rejected_reason: "Zbyt mało kart w talii",
      },
      {
        user_id: TEST_USER_ID,
        name: "Informatyka - Algorytmy",
        slug: "informatyka-algorytmy",
        status: "rejected" as const,
        published_at: null,
        rejected_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        rejected_reason: "Karty wymagają poprawy jakości",
      },
    ];

    const { data: insertedDecks, error: decksError } = await supabase.from("decks").insert(decks).select();

    if (decksError) {
      console.error("❌ Error creating decks:", decksError);
      return;
    }

    console.log(`✅ Created ${insertedDecks?.length} decks`);

    // Create test cards for each deck
    console.log("\n🃏 Creating test cards...");

    const cardCounts = [5, 8, 3, 15, 12, 20, 2, 1]; // Cards per deck

    for (let i = 0; i < insertedDecks!.length; i++) {
      const deck = insertedDecks![i];
      const count = cardCounts[i];

      const cards = Array.from({ length: count }, (_, j) => ({
        deck_id: deck.id,
        front: `Pytanie ${j + 1} dla talii "${deck.name}"`,
        back: `Odpowiedź ${j + 1}`,
        hint: j % 3 === 0 ? `Wskazówka ${j + 1}` : null,
        position: j + 1, // 1-based indexing
      }));

      const { error: cardsError } = await supabase.from("cards").insert(cards);

      if (cardsError) {
        console.error(`❌ Error creating cards for deck ${deck.name}:`, cardsError);
      } else {
        console.log(`  ✅ Created ${count} cards for "${deck.name}"`);
      }
    }

    console.log("\n✨ Database seeding completed successfully!");
    console.log(`\n📝 Test user credentials:`);
    console.log(`   Email: test@example.com`);
    console.log(`   Password: test123456`);
    console.log(`   User ID: ${TEST_USER_ID}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
}

seedDatabase().catch(console.error);
