// Fail visibly when a blocked download or unsupported browser prevents startup.
window.recipeAppReady = false;
window.addEventListener("load", () => {
  if (!window.recipeAppReady) {
    document.querySelector("#auth-message").textContent = "Recipe Support could not start. Reload in a current browser over HTTPS (or localhost), and check your connection.";
    document.querySelector("#auth-submit").disabled = true;
  }
});
