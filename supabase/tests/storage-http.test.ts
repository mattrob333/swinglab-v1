// End-to-end RLS/storage checks against a running Supabase stack, over HTTP.
//
//   npx supabase start
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
//   SUPABASE_TEST_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `supabase status`> \
//   SUPABASE_TEST_SECRET_KEY=<SECRET_KEY from `supabase status`> \
//   node --test --experimental-strip-types supabase/tests/storage-http.test.ts
//
// Never point this at production: it creates and deletes test users.
// Skips itself when the variables are not set (so `npm test` stays offline).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const publishable = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_TEST_SECRET_KEY;
const enabled = Boolean(url && publishable && secret);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const created: string[] = [];

async function makeUser(admin: SupabaseClient, email: string, isAdmin: boolean) {
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  if (isAdmin) {
    const { error: e2 } = await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
    if (e2) throw e2;
  }
  const client = createClient(url!, publishable!, opts);
  const { error: e3 } = await client.auth.signInWithPassword({ email, password });
  if (e3) throw e3;
  return { id: data.user.id, client };
}

test("storage and table RLS over HTTP", { skip: !enabled && "SUPABASE_TEST_* not set" }, async (t) => {
  const admin = createClient(url!, secret!, opts);
  const anon = createClient(url!, publishable!, opts);
  const tag = crypto.randomUUID().slice(0, 8);
  t.after(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });
  const a = await makeUser(admin, `dad-${tag}@test.local`, true);
  const b = await makeUser(admin, `kid-${tag}@test.local`, false);

  const proId = crypto.randomUUID();
  const kidId = crypto.randomUUID();
  const proPath = `${a.id}/${proId}.mp4`;
  const kidPath = `${b.id}/${kidId}.mp4`;
  const video = new Blob([new Uint8Array(1024)], { type: "video/mp4" });

  try {
    await t.test("public sign-up is disabled", async () => {
      const { error } = await anon.auth.signUp({ email: `x-${tag}@test.local`, password: "password-123" });
      assert.ok(error, "signUp should fail");
    });

    await t.test("owners upload into their own folder", async () => {
      assert.equal((await a.client.storage.from("clips").upload(proPath, video)).error, null);
      assert.equal((await b.client.storage.from("clips").upload(kidPath, video)).error, null);
      const r1 = await a.client.from("clips").insert({ id: proId, owner_id: a.id, kind: "pro", title: "Pro", storage_path: proPath });
      assert.equal(r1.error, null);
      const r2 = await b.client.from("clips").insert({ id: kidId, owner_id: b.id, kind: "athlete", title: "Kid", storage_path: kidPath });
      assert.equal(r2.error, null);
    });

    await t.test("anon reads nothing", async () => {
      const rows = await anon.from("clips").select("id");
      assert.ok(rows.error || rows.data?.length === 0, "anon must not list clips");
      const dl = await anon.storage.from("clips").download(proPath);
      assert.ok(dl.error, "anon download must fail");
      const signed = await anon.storage.from("clips").createSignedUrl(proPath, 60);
      assert.ok(signed.error, "anon cannot sign URLs");
    });

    await t.test("bucket is private: public URL fails, signed URL works", async () => {
      const publicUrl = a.client.storage.from("clips").getPublicUrl(proPath).data.publicUrl;
      const pub = await fetch(publicUrl);
      assert.ok(pub.status >= 400, `public URL returned ${pub.status}`);
      await pub.body?.cancel();
      const { data, error } = await b.client.storage.from("clips").createSignedUrl(proPath, 60);
      assert.equal(error, null);
      const res = await fetch(data!.signedUrl);
      assert.equal(res.status, 200);
      assert.equal((await res.arrayBuffer()).byteLength, 1024);
    });

    await t.test("non-admin cannot insert pro clips", async () => {
      const r = await b.client.from("clips").insert({ id: crypto.randomUUID(), owner_id: b.id, kind: "pro", title: "fake" });
      assert.ok(r.error, "expected RLS violation");
    });

    await t.test("user B cannot modify A's rows or objects", async () => {
      const up = await b.client.from("clips").update({ title: "hacked" }).eq("id", proId).select();
      assert.equal(up.data?.length ?? 0, 0);
      const del = await b.client.from("clips").delete().eq("id", proId).select();
      assert.equal(del.data?.length ?? 0, 0);
      const over = await b.client.storage.from("clips").upload(proPath, video, { upsert: true });
      assert.ok(over.error, "overwrite of A's object must fail");
      const into = await b.client.storage.from("clips").upload(`${a.id}/${crypto.randomUUID()}.mp4`, video);
      assert.ok(into.error, "upload into A's folder must fail");
      await b.client.storage.from("clips").remove([proPath]);
      const still = await admin.storage.from("clips").download(proPath);
      assert.equal(still.error, null, "A's object must survive B's delete");
      const row = await admin.from("clips").select("title").eq("id", proId).single();
      assert.equal(row.data?.title, "Pro");
    });

    await t.test("user A cannot modify B's rows or objects", async () => {
      const up = await a.client.from("clips").update({ title: "dad" }).eq("id", kidId).select();
      assert.equal(up.data?.length ?? 0, 0);
      const over = await a.client.storage.from("clips").upload(kidPath, video, { upsert: true });
      assert.ok(over.error);
    });

    await t.test("bucket rejects disallowed mime types", async () => {
      const html = new Blob(["<script>alert(1)</script>"], { type: "text/html" });
      const r = await b.client.storage.from("clips").upload(`${b.id}/${crypto.randomUUID()}.mp4`, html, { contentType: "text/html" });
      assert.ok(r.error);
    });
  } finally {
    await admin.storage.from("clips").remove([proPath, kidPath]);
    await admin.from("clips").delete().in("id", [proId, kidId]);
  }
});
