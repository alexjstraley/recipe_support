const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Exercise the browser's actual parser without starting the authenticated app.
const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
const context = vm.createContext({ getSuggestedTag: () => "" });
const functions = ["parseRecipeText", "inferRecipeTitle", "splitRecipeTextSections", "inferRecipeTextSections", "isIngredientSubheading", "stripListMarker", "uniqueLines", "parseImportedIngredient", "mainIngredientName", "parseServings", "arrayify", "cleanText"];
for (const name of functions) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}", start) + 2;
  vm.runInContext(source.slice(start, end), context);
}

const ingredientLines = [
  ["8 oz", "(about 2 cups) macaroni or pasta of choice"],
  ["½ cup", "nutritional yeast"],
  ["1 cup", "canned white beans (cannellini or Great Northern), rinsed and drained"],
  ["1 cup", "yellow potatoes, peeled and diced (about 1 medium potato)"],
  ["½ cup", "carrots, peeled and diced (for natural color)"],
  ["½ cup", "raw cashews (or raw sunflower seeds for a nut-free version)"],
  ["1 cup", "reserved potato/carrot boiling water"],
  ["2 tbsp", "olive oil or unsalted vegan butter (soy-free)"],
  ["1 tbsp", "fresh lemon juice"],
  ["1 tsp", "garlic powder"],
  ["1 tsp", "onion powder"],
  ["½ tsp", "smoked paprika"],
  ["1 tsp", "fine sea salt (adjust to taste)"],
  ["¼ tsp", "ground black pepper"]
];

test("pasted mac and cheese ignores Markdown fences and ingredient subheadings", () => {
  const recipe = context.parseRecipeText([
    '"', "Vegan mac and cheese", "Prep Time & Nutrition Info", "```",
    "Prep time: 10 minutes", "Cook time: 15 minutes", "Yield: 4 servings",
    "Protein: ~14–16g per serving (higher if using legume-based pasta)", "```",
    "Ingredients", "For the Pasta", "```", ingredientLines[0].join(" "), "```",
    "For the High-Protein Cheese Sauce", "```java",
    ...ingredientLines.slice(1).map(parts => parts.join(" ")), "```",
    "Instructions", "```vbnet", "Boil the Vegetables & Nuts",
    "Bring a small pot of water to a boil. Add the diced potatoes, carrots, and cashews (or sunflower seeds). Boil for 10–12 minutes until the vegetables are completely fork-tender.",
    "Before draining, measure and set aside 1 cup of the hot boiling water.",
    "Cook the Pasta", "Cook your macaroni in salted boiling water until al dente.",
    "Blend the Protein Cheese Sauce", "Blend on high speed for 60–90 seconds until completely smooth and velvety.",
    "Combine & Heat Through", "Stir gently over low heat for 1–2 minutes.", "```",
    "Optional Variational Touches", "```sql",
    "Double Bean Crunch: Reserve ½ cup of whole white beans and stir them in at the end alongside the sauce for extra texture.",
    "Greens Stir-In: Toss 2 cups of fresh baby spinach into the pot during the last minute of heating—the warm sauce will wilt it gently."
  ].join("\r\n"));
  assert.equal(recipe.title, "Vegan mac and cheese");
  assert.equal(recipe.servings, 4);
  const names = ["macaroni", "nutritional yeast", "canned white beans", "yellow potatoes", "carrots", "raw cashews", "reserved potato/carrot boiling water", "olive oil", "fresh lemon juice", "garlic powder", "onion powder", "smoked paprika", "fine sea salt", "ground black pepper"];
  assert.deepEqual(Array.from(recipe.ingredients, ({ quantity, name }) => [quantity, name]), ingredientLines.map(([quantity], i) => [quantity, names[i]]));
  assert.match(recipe.instructions, /Before draining, measure and set aside 1 cup/);
  assert.match(recipe.instructions, /Greens Stir-In:/);
  assert.doesNotMatch(recipe.instructions, /```|vbnet|sql/);
});

test("Markdown headings and plain ingredients work without cooking directions", () => {
  const recipe = context.parseRecipeText("# Soup\n## Ingredients\n**For the soup**\n~~~text\n- 1/2 cup lentils\n- Salt to taste\n~~~");
  assert.equal(recipe.title, "Soup");
  assert.equal(recipe.servings, null);
  assert.deepEqual(Array.from(recipe.ingredients, ({ quantity, name }) => [quantity, name]), [["1/2 cup", "lentils"], ["", "Salt"]]);
});

test("ingredient cleanup retains identifying words and removes preparation and alternatives", () => {
  for (const [line, name] of [
    ["1 cup canned white beans (cannellini or Great Northern), rinsed and drained", "canned white beans"],
    ["2 tbsp olive oil or unsalted vegan butter (soy-free)", "olive oil"],
    ["1 cup tomatoes (fresh (preferred) or canned), diced", "tomatoes"],
    ["1 tsp salt, divided", "salt"],
    ["1 cup chopped walnuts", "chopped walnuts"],
    ["1 cup flour, all-purpose", "flour, all-purpose"],
    ["1 cup half-and-half", "half-and-half"]
  ]) assert.equal(context.parseImportedIngredient(line).name, name);
});
