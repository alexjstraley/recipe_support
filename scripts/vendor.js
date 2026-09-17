const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const pkg = path.join(root, "node_modules/@supabase/supabase-js");
const version = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"))).version;
if (version !== require("../package.json").dependencies["@supabase/supabase-js"]) throw new Error("Unexpected Supabase version");
fs.mkdirSync(path.join(root,"vendor"), { recursive:true });
for (const [source,target] of [["dist/umd/supabase.js","supabase.js"],["LICENSE","LICENSE.supabase"]]) {
  fs.copyFileSync(path.join(pkg,source),path.join(root,"vendor",target));
}
const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"vendor/supabase.js"))).digest("hex");
fs.writeFileSync(path.join(root,"vendor/manifest.json"),JSON.stringify({package:"@supabase/supabase-js",version,sha256:digest},null,2)+"\n");
console.log("Vendored Supabase " + version);
