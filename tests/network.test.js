const {test} = require("node:test");
const assert = require("node:assert/strict");
const {importURL,recipeHTML} = require("../network");
test("recipe import rejects credentials, local networks, unsafe schemes, and ports", () => {
  for (const value of ["http://example.com","https://localhost","https://127.0.0.1","https://0x7f000001","https://[::1]","https://kitchen.local","https://user:pass@example.com","https://example.com:8443","file:///etc/passwd","javascript:alert(1)"]) {
    assert.throws(()=>importURL(value),undefined,value);
  }
  assert.equal(importURL("https://recipes.example.com/soup#recipe"),"https://recipes.example.com/soup");
});
test("imports omit credentials and reject oversized chunked responses", async t => {
  const original = global.fetch;
  t.after(()=> {global.fetch=original;});
  global.fetch=async (url,options)=>{
    assert.equal(options.credentials,"omit");
    assert.equal(options.referrerPolicy,"no-referrer");
    assert.equal(options.redirect,"error");
    return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1024*1024+1));c.close();}}),{headers:{"content-type":"text/html"}});
  };
  await assert.rejects(recipeHTML("https://example.com/soup"),/exceeds 1 MB/);
});
test("imports reject non-HTML responses", async t => {
  const original = global.fetch;
  t.after(()=> {global.fetch=original;});
  global.fetch=async ()=>new Response("binary",{headers:{"content-type":"application/octet-stream"}});
  await assert.rejects(recipeHTML("https://example.com/soup"),/HTML recipe page/);
});
