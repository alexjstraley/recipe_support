const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseVoiceGroceryPhrase: parse } = require("../voice-entry");

test("separates spoken quantities from the grocery item", () => {
  for (const [spoken, name, quantity] of [
    ["two heads of broccoli", "broccoli", "2 heads"],
    ["Please add two heads of brocoli.", "Broccoli", "2 heads"],
    ["three carrots", "carrots", "3"],
    ["one and a half pounds of potatoes", "potatoes", "1 1/2 pounds"],
    ["a half pound of mushrooms", "mushrooms", "1/2 pound"],
    ["half a pound of mushrooms", "mushrooms", "1/2 pound"],
    ["1 1/2 cups of oats", "oats", "1 1/2 cups"],
    ["2% milk", "2% milk", ""],
  ]) assert.deepEqual(parse(spoken, ["Broccoli"]), { name, quantity }, spoken);
});

test("matches remembered names conservatively without erasing qualifiers", () => {
  assert.equal(parse("two bags of brocoli", ["Broccoli"]).name, "Broccoli");
  assert.equal(parse("shiitake mushroms", ["Shiitake mushrooms"]).name, "Shiitake mushrooms");
  assert.equal(parse("oat milk", ["Goat milk"]).name, "oat milk");
  assert.equal(parse("green apples", ["Apples"]).name, "green apples");
  assert.equal(parse("berry", ["Merry", "Terry"]).name, "berry");
  assert.equal(parse("dragon fruit", ["Broccoli"]).name, "dragon fruit");
  assert.deepEqual(parse("Two Good yogurt", ["Two Good yogurt"]), {name: "Two Good yogurt", quantity: ""});
  assert.deepEqual(parse("two boxes of mac and cheese", ["Mac and cheese"]), {name: "mac and cheese", quantity: "2 boxes"});
});

test("preserves simple multiple items without sharing differing quantities", () => {
  assert.deepEqual(parse("add carrots and broccoli."), { name: "carrots, broccoli", quantity: "" });
  assert.equal(parse("two carrots and three onions").needsSingleItem, true);
});
