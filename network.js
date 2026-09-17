(function(root) {
  async function timedFetch(input, options = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const source = options.signal;
    if (source?.aborted) cancel();
    source?.addEventListener("abort",cancel,{once:true});
    const timer = setTimeout(cancel,20000);
    try { return await fetch(input,{...options,signal:controller.signal}); }
    finally { clearTimeout(timer); source?.removeEventListener("abort",cancel); }
  }
  function importURL(value) {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/,"");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !host.includes(".") || host.includes(":") || /^[\d.]+$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
      throw new Error("Use a public HTTPS recipe page without a username, password, or custom port.");
    }
    url.hash = "";
    return url.href;
  }
  async function recipeHTML(value) {
    const url = importURL(value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch(url,{signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",cache:"no-store"});
      if (!response.ok) throw new Error("The page returned " + response.status + ".");
      if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("The link must return an HTML recipe page.");
      const limit = 1024 * 1024;
      if (Number(response.headers.get("content-length")) > limit) throw new Error("The recipe page exceeds 1 MB. Paste its recipe text instead.");
      const reader = response.body.getReader();
      const chunks = []; let size=0;
      try {
        while (true) {
          const {done,value:chunk} = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > limit) { await reader.cancel(); throw new Error("The recipe page exceeds 1 MB. Paste its recipe text instead."); }
          chunks.push(chunk);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset=0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
      return {url,html:new TextDecoder().decode(bytes)};
    } finally { clearTimeout(timer); }
  }
  const api = {timedFetch,importURL,recipeHTML};
  if (typeof module !== "undefined") module.exports=api; else root.RecipeNetwork=api;
})(globalThis);
