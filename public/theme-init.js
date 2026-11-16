// Applies the saved theme before first paint (kept as a file so CSP needs no 'unsafe-inline').
try {
  var t = localStorage.getItem("scl-theme");
  if (t === "dark" || ((!t || t === "system") && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
