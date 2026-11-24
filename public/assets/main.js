"use strict";

const root = document.documentElement;
const themeButton = document.querySelector("#theme-toggle");
const menuButton = document.querySelector("#menu-toggle");
const menu = document.querySelector("#menu-principal");
const form = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");
const csrfInput = document.querySelector("#csrf-token");

function setTheme(theme) {
  root.dataset.theme = theme;
  const isLight = theme === "light";
  themeButton?.setAttribute("aria-pressed", String(isLight));
  themeButton?.setAttribute("aria-label", isLight ? "Activer le thème sombre" : "Activer le thème clair");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? "#f5f8f6" : "#0b1110");
}

try {
  const savedTheme = localStorage.getItem("portfolio-theme");
  setTheme(savedTheme === "light" ? "light" : "dark");
} catch {
  setTheme("dark");
}

themeButton?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
  try {
    localStorage.setItem("portfolio-theme", nextTheme);
  } catch {
    // Le thème reste utilisable même si le stockage local est désactivé.
  }
});

menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  const label = expanded ? "Ouvrir le menu" : "Fermer le menu";
  menuButton.setAttribute("aria-label", label);
  const hiddenLabel = menuButton.querySelector(".sr-only");
  if (hiddenLabel) hiddenLabel.textContent = label;
  menu?.classList.toggle("hidden", expanded);
});

menu?.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    menu.classList.add("hidden");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "Ouvrir le menu");
    const hiddenLabel = menuButton?.querySelector(".sr-only");
    if (hiddenLabel) hiddenLabel.textContent = "Ouvrir le menu";
  });
});

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
document.querySelector("#current-year").textContent = String(new Date().getFullYear());

async function loadCsrfToken() {
  if (!csrfInput) return;
  try {
    const response = await fetch("/.netlify/functions/contact", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error("Impossible de préparer le formulaire.");
    const data = await response.json();
    csrfInput.value = data.csrf;
  } catch {
    formStatus.textContent = "Le formulaire sécurisé est indisponible. Réessayez plus tard ou contactez-moi par email.";
  }
}

loadCsrfToken();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  formStatus.textContent = "";
  if (!form.reportValidity()) return;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Envoi en cours…";

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new URLSearchParams(new FormData(form)),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      credentials: "same-origin"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "L’envoi a échoué. Réessayez plus tard.");
    form.reset();
    await loadCsrfToken();
    formStatus.textContent = "Merci, votre message a bien été envoyé.";
  } catch (error) {
    formStatus.textContent = error instanceof Error ? error.message : "Une erreur est survenue. Réessayez plus tard.";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Envoyer le message <span aria-hidden="true">↗</span>';
  }
});
