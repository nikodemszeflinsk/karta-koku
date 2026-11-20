// Runs before first paint (kept as a file so CSP needs no 'unsafe-inline').

// The app moved to a new address: send old links and old home-screen icons there.
if (location.hostname === "sushi-chef-lab.nikodemszeflinsk.workers.dev") {
  location.replace("https://kuchnia-formularze.nikodemszeflinsk.workers.dev" + location.pathname + location.search + location.hash);
}

// Light is the default; dark only when chosen in the app (Menu → Wygląd).
try {
  if (localStorage.getItem("scl-theme") === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
} catch (e) {}
