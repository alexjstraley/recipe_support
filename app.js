const STORAGE_KEY = "recipe-support-state-v1";
const cloud = window.supabase.createClient(window.RECIPE_SUPABASE.url, window.RECIPE_SUPABASE.publishableKey, { global: { fetch: RecipeNetwork.timedFetch } });
let sessionUser = null;
let savedState = null;
let busy = false;
let saveScheduled = false;
let authGeneration = 0;
let failedDraft = null;
let saveInFlight = false;
let recipeDirty = false;

const COMMON_ITEMS = [
  { name: "Apples", tag: "green" },
  { name: "Avocado", tag: "green" },
  { name: "Bananas", tag: "green" },
  { name: "Bell peppers", tag: "green" },
  { name: "Blueberries", tag: "green" },
  { name: "Broccoli", tag: "green" },
  { name: "Carrots", tag: "green" },
  { name: "Cucumbers", tag: "green" },
  { name: "Garlic", tag: "green" },
  { name: "Kale", tag: "green" },
  { name: "Lemons", tag: "green" },
  { name: "Lettuce", tag: "green" },
  { name: "Limes", tag: "green" },
  { name: "Mushrooms", tag: "green" },
  { name: "Onions", tag: "green" },
  { name: "Oranges", tag: "green" },
  { name: "Potatoes", tag: "green" },
  { name: "Spinach", tag: "green" },
  { name: "Strawberries", tag: "green" },
  { name: "Sweet potatoes", tag: "green" },
  { name: "Tomatoes", tag: "green" },
  { name: "Zucchini", tag: "green" },
  { name: "Almonds", tag: "orange" },
  { name: "Bagels", tag: "orange" },
  { name: "Bread", tag: "orange" },
  { name: "Cashews", tag: "orange" },
  { name: "Oats", tag: "orange" },
  { name: "Pasta", tag: "orange" },
  { name: "Peanut butter", tag: "orange" },
  { name: "Pita", tag: "orange" },
  { name: "Sourdough", tag: "orange" },
  { name: "Spaghetti", tag: "orange" },
  { name: "Tortillas", tag: "orange" },
  { name: "Walnuts", tag: "orange" },
  { name: "Beyond Sausage", tag: "red" },
  { name: "Seitan", tag: "red" },
  { name: "Tofu", tag: "red" },
  { name: "Almond milk", tag: "blue" },
  { name: "Coffee", tag: "blue" },
  { name: "Coconut milk", tag: "blue" },
  { name: "Kombucha", tag: "blue" },
  { name: "Oat milk", tag: "blue" },
  { name: "Orange juice", tag: "blue" },
  { name: "Sparkling water", tag: "blue" },
  { name: "Tea", tag: "blue" },
  { name: "Vegetable broth", tag: "blue" },
  { name: "Frozen berries", tag: "purple" },
  { name: "Frozen corn", tag: "purple" },
  { name: "Frozen edamame", tag: "purple" },
  { name: "Frozen fruit", tag: "purple" },
  { name: "Frozen peas", tag: "purple" },
  { name: "Frozen spinach", tag: "purple" },
  { name: "Frozen vegetables", tag: "purple" },
  { name: "Frozen waffles", tag: "purple" },
  { name: "Cheddar cheese", tag: "yellow" },
  { name: "Cottage cheese", tag: "yellow" },
  { name: "Cream cheese", tag: "yellow" },
  { name: "Feta", tag: "yellow" },
  { name: "Goat cheese", tag: "yellow" },
  { name: "Mozzarella", tag: "yellow" },
  { name: "Parmesan", tag: "yellow" },
  { name: "Ricotta", tag: "yellow" }
];

const defaultState = {
  users: {},
  recipes: [],
  lists: [],
  itemTags: {},
  commonItems: COMMON_ITEMS,
  removedCommonItems: []
};

const TAGS = ["green", "orange", "red", "blue", "purple", "yellow", "pink"];
const TAG_LABELS = {
  green: "Veg",
  orange: "Dry",
  red: "Protein",
  blue: "Liquid",
  purple: "Frozen",
  yellow: "Cheese",
  pink: "Home"
};

let state = ensureState(structuredClone(defaultState));
let sessionEmail = null;
let authMode = "signin";
let editingRecipeId = null;
let creatingRecipe = false;
let activeListId = null;
let editingItemRef = null;
let manageItems = false;
let manageRecipeIngredients = false;
let editingRecipeIngredientRef = null;
let draftRecipeIngredients = [];
let editingIngredientId = null;
let planningRecipes = false;
let plannedRecipeIds = new Set();

const $ = (selector) => document.querySelector(selector);
const emptyTemplate = $("#empty-state-template");

const authScreen = $("#auth-screen");
const appScreen = $("#app-screen");
const authForm = $("#auth-form");
const authMessage = $("#auth-message");
const authSubmit = $("#auth-submit");
const recipeForm = $("#recipe-form");
const recipeImportForm = $("#recipe-import-form");
const recipeTextImportForm = $("#recipe-text-import-form");
const listForm = $("#list-form");
const listDetailsForm = $("#list-details-form");
const accountForm = $("#account-form");
const standardItemForm = $("#standard-item-form");

function loadState() {
  try {
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...structuredClone(defaultState), recipes: Array.isArray(legacy?.recipes) ? legacy.recipes : [], lists: Array.isArray(legacy?.lists) ? legacy.lists : [] };
  } catch {
    return structuredClone(defaultState);
  }
}

function ensureState(nextState) {
  const existingCommonItems = nextState.commonItems || [];
  const removedCommonItems = nextState.removedCommonItems || [];
  const removedNames = new Set(removedCommonItems.map(normalizeItemName));
  const commonItemsByName = Object.fromEntries(existingCommonItems.map((item) => [normalizeItemName(item.name), item]));
  COMMON_ITEMS.forEach((item) => {
    const normalizedName = normalizeItemName(item.name);
    if (!Object.hasOwn(commonItemsByName, normalizedName) && !removedNames.has(normalizedName)) {
      commonItemsByName[normalizedName] = { ...item, tag: normalizeTag(item.tag) };
    }
  });

  Object.values(nextState.itemTags || {}).forEach((tags) => {
    Object.keys(tags).forEach((name) => {
      tags[name] = normalizeTag(tags[name]);
    });
  });
  (nextState.lists || []).forEach((list) => {
    (list.items || []).forEach((item) => {
      item.tag = normalizeTag(item.tag);
    });
  });
  (nextState.recipes || []).forEach((recipe) => {
    (recipe.ingredients || []).forEach((ingredient) => {
      if (typeof ingredient !== "string") ingredient.tag = normalizeTag(ingredient.tag);
    });
  });

  return {
    ...nextState,
    removedCommonItems,
    commonItems: Object.values(commonItemsByName)
      .map((item) => ({ ...item, tag: normalizeTag(item.tag) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

function saveState() {
  // Coalesce nested synchronous edits (learning tags and adding an item) into one save.
  if (saveScheduled) return;
  if (saveInFlight) {
    setStatus("A save is already in progress. Wait before making another change.", true);
    return;
  }
  saveScheduled = true;
  setBusy(true, "Saving…");
  const generation = authGeneration;
  queueMicrotask(async () => {
    saveScheduled = false;
    if (generation !== authGeneration) return;
    saveInFlight = true;
    const draft = structuredClone(state);
    if (!failedDraft) rememberRecoveryDraft(draft);
    try {
      if (!sessionUser || !savedState) throw new Error("Sign in before saving.");
      const changes = CloudStore.changes(savedState, draft, sessionUser);
      if (changes.length) {
        const { data, error } = await cloud.rpc("save_workspace", { changes });
        if (error) throw error;
        if (generation !== authGeneration) return;
        state = ensureState(CloudStore.decode(data, sessionUser, defaultState));
        savedState = structuredClone(state);
      }
      if (!failedDraft) forgetRecoveryDraft();
      updateRecoveryActions();
      setStatus("Saved to Supabase");
      renderCommonItemOptions();
      if (changes.some(change => change.kind !== "preferences")) render();
    } catch (error) {
      if (generation !== authGeneration) return;
      failedDraft = draft;
      rememberRecoveryDraft(draft);
      updateRecoveryActions();
      state = structuredClone(savedState || defaultState);
      render();
      setStatus("Save failed: " + error.message + " Your unsaved changes can be downloaded. Refresh before trying again.", true);
    } finally {
      if (generation === authGeneration) { saveInFlight = false; setBusy(false); }
    }
  });
}

function setStatus(message, error = false) {
  $("#sync-status").textContent = message;
  $("#sync-status").classList.toggle("sync-error", error);
}
function setBusy(value, message) {
  busy = value;
  appScreen.inert = value;
  document.querySelectorAll("dialog").forEach(dialog => { dialog.inert = value; });
  if (message) setStatus(message);
}
function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshWorkspace() {
  if (!sessionUser || busy) return;
  if (recipeDirty) { setStatus("Save your recipe draft or start a new recipe before refreshing.", true); return; }
  const generation = authGeneration;
  setBusy(true, "Loading from Supabase…");
  try {
    const { data, error } = await cloud.rpc("load_workspace");
    if (error) throw error;
    if (generation !== authGeneration) return;
    state = ensureState(CloudStore.decode(data, sessionUser, defaultState));
    savedState = structuredClone(state);
    renderCommonItemOptions(); render();
    setStatus("Up to date");
  } catch (error) { if (generation === authGeneration) setStatus("Could not refresh: " + error.message, true); }
  finally { if (generation === authGeneration) setBusy(false); }
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function parseEmails(value) {
  return value
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

function id() {
  return crypto.randomUUID();
}

function canAccess(record) {
  return Boolean(sessionUser); // The loaded workspace has already passed database RLS.
}

function owned(record) {
  return record.ownerId === sessionUser?.id;
}

function currentRecipes() {
  return state.recipes.filter(canAccess).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function currentLists() {
  return state.lists.filter(canAccess).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function assertOwner(record) {
  if (!owned(record)) {
    alert("Only the owner can change or delete this item.");
    return false;
  }
  return true;
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authMessage.textContent = "";
  try {
    const credentials = { email: normalizeEmail($("#auth-email").value), password: $("#auth-password").value };
    const { data, error } = authMode === "signup"
      ? await cloud.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + location.pathname } })
      : await cloud.auth.signInWithPassword(credentials);
    if (error) throw error;
    $("#auth-password").value = "";
    if (!data.session) authMessage.textContent = "Check your email to confirm your account, then sign in.";
  } catch (error) { authMessage.textContent = error.message; }
  finally { authSubmit.disabled = false; }
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    authMode = button.dataset.authMode;
    document.querySelectorAll("[data-auth-mode]").forEach((item) => item.classList.toggle("active", item === button));
    authSubmit.textContent = authMode === "signup" ? "Create secure account" : "Sign in securely";
    authMessage.textContent = "";
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

$("#profile-toggle").addEventListener("click", () => {
  const isOpen = !$("#profile-panel").classList.contains("hidden");
  if (isOpen) {
    closeProfile();
  } else {
    openProfile();
  }
});

$("#profile-close").addEventListener("click", closeProfile);

document.addEventListener("click", (event) => {
  const panel = $("#profile-panel");
  const toggle = $("#profile-toggle");
  if (panel.classList.contains("hidden")) return;
  if (panel.contains(event.target) || toggle.contains(event.target)) return;
  closeProfile();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeProfile();
});

$("#sign-out").addEventListener("click", async () => {
  if (busy) return;
  const { error } = await cloud.auth.signOut({ scope: "local" });
  if (error) setStatus(error.message, true);
});

$("#export-data").addEventListener("click", () => {
  const exportable = {
    exportedAt: new Date().toISOString(), email: sessionEmail,
    recipes: currentRecipes(), lists: currentLists(),
    itemTags: state.itemTags[sessionEmail] || {},
    commonItems: state.commonItems, removedCommonItems: state.removedCommonItems
  };
  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "shopping-list-export.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#account-message");
  const button = accountForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const nextEmail = normalizeEmail($("#account-email").value);
    const nextPassword = $("#account-new-password").value;
    const { error: verifyError } = await cloud.auth.signInWithPassword({ email: sessionEmail, password: $("#account-current-password").value });
    if (verifyError) throw verifyError;
    const updates = {};
    if (nextEmail !== sessionEmail) updates.email = nextEmail;
    if (nextPassword) updates.password = nextPassword;
    if (!Object.keys(updates).length) { message.textContent = "No account changes entered."; return; }
    const { error } = await cloud.auth.updateUser(updates, { emailRedirectTo: location.origin + location.pathname });
    if (error) throw error;
    $("#account-current-password").value = "";
    $("#account-new-password").value = "";
    message.textContent = updates.email ? "Check your email to confirm the address change." : "Password updated.";
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

standardItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#standard-item-name").value.trim();
  const tag = $("#standard-item-tag").value;
  if (!name) {
    $("#standard-item-name").focus();
    return;
  }
  upsertStandardItem(name, tag);
  $("#standard-item-name").value = "";
  $("#standard-item-tag").value = "";
});

$("#standard-item-name").addEventListener("input", () => {
  applySuggestedTag("#standard-item-name", "#standard-item-tag");
});

$("#standard-item-name").addEventListener("change", () => {
  applySuggestedTag("#standard-item-name", "#standard-item-tag");
});

recipeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (editingIngredientId || $("#recipe-ingredient-item").value.trim()) {
    if (!addDraftRecipeIngredient()) return;
  }
  const now = new Date().toISOString();
  const payload = {
    title: $("#recipe-name").value.trim(),
    servings: $("#recipe-servings").value === "" ? null : Number($("#recipe-servings").value),
    sharedWith: parseEmails($("#recipe-shared").value),
    ingredients: draftRecipeIngredients.map((ingredient) => ({ ...ingredient })),
    instructions: $("#recipe-instructions").value.trim(),
    updatedAt: now
  };

  if (!payload.ingredients.length) {
    alert("Add at least one ingredient to save this recipe.");
    $("#recipe-ingredient-item").focus();
    return;
  }

  if (editingRecipeId) {
    const recipe = state.recipes.find((item) => item.id === editingRecipeId);
    if (!recipe || !assertOwner(recipe)) return;
    Object.assign(recipe, payload);
  } else {
    const recipe = { id: id("recipe"), owner: sessionEmail, ownerId: sessionUser.id, createdAt: now, ...payload };
    state.recipes.push(recipe);
    editingRecipeId = recipe.id;
  }

  creatingRecipe = false;
  recipeDirty = false;
  saveState();
  render();
});

$("#clear-recipe").addEventListener("click", startNewRecipe);
$("#new-recipe").addEventListener("click", startNewRecipe);
$("#plan-recipes").addEventListener("click", toggleRecipePlanning);
$("#delete-recipe").addEventListener("click", () => {
  if (editingRecipeId) deleteRecipe(editingRecipeId);
});
recipeImportForm.addEventListener("submit", importRecipeFromUrl);
recipeTextImportForm.addEventListener("submit", importRecipeFromText);
$("#clear-recipe-text").addEventListener("click", () => {
  $("#recipe-import-text").value = "";
  $("#recipe-text-import-message").textContent = "";
});
$("#add-recipe-ingredient").addEventListener("click", addDraftRecipeIngredient);
$("#clear-recipe-ingredient").addEventListener("click", clearRecipeIngredientFields);
$("#recipe-ingredient-item").addEventListener("input", () => {
  applySuggestedTag("#recipe-ingredient-item", "#recipe-ingredient-tag");
});
$("#recipe-ingredient-item").addEventListener("change", () => {
  applySuggestedTag("#recipe-ingredient-item", "#recipe-ingredient-tag");
});
["#recipe-ingredient-item", "#recipe-ingredient-quantity"].forEach((selector) => {
  $(selector).addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addDraftRecipeIngredient();
  });
});

listForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const now = new Date().toISOString();
  const newItem = $("#list-item").value.trim();
  const quantity = $("#list-quantity").value.trim();
  const tag = $("#list-tag").value;

  if (!activeListId) {
    alert("Create or open a grocery list first.");
    openListSettingsDialog();
    return;
  }

  if (!newItem) {
    $("#list-item").focus();
    return;
  }

  const list = state.lists.find((item) => item.id === activeListId);
  if (!list || !assertOwner(list)) return;

  addGroceryItem(list, newItem, quantity, tag);
  list.updatedAt = now;
  saveState();
  clearListItemFields();
  render();
  closeDialog("#add-item-dialog");
});

listDetailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const now = new Date().toISOString();
  const listName = $("#detail-list-name").value.trim();
  const payload = {
    name: listName,
    sharedWith: parseEmails($("#detail-list-shared").value),
    updatedAt: now
  };

  let list = activeListId ? state.lists.find((item) => item.id === activeListId) : null;
  if (list && !assertOwner(list)) return;

  if (!list) {
    list = state.lists.find((item) => owned(item) && item.name.toLowerCase() === listName.toLowerCase());
  }

  if (list) {
    Object.assign(list, payload);
  } else {
    list = {
      id: id("list"),
      owner: sessionEmail, ownerId: sessionUser.id,
      createdAt: now,
      items: [],
      ...payload
    };
    state.lists.push(list);
  }

  activeListId = list.id;
  saveState();
  render();
  closeDialog("#list-settings-dialog");
});

$("#clear-list").addEventListener("click", clearListItemFields);
$("#new-list").addEventListener("click", startNewList);
$("#edit-list").addEventListener("click", openListSettingsDialog);
$("#open-add-item").addEventListener("click", openAddItemDialog);
$("#toggle-manage-items").addEventListener("click", toggleManageItems);
$("#list-switcher").addEventListener("change", (event) => openList(event.target.value));
$("#clear-checked").addEventListener("click", clearCheckedItems);
$("#edit-item-form").addEventListener("submit", saveEditedItem);
$("#remove-edit-item").addEventListener("click", removeEditingItem);
$("#edit-ingredient-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const ingredient = draftRecipeIngredients.find((item) => item.id === editingRecipeIngredientRef);
  const name = $("#edit-ingredient-name").value.trim();
  if (!ingredient || !name) return;
  Object.assign(ingredient, {
    name,
    quantity: $("#edit-ingredient-quantity").value.trim(),
    tag: normalizeTag($("#edit-ingredient-tag").value)
  });
  recipeDirty = true;
  if (ingredient.tag) rememberTag(name, ingredient.tag);
  learnStandardItem(name, ingredient.tag);
  closeDialog("#edit-ingredient-dialog");
  renderRecipeIngredients(true);
  focusRecipeIngredient(ingredient.id);
});
$("#remove-edit-ingredient").addEventListener("click", () => {
  const ingredientId = editingRecipeIngredientRef;
  closeDialog("#edit-ingredient-dialog");
  if (ingredientId) removeDraftRecipeIngredient(ingredientId);
  $("#recipe-ingredients-list button")?.focus({ preventScroll: true });
});
$("#edit-ingredient-dialog").addEventListener("close", () => {
  editingRecipeIngredientRef = null;
});
document.querySelectorAll("[data-list-tag]").forEach((button) => {
  button.addEventListener("click", () => setListTag(button.dataset.listTag));
});
$("#list-item").addEventListener("input", () => {
  applySuggestedTag("#list-item", "#list-tag");
  syncListTagPicker();
  renderItemSuggestions();
});
$("#list-item").addEventListener("change", () => {
  applySuggestedTag("#list-item", "#list-tag");
  syncListTagPicker();
  renderItemSuggestions();
});
$("#list-item").addEventListener("focus", renderItemSuggestions);
$("#list-item").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideItemSuggestions();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".typeahead-field")) hideItemSuggestions();
});

async function handleSession(session) {
  const user = session?.user || null;
  if (user && sessionUser?.id === user.id && sessionUser?.email === user.email && savedState) return;
  const previousUserId = sessionUser?.id;
  const generation = ++authGeneration;
  if (previousUserId && previousUserId !== user?.id) {
    try { sessionStorage.removeItem("recipe-support-draft:" + previousUserId); } catch {}
  }
  sessionUser = user;
  sessionEmail = user?.email || null;
  state = ensureState(structuredClone(defaultState));
  savedState = null; failedDraft = null; saveInFlight = false; recipeDirty = false;
  updateRecoveryActions();
  document.querySelectorAll("input[type=password]").forEach(input => { input.value = ""; });
  document.querySelectorAll("#app-screen form").forEach(form => form.reset());
  $("#signed-in-email").textContent = "";
  $("#workspace-title").textContent = "My Kitchen";
  for (const selector of ["#recipes-list","#active-list-items","#lists-list","#sharing-list","#recipe-ingredients-list","#recipe-grocery-actions","#recipe-plan-panel","#list-switcher"]) $(selector).replaceChildren();
  renderCommonItemOptions();
  renderStandardItems();
  editingRecipeId = null; activeListId = null; draftRecipeIngredients = [];
  clearRecipeIngredientFields();
  plannedRecipeIds.clear();
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  if (!user) { setBusy(false); showAuth(); setStatus(""); return; }
  showAuth();
  authMessage.textContent = "Loading your workspace…";
  setBusy(true);
  try {
    const { data, error } = await cloud.rpc("load_workspace");
    if (error) throw error;
    if (generation !== authGeneration) return;
    state = ensureState(CloudStore.decode(data, user, defaultState));
    savedState = structuredClone(state);
    renderCommonItemOptions();
    showApp();
    restoreRecoveryDraft();
    setStatus(failedDraft ? "An earlier save may be incomplete. Download its backup and refresh before editing." : "Connected to Supabase");
    const legacy = loadState();
    const hasLegacy = [...legacy.recipes, ...legacy.lists].some(r => r.owner?.toLowerCase() === sessionEmail.toLowerCase());
    $("#import-local").classList.toggle("hidden", !hasLegacy);
  } catch (error) {
    if (generation === authGeneration) authMessage.textContent = "Could not load your workspace: " + error.message + " Sign in again to retry.";
  } finally { if (generation === authGeneration) setBusy(false); }
}

function showAuth() {
  authScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
  closeProfile();
  authForm.reset();
}

function showApp() {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  $("#workspace-title").textContent = `${sessionEmail.split("@")[0]}'s Grocery Lists`;
  renderProfile();
  showView("groceries");
  render();
}

function showView(view) {
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  $(`#${view}-view`).classList.add("active-view");
}

function render() {
  const recipes = currentRecipes();
  const lists = currentLists();
  if (editingRecipeId && !recipes.some((recipe) => recipe.id === editingRecipeId)) editingRecipeId = null;
  if (!editingRecipeId && recipes.length && !creatingRecipe) editingRecipeId = recipes[0].id;
  if (activeListId && !lists.some((list) => list.id === activeListId)) activeListId = null;
  if (!activeListId && lists.length) activeListId = lists[0].id;
  plannedRecipeIds = new Set([...plannedRecipeIds].filter((recipeId) => recipes.some((recipe) => recipe.id === recipeId)));

  renderRecipes(recipes, lists);
  renderLists(lists);
  renderSharing(recipes, lists);
}

function openProfile() {
  renderProfile();
  $("#profile-panel").classList.remove("hidden");
  $("#profile-toggle").setAttribute("aria-expanded", "true");
}

function closeProfile() {
  $("#profile-panel").classList.add("hidden");
  $("#profile-toggle").setAttribute("aria-expanded", "false");
}

function renderProfile() {
  $("#signed-in-email").textContent = sessionEmail;
  $("#account-email").value = sessionEmail || "";
  $("#account-message").textContent = "";
  $("#account-message").classList.remove("success");
  renderStandardItems();
}


function renderRecipes(recipes, lists) {
  const container = $("#recipes-list");
  const planPanel = $("#recipe-plan-panel");
  const planButton = $("#plan-recipes");
  const editableLists = lists.filter(owned);
  const plannedRecipes = recipes.filter((recipe) => plannedRecipeIds.has(recipe.id));
  const plannedIngredientCount = plannedRecipes.reduce((total, recipe) => total + normalizeRecipeIngredients(recipe.ingredients).length, 0);
  const listOptions = editableLists.map((list) => `<option value="${escapeHtml(list.id)}" ${list.id === activeListId ? "selected" : ""}>${escapeHtml(list.name)}</option>`).join("");

  container.innerHTML = "";
  planButton.setAttribute("aria-pressed", String(planningRecipes));
  planButton.textContent = planningRecipes ? "Done" : "Plan week";
  planPanel.classList.toggle("hidden", !planningRecipes);
  planPanel.innerHTML = planningRecipes ? `
    <div class="recipe-plan-summary">
      <strong>${plannedRecipes.length} selected</strong>
      <span>${plannedIngredientCount} ingredients</span>
    </div>
    <label>
      Add to
      <select id="recipe-plan-target-list" ${editableLists.length ? "" : "disabled"}>
        ${listOptions || `<option value="">Create a grocery list first</option>`}
      </select>
    </label>
    <div class="recipe-plan-actions">
      <button id="add-planned-recipes" class="primary small" type="button" ${plannedRecipes.length && editableLists.length ? "" : "disabled"}>Add plan</button>
      <button id="clear-planned-recipes" class="ghost small" type="button" ${plannedRecipes.length ? "" : "disabled"}>Clear</button>
    </div>
  ` : "";

  $("#add-planned-recipes")?.addEventListener("click", () => addPlannedRecipesToList($("#recipe-plan-target-list").value));
  $("#clear-planned-recipes")?.addEventListener("click", clearPlannedRecipes);

  if (!recipes.length) {
    addEmpty(container);
    renderActiveRecipe(null, lists);
    return;
  }

  recipes.forEach((recipe) => {
    const button = document.createElement("button");
    const isPlanned = plannedRecipeIds.has(recipe.id);
    button.className = `list-chip recipe-chip ${recipe.id === editingRecipeId ? "active" : ""} ${isPlanned ? "planned" : ""}`;
    button.type = "button";
    button.dataset.openRecipe = recipe.id;
    button.setAttribute("aria-pressed", String(isPlanned));
    button.innerHTML = `
      <span>
        <strong>${escapeHtml(recipe.title)}</strong>
        <small>${recipe.servings ? `${escapeHtml(recipe.servings)} servings &middot; ` : ""}${normalizeRecipeIngredients(recipe.ingredients).length} ingredients</small>
      </span>
      <span class="recipe-select-indicator" aria-hidden="true">${isPlanned ? "Selected" : "Select"}</span>
    `;
    container.append(button);
  });

  container.querySelectorAll("[data-open-recipe]").forEach(attachRecipeChipInteraction);
  renderActiveRecipe(recipes.find((recipe) => recipe.id === editingRecipeId) || null, lists);
}

function renderActiveRecipe(recipe, lists) {
  const groceryActions = $("#recipe-grocery-actions");
  const saveButton = $("#save-recipe");
  const deleteButton = $("#delete-recipe");
  const formFields = recipeForm.querySelectorAll("input, textarea, select");
  const canEdit = !recipe || owned(recipe);
  const editableLists = lists.filter(owned);
  const listOptions = editableLists.map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join("");

  $("#active-recipe-title").textContent = recipe ? recipe.title : "New recipe";
  saveButton.disabled = !canEdit;
  deleteButton.disabled = !recipe || !canEdit;
  formFields.forEach((field) => {
    field.disabled = !canEdit;
  });

  const pendingDraft = recipeDirty ? {
    title: $("#recipe-name").value, servings: $("#recipe-servings").value,
    shared: $("#recipe-shared").value, instructions: $("#recipe-instructions").value,
    ingredients: structuredClone(draftRecipeIngredients),
    ingredientEditor: {
      id: editingIngredientId, name: $("#recipe-ingredient-item").value,
      quantity: $("#recipe-ingredient-quantity").value, tag: $("#recipe-ingredient-tag").value
    }
  } : null;
  if (recipe) {
    draftRecipeIngredients = normalizeRecipeIngredients(recipe.ingredients);
    $("#recipe-name").value = recipe.title;
    $("#recipe-servings").value = recipe.servings ?? "";
    $("#recipe-shared").value = recipe.sharedWith.join(", ");
    $("#recipe-instructions").value = recipe.instructions;
  } else {
    clearRecipeFields();
  }
  if (pendingDraft && canEdit) {
    $("#recipe-name").value = pendingDraft.title; $("#recipe-servings").value = pendingDraft.servings;
    $("#recipe-shared").value = pendingDraft.shared; $("#recipe-instructions").value = pendingDraft.instructions;
    draftRecipeIngredients = pendingDraft.ingredients;
    editingIngredientId = pendingDraft.ingredientEditor.id;
    $("#recipe-ingredient-item").value = pendingDraft.ingredientEditor.name;
    $("#recipe-ingredient-quantity").value = pendingDraft.ingredientEditor.quantity;
    $("#recipe-ingredient-tag").value = pendingDraft.ingredientEditor.tag;
  }
  renderRecipeIngredients(canEdit);

  groceryActions.innerHTML = recipe ? `
    <div class="quick-add-form recipe-grocery-form">
      <label>
        Grocery list
        <select id="recipe-target-list" ${editableLists.length ? "" : "disabled"}>
          ${listOptions || `<option value="">Create a grocery list first</option>`}
        </select>
      </label>
      <div class="form-actions">
        <button id="add-active-recipe" class="ghost" type="button" ${editableLists.length ? "" : "disabled"}>Add to groceries</button>
      </div>
    </div>
  ` : `<div class="empty-inline">Save a recipe before adding ingredients to a grocery list.</div>`;

  $("#add-active-recipe")?.addEventListener("click", () => {
    addRecipeToList(recipe.id, $("#recipe-target-list").value);
  });
}

function renderRecipeIngredients(canEdit = true) {
  const container = $("#recipe-ingredients-list");
  container.innerHTML = "";
  $("#add-recipe-ingredient").disabled = !canEdit;
  $("#clear-recipe-ingredient").disabled = !canEdit;
  $("#add-recipe-ingredient").textContent = editingIngredientId ? "Update ingredient" : "Add ingredient";
  $("#clear-recipe-ingredient").textContent = editingIngredientId ? "Cancel edit" : "Clear item";

  if (!draftRecipeIngredients.length) {
    container.innerHTML = `<div class="empty-inline">Add the first ingredient above.</div>`;
    return;
  }

  const detail = document.createElement("article");
  const canManage = canEdit && manageRecipeIngredients;
  detail.className = `active-list-card shopping-list-card ${canManage ? "manage-mode" : ""}`;
  detail.innerHTML = `
    ${canEdit ? `<div class="card-actions"><button id="toggle-manage-ingredients" class="ghost small" type="button" aria-pressed="${canManage}">${canManage ? "Done" : "Manage"}</button></div>` : ""}
    <ul class="items shopping-items">
      ${draftRecipeIngredients.map((ingredient) => `
        <li class="item-row ${ingredient.tag ? `tag-${escapeHtml(ingredient.tag)}` : ""}">
          <button class="item-tap-target" data-edit-recipe-ingredient="${escapeHtml(ingredient.id)}" type="button" aria-label="Edit ${escapeHtml(ingredient.name)}" title="Hold to edit ingredient" ${canEdit ? "" : "disabled"}>
          <span class="item-main">
            <span class="item-name">${escapeHtml(ingredient.name)}</span>
            <span class="item-subline">
              ${ingredient.quantity ? `<span class="item-quantity">${escapeHtml(ingredient.quantity)}</span>` : ""}
              ${ingredient.tag ? `<span class="tag-pill tag-${escapeHtml(ingredient.tag)}">${escapeHtml(TAG_LABELS[ingredient.tag])}</span>` : ""}
            </span>
          </span>
          </button>
          ${canManage ? `<span class="item-actions">
            <select class="tag-select" data-recipe-tag="${escapeHtml(ingredient.id)}" aria-label="Tag ${escapeHtml(ingredient.name)}" ${canEdit ? "" : "disabled"}>
              ${tagOptions(ingredient.tag)}
            </select>
            <button class="danger small" data-remove-recipe-ingredient="${escapeHtml(ingredient.id)}" type="button" ${canEdit ? "" : "disabled"}>Remove</button>
          </span>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
  container.append(detail);
  container.querySelector("#toggle-manage-ingredients")?.addEventListener("click", () => {
    manageRecipeIngredients = !manageRecipeIngredients;
    renderRecipeIngredients(canEdit);
    container.querySelector("#toggle-manage-ingredients")?.focus();
  });
  container.querySelectorAll("[data-edit-recipe-ingredient]").forEach(attachRecipeIngredientInteraction);

  container.querySelectorAll("[data-recipe-tag]").forEach((select) => select.addEventListener("change", () => tagDraftRecipeIngredient(select.dataset.recipeTag, select.value)));
  container.querySelectorAll("[data-remove-recipe-ingredient]").forEach((button) => button.addEventListener("click", () => removeDraftRecipeIngredient(button.dataset.removeRecipeIngredient)));
}

function renderLists(lists) {
  const directory = $("#lists-list");
  const activeItems = $("#active-list-items");
  const switcher = $("#list-switcher");
  directory.innerHTML = "";
  activeItems.innerHTML = "";
  switcher.innerHTML = "";
  switcher.disabled = !lists.length;

  if (!lists.length) {
    for (const selector of ["#open-add-item","#toggle-manage-items","#clear-checked","#edit-list"]) $(selector).disabled = true;
    $("#active-list-title").textContent = "Start a grocery list";
    $("#active-list-progress").textContent = "Create a list to start shopping.";
    $("#detail-list-name").value = "";
    $("#detail-list-shared").value = "";
    switcher.innerHTML = `<option value="">No lists yet</option>`;
    addEmpty(directory);
    addEmpty(activeItems);
    return;
  }

  switcher.innerHTML = lists.map((list) => `
    <option value="${escapeHtml(list.id)}" ${list.id === activeListId ? "selected" : ""}>
      ${escapeHtml(list.name)}
    </option>
  `).join("");

  lists.forEach((list) => {
    const button = document.createElement("button");
    button.className = `list-chip ${list.id === activeListId ? "active" : ""}`;
    button.type = "button";
    button.dataset.openList = list.id;
    button.innerHTML = `
      <span>
        <strong>${escapeHtml(list.name)}</strong>
        <small>${list.items.filter((item) => !item.done).length} remaining &middot; ${list.items.length} total</small>
      </span>
    `;
    directory.append(button);
  });

  directory.querySelectorAll("[data-open-list]").forEach((button) => button.addEventListener("click", () => openList(button.dataset.openList)));
  renderActiveList(lists.find((list) => list.id === activeListId));
}

function renderActiveList(list) {
  const container = $("#active-list-items");
  container.innerHTML = "";
  if (!list) return addEmpty(container);

  $("#active-list-title").textContent = list.name;
  $("#detail-list-name").value = list.name;
  $("#detail-list-shared").value = list.sharedWith.join(", ");
  const remaining = list.items.filter((item) => !item.done).length;
  const completed = list.items.length - remaining;
  for (const selector of ["#open-add-item","#toggle-manage-items","#clear-checked","#edit-list"]) $(selector).disabled = !owned(list);
  $("#active-list-progress").textContent = list.items.length
    ? `${remaining} remaining, ${completed} checked off`
    : "No items yet.";
  $("#toggle-manage-items").setAttribute("aria-pressed", String(manageItems));
  $("#toggle-manage-items").textContent = manageItems ? "Done" : "Manage";

  const detail = document.createElement("article");
  const canManage = manageItems && owned(list);
  detail.className = `active-list-card shopping-list-card ${canManage ? "manage-mode" : ""}`;
  detail.innerHTML = `
    <div class="pill-row shopping-meta">
      <span class="pill">${owned(list) ? "Owner" : "Shared"}</span>
      ${list.sharedWith.map((email) => `<span class="pill">${escapeHtml(email)}</span>`).join("")}
    </div>
    <ul class="items shopping-items">
      ${sortedItems(list).map((item) => `
        <li class="item-row ${item.done ? "done" : ""} ${item.tag ? `tag-${escapeHtml(item.tag)}` : ""}">
          <button class="item-tap-target" data-shopping-item="${escapeHtml(list.id)}:${escapeHtml(item.id)}" type="button" aria-pressed="${item.done}" ${owned(list) ? "" : "disabled"}>
            <span class="item-main">
              <span class="item-name">${escapeHtml(item.name)}</span>
              <span class="item-subline">
                ${item.quantity ? `<span class="item-quantity">${escapeHtml(item.quantity)}</span>` : ""}
                ${item.tag ? `<span class="tag-pill tag-${escapeHtml(item.tag)}">${escapeHtml(TAG_LABELS[item.tag])}</span>` : ""}
              </span>
            </span>
          </button>
          ${canManage ? `<span class="item-actions">
            <select class="tag-select" data-tag-item="${escapeHtml(list.id)}:${escapeHtml(item.id)}" aria-label="Tag ${escapeHtml(item.name)}">
              ${tagOptions(item.tag)}
            </select>
            <button class="danger small" data-remove-item="${escapeHtml(list.id)}:${escapeHtml(item.id)}" type="button">Remove</button>
          </span>` : ""}
        </li>
      `).join("") || `<li class="empty-inline">Tap Add item when you are ready.</li>`}
    </ul>
    ${canManage ? `<div class="card-actions">
      <button class="danger small" data-delete-list="${escapeHtml(list.id)}" type="button">Delete list</button>
    </div>` : ""}
  `;
  container.append(detail);

  container.querySelectorAll("[data-delete-list]").forEach((button) => button.addEventListener("click", () => deleteList(button.dataset.deleteList)));
  container.querySelectorAll("[data-shopping-item]").forEach(attachShoppingItemInteraction);
  container.querySelectorAll("[data-remove-item]").forEach((button) => button.addEventListener("click", () => removeItem(button.dataset.removeItem)));
  container.querySelectorAll("[data-tag-item]").forEach((select) => select.addEventListener("change", () => tagItem(select.dataset.tagItem, select.value)));
}

function renderSharing(recipes, lists) {
  const container = $("#sharing-list");
  container.innerHTML = "";
  const shared = [...recipes.map((item) => ({ type: "Recipe", ...item })), ...lists.map((item) => ({ type: "List", title: item.name, ...item }))].filter((item) => item.sharedWith.length);
  if (!shared.length) return addEmpty(container);

  shared.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${item.type} &middot; owned by ${escapeHtml(item.owner)}</p>
      </div>
      <div class="pill-row">${item.sharedWith.map((email) => `<span class="pill">${escapeHtml(email)}</span>`).join("")}</div>
    `;
    container.append(card);
  });
}

function openRecipe(recipeId) {
  if (recipeId !== editingRecipeId && !discardRecipeDraft()) return;
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !canAccess(recipe)) return;
  if (recipeId !== editingRecipeId) clearRecipeIngredientFields();
  editingRecipeId = recipeId;
  creatingRecipe = false;
  render();
  $("#recipe-name").focus();
}

function attachRecipeChipInteraction(button) {
  let longPressTimer = null;
  let longPressHandled = false;
  const recipeId = button.dataset.openRecipe;

  const cancelLongPress = () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  button.addEventListener("pointerdown", () => {
    longPressHandled = false;
    cancelLongPress();
    longPressTimer = setTimeout(() => {
      longPressHandled = true;
      setRecipePlanning(true);
      togglePlannedRecipe(recipeId);
    }, 520);
  });
  button.addEventListener("pointerup", cancelLongPress);
  button.addEventListener("pointercancel", cancelLongPress);
  button.addEventListener("pointerleave", cancelLongPress);
  button.addEventListener("click", () => {
    if (longPressHandled) return;
    if (planningRecipes) {
      togglePlannedRecipe(recipeId);
      return;
    }
    openRecipe(recipeId);
  });
}

function toggleRecipePlanning() {
  setRecipePlanning(!planningRecipes);
}

function setRecipePlanning(enabled) {
  planningRecipes = enabled;
  if (!planningRecipes) plannedRecipeIds.clear();
  render();
}

function togglePlannedRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !canAccess(recipe)) return;
  if (plannedRecipeIds.has(recipeId)) {
    plannedRecipeIds.delete(recipeId);
  } else {
    plannedRecipeIds.add(recipeId);
  }
  planningRecipes = true;
  render();
}

function clearPlannedRecipes() {
  plannedRecipeIds.clear();
  render();
}

function deleteRecipe(recipeId) {
  if (!confirm("Delete this recipe and its sharing settings?")) return;
  recipeDirty = false;
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !assertOwner(recipe)) return;
  state.recipes = state.recipes.filter((item) => item.id !== recipeId);
  if (editingRecipeId === recipeId) editingRecipeId = null;
  creatingRecipe = false;
  saveState();
  render();
}

function addRecipeToList(recipeId, listId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !canAccess(recipe)) return;

  if (!listId) {
    alert("Create a grocery list first.");
    showView("groceries");
    $("#detail-list-name").focus();
    return;
  }

  const list = state.lists.find((item) => item.id === listId);
  if (!list) {
    alert("Choose an available grocery list.");
    return;
  }
  if (!assertOwner(list)) return;

  normalizeRecipeIngredients(recipe.ingredients).forEach((ingredient) => addGroceryItem(list, ingredient.name, ingredient.quantity, ingredient.tag));
  list.updatedAt = new Date().toISOString();
  activeListId = list.id;
  saveState();
  showView("groceries");
  render();
}

function addPlannedRecipesToList(listId) {
  const selectedRecipes = currentRecipes().filter((recipe) => plannedRecipeIds.has(recipe.id));
  if (!selectedRecipes.length) return;

  if (!listId) {
    alert("Create a grocery list first.");
    showView("groceries");
    $("#detail-list-name").focus();
    return;
  }

  const list = state.lists.find((item) => item.id === listId);
  if (!list) {
    alert("Choose an available grocery list.");
    return;
  }
  if (!assertOwner(list)) return;

  selectedRecipes.forEach((recipe) => {
    normalizeRecipeIngredients(recipe.ingredients).forEach((ingredient) => addGroceryItem(list, ingredient.name, ingredient.quantity, ingredient.tag));
  });
  list.updatedAt = new Date().toISOString();
  activeListId = list.id;
  planningRecipes = false;
  plannedRecipeIds.clear();
  saveState();
  showView("groceries");
  render();
}

function addGroceryItem(list, name, quantity, selectedTag = "") {
  const tag = normalizeTag(selectedTag) || getSuggestedTag(name);
  if (tag) rememberTag(name, tag);
  learnStandardItem(name, tag);
  list.items.push({
    id: id("item"),
    name,
    quantity,
    tag,
    done: false,
    addedAt: new Date().toISOString()
  });
}

function openList(listId) {
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !canAccess(list)) return;
  activeListId = listId;
  render();
}

function deleteList(listId) {
  if (!confirm("Delete this grocery list and all its items?")) return;
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !assertOwner(list)) return;
  state.lists = state.lists.filter((item) => item.id !== listId);
  if (activeListId === listId) activeListId = null;
  saveState();
  render();
}

function toggleItem(value) {
  const [listId, itemId] = value.split(":");
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !assertOwner(list)) return;
  const item = list.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.done = !item.done;
  list.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function attachShoppingItemInteraction(button) {
  let timer = null;
  let longPressed = false;
  const value = button.dataset.shoppingItem;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  button.addEventListener("pointerdown", () => {
    longPressed = false;
    clearTimer();
    timer = setTimeout(() => {
      longPressed = true;
      openEditItemDialog(value);
    }, 550);
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    button.addEventListener(eventName, clearTimer);
  });

  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  button.addEventListener("click", (event) => {
    if (longPressed) {
      event.preventDefault();
      longPressed = false;
      return;
    }
    toggleItem(value);
  });
}

function openEditItemDialog(value) {
  const [listId, itemId] = value.split(":");
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !assertOwner(list)) return;
  const item = list.items.find((entry) => entry.id === itemId);
  if (!item) return;

  editingItemRef = value;
  $("#edit-item-name").value = item.name;
  $("#edit-item-quantity").value = item.quantity || "";
  $("#edit-item-tag").value = normalizeTag(item.tag);
  openDialog("#edit-item-dialog");
  $("#edit-item-name").focus();
}

function saveEditedItem(event) {
  event.preventDefault();
  if (!editingItemRef) return;
  const [listId, itemId] = editingItemRef.split(":");
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !assertOwner(list)) return;
  const item = list.items.find((entry) => entry.id === itemId);
  if (!item) return;

  const name = $("#edit-item-name").value.trim();
  if (!name) {
    $("#edit-item-name").focus();
    return;
  }

  item.name = name;
  item.quantity = $("#edit-item-quantity").value.trim();
  item.tag = normalizeTag($("#edit-item-tag").value);
  if (item.tag) rememberTag(item.name, item.tag);
  learnStandardItem(item.name, item.tag);
  list.updatedAt = new Date().toISOString();
  saveState();
  closeDialog("#edit-item-dialog");
  editingItemRef = null;
  render();
}

function removeEditingItem() {
  if (!editingItemRef) return;
  removeItem(editingItemRef);
  closeDialog("#edit-item-dialog");
  editingItemRef = null;
}

function toggleManageItems() {
  manageItems = !manageItems;
  render();
}

function removeItem(value) {
  const [listId, itemId] = value.split(":");
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !assertOwner(list)) return;
  list.items = list.items.filter((entry) => entry.id !== itemId);
  list.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function tagItem(value, tag) {
  const [listId, itemId] = value.split(":");
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !assertOwner(list)) return;
  const item = list.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.tag = normalizeTag(tag);
  if (item.tag) rememberTag(item.name, item.tag);
  learnStandardItem(item.name, item.tag);
  list.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function clearCheckedItems() {
  if (!activeListId) return;
  const list = state.lists.find((item) => item.id === activeListId);
  if (!list || !assertOwner(list)) return;
  list.items = list.items.filter((item) => !item.done);
  list.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function startNewList() {
  activeListId = null;
  $("#active-list-title").textContent = "Start a grocery list";
  $("#active-list-progress").textContent = "";
  $("#detail-list-name").value = "";
  $("#detail-list-shared").value = "";
  clearListItemFields();
  $("#active-list-items").innerHTML = "";
  addEmpty($("#active-list-items"));
  renderListSelection();
  openListSettingsDialog();
  $("#detail-list-name").focus();
}

function renderListSelection() {
  document.querySelectorAll(".list-chip").forEach((button) => button.classList.remove("active"));
}

function startNewRecipe() {
  if (!discardRecipeDraft()) return;
  editingRecipeId = null;
  creatingRecipe = true;
  renderRecipeSelection();
  renderActiveRecipe(null, currentLists());
  $("#recipe-name").focus();
}

function renderRecipeSelection() {
  document.querySelectorAll("[data-open-recipe]").forEach((button) => button.classList.remove("active"));
}

async function importRecipeFromUrl(event) {
  event.preventDefault();
  const url = $("#recipe-import-url").value.trim();
  const message = $("#recipe-import-message");
  if (!url) {
    $("#recipe-import-url").focus();
    return;
  }

  message.classList.remove("success");
  if (!discardRecipeDraft()) return;
  const generation = authGeneration;
  $("#import-recipe").disabled = true;
  message.textContent = "Importing recipe...";

  try {
    const result = await RecipeNetwork.recipeHTML(url);
    if (generation !== authGeneration) return;
    const parsedRecipe = parseRecipePage(result.html, result.url);

    if (!parsedRecipe.ingredients.length && !parsedRecipe.instructions) {
      throw new Error("I could not find recipe ingredients or instructions on that page.");
    }

    applyImportedRecipe(parsedRecipe);
    message.classList.add("success");
    message.textContent = `Imported ${parsedRecipe.title || "recipe"}. Review it, then save.`;
  } catch (error) {
    if (generation === authGeneration) message.textContent = "Could not import this page. Paste the recipe text below instead. " + error.message;
  } finally { $("#import-recipe").disabled = false; }
}

function importRecipeFromText(event) {
  event.preventDefault();
  const text = $("#recipe-import-text").value.trim();
  const message = $("#recipe-text-import-message");
  if (!text) {
    $("#recipe-import-text").focus();
    return;
  }

  if (text.length > 50000) { message.textContent = "Paste up to 50,000 characters."; return; }
  if (!discardRecipeDraft()) return;
  message.classList.remove("success");
  const parsedRecipe = parseRecipeText(text);
  if (!parsedRecipe.ingredients.length && !parsedRecipe.instructions) {
    message.textContent = "I could not find ingredients or instructions in that text.";
    return;
  }

  applyImportedRecipe(parsedRecipe);
  message.classList.add("success");
  message.textContent = `Parsed ${parsedRecipe.title || "recipe"}. Review it, then save.`;
}

function parseRecipeText(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanText)
    .filter((line) => !/^(?:`{3,}|~{3,})/.test(line) && !/^["“”]+$/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/\*\*([^*]+)\*\*/g, "$1"))
    .filter(Boolean);
  const title = inferRecipeTitle(lines);
  const servings = parseServings(lines.find((line) => /servings?|yield/i.test(line)) || "");
  const sections = splitRecipeTextSections(lines);
  const ingredients = sections.ingredients.map(parseImportedIngredient).filter((ingredient) => ingredient.name);

  return {
    title,
    servings,
    ingredients,
    instructions: sections.instructions.join("\n")
  };
}

function inferRecipeTitle(lines) {
  const firstMeaningfulLine = lines.find((line) => !/^(ingredients?|instructions?|directions?|method|steps?|servings?|yield)\b/i.test(line));
  return firstMeaningfulLine || "Imported recipe";
}

function splitRecipeTextSections(lines) {
  let mode = "title";
  const ingredients = [];
  const instructions = [];
  const ingredientHeading = /^(ingredients?|what you(?:'|’)ll need)\b/i;
  const instructionHeading = /^(instructions?|directions?|method|preparation|steps?)\b/i;
  const stopHeading = /^(notes?|nutrition|tips?)\b/i;

  lines.forEach((line) => {
    if (ingredientHeading.test(line)) {
      mode = "ingredients";
      return;
    }
    if (instructionHeading.test(line)) {
      mode = "instructions";
      return;
    }
    if (stopHeading.test(line)) {
      mode = "other";
      return;
    }
    if (mode === "ingredients" && !isIngredientSubheading(line)) ingredients.push(stripListMarker(line));
    if (mode === "instructions") instructions.push(stripListMarker(line));
  });

  if (!ingredients.length || !instructions.length) {
    return inferRecipeTextSections(lines, ingredients, instructions);
  }

  return {
    ingredients: uniqueLines(ingredients),
    instructions: uniqueLines(instructions)
  };
}

function inferRecipeTextSections(lines, existingIngredients, existingInstructions) {
  const ingredients = [...existingIngredients];
  const instructions = [...existingInstructions];
  const likelyIngredient = /^[-*•]?\s*(?:\d+|[¼½¾⅓⅔⅛⅜⅝⅞])|(?:cup|tbsp|tsp|oz|lb|g|kg|ml|clove|bunch|pinch)s?\b/i;
  const likelyInstruction = /^(?:\d+[\.)]|step\s+\d+|[-*•])\s+|(?:preheat|mix|stir|cook|bake|simmer|add|combine|serve|whisk|chop|heat)\b/i;

  lines.forEach((line, index) => {
    if (index === 0 || isIngredientSubheading(line) || /^(ingredients?|instructions?|directions?|method|steps?|servings?|yield)\b/i.test(line)) return;
    const cleanLine = stripListMarker(line);
    if (!existingIngredients.length && likelyIngredient.test(line) && !/[.!?]$/.test(line)) {
      ingredients.push(cleanLine);
      return;
    }
    if (!existingInstructions.length && likelyInstruction.test(line)) {
      instructions.push(cleanLine);
    }
  });

  return {
    ingredients: uniqueLines(ingredients),
    instructions: uniqueLines(instructions)
  };
}

function isIngredientSubheading(line) {
  return /^for\s+(?:the\s+)?\D/i.test(line) || /:$/.test(line);
}

function stripListMarker(line) {
  return cleanText(line.replace(/^[-*•]\s*/, "").replace(/^\d+[\.)]\s*/, ""));
}

function parseRecipePage(html, url) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const structuredRecipe = findStructuredRecipe(document);
  if (structuredRecipe) return structuredRecipeToRecipe(structuredRecipe, document, url);
  return fallbackRecipeFromDocument(document, url);
}

function findStructuredRecipe(document) {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  for (const script of scripts) {
    try {
      const json = JSON.parse(script.textContent.trim());
      const recipe = findRecipeNode(json);
      if (recipe) return recipe;
    } catch {
      continue;
    }
  }
  return null;
}

function findRecipeNode(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRecipeNode(item);
      if (match) return match;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item).toLowerCase() === "recipe")) return value;
  return findRecipeNode(value["@graph"]);
}

function structuredRecipeToRecipe(recipe, document, url) {
  const ingredients = arrayify(recipe.recipeIngredient).map(parseImportedIngredient).filter((ingredient) => ingredient.name);
  const instructions = recipeInstructionsToText(recipe.recipeInstructions);
  return {
    title: cleanText(recipe.name) || pageTitle(document, url),
    servings: parseServings(recipe.recipeYield),
    ingredients,
    instructions
  };
}

function fallbackRecipeFromDocument(document, url) {
  const ingredientText = uniqueLines([
    ...textsFrom(document, '[class*="ingredient" i] li'),
    ...textsFrom(document, '[class*="ingredient" i]'),
    ...textsFrom(document, '[itemprop="recipeIngredient"]')
  ]).filter((line) => line.length > 1);

  const instructionText = uniqueLines([
    ...textsFrom(document, '[class*="instruction" i] li'),
    ...textsFrom(document, '[class*="direction" i] li'),
    ...textsFrom(document, '[class*="method" i] li'),
    ...textsFrom(document, '[itemprop="recipeInstructions"]')
  ]);

  return {
    title: pageTitle(document, url),
    servings: null,
    ingredients: ingredientText.map(parseImportedIngredient).filter((ingredient) => ingredient.name),
    instructions: instructionText.join("\n")
  };
}

function applyImportedRecipe(recipe) {
  recipeDirty = true;
  editingRecipeId = null;
  creatingRecipe = true;
  renderRecipeSelection();
  clearRecipeFields();
  $("#active-recipe-title").textContent = recipe.title || "Imported recipe";
  $("#recipe-name").value = recipe.title || "";
  $("#recipe-servings").value = recipe.servings ?? "";
  $("#recipe-instructions").value = recipe.instructions || "";
  draftRecipeIngredients = recipe.ingredients.map((ingredient) => ({
    id: id("ingredient"),
    name: ingredient.name,
    quantity: ingredient.quantity,
    tag: normalizeTag(ingredient.tag) || getSuggestedTag(ingredient.name)
  }));
  draftRecipeIngredients.forEach((ingredient) => learnStandardItem(ingredient.name, ingredient.tag));
  renderRecipeIngredients(true);
}

function clearRecipeFields() {
  draftRecipeIngredients = [];
  recipeForm.reset();
  $("#recipe-servings").value = "";
  clearRecipeIngredientFields();
  renderRecipeIngredients(true);
}

function addDraftRecipeIngredient() {
  const name = $("#recipe-ingredient-item").value.trim();
  const quantity = $("#recipe-ingredient-quantity").value.trim();
  const tag = $("#recipe-ingredient-tag").value;

  if (!name) {
    $("#recipe-ingredient-item").focus();
    return false;
  }

  recipeDirty = true;
  const ingredient = draftRecipeIngredients.find((item) => item.id === editingIngredientId);
  if (ingredient) Object.assign(ingredient, { name, quantity, tag: normalizeTag(tag) });
  else draftRecipeIngredients.push({ id: id("ingredient"), name, quantity, tag: normalizeTag(tag) });
  if (tag) rememberTag(name, tag);
  learnStandardItem(name, tag);
  clearRecipeIngredientFields();
  renderRecipeIngredients(true);
  return true;
}

function editDraftRecipeIngredient(ingredientId) {
  const ingredient = draftRecipeIngredients.find((item) => item.id === ingredientId);
  if (!ingredient) return;
  editingRecipeIngredientRef = ingredientId;
  $("#edit-ingredient-name").value = ingredient.name;
  $("#edit-ingredient-quantity").value = ingredient.quantity;
  $("#edit-ingredient-tag").innerHTML = tagOptions(ingredient.tag);
  openDialog("#edit-ingredient-dialog");
  $("#edit-ingredient-name").focus({ preventScroll: true });
}

function focusRecipeIngredient(ingredientId) {
  Array.from(document.querySelectorAll("[data-edit-recipe-ingredient]"))
    .find((button) => button.dataset.editRecipeIngredient === ingredientId)?.focus({ preventScroll: true });
}

function attachRecipeIngredientInteraction(button) {
  let timer = null;
  let origin = null;
  const clearTimer = () => { clearTimeout(timer); timer = null; };
  const edit = () => { if (!button.disabled) editDraftRecipeIngredient(button.dataset.editRecipeIngredient); };
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || button.disabled) return;
    clearTimer();
    origin = { x: event.clientX, y: event.clientY };
    timer = setTimeout(edit, 550);
  });
  button.addEventListener("pointermove", (event) => {
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) clearTimer();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => button.addEventListener(eventName, clearTimer));
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    // Keyboard and assistive technology activation does not require holding.
    if (event.detail === 0) edit();
  });
}

function removeDraftRecipeIngredient(ingredientId) {
  if (editingIngredientId === ingredientId) clearRecipeIngredientFields();
  recipeDirty = true;
  draftRecipeIngredients = draftRecipeIngredients.filter((ingredient) => ingredient.id !== ingredientId);
  renderRecipeIngredients(true);
}

function tagDraftRecipeIngredient(ingredientId, tag) {
  recipeDirty = true;
  const ingredient = draftRecipeIngredients.find((item) => item.id === ingredientId);
  if (!ingredient) return;
  ingredient.tag = normalizeTag(tag);
  if (ingredient.tag) rememberTag(ingredient.name, ingredient.tag);
  learnStandardItem(ingredient.name, ingredient.tag);
  renderRecipeIngredients(true);
}

function clearRecipeIngredientFields() {
  editingIngredientId = null;
  $("#add-recipe-ingredient").textContent = "Add ingredient";
  $("#clear-recipe-ingredient").textContent = "Clear item";
  $("#recipe-ingredient-item").value = "";
  $("#recipe-ingredient-quantity").value = "";
  $("#recipe-ingredient-tag").value = "";
}

function clearListItemFields() {
  $("#list-item").value = "";
  $("#list-quantity").value = "";
  setListTag("");
  hideItemSuggestions();
  if ($("#add-item-dialog").open) $("#list-item").focus();
}

function openAddItemDialog() {
  if (!activeListId) {
    openListSettingsDialog();
    return;
  }
  openDialog("#add-item-dialog");
  $("#list-item").focus();
}

function openListSettingsDialog() {
  openDialog("#list-settings-dialog");
  $("#detail-list-name").focus();
}

function openDialog(selector) {
  const dialog = $(selector);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(selector) {
  const dialog = $(selector);
  if (dialog.open) dialog.close();
}

function renderItemSuggestions() {
  const container = $("#item-suggestions");
  const query = normalizeItemName($("#list-item").value);
  if (!query) {
    hideItemSuggestions();
    return;
  }

  const matches = itemSuggestionCandidates()
    .filter((item) => normalizeItemName(item.name).includes(query))
    .slice(0, 8);

  container.innerHTML = "";
  if (!matches.length) {
    hideItemSuggestions();
    return;
  }

  matches.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "typeahead-option";
    button.dataset.itemName = item.name;
    button.dataset.itemTag = item.tag;
    button.innerHTML = `
      <span>${escapeHtml(item.name)}</span>
      ${item.tag ? `<span class="tag-pill tag-${escapeHtml(item.tag)}">${escapeHtml(TAG_LABELS[item.tag])}</span>` : ""}
    `;
    button.addEventListener("click", () => chooseItemSuggestion(item.name, item.tag));
    container.append(button);
  });

  container.classList.remove("hidden");
}

function hideItemSuggestions() {
  $("#item-suggestions").classList.add("hidden");
}

function chooseItemSuggestion(name, tag) {
  $("#list-item").value = name;
  setListTag(tag);
  hideItemSuggestions();
  $("#list-quantity").focus();
}

function setListTag(tag) {
  $("#list-tag").value = normalizeTag(tag);
  syncListTagPicker();
}

function syncListTagPicker() {
  const selectedTag = normalizeTag($("#list-tag").value);
  document.querySelectorAll("[data-list-tag]").forEach((button) => {
    button.classList.toggle("active", button.dataset.listTag === selectedTag);
  });
}

function itemSuggestionCandidates() {
  const seen = new Map();
  const addCandidate = (name, tag = "") => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return;
    const normalizedName = normalizeItemName(trimmedName);
    const normalizedTag = normalizeTag(tag) || getSuggestedTag(trimmedName);
    if (!seen.has(normalizedName)) {
      seen.set(normalizedName, { name: trimmedName, tag: normalizedTag });
      return;
    }
    const existing = seen.get(normalizedName);
    if (!existing.tag && normalizedTag) existing.tag = normalizedTag;
  };

  state.commonItems.forEach((item) => addCandidate(item.name, item.tag));
  state.lists
    .filter(canAccess)
    .flatMap((list) => list.items || [])
    .forEach((item) => addCandidate(item.name, item.tag));
  Object.entries(userTags()).forEach(([name, tag]) => addCandidate(name, tag));

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sortedItems(list) {
  return [...list.items].sort((a, b) => {
    const tagA = tagSortValue(a.tag);
    const tagB = tagSortValue(b.tag);
    if (tagA !== tagB) return tagA - tagB;
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    return a.name.localeCompare(b.name);
  });
}

function tagSortValue(tag) {
  const index = TAGS.indexOf(tag);
  return index === -1 ? TAGS.length : index;
}

function tagOptions(selectedTag) {
  const normalizedSelectedTag = normalizeTag(selectedTag);
  return [
    `<option value="">None</option>`,
    ...TAGS.map((tag) => `<option value="${tag}" ${tag === normalizedSelectedTag ? "selected" : ""}>${TAG_LABELS[tag]}</option>`)
  ].join("");
}

function arrayify(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pageTitle(document, url) {
  return cleanText(document.querySelector("h1")?.textContent || document.title || new URL(url).hostname);
}

function textsFrom(document, selector) {
  return [...document.querySelectorAll(selector)]
    .map((element) => cleanText(element.textContent))
    .filter(Boolean);
}

function uniqueLines(lines) {
  const seen = new Set();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseServings(value) {
  const text = cleanText(arrayify(value).join(" "));
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function recipeInstructionsToText(instructions) {
  return arrayify(instructions)
    .flatMap((instruction) => {
      if (typeof instruction === "string") return [instruction];
      if (!instruction || typeof instruction !== "object") return [];
      if (instruction.itemListElement) return arrayify(instruction.itemListElement).map((item) => item.text || item.name || item);
      return [instruction.text || instruction.name || ""];
    })
    .map(cleanText)
    .filter(Boolean)
    .join("\n");
}

function parseImportedIngredient(line) {
  const text = cleanText(line);
  const match = text.match(/^((?:\d+[\d\s./-]*|[¼½¾⅓⅔⅛⅜⅝⅞]+)\s*(?:cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|l|liters?|cloves?|heads?|bunch(?:es)?|cans?|packages?|pinch(?:es)?|slices?)?)\s+(.+)$/i);
  const quantity = cleanText(match?.[1] || "");
  const name = mainIngredientName(match?.[2] || text);
  const tag = getSuggestedTag(name);
  return { name, quantity, tag };
}

function mainIngredientName(value) {
  let text = cleanText(value);
  // Remove balanced parenthetical amounts, alternatives, and preparation notes.
  while (/\([^()]*\)/.test(text)) text = text.replace(/\([^()]*\)/g, " ");
  text = text.split(/\s+or\s+/i)[0];
  text = text.replace(/,\s*(?:rinsed|drained|peeled|diced|chopped|minced|sliced|grated|shredded|crushed|melted|softened|beaten|sifted|divided|plus|for|to|at room temperature|optional)\b.*$/i, "");
  text = text.replace(/\s+(?:to taste|as needed|for (?:serving|garnish|topping))\b.*$/i, "");
  return cleanText(text).replace(/[,;\s]+$/, "") || cleanText(value);
}

function renderStandardItems() {
  const container = $("#standard-items-list");
  if (!container) return;
  container.innerHTML = "";
  if (!state.commonItems.length) {
    container.innerHTML = `<div class="empty-inline">No standard items yet.</div>`;
    return;
  }

  const list = document.createElement("ul");
  list.className = "items standard-items";
  list.innerHTML = state.commonItems.map((item) => `
    <li class="item-row ${item.tag ? `tag-${escapeHtml(item.tag)}` : ""}">
      <span class="item-main">
        <span>${escapeHtml(item.name)}</span>
      </span>
      <span class="item-actions">
        <select class="tag-select" data-standard-tag="${escapeHtml(item.name)}" aria-label="Tag ${escapeHtml(item.name)}">
          ${tagOptions(item.tag)}
        </select>
        <button class="danger small" data-remove-standard-item="${escapeHtml(item.name)}" type="button">Remove</button>
      </span>
    </li>
  `).join("");
  container.append(list);

  container.querySelectorAll("[data-standard-tag]").forEach((select) => select.addEventListener("change", () => {
    upsertStandardItem(select.dataset.standardTag, select.value);
  }));
  container.querySelectorAll("[data-remove-standard-item]").forEach((button) => button.addEventListener("click", () => {
    removeStandardItem(button.dataset.removeStandardItem);
  }));
}

function learnStandardItem(name, tag) {
  if (!name.trim()) return;
  const existing = standardItemByName(name);
  if (existing) {
    if (tag && existing.tag !== tag) upsertStandardItem(existing.name, tag);
    return;
  }
  upsertStandardItem(name, tag);
}

function upsertStandardItem(name, tag) {
  const trimmedName = name.trim();
  if (!trimmedName) return;
  const normalizedName = normalizeItemName(trimmedName);
  const existing = state.commonItems.find((item) => normalizeItemName(item.name) === normalizedName);
  const item = {
    name: existing?.name || trimmedName,
    tag: normalizeTag(tag)
  };

  if (existing) {
    Object.assign(existing, item);
  } else {
    state.commonItems.push(item);
  }

  state.removedCommonItems = (state.removedCommonItems || []).filter((itemName) => normalizeItemName(itemName) !== normalizedName);
  state.commonItems.sort((a, b) => a.name.localeCompare(b.name));
  if (item.tag) {
    rememberTag(item.name, item.tag);
  } else {
    forgetRememberedTag(item.name);
  }
  saveStandardItems();
}

function removeStandardItem(name) {
  const normalizedName = normalizeItemName(name);
  state.commonItems = state.commonItems.filter((item) => normalizeItemName(item.name) !== normalizedName);
  state.removedCommonItems = [...new Set([...(state.removedCommonItems || []), name])];
  forgetRememberedTag(name);
  saveStandardItems();
}

function saveStandardItems() {
  renderCommonItemOptions();
  renderStandardItems();
  saveState();
}

function standardItemByName(name) {
  const normalizedName = normalizeItemName(name);
  return state.commonItems.find((item) => normalizeItemName(item.name) === normalizedName);
}

function renderCommonItemOptions() {
  $("#common-item-options").innerHTML = state.commonItems
    .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
    .join("");
}

function applySuggestedTag(itemSelector, tagSelector) {
  const tag = getSuggestedTag($(itemSelector).value);
  if (tag) $(tagSelector).value = tag;
}

function getSuggestedTag(name) {
  const normalizedName = normalizeItemName(name);
  return normalizeTag(userTags()[normalizedName]) || commonItemTags()[normalizedName] || "";
}

function commonItemTags() {
  return Object.fromEntries(state.commonItems.map((item) => [normalizeItemName(item.name), normalizeTag(item.tag)]));
}

function normalizeTag(tag) {
  return TAGS.includes(tag) ? tag : "";
}

function normalizeRecipeIngredients(ingredients = []) {
  return ingredients.map((ingredient) => {
    if (typeof ingredient === "string") {
      return {
        id: id("ingredient"),
        name: ingredient,
        quantity: "",
        tag: getSuggestedTag(ingredient)
      };
    }

    return {
      id: ingredient.id || id("ingredient"),
      name: ingredient.name || "",
      quantity: ingredient.quantity || "",
      tag: normalizeTag(ingredient.tag)
    };
  }).filter((ingredient) => ingredient.name);
}

function normalizeItemName(name) {
  return name.trim().toLowerCase();
}

function userTags() {
  if (!state.itemTags[sessionEmail]) state.itemTags[sessionEmail] = {};
  return state.itemTags[sessionEmail];
}

function getRememberedTag(name) {
  return getSuggestedTag(name);
}

function rememberTag(name, tag) {
  const normalizedTag = normalizeTag(tag);
  if (!normalizedTag) return;
  userTags()[normalizeItemName(name)] = normalizedTag;
}

function forgetRememberedTag(name) {
  delete userTags()[normalizeItemName(name)];
}

function addEmpty(container) {
  container.append(emptyTemplate.content.cloneNode(true));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

$("#refresh-data").addEventListener("click", refreshWorkspace);
$("#download-unsaved").addEventListener("click", () => {
  if (failedDraft) downloadJSON({ email: sessionEmail, recipes: failedDraft.recipes, lists: failedDraft.lists, itemTags: failedDraft.itemTags, commonItems: failedDraft.commonItems }, "shopping-list-unsaved.json");
});
$("#import-local").addEventListener("click", async () => {
  if (busy) return;
  if (!sessionUser.email_confirmed_at) { setStatus("Confirm your email before importing local records.", true); return; }
  const legacy = loadState();
  const generation = authGeneration;
  const user = sessionUser;
  setBusy(true, "Preparing local import…");
  try {
    const imported = await CloudStore.legacyRecords(legacy, user);
    if (generation !== authGeneration) return;
    let count = 0;
    for (const key of ["recipes","lists"]) {
      const existing = new Set(state[key].map(r => r.id));
      for (const row of imported[key]) if (!existing.has(row.id)) { state[key].push(row); count++; }
    }
    if (!count) { setStatus("These local records have already been imported."); return; }
    saveState();
  } catch (error) { if (generation === authGeneration) setStatus("Import failed: " + error.message, true); }
  finally { if (generation === authGeneration && !saveScheduled && !saveInFlight) setBusy(false); }
});
window.addEventListener("beforeunload", event => {
  if (busy || failedDraft || recipeDirty) { event.preventDefault(); event.returnValue = ""; }
});
cloud.auth.onAuthStateChange((event, session) => {
  // Never await Supabase calls inside its auth lock.
  if (event === "TOKEN_REFRESHED") return;
  setTimeout(() => { handleSession(session).then(() => {
    if (event === "PASSWORD_RECOVERY") $("#password-reset-dialog").showModal();
  }).catch(error => { authMessage.textContent = error.message; }); }, 0);
});
$("#forgot-password").addEventListener("click", async () => {
  const email = normalizeEmail($("#auth-email").value);
  if (!email) { authMessage.textContent = "Enter your email first."; return; }
  const button = $("#forgot-password"); button.disabled = true;
  try {
    const { error } = await cloud.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
    authMessage.textContent = "If an account exists, check its email for a reset link.";
  } catch (error) { authMessage.textContent = error.message; }
  finally { button.disabled = false; }
});
$("#password-reset-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    const { error } = await cloud.auth.updateUser({ password: $("#reset-password").value });
    if (error) throw error;
    $("#reset-password").value = "";
    $("#password-reset-dialog").close();
    setStatus("Password updated");
  } catch (error) { $("#reset-message").textContent = error.message; }
  finally { button.disabled = false; }
});
showAuth();
authMessage.textContent = "Connecting to Supabase…";
cloud.auth.getSession().then(({ data, error }) => {
  if (error) authMessage.textContent = error.message;
  else if (!data.session) authMessage.textContent = "";
}).catch(error => { authMessage.textContent = error.message; });


function updateRecoveryActions() {
  $("#download-unsaved").classList.toggle("hidden", !failedDraft);
  $("#discard-unsaved").classList.toggle("hidden", !failedDraft);
}
function rememberRecoveryDraft(draft) {
  if (!sessionUser) return;
  const recovery = { ...draft, users: {}, recipes: draft.recipes.filter(owned), lists: draft.lists.filter(owned) };
  try { sessionStorage.setItem("recipe-support-draft:" + sessionUser.id, JSON.stringify({ at: Date.now(), draft: recovery })); }
  catch { setStatus("This browser cannot keep a recovery backup. Download unsaved changes before closing if a save fails.", true); }
}
function restoreRecoveryDraft() {
  try {
    const raw = JSON.parse(sessionStorage.getItem("recipe-support-draft:" + sessionUser.id));
    if (raw && Date.now() - raw.at < 86400000) failedDraft = raw.draft;
    else forgetRecoveryDraft();
  } catch { forgetRecoveryDraft(); }
  updateRecoveryActions();
}
function forgetRecoveryDraft() {
  if (sessionUser) { try { sessionStorage.removeItem("recipe-support-draft:" + sessionUser.id); } catch {} }
}
$("#discard-unsaved").addEventListener("click", () => {
  if (!confirm("Discard the recovery backup? Download it first if you still need those changes.")) return;
  failedDraft = null; forgetRecoveryDraft(); updateRecoveryActions();
});
function discardRecipeDraft() {
  if (recipeDirty && !confirm("Discard unsaved recipe edits?")) return false;
  recipeDirty = false; return true;
}
recipeForm.addEventListener("input", () => { recipeDirty = true; });
recipeForm.addEventListener("change", () => { recipeDirty = true; });
window.addEventListener("offline", () => { setStatus("Offline. Changes cannot be saved until you reconnect.", true); });
window.addEventListener("online", () => { setStatus("Connection restored. Refresh cloud data before retrying a failed save."); });
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
window.recipeAppReady = true;
