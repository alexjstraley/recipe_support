const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname,"..");
const output = path.join(root,"dist");
const manifest = require("../vendor/manifest.json");
const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"vendor/supabase.js"))).digest("hex");
if (digest !== manifest.sha256 || manifest.version !== require("../package.json").dependencies["@supabase/supabase-js"]) throw new Error("Run pnpm vendor to update the SDK");
// Refuse stale artifacts rather than publishing files outside the allowlist.
if (fs.existsSync(output)) {
  const allowed = new Set([...require("../public-files"), "_headers", "vendor/LICENSE.supabase"]);
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const target = path.join(dir,entry.name);
      if (entry.isDirectory()) inspect(target);
      else if (!allowed.has(path.relative(output,target).split(path.sep).join("/"))) throw new Error("Unexpected file in dist: "+target);
    }
  }
  inspect(output);
}
for (const file of [...require("../public-files"),"vendor/LICENSE.supabase"]) {
  fs.mkdirSync(path.dirname(path.join(output,file)),{recursive:true});
  fs.copyFileSync(path.join(root,file),path.join(output,file));
}
const headers = { ...require("../security-headers"), "Strict-Transport-Security": "max-age=31536000" };
fs.writeFileSync(path.join(output,"_headers"), "/*\n"+Object.entries(headers).map(([k,v])=>"  "+k+": "+v).join("\n")+"\n");
console.log("Built allowlisted static assets in dist. Deploy only this directory over HTTPS.");
