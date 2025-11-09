import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testApiWithRealDb() {
  console.log("🧪 Testing GET /api/decks with real database...\n");

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

  // Test 1: Get all decks
  console.log("📋 Test 1: GET /api/decks (all decks)");
  const response1 = await fetch("http://localhost:3000/api/decks", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data1 = await response1.json();
  console.log(`Status: ${response1.status}`);
  console.log(`Total decks: ${data1.pagination?.total || 0}`);
  console.log(`Returned: ${data1.data?.length || 0} decks\n`);

  // Test 2: Filter by status=draft
  console.log("📋 Test 2: GET /api/decks?status=draft");
  const response2 = await fetch("http://localhost:3000/api/decks?status=draft", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data2 = await response2.json();
  console.log(`Status: ${response2.status}`);
  console.log(`Draft decks: ${data2.data?.length || 0}`);
  if (data2.data && data2.data.length > 0) {
    console.log(`Sample: ${data2.data[0].name} (${data2.data[0].card_count} cards)\n`);
  }

  // Test 3: Filter by status=published
  console.log("📋 Test 3: GET /api/decks?status=published");
  const response3 = await fetch("http://localhost:3000/api/decks?status=published", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data3 = await response3.json();
  console.log(`Status: ${response3.status}`);
  console.log(`Published decks: ${data3.data?.length || 0}\n`);

  // Test 4: Pagination
  console.log("📋 Test 4: GET /api/decks?limit=2&offset=0");
  const response4 = await fetch("http://localhost:3000/api/decks?limit=2&offset=0", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data4 = await response4.json();
  console.log(`Status: ${response4.status}`);
  console.log(
    `Pagination: limit=${data4.pagination?.limit}, offset=${data4.pagination?.offset}, total=${data4.pagination?.total}`
  );
  console.log(`Returned: ${data4.data?.length || 0} decks\n`);

  // Test 5: Sorting
  console.log("📋 Test 5: GET /api/decks?sort=created_at_asc");
  const response5 = await fetch("http://localhost:3000/api/decks?sort=created_at_asc", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data5 = await response5.json();
  console.log(`Status: ${response5.status}`);
  if (data5.data && data5.data.length > 0) {
    console.log(`First deck (oldest): ${data5.data[0].name}\n`);
  }

  // Test 6: Unauthorized (no token)
  console.log("📋 Test 6: GET /api/decks (no auth token)");
  const response6 = await fetch("http://localhost:3000/api/decks");

  const data6 = await response6.json();
  console.log(`Status: ${response6.status}`);
  console.log(`Error: ${data6.error}`);
  console.log(`Message: ${data6.message}\n`);

  // Test 7: Invalid parameter
  console.log("📋 Test 7: GET /api/decks?limit=200 (validation error)");
  const response7 = await fetch("http://localhost:3000/api/decks?limit=200", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data7 = await response7.json();
  console.log(`Status: ${response7.status}`);
  console.log(`Error: ${data7.error}`);
  console.log(`Message: ${data7.message}\n`);

  console.log("✅ All tests completed!");
}

testApiWithRealDb().catch(console.error);
