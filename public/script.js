/* ============================================================
   Shared frontend helpers — Smart Attendance System
============================================================ */
const API = "/api";

function saveSession({ token, role, name, username, id }) {
  localStorage.setItem("sa_token", token);
  localStorage.setItem("sa_role", role);
  localStorage.setItem("sa_name", name || username || "");
  localStorage.setItem("sa_id", id || "");
}

function getToken() { return localStorage.getItem("sa_token"); }
function getRole() { return localStorage.getItem("sa_role"); }
function getName() { return localStorage.getItem("sa_name"); }

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

// Redirect to login if not authenticated as the expected role
function requireRole(role) {
  if (getToken() === null || getRole() !== role) {
    window.location.href = "login.html";
  }
}

// fetch wrapper that attaches Bearer token and parses JSON
async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  if (!isForm && body) headers["Content-Type"] = "application/json";

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.blob();

  if (!res.ok) {
    const message = (isJson && data.message) ? data.message : "Request failed";
    throw new Error(message);
  }
  return data;
}

function showMsg(el, text, kind = "good") {
  el.textContent = text;
  el.className = "msg " + kind;
  el.classList.remove("hidden");
}

function hideMsg(el) {
  el.classList.add("hidden");
}
