// Applies the chosen theme before first paint (kept as a file so CSP needs no 'unsafe-inline').
// Light is the default; dark only when chosen in the app (Menu → Wygląd).
try {
  if (localStorage.getItem("scl-theme") === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
} catch (e) {}
