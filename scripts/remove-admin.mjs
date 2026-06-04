// Remove an admin by email with confirmation safeguards.
// Usage: node scripts/remove-admin.mjs <email>
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const [, , email] = process.argv;
if (!email) {
  console.error("Usage: node scripts/remove-admin.mjs <email>");
  process.exit(1);
}

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    })
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalized = email.trim().toLowerCase();

// 1. Check if admin exists
const { data: target, error: findError } = await admin
  .from("admins")
  .select("email, name, role")
  .eq("email", normalized)
  .maybeSingle();

if (findError) {
  console.error("ERROR fetching admin:", findError);
  process.exit(1);
}

if (!target) {
  console.error(`❌ Admin not found: ${normalized}`);
  process.exit(1);
}

// 2. Show what we're about to delete
console.log("\n📋 Admin to remove:");
console.log(`   Email: ${target.email}`);
console.log(`   Name:  ${target.name}`);
console.log(`   Role:  ${target.role}`);

// 3. Count remaining superadmins after deletion
const { data: allAdmins, error: countError } = await admin
  .from("admins")
  .select("role")
  .eq("role", "superadmin");

if (countError) {
  console.error("ERROR counting superadmins:", countError);
  process.exit(1);
}

const superadminCount = allAdmins?.length || 0;
const willHave = target.role === "superadmin" ? superadminCount - 1 : superadminCount;

if (willHave === 0) {
  console.log(`\n⚠️  WARNING: This is the LAST superadmin. After deletion, no one can manage the system!`);
}

console.log(`\n📊 Superadmins remaining after deletion: ${willHave}`);

// 4. Ask for confirmation
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\n⚠️  Confirm deletion? (type 'yes' to proceed): ", async (answer) => {
  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("\n❌ Cancelled.");
    process.exit(0);
  }

  // 5. Perform deletion from admins table
  const { error: deleteError, count } = await admin
    .from("admins")
    .delete({ count: "exact" })
    .eq("email", normalized);

  if (deleteError) {
    console.error("\n❌ Deletion failed:", deleteError);
    process.exit(1);
  }

  console.log(`\n✅ Deleted ${count} admin row(s)`);

  // 6. Clean up auth.users entry for a true clean slate
  console.log("\n🔍 Looking up auth.users entry...");
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers({
    filters: { query: normalized },
  });

  if (listError) {
    console.warn("⚠️  Could not list auth users:", listError);
  } else if (users && users.length > 0) {
    const targetUser = users.find((u) => u.email?.toLowerCase() === normalized);
    if (targetUser) {
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUser.id);
      if (deleteAuthError) {
        console.warn(`\n⚠️  Could not delete auth.users entry: ${deleteAuthError.message}`);
        console.log("   (Account removed from admins table, but auth entry still exists)");
      } else {
        console.log(`\n✅ Deleted auth.users entry — account is now a clean slate`);
      }
    } else {
      console.log("\n✅ No auth.users entry found (admins row deleted)");
    }
  } else {
    console.log("\n✅ No auth.users entry found (admins row deleted)");
  }

  // 6. Show remaining admins
  const { data: remaining } = await admin
    .from("admins")
    .select("email, name, role")
    .order("created_at");

  console.log("\n📋 Remaining admins:");
  if (remaining?.length === 0) {
    console.log("   (none)");
  } else {
    for (const a of remaining) {
      console.log(`   ${a.email.padEnd(30)} name=${a.name.padEnd(20)} role=${a.role}`);
    }
  }
});
