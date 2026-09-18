const { test } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../cloud-store");
const user = { id: "user-1", email: "owner@example.com" };
const defaults = { recipes: [], lists: [], commonItems: [], removedCommonItems: [], itemTags: {} };
test("decode keeps unspecified servings blank", () => {
  const row = { id: "r", owner_id: user.id, title: "Soup", servings: null, ingredients: [] };
  const state = store.decode({ recipes: [row], lists: [], tags: {}, profile: null }, user, defaults);
  assert.equal(state.recipes[0].servings, null);
});
test("decode preserves versions and checked state; another owner's record is never written", () => {
  const row = { id: "r", owner_id: "other", title: "Shared", servings: "2", instructions: "", ingredients: [], shares: [user.email], updated_at: "version" };
  const state = store.decode({ recipes: [row], lists: [], tags: {}, profile: null }, user, defaults);
  assert.equal(state.recipes[0]._version, "version");
  const edited = structuredClone(state); edited.recipes[0].title = "Forged";
  assert.deepEqual(store.changes(state, edited, user), []);
});
test("diff sends only changed records and versioned deletes", () => {
  const before = { ...defaults, recipes: [{ id: "a", ownerId: user.id, _version: "v1" }, { id: "b", ownerId: user.id, _version: "v2" }] };
  const after = structuredClone(before); after.recipes.shift();
  assert.deepEqual(store.changes(before, after, user), [{ kind: "recipe", id: "a", version: "v1", operation: "delete" }]);
});
test("legacy import is deterministic, scoped to the matching email, and excludes credentials", async () => {
  const legacy = { users: { secret: "do not copy" }, recipes: [{ id: "recipe-old", owner: user.email, title: "Soup", ingredients: ["Beans"], sharedWith: [] }, { id: "other", owner: "other@example.com" }], lists: [] };
  const one = await store.legacyRecords(legacy, user);
  assert.deepEqual(one, await store.legacyRecords(legacy, user));
  assert.equal(one.recipes.length, 1);
  assert.match(one.recipes[0].id, /^[a-f0-9-]{36}$/);
  assert.equal(one.recipes[0].ingredients[0].name, "Beans");
  assert.equal(one.users, undefined);
});
