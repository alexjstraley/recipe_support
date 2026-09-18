(function (root) {
  function decode(data, user, defaults) {
    const record = (row, isRecipe) => ({
      id: row.id, ownerId: row.owner_id,
      owner: row.owner_id === user.id ? user.email : "another member",
      sharedWith: row.shares || [], createdAt: row.created_at,
      updatedAt: row.updated_at, _version: row.updated_at,
      ...(isRecipe ? { title: row.title, servings: row.servings == null ? null : Number(row.servings), instructions: row.instructions,
        ingredients: row.ingredients.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, tag: i.tag })) }
        : { name: row.name, items: row.items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, tag: i.tag, done: i.checked, addedAt: i.created_at })) })
    });
    return { ...structuredClone(defaults),
      recipes: data.recipes.map(r => record(r, true)),
      lists: data.lists.map(r => record(r, false)),
      commonItems: data.profile?.preferences?.commonItems || structuredClone(defaults.commonItems),
      removedCommonItems: data.profile?.preferences?.removedCommonItems || [],
      itemTags: { [user.email]: data.tags || {} },
      _profileVersion: data.profile?.updated_at || null
    };
  }
  function changes(before, after, user) {
    const result = [];
    for (const [collection, kind] of [["recipes", "recipe"], ["lists", "list"]]) {
      const old = new Map(before[collection].filter(r => r.ownerId === user.id).map(r => [r.id, r]));
      for (const row of after[collection]) {
        if (row.ownerId !== user.id) continue;
        const previous = old.get(row.id);
        if (JSON.stringify(previous) !== JSON.stringify(row)) {
          result.push({ kind, id: row.id, version: previous?._version || null, operation: "save", data: row });
        }
        old.delete(row.id);
      }
      for (const row of old.values()) result.push({ kind, id: row.id, version: row._version, operation: "delete" });
    }
    const prefs = s => ({ preferences: { commonItems: s.commonItems, removedCommonItems: s.removedCommonItems }, tags: s.itemTags[user.email] || {} });
    if (JSON.stringify(prefs(before)) !== JSON.stringify(prefs(after))) {
      result.push({ kind: "preferences", version: before._profileVersion, data: prefs(after) });
    }
    return result;
  }
  async function legacyRecords(legacy, user) {
    // Stable IDs make repeating an interrupted import safe; never migrate credentials.
    async function stableId(value) {
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.id + ":" + value)));
      bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
      const hex = [...bytes.slice(0,16)].map(b => b.toString(16).padStart(2,"0")).join("");
      return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
    }
    const output = { recipes: [], lists: [] };
    for (const [collection, field] of [["recipes","ingredients"],["lists","items"]]) {
      for (const row of legacy[collection] || []) {
        if (row.owner?.trim().toLowerCase() !== user.email.toLowerCase()) continue;
        const copy = structuredClone(row);
        copy.id = await stableId(collection + ":" + row.id);
        copy.ownerId = user.id; copy.owner = user.email; delete copy._version;
        copy.sharedWith = [...new Set((row.sharedWith || []).map(e => e.trim().toLowerCase()).filter(Boolean))];
        copy[field] = await Promise.all((row[field] || []).map(async (value, index) => ({
          ...(typeof value === "string" ? { name: value, quantity: "", tag: "" } : value),
          id: await stableId(collection + ":" + row.id + ":" + index)
        })));
        output[collection].push(copy);
      }
    }
    return output;
  }
  const api = { decode, changes, legacyRecords };
  if (typeof module !== "undefined") module.exports = api;
  else root.CloudStore = api;
})(globalThis);
