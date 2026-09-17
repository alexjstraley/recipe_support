const playwright = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const server = spawn(process.execPath, ["local-server.js"], { cwd: require("node:path").join(__dirname,".."), env: { ...process.env, PORT: "4174", NO_OPEN: "1" }, stdio: "pipe" });
(async () => {
  await new Promise((resolve, reject) => { server.stdout.once("data", resolve); server.once("error", reject); });
  const browser = await playwright[process.env.BROWSER || "chromium"].launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL}:{}), headless: true });
  try {
    const mobile = process.env.MOBILE === "1";
    const page = await browser.newPage(mobile ? {viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:2} : {});
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const user = { id: "11111111-1111-4111-8111-111111111111", email: "test@example.com", email_confirmed_at: "2026-01-01", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
    const token = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")+"."+Buffer.from(JSON.stringify({ sub:user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")+".test";
    let workspace = { recipes: [], lists: [], tags: {}, profile: null };
    let failSave = false;
    await page.route("https://gsxjvjrzcqlldfgdzsjm.supabase.co/**", async route => {
      const url = route.request().url();
      let body = {};
      let status = 200;
      if (url.includes("/auth/v1/token")) body = { access_token: token, refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
      else if (url.includes("/auth/v1/user")) body = user;
      else if (url.includes("/rpc/load_workspace")) body = workspace;
      else if (url.includes("/rpc/save_workspace")) {
        if (failSave) { status = 400; body = { message: "Simulated save failure", code: "P0001" }; }
        else {
          for (const c of route.request().postDataJSON().changes) {
            if (c.kind === "list") {
              workspace.lists = workspace.lists.filter(l => l.id !== c.id);
              if (c.operation !== "delete") workspace.lists.push({ id:c.id, owner_id:user.id, name:c.data.name, shares:c.data.sharedWith, created_at:new Date().toISOString(), updated_at:new Date().toISOString(), items:c.data.items.map(i=>({...i,checked:i.done})) });
            } else if (c.kind === "recipe") {
              workspace.recipes = workspace.recipes.filter(r => r.id !== c.id);
              if (c.operation !== "delete") workspace.recipes.push({ id:c.id, owner_id:user.id, title:c.data.title, servings:c.data.servings, instructions:c.data.instructions, shares:c.data.sharedWith, created_at:new Date().toISOString(), updated_at:new Date().toISOString(), ingredients:c.data.ingredients });
            } else if (c.kind === "preferences") {
              workspace.profile = { preferences: c.data.preferences, updated_at: new Date().toISOString() };
              workspace.tags = c.data.tags;
            }
          }
          body = workspace;
        }
      }
      await route.fulfill({ status, contentType:"application/json", body:JSON.stringify(body) });
    });
    await page.goto("http://127.0.0.1:4174");
    const headers = (await page.request.get("http://127.0.0.1:4174")).headers();
    assert.match(headers["content-security-policy"],/frame-ancestors 'none'/);
    assert.match(headers["content-security-policy"],/script-src 'self'/);
    assert.equal(headers["referrer-policy"],"no-referrer");
    assert.equal((await page.request.post("http://127.0.0.1:4174/app.js")).status(),405);
    assert.equal((await page.request.get("http://127.0.0.1:4174",{headers:{Host:"attacker.example"}})).status(),400);
    await page.locator("#auth-email").fill(user.email);
    await page.locator("#auth-password").fill("test-password-123");
    await page.locator("#auth-submit").click();
    await page.locator("#app-screen").waitFor({state:"visible"});
    if (mobile) assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Mobile workspace overflows horizontally");
    await page.evaluate(() => startNewList());
    await page.locator("#detail-list-name").fill("Cloud shopping");
    await page.locator("#list-details-form button[type=submit]").click();
    await page.waitForFunction(() => document.querySelector("#sync-status").textContent === "Saved to Supabase");
    assert.equal(workspace.lists[0].name,"Cloud shopping");
    await page.reload();
    await page.locator("#app-screen").waitFor({state:"visible"});
    assert.match(await page.locator("#active-list-title").textContent(),/Cloud shopping/);
    await page.evaluate(() => { addGroceryItem(state.lists[0],"Beans","1/2 cup","green"); saveState(); render(); });
    await page.waitForFunction(() => document.querySelector("#sync-status").textContent === "Saved to Supabase");
    assert.equal(workspace.lists[0].items.length,1);
    await page.locator("[data-shopping-item]").click();
    await page.waitForFunction(() => document.querySelector("#sync-status").textContent === "Saved to Supabase");
    assert.equal(workspace.lists[0].items[0].checked,true);
    await page.locator('[data-view="recipes"]').click();
    await page.locator("#new-recipe").click();
    await page.locator("#recipe-name").fill("Cloud soup");
    await page.locator("#recipe-instructions").fill("Simmer until ready.");
    await page.locator("#recipe-ingredient-item").fill("Lentils");
    await page.locator("#recipe-ingredient-quantity").fill("1 cup");
    await page.locator("#add-recipe-ingredient").click();
    await page.waitForFunction(() => !busy);
    assert.equal(await page.locator("#recipe-name").inputValue(),"Cloud soup");
    assert.equal(await page.evaluate(() => draftRecipeIngredients.length),1);
    await page.locator("#save-recipe").click();
    await page.waitForFunction(() => document.querySelector("#sync-status").textContent === "Saved to Supabase");
    assert.equal(workspace.recipes[0].title,"Cloud soup");
    assert.equal(workspace.recipes[0].ingredients[0].quantity,"1 cup");
    await page.reload();
    await page.locator("#app-screen").waitFor({state:"visible"});
    await page.locator('[data-view="recipes"]').click();
    assert.equal(await page.locator("#recipe-name").inputValue(),"Cloud soup");
    await page.locator('[data-view="groceries"]').click();
    // Stored content stays text even when it looks like HTML.
    await page.evaluate(() => { state.lists[0].items[0].name = '<img src=x onerror="window.xss=true">'; render(); });
    assert.equal(await page.locator("#active-list-items img").count(),0);
    assert.equal(await page.evaluate(()=>window.xss),undefined);
    if (mobile) assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Mobile item layout overflows");
    failSave = true;
    await page.locator("[data-shopping-item]").click();
    await page.waitForFunction(() => document.querySelector("#sync-status").textContent.includes("Save failed"));
    assert.equal(await page.locator("[data-shopping-item]").getAttribute("aria-pressed"),"true");
    await page.locator("#download-unsaved").waitFor({state:"visible"});
    // Recovery survives a mobile tab reload without automatically replaying the failed mutation.
    await page.reload();
    await page.locator("#app-screen").waitFor({state:"visible"});
    await page.locator("#download-unsaved").waitFor({state:"visible"});
    if (process.env.SCREENSHOT_PATH) await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
    await page.locator("#profile-toggle").click();
    await page.locator("#sign-out").click();
    await page.locator("#auth-screen").waitFor({state:"visible"});
    assert.equal(await page.evaluate(() => sessionUser),null);
    assert.equal(await page.locator("#active-list-items").textContent(),"");
    assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("recipe-support-draft:")).length),0);
    assert.equal((await page.request.get("http://127.0.0.1:4174/.env.local")).status(),404);
    assert.deepEqual(errors,[]);
    console.log("PASS: "+(mobile?"mobile":"desktop")+" auth, list/recipe saves, draft retention, reload recovery, stored-XSS rendering, sign-out cleanup, security headers and private-file blocking");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => server.kill());
