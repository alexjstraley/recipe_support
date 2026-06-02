const STORAGE_KEY = "recipe-support-state-v1";
const SESSION_KEY = "recipe-support-session-v1";

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

const TAGS = ["green", "orange", "red", "blue", "purple", "yellow"];
const TAG_LABELS = {
  green: "Green",
  orange: "Orange",
  red: "Red",
  blue: "Blue",
  purple: "Purple",
  yellow: "Yellow"
};

let state = ensureState(loadState());
let sessionEmail = localStorage.getItem(SESSION_KEY);
let authMode = "signin";
let editingRecipeId = null;
let creatingRecipe = false;
let activeListId = null;
let draftRecipeIngredients = [];

const $ = (selector) => document.querySelector(selector);
const emptyTemplate = $("#empty-state-template");

const authScreen = $("#auth-screen");
const appScreen = $("#app-screen");
const authForm = $("#auth-form");
const authMessage = $("#auth-message");
const authSubmit = $("#auth-submit");
const recipeForm = $("#recipe-form");
const listForm = $("#list-form");
const listDetailsForm = $("#list-details-form");
const accountForm = $("#account-form");
const standardItemForm = $("#standard-item-form");

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
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
    if (!commonItemsByName[normalizedName] && !removedNames.has(normalizedName)) {
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 150000, hash: "SHA-256" },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function canAccess(record) {
  return record.owner === sessionEmail || record.sharedWith.includes(sessionEmail);
}

function owned(record) {
  return record.owner === sessionEmail;
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
  const email = normalizeEmail($("#auth-email").value);
  const password = $("#auth-password").value;
  authMessage.textContent = "";

  if (authMode === "signup") {
    if (state.users[email]) {
      authMessage.textContent = "An account already exists for this email.";
      return;
    }
    const salt = crypto.randomUUID();
    state.users[email] = {
      email,
      salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };
    saveState();
    startSession(email);
    return;
  }

  const user = state.users[email];
  if (!user || user.passwordHash !== (await hashPassword(password, user.salt))) {
    authMessage.textContent = "Email or password was not recognized.";
    return;
  }
  startSession(email);
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

$("#sign-out").addEventListener("click", () => {
  localStorage.removeItem(SESSION_KEY);
  sessionEmail = null;
  showAuth();
});

$("#export-data").addEventListener("click", () => {
  const exportable = {
    exportedAt: new Date().toISOString(),
    email: sessionEmail,
    recipes: currentRecipes(),
    lists: currentLists()
  };
  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "recipe-support-export.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentUser = state.users[sessionEmail];
  const nextEmail = normalizeEmail($("#account-email").value);
  const currentPassword = $("#account-current-password").value;
  const nextPassword = $("#account-new-password").value;
  const message = $("#account-message");
  message.classList.remove("success");
  message.textContent = "";

  if (!currentUser || currentUser.passwordHash !== (await hashPassword(currentPassword, currentUser.salt))) {
    message.textContent = "Current password was not recognized.";
    return;
  }

  if (nextEmail !== sessionEmail && state.users[nextEmail]) {
    message.textContent = "An account already exists for that email.";
    return;
  }

  const previousEmail = sessionEmail;
  const updatedUser = { ...currentUser, email: nextEmail };
  if (nextPassword) {
    updatedUser.salt = crypto.randomUUID();
    updatedUser.passwordHash = await hashPassword(nextPassword, updatedUser.salt);
  }

  if (nextEmail !== previousEmail) {
    delete state.users[previousEmail];
    state.recipes.forEach((recipe) => migrateRecordEmail(recipe, previousEmail, nextEmail));
    state.lists.forEach((list) => migrateRecordEmail(list, previousEmail, nextEmail));
    if (state.itemTags[previousEmail]) {
      state.itemTags[nextEmail] = { ...state.itemTags[nextEmail], ...state.itemTags[previousEmail] };
      delete state.itemTags[previousEmail];
    }
  }

  state.users[nextEmail] = updatedUser;
  sessionEmail = nextEmail;
  localStorage.setItem(SESSION_KEY, nextEmail);
  saveState();
  renderProfile();
  render();
  $("#workspace-title").textContent = `${sessionEmail.split("@")[0]}'s Grocery Lists`;
  $("#account-current-password").value = "";
  $("#account-new-password").value = "";
  message.classList.add("success");
  message.textContent = "Account updated.";
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
  if ($("#recipe-ingredient-item").value.trim()) addDraftRecipeIngredient();
  const now = new Date().toISOString();
  const payload = {
    title: $("#recipe-name").value.trim(),
    servings: Number($("#recipe-servings").value),
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
    const recipe = { id: id("recipe"), owner: sessionEmail, createdAt: now, ...payload };
    state.recipes.push(recipe);
    editingRecipeId = recipe.id;
  }

  creatingRecipe = false;
  saveState();
  render();
});

$("#clear-recipe").addEventListener("click", startNewRecipe);
$("#new-recipe").addEventListener("click", startNewRecipe);
$("#delete-recipe").addEventListener("click", () => {
  if (editingRecipeId) deleteRecipe(editingRecipeId);
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
    $("#detail-list-name").focus();
    return;
  }

  const list = state.lists.find((item) => item.id === activeListId);
  if (!list || !assertOwner(list)) return;

  if (newItem) addGroceryItem(list, newItem, quantity, tag);
  list.updatedAt = now;
  saveState();
  clearListItemFields();
  render();
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
      owner: sessionEmail,
      createdAt: now,
      items: [],
      ...payload
    };
    state.lists.push(list);
  }

  activeListId = list.id;
  saveState();
  render();
  $("#list-item").focus();
});

$("#clear-list").addEventListener("click", clearListItemFields);
$("#new-list").addEventListener("click", startNewList);
$("#clear-checked").addEventListener("click", clearCheckedItems);
$("#list-item").addEventListener("input", () => {
  applySuggestedTag("#list-item", "#list-tag");
});
$("#list-item").addEventListener("change", () => {
  applySuggestedTag("#list-item", "#list-tag");
});

function startSession(email) {
  sessionEmail = email;
  localStorage.setItem(SESSION_KEY, email);
  showApp();
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

function migrateRecordEmail(record, previousEmail, nextEmail) {
  if (record.owner === previousEmail) record.owner = nextEmail;
  record.sharedWith = [...new Set(record.sharedWith.map((email) => email === previousEmail ? nextEmail : email))];
}

function renderRecipes(recipes, lists) {
  const container = $("#recipes-list");
  container.innerHTML = "";
  if (!recipes.length) {
    addEmpty(container);
    renderActiveRecipe(null, lists);
    return;
  }

  recipes.forEach((recipe) => {
    const button = document.createElement("button");
    button.className = `list-chip ${recipe.id === editingRecipeId ? "active" : ""}`;
    button.type = "button";
    button.dataset.openRecipe = recipe.id;
    button.innerHTML = `
      <span>
        <strong>${escapeHtml(recipe.title)}</strong>
        <small>${recipe.servings} servings &middot; ${normalizeRecipeIngredients(recipe.ingredients).length} ingredients</small>
      </span>
    `;
    container.append(button);
  });

  container.querySelectorAll("[data-open-recipe]").forEach((button) => button.addEventListener("click", () => openRecipe(button.dataset.openRecipe)));
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

  if (recipe) {
    draftRecipeIngredients = normalizeRecipeIngredients(recipe.ingredients);
    $("#recipe-name").value = recipe.title;
    $("#recipe-servings").value = recipe.servings;
    $("#recipe-shared").value = recipe.sharedWith.join(", ");
    $("#recipe-instructions").value = recipe.instructions;
  } else {
    clearRecipeFields();
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

  if (!draftRecipeIngredients.length) {
    container.innerHTML = `<div class="empty-inline">Add the first ingredient above.</div>`;
    return;
  }

  const detail = document.createElement("article");
  detail.className = "card active-list-card";
  detail.innerHTML = `
    <ul class="items shopping-items">
      ${draftRecipeIngredients.map((ingredient) => `
        <li class="item-row ${ingredient.tag ? `tag-${escapeHtml(ingredient.tag)}` : ""}">
          <span class="item-main">
            ${ingredient.quantity ? `<span class="item-quantity">${escapeHtml(ingredient.quantity)}</span>` : ""}
            <span>${escapeHtml(ingredient.name)}</span>
          </span>
          <span class="item-actions">
            <select class="tag-select" data-recipe-tag="${ingredient.id}" aria-label="Tag ${escapeHtml(ingredient.name)}" ${canEdit ? "" : "disabled"}>
              ${tagOptions(ingredient.tag)}
            </select>
            <button class="danger small" data-remove-recipe-ingredient="${ingredient.id}" type="button" ${canEdit ? "" : "disabled"}>Remove</button>
          </span>
        </li>
      `).join("")}
    </ul>
  `;
  container.append(detail);

  container.querySelectorAll("[data-recipe-tag]").forEach((select) => select.addEventListener("change", () => tagDraftRecipeIngredient(select.dataset.recipeTag, select.value)));
  container.querySelectorAll("[data-remove-recipe-ingredient]").forEach((button) => button.addEventListener("click", () => removeDraftRecipeIngredient(button.dataset.removeRecipeIngredient)));
}

function renderLists(lists) {
  const directory = $("#lists-list");
  const activeItems = $("#active-list-items");
  directory.innerHTML = "";
  activeItems.innerHTML = "";

  if (!lists.length) {
    $("#active-list-title").textContent = "Start a grocery list";
    $("#detail-list-name").value = "";
    $("#detail-list-shared").value = "";
    addEmpty(directory);
    addEmpty(activeItems);
    return;
  }

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

  const detail = document.createElement("article");
  detail.className = "card active-list-card";
  detail.innerHTML = `
    <div class="pill-row">
      <span class="pill">${owned(list) ? "Owner" : "Shared"}</span>
      ${list.sharedWith.map((email) => `<span class="pill">${escapeHtml(email)}</span>`).join("")}
    </div>
    <ul class="items shopping-items">
      ${sortedItems(list).map((item) => `
        <li class="item-row ${item.done ? "done" : ""} ${item.tag ? `tag-${escapeHtml(item.tag)}` : ""}">
          <span class="item-main">
            ${item.quantity ? `<span class="item-quantity">${escapeHtml(item.quantity)}</span>` : ""}
            <span>${escapeHtml(item.name)}</span>
          </span>
          <span class="item-actions">
            <select class="tag-select" data-tag-item="${list.id}:${item.id}" aria-label="Tag ${escapeHtml(item.name)}">
              ${tagOptions(item.tag)}
            </select>
            <button class="ghost small" data-toggle-item="${list.id}:${item.id}" type="button">${item.done ? "Undo" : "Done"}</button>
            <button class="danger small" data-remove-item="${list.id}:${item.id}" type="button">Remove</button>
          </span>
        </li>
      `).join("") || `<li class="empty-inline">Add the first item above.</li>`}
    </ul>
    <div class="card-actions">
      <button class="danger small" data-delete-list="${list.id}" type="button">Delete list</button>
    </div>
  `;
  container.append(detail);

  container.querySelectorAll("[data-delete-list]").forEach((button) => button.addEventListener("click", () => deleteList(button.dataset.deleteList)));
  container.querySelectorAll("[data-toggle-item]").forEach((button) => button.addEventListener("click", () => toggleItem(button.dataset.toggleItem)));
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
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !canAccess(recipe)) return;
  editingRecipeId = recipeId;
  creatingRecipe = false;
  render();
  $("#recipe-name").focus();
}

function deleteRecipe(recipeId) {
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
  $("#list-item").focus();
}

function deleteList(listId) {
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
  item.done = !item.done;
  list.updatedAt = new Date().toISOString();
  saveState();
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
  $("#detail-list-name").value = "";
  $("#detail-list-shared").value = "";
  clearListItemFields();
  $("#active-list-items").innerHTML = "";
  addEmpty($("#active-list-items"));
  renderListSelection();
  $("#detail-list-name").focus();
}

function renderListSelection() {
  document.querySelectorAll(".list-chip").forEach((button) => button.classList.remove("active"));
}

function startNewRecipe() {
  editingRecipeId = null;
  creatingRecipe = true;
  renderRecipeSelection();
  renderActiveRecipe(null, currentLists());
  $("#recipe-name").focus();
}

function renderRecipeSelection() {
  document.querySelectorAll("[data-open-recipe]").forEach((button) => button.classList.remove("active"));
}

function clearRecipeFields() {
  draftRecipeIngredients = [];
  recipeForm.reset();
  $("#recipe-servings").value = 4;
  clearRecipeIngredientFields();
  renderRecipeIngredients(true);
}

function addDraftRecipeIngredient() {
  const name = $("#recipe-ingredient-item").value.trim();
  const quantity = $("#recipe-ingredient-quantity").value.trim();
  const tag = $("#recipe-ingredient-tag").value;

  if (!name) {
    $("#recipe-ingredient-item").focus();
    return;
  }

  draftRecipeIngredients.push({
    id: id("ingredient"),
    name,
    quantity,
    tag: normalizeTag(tag)
  });
  if (tag) rememberTag(name, tag);
  learnStandardItem(name, tag);
  clearRecipeIngredientFields();
  renderRecipeIngredients(true);
}

function removeDraftRecipeIngredient(ingredientId) {
  draftRecipeIngredients = draftRecipeIngredients.filter((ingredient) => ingredient.id !== ingredientId);
  renderRecipeIngredients(true);
}

function tagDraftRecipeIngredient(ingredientId, tag) {
  const ingredient = draftRecipeIngredients.find((item) => item.id === ingredientId);
  if (!ingredient) return;
  ingredient.tag = normalizeTag(tag);
  if (ingredient.tag) rememberTag(ingredient.name, ingredient.tag);
  learnStandardItem(ingredient.name, ingredient.tag);
  renderRecipeIngredients(true);
}

function clearRecipeIngredientFields() {
  $("#recipe-ingredient-item").value = "";
  $("#recipe-ingredient-quantity").value = "";
  $("#recipe-ingredient-tag").value = "";
}

function clearListItemFields() {
  $("#list-item").value = "";
  $("#list-quantity").value = "";
  $("#list-tag").value = "";
  $("#list-item").focus();
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
    `<option value="">No tag</option>`,
    ...TAGS.map((tag) => `<option value="${tag}" ${tag === normalizedSelectedTag ? "selected" : ""}>${TAG_LABELS[tag]}</option>`)
  ].join("");
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

renderCommonItemOptions();
saveState();

if (sessionEmail && state.users[sessionEmail]) {
  showApp();
} else {
  showAuth();
}
