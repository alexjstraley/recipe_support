// Pure parser shared by browser voice entry and the regression tests.
function parseVoiceGroceryPhrase(raw, knownItems = []) {
  const text = raw.trim().replace(/^(?:please\s+)?add\s+/i, "").replace(/[.!?]+$/, "");
  const key = value => value.toLowerCase().replace(/[-\s]+/g, " ").trim();
  const known = [...new Map(knownItems.map(item => {
    const name = typeof item === "string" ? item : item.name;
    return [key(name), name];
  })).values()];
  function matchName(name) {
    if (known.some(candidate => key(candidate) === key(name))) return name;
    // Only accept a unique, very close spelling; never guess between ties.
    const source = key(name);
    if (source.length < 5) return name;
    const scored = known.map(candidate => {
      const target = key(candidate);
      // Do not change short words (oat/goat, red/bed) inside a product name.
      const sourceWords = source.split(" ");
      const targetWords = target.split(" ");
      if (sourceWords.length !== targetWords.length || sourceWords.some((word, i) =>
        word.length <= 3 && word !== targetWords[i])) return { name: candidate, distance: Infinity };
      let row = Array.from({ length: target.length + 1 }, (_, i) => i);
      for (let i = 0; i < source.length; i++) {
        const next = [i + 1];
        for (let j = 0; j < target.length; j++) {
          next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (source[i] !== target[j])));
        }
        row = next;
      }
      return { name: candidate, distance: row[target.length] };
    }).sort((a, b) => a.distance - b.distance);
    const best = scored[0];
    return best && best.distance <= (source.length >= 9 ? 2 : 1)
      && best.distance < (scored[1]?.distance ?? Infinity) ? best.name : name;
  }
  // Preserve known product names that themselves start with numbers or contain "and".
  if (known.some(candidate => key(candidate) === key(text))) return { name: text, quantity: "" };
  const numbers = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  const numberPattern = Object.keys(numbers).join("|");
  const amount = new RegExp(`^(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?|[½¼¾]|${numberPattern}|half|quarter)(?:\\s+and\\s+(?:a\\s+)?(half|quarter))?\\s+`, "i");
  const prefix = text.match(amount);
  let quantity = "";
  let name = text;
  if (prefix) {
    const value = prefix[1].toLowerCase();
    quantity = String(numbers[value] ?? ({ half: "1/2", quarter: "1/4", "½": "1/2", "¼": "1/4", "¾": "3/4" }[value]) ?? value);
    if (prefix[2]) quantity += prefix[2].toLowerCase() === "half" ? " 1/2" : " 1/4";
    name = text.slice(prefix[0].length);
    // "a half pound" and "a quarter of ...".
    const fraction = name.match(/^(half|quarter)\s+/i);
    if ((value === "a" || value === "an") && fraction) {
      quantity = fraction[1].toLowerCase() === "half" ? "1/2" : "1/4";
      name = name.slice(fraction[0].length);
    }
    if (value === "half" || value === "quarter") name = name.replace(/^a\s+/i, "");
    const unit = name.match(/^(heads?|bunch(?:es)?|bags?|boxes?|bottles?|cans?|jars?|packs?|packages?|cartons?|dozen|cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|kg|kilograms?|g|grams?|ml|milliliters?|liters?|litres?|cloves?|slices?|pieces?)\s+/i);
    if (unit) {
      quantity += " " + unit[1].toLowerCase();
      name = name.slice(unit[0].length);
    }
    name = name.replace(/^of\s+/i, "");
  }
  const parts = known.some(candidate => key(candidate) === key(name)) ? [name]
    : name.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).filter(Boolean);
  // The form has one quantity field. Do not assign the first quantity to other items.
  if (parts.length > 1 && (quantity || parts.some(part => amount.test(part)))) {
    return { name: text, quantity: "", needsSingleItem: true };
  }
  return { name: parts.map(matchName).join(", "), quantity };
}

if (typeof module !== "undefined") module.exports = { parseVoiceGroceryPhrase };

if (typeof document !== "undefined") (() => {
  const dialog = document.querySelector("#add-item-dialog");
  const status = document.querySelector("#voice-status");
  const buttons = [...document.querySelectorAll("[data-voice-field]")];
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let current = null;
  let stopListening = null;
  let restartTimer;
  let sessionTimer;
  let finishTimer;

  function resetButtons() {
    clearTimeout(restartTimer);
    clearTimeout(sessionTimer);
    clearTimeout(finishTimer);
    stopListening = null;
    buttons.forEach(button => {
      button.setAttribute("aria-label", "Start voice entry");
      button.title = "Start voice entry";
      button.setAttribute("aria-pressed", "false");
      button.disabled = false;
    });
  }

  function cancel() {
    if (!current) return;
    const recognition = current;
    current = null;
    try { recognition.abort(); } catch { /* Already disconnected. */ }
    resetButtons();
    status.textContent = "Voice entry stopped. Review the text before adding your item.";
  }

  if (!Recognition || !window.isSecureContext) {
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = !window.isSecureContext
      ? "Voice entry needs HTTPS or localhost. You can still type your items."
      : "Voice entry is unavailable in this browser. You can type or use your keyboard’s dictation.";
    return;
  }

  buttons.forEach(button => button.addEventListener("click", () => {
    if (current) {
      stopListening?.();
      return;
    }
    const field = document.getElementById(button.dataset.voiceField);
    const quantityField = document.getElementById("list-quantity");
    const originalQuantity = quantityField.value;
    const knownItems = typeof itemSuggestionCandidates === "function" ? itemSuggestionCandidates() : [];
    let parsed;
    let recognition;
    let received = false;
    let failed = false;
    let stopping = false;
    let ended = false;
    let emptyEnds = 0;
    let previousText = "";
    let segmentText = "";
    let previewText = "";
    try {
      recognition = new Recognition();
      current = recognition;
      recognition.lang = document.documentElement.lang || navigator.language || "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      buttons.forEach(other => { other.disabled = other !== button; });
      button.setAttribute("aria-label", "Stop listening");
      button.title = "Stop listening";
      button.setAttribute("aria-pressed", "true");
      status.textContent = "Starting microphone… Allow microphone access if prompted.";
      recognition.onstart = () => {
        ended = false;
        if (current === recognition) status.textContent = field.id === "list-item"
          ? "Listening… Say items, then select Stop listening when finished."
          : "Listening… Say a quantity, then select Stop listening.";
      };
      function writeText(raw) {
        if (!raw.trim()) return;
        received = true;
        parsed = field.id === "list-item" ? parseVoiceGroceryPhrase(raw, knownItems) : null;
        const text = parsed ? parsed.name : raw.trim();
        if (parsed) {
          quantityField.value = (parsed.quantity || originalQuantity).slice(0, quantityField.maxLength);
          quantityField.dispatchEvent(new Event("input", { bubbles: true }));
        }
        field.value = text.slice(0, field.maxLength);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      function finish() {
        if (current !== recognition) return;
        // Some services end with only a provisional result. Keep it for review.
        writeText([previousText, segmentText, previewText].filter(Boolean).join(" "));
        current = null;
        resetButtons();
        if (!failed) status.textContent = received
          ? parsed?.needsSingleItem
            ? "Heard multiple items with quantities. Enter one item at a time so each quantity stays correct."
            : "Text captured. Review the item and quantity before adding."
          : "No text captured. Check your microphone or try another browser.";
      }
      stopListening = () => {
        stopping = true;
        clearTimeout(restartTimer);
        button.disabled = true;
        status.textContent = "Finishing voice entry…";
        if (ended) { finish(); return; }
        // Do not stay stuck if the service never sends its final end event.
        finishTimer = setTimeout(() => {
          finish();
          try { recognition.abort(); } catch { /* Already disconnected. */ }
        }, 2000);
        try { recognition.stop(); } catch { finish(); }
      };
      recognition.onresult = event => {
        if (current !== recognition || !dialog.open) return;
        let finalText = "";
        let interim = "";
        for (const result of Array.from(event.results)) {
          if (result.isFinal) finalText += result[0].transcript + " ";
          else interim += result[0].transcript;
        }
        segmentText = finalText.trim();
        previewText = interim.trim();
        writeText([previousText, segmentText].filter(Boolean).join(" "));
        status.textContent = interim ? "Hearing: " + interim : "Text captured. Keep speaking or select Stop listening.";
      };
      recognition.onerror = event => {
        if (current !== recognition) return;
        if (event.error === "no-speech" && !stopping) {
          status.textContent = "Still listening… Say your items when ready.";
          return;
        }
        failed = true;
        const messages = {
          "not-allowed": "Microphone access was denied. Allow it in your browser’s site settings, then try again.",
          "service-not-allowed": "The browser’s speech service is unavailable. Try another browser or type your item.",
          "audio-capture": "No microphone is available. Connect a microphone and try again.",
          "no-speech": "No speech was detected. Try again and speak clearly.",
          network: "The speech service could not connect. Check your connection and try again."
        };
        status.textContent = messages[event.error] || "Voice entry stopped. Try again or type your item.";
        finish();
        try { recognition.abort(); } catch { /* Already disconnected. */ }
      };
      recognition.onend = () => {
        if (current !== recognition) return;
        ended = true;
        if (stopping || failed || !dialog.open || document.hidden) { finish(); return; }
        emptyEnds = segmentText || previewText ? 0 : emptyEnds + 1;
        if (emptyEnds >= 3) { finish(); return; }
        previousText = [previousText, segmentText, previewText].filter(Boolean).join(" ");
        segmentText = "";
        previewText = "";
        writeText(previousText);
        status.textContent = "Still listening… Continue speaking, or select Stop listening.";
        restartTimer = setTimeout(() => {
          if (current !== recognition || stopping) return;
          try { recognition.start(); }
          catch {
            failed = true;
            status.textContent = "Could not resume voice entry. Review the captured text and try again.";
            finish();
          }
        }, 300);
      };
      sessionTimer = setTimeout(() => stopListening?.(), 60000);
      recognition.start();
    } catch {
      cancel();
      status.textContent = "Could not start voice entry. Try again or type your item.";
    }
  }));

  // Invalidate callbacks before any action can clear or save the form.
  dialog.addEventListener("close", cancel);
  dialog.addEventListener("cancel", cancel);
  dialog.addEventListener("submit", cancel, true);
  document.querySelector("#clear-list").addEventListener("click", cancel, true);
  dialog.querySelectorAll("#list-item, #list-quantity").forEach(field => field.addEventListener("input", event => {
    if (event.isTrusted) cancel();
  }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); });
  window.addEventListener("pagehide", cancel);
})();
