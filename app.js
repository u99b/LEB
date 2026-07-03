/**
 * app.js
 * ---------------------------------------------------------
 * App bootstrap:
 *   - Runs admin auth check.
 *   - Shows/hides the ➕ Add button based on admin status.
 *   - Wires up the Add/Edit modal (create + update).
 *   - Wires up delete buttons on each entry (admin only).
 *   - Renders the live entries list from Firestore for everyone.
 *
 * Regular visitors: read-only. They never even receive the
 * Firestore write permission client-side, and — critically —
 * Firestore Security Rules reject their writes even if they
 * try to call the write functions manually from devtools.
 * ---------------------------------------------------------
 */

import { db } from "./firebase-config.js";
import { initAdminAuth } from "./admin-auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const entriesCol = collection(db, "entries");

// ---- DOM refs ----
const addBtn = document.getElementById("add-btn");
const listEl = document.getElementById("entries-list");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const form = document.getElementById("entry-form");
const titleInput = document.getElementById("entry-title");
const descInput = document.getElementById("entry-desc");
const cancelBtn = document.getElementById("modal-cancel");
const latInput = document.getElementById("entry-lat");
const lngInput = document.getElementById("entry-lng");
const radiusInput = document.getElementById("entry-radius");
const pickOnMapBtn = document.getElementById("pick-on-map-btn");

let isAdmin = false;
let editingId = null; // null = creating, otherwise = editing this doc id
let pickModeActive = false;
const entryMarkers = new Map(); // id -> { marker, circle }

// ---- Boot ----
const map = initMap();

initAdminAuth()
  .then(({ user, isAdmin: admin }) => {
    isAdmin = admin;
    console.log("Signed in anonymously as", user.uid, "| admin:", isAdmin);
    applyAdminUI();
    listenToEntries();
  })
  .catch((err) => {
    console.error("Auth initialization failed:", err);
  });

function applyAdminUI() {
  addBtn.style.display = isAdmin ? "flex" : "none";
  pickOnMapBtn.style.display = isAdmin ? "inline-block" : "none";
}

// ---- Map setup (same style/line as the standalone demo) ----
function initMap() {
  const m = L.map("alert-map", { zoomControl: true });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19
  }).addTo(m);

  // نفس الخط الأصفر المتقطع (الحد السياسي) الممتد من أقصى الغرب لأقصى الشرق
  const borderLine = [
    [33.085, 35.100],
    [33.091, 35.127],
    [33.100, 35.220],
    [33.108, 35.300],
    [33.130, 35.400],
    [33.180, 35.480],
    [33.230, 35.560],
    [33.277, 35.680],
    [33.320, 35.760],
    [33.370, 35.830],
    [33.420, 35.900]
  ];
  const line = L.polyline(borderLine, {
    color: "#f4c430",
    weight: 3,
    dashArray: "10, 8",
    opacity: 0.9
  }).addTo(m);

  m.fitBounds(line.getBounds(), { padding: [30, 30] });

  // Admin clicks the map (after pressing "Pick on map") to set lat/lng on the form
  m.on("click", (e) => {
    if (!pickModeActive) return;
    latInput.value = e.latlng.lat.toFixed(5);
    lngInput.value = e.latlng.lng.toFixed(5);
    setPickMode(false);
  });

  return m;
}

function setPickMode(active) {
  pickModeActive = active;
  document.getElementById("map-wrap").classList.toggle("pick-mode", active);
  pickOnMapBtn.textContent = active ? "📍 Click the map…" : "📍 Pick on map";
}

pickOnMapBtn?.addEventListener("click", () => setPickMode(!pickModeActive));

function planeIcon() {
  return L.divIcon({
    className: "plane-icon",
    html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#e3101f" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(-35deg);">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

// ---- Realtime list rendering ----
function listenToEntries() {
  const q = query(entriesCol, orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    listEl.innerHTML = "";
    const seenIds = new Set();

    snapshot.forEach((docSnap) => {
      const id = docSnap.id;
      const data = docSnap.data();
      seenIds.add(id);
      listEl.appendChild(renderEntry(id, data));
      syncMarker(id, data);
    });

    // Remove markers for entries that no longer exist
    for (const id of entryMarkers.keys()) {
      if (!seenIds.has(id)) removeMarker(id);
    }
  });
}

// ---- Map markers/circles for entries that have coordinates ----
function syncMarker(id, data) {
  if (typeof data.lat !== "number" || typeof data.lng !== "number") {
    removeMarker(id);
    return;
  }

  const latlng = [data.lat, data.lng];
  const radiusMeters = (data.radiusKm || 15) * 1000;

  removeMarker(id); // simplest: redraw fresh each update

  const circle = L.circle(latlng, {
    radius: radiusMeters,
    color: "#e3101f",
    weight: 2,
    fillColor: "#e3101f",
    fillOpacity: 0.15
  }).addTo(map);

  const marker = L.marker(latlng, { icon: planeIcon() })
    .addTo(map)
    .bindPopup(`<b>${escapeHtml(data.title || "")}</b><br>${escapeHtml(data.description || "")}`);

  entryMarkers.set(id, { marker, circle });
}

function removeMarker(id) {
  const existing = entryMarkers.get(id);
  if (!existing) return;
  map.removeLayer(existing.marker);
  map.removeLayer(existing.circle);
  entryMarkers.delete(id);
}

function renderEntry(id, data) {
  const item = document.createElement("div");
  item.className = "incident-item";

  const text = document.createElement("div");
  text.className = "incident-text";
  text.innerHTML = `
    <div class="incident-place">${escapeHtml(data.title || "")}</div>
    <div class="incident-desc">${escapeHtml(data.description || "")}</div>
  `;
  item.appendChild(text);

  if (isAdmin) {
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = ".4rem";

    const editBtn = document.createElement("button");
    editBtn.className = "tool-btn";
    editBtn.title = "Edit";
    editBtn.textContent = "✎";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openModal(id, data);
    };

    const delBtn = document.createElement("button");
    delBtn.className = "tool-btn";
    delBtn.title = "Delete";
    delBtn.textContent = "🗑";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm("Delete this entry?")) {
        try {
          await deleteDoc(doc(db, "entries", id));
        } catch (err) {
          alert("Delete failed: " + err.message);
        }
      }
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    item.appendChild(actions);
  }

  return item;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Modal open/close ----
addBtn?.addEventListener("click", () => openModal());
cancelBtn?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function openModal(id = null, data = null) {
  editingId = id;
  modalTitle.textContent = id ? "Edit Entry" : "New Entry";
  titleInput.value = data?.title || "";
  descInput.value = data?.description || "";
  latInput.value = typeof data?.lat === "number" ? data.lat : "";
  lngInput.value = typeof data?.lng === "number" ? data.lng : "";
  radiusInput.value = data?.radiusKm ?? "";
  modalOverlay.classList.add("show");
}

function closeModal() {
  modalOverlay.classList.remove("show");
  setPickMode(false);
  form.reset();
  editingId = null;
}

// ---- Create / update ----
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isAdmin) return; // client-side guard; server-side rule is the real guard

  const payload = {
    title: titleInput.value.trim(),
    description: descInput.value.trim()
  };
  if (!payload.title) return;

  // Optional map data — only included if both lat & lng were provided
  if (latInput.value !== "" && lngInput.value !== "") {
    payload.lat = parseFloat(latInput.value);
    payload.lng = parseFloat(lngInput.value);
    payload.radiusKm = radiusInput.value !== "" ? parseFloat(radiusInput.value) : 15;
  } else {
    payload.lat = null;
    payload.lng = null;
    payload.radiusKm = null;
  }

  try {
    if (editingId) {
      await updateDoc(doc(db, "entries", editingId), payload);
    } else {
      await addDoc(entriesCol, { ...payload, createdAt: serverTimestamp() });
    }
    closeModal();
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});
