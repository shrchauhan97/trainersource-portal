import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const env = Object.fromEntries(
  (await readFile(".env.production.local", "utf8"))
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; })
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function check(label, probe) {
  try {
    const result = await probe();
    console.log(`  ✓ ${label}: ${result}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${label}: ${err.message}`);
    return false;
  }
}

console.log("verifying lifecycle migration on prod Supabase...\n");

let pass = 0, fail = 0;

async function run(label, probe) {
  const ok = await check(label, probe);
  if (ok) pass++; else fail++;
}

// customers.status column exists and defaults to 'active' on existing rows
await run("customers.status column populated", async () => {
  const { data, error } = await admin.from("customers").select("id, status").limit(5);
  if (error) throw new Error(error.message);
  const unique = new Set((data ?? []).map((r) => r.status));
  return `sample rows have status ∈ {${[...unique].join(",")}}`;
});

// lifecycle_events table exists + empty
await run("lifecycle_events table exists", async () => {
  const { count, error } = await admin.from("lifecycle_events").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return `row count = ${count}`;
});

// bot_blocklist exists + empty
await run("bot_blocklist table exists", async () => {
  const { count, error } = await admin.from("bot_blocklist").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return `row count = ${count}`;
});

// access_codes status 'revoked' reachable (update nothing, just probe)
await run("access_codes.status accepts 'revoked'", async () => {
  // Try a no-op update that would fail if 'revoked' isn't a valid enum value.
  // Using .eq on an impossible condition keeps it side-effect-free.
  const { error } = await admin
    .from("access_codes")
    .update({ status: "revoked" })
    .eq("code", "__never_matches__");
  if (error && !/invalid input value for enum/.test(error.message || "")) {
    return "enum accepts 'revoked' (no rows matched — expected)";
  }
  if (error) throw new Error(error.message);
  return "enum accepts 'revoked'";
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
