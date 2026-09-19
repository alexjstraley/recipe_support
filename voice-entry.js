(() => {
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
        const text = field.id === "list-item"
          ? raw.trim().replace(/^(?:please\s+)?add\s+/i, "").replace(/[.!?]+$/, "")
            .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map(name => name.trim()).filter(Boolean).join(", ")
          : raw.trim();
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
          ? "Text captured. Review it before adding your item."
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
