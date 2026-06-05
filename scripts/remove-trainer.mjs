// Remove a trainer by email with confirmation safeguards.
// If the trainer has no orders or commissions, performs a HARD delete
// (all onboarding data + auth user), freeing the email for re-registration.
// If the trainer has dependencies, performs a soft delete (suspend + revoke codes).
//
// Usage: node scripts/remove-trainer.mjs <email>
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const [, , email] = process.argv;
if (!email) {
  console.error("Usage: node scripts/remove-trainer.mjs <email>");
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

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalized = email.trim().toLowerCase();

// 1. Find trainer
const { data: trainer, error: findError } = await supabase
  .from("trainers")
  .select("id, email, name, status, city, country")
  .eq("email", normalized)
  .maybeSingle();

if (findError) {
  console.error("ERROR fetching trainer:", findError);
  process.exit(1);
}

if (!trainer) {
  console.error(`❌ Trainer not found: ${normalized}`);
  process.exit(1);
}

// 2. Show trainer info
console.log("\n📋 Trainer to remove:");
console.log(`   Email:    ${trainer.email}`);
console.log(`   Name:     ${trainer.name}`);
console.log(`   Status:   ${trainer.status}`);
console.log(`   City:     ${trainer.city}`);
console.log(`   Country:  ${trainer.country}`);
console.log(`   ID:       ${trainer.id}`);

// 3. Check FK dependencies
const [{ count: orderCount }, { count: commissionCount }] = await Promise.all([
  supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", trainer.id),
  supabase
    .from("commissions")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", trainer.id),
]);

const hasDependencies = (orderCount ?? 0) > 0 || (commissionCount ?? 0) > 0;

if (hasDependencies) {
  console.log(`\n⚠️  Trainer has FK dependencies — will SOFT-DELETE (suspend):`);
  console.log(`   Orders:      ${orderCount ?? 0}`);
  console.log(`   Commissions: ${commissionCount ?? 0}`);
  console.log(`\n   The trainer row will be kept (status → suspended) and access codes revoked.`);
  console.log(`   The auth user will NOT be deleted (email stays locked).`);
} else {
  console.log(`\n✅ No orders or commissions — will HARD-DELETE (full removal):`);
  console.log(`   • All onboarding data (agreement, payout details, training progress, qualifications, application details)`);
  console.log(`   • Access codes`);
  console.log(`   • Trainer row`);
  console.log(`   • Auth user (frees email for re-registration)`);
}

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

  if (hasDependencies) {
    // Soft-delete: suspend + revoke codes
    const { error: suspendError } = await supabase
      .from("trainers")
      .update({ status: "suspended" })
      .eq("id", trainer.id);

    if (suspendError) {
      console.error("\n❌ Suspend failed:", suspendError);
      process.exit(1);
    }
    console.log("\n✅ Trainer status set to 'suspended'");

    const { error: revokeError } = await supabase
      .from("access_codes")
      .update({ status: "revoked" })
      .eq("trainer_id", trainer.id)
      .eq("status", "active");

    if (revokeError) {
      console.error("\n❌ Code revocation failed:", revokeError);
      process.exit(1);
    }
    console.log("✅ Active access codes revoked");

    console.log("\n⚠️  Trainer row preserved (has orders/commissions). Email NOT freed.");
  } else {
    // Hard-delete: remove all related data in FK-safe order
    const tables = [
      "trainer_agreement",
      "trainer_payout_details",
      "trainer_training_progress",
      "trainer_qualifications",
      "trainer_application_details",
      "access_codes",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("trainer_id", trainer.id);
      if (error) {
        console.error(`\n❌ Failed to delete from ${table}:`, error);
        process.exit(1);
      }
      console.log(`✅ Deleted from ${table}`);
    }

    // Delete the trainer row itself
    const { error: trainerDeleteError } = await supabase
      .from("trainers")
      .delete()
      .eq("id", trainer.id);

    if (trainerDeleteError) {
      console.error("\n❌ Failed to delete trainer row:", trainerDeleteError);
      process.exit(1);
    }
    console.log("✅ Deleted trainer row");

    // Delete the auth user to free the email for re-registration
    console.log("\n🔍 Looking up auth.users entry...");
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers({
      filters: { query: normalized },
    });

    if (listError) {
      console.warn("⚠️  Could not list auth users:", listError);
    } else if (users && users.length > 0) {
      const targetUser = users.find(
        (u) => u.email?.toLowerCase() === normalized,
      );
      if (targetUser) {
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(
          targetUser.id,
        );
        if (deleteAuthError) {
          console.warn(
            `\n⚠️  Could not delete auth.users entry: ${deleteAuthError.message}`,
          );
          console.log(
            "   (Trainer row deleted, but auth entry still exists — email may still be locked)",
          );
        } else {
          console.log(
            "\n✅ Deleted auth.users entry — email is now free for re-registration",
          );
        }
      } else {
        console.log("\n✅ No matching auth.users entry found (trainer row deleted)");
      }
    } else {
      console.log("\n✅ No matching auth.users entry found (trainer row deleted)");
    }
  }

  // 5. Show remaining trainers
  const { data: remaining } = await supabase
    .from("trainers")
    .select("email, name, status")
    .order("created_at");

  console.log("\n📋 Remaining trainers:");
  if (!remaining || remaining.length === 0) {
    console.log("   (none)");
  } else {
    for (const t of remaining) {
      console.log(
        `   ${t.email.padEnd(30)} name=${t.name.padEnd(20)} status=${t.status}`,
      );
    }
  }
});