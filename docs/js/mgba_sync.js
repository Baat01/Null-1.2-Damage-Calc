/**
 * mGBA Live Auto-Sync Integration
 * Connects to the local Vs. Link / Vs. Recorder server on port 31123.
 *
 * Features:
 *   1. Manual one-shot sync button  (🔄 Synchroniser Maintenant)
 *   2. Auto-Sync toggle with polling loop  (🔁 Auto-Sync : ON/OFF)
 *   3. "Sans objets / No Items" checkbox — strips held items on import
 *   4. Set name mirrors native Import button (.import-name-text or "Custom Set")
 *      All Pokémon (nicknamed or not) use the set name field value.
 */

const MGBA_SYNC_URL = "http://localhost:31123/vs/all";
const FALLBACK_URL  = "http://localhost:31123/update";

const SyncState = {
    ENABLED:         false,
    POLL_INTERVAL:   3000,
    LAST_HASH:       null,
    TIMEOUT_ID:      null,
    MANUAL_FETCHING: false,
    SETTINGS: {
        includePc:      true,
        excludeDeadBox: true,
        stripItems:     false
    }
};

// ─── Utilities ─────────────────────────────────────────────────────────────────

/** djb2-style hash — skip redundant DOM updates when auto-sync data is unchanged. */
function hashCode(str) {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

/**
 * Read the set-name exactly as the native Import button does:
 *   → .import-name-text value if non-empty, else "Custom Set"
 */
function getImportSetName() {
    return (document.querySelector(".import-name-text")?.value.trim()) || "Custom Set";
}

// ─── Showdown Text Builder ─────────────────────────────────────────────────────

/**
 * Convert one mGBA mon object → a Showdown paste text block.
 * @param {object}  mon
 * @param {{ stripItems?: boolean }} opts
 * @returns {string|null}
 */
function monToShowdownText(mon, { stripItems = false } = {}) {
    let species = mon.speciesName || mon.species;
    if (!species || species === "None" || species === "0" || species === 0) return null;
    if (mon.isEgg || mon.isBadEgg) return null;

    // Sanitize species: ensure no nickname or parentheses leaks into the species name
    if (typeof species === "string" && species.indexOf("(") !== -1) {
        const parenMatch = species.match(/\(([^)]+)\)/);
        if (parenMatch && typeof calc !== "undefined" && calc.SPECIES && calc.SPECIES[9] && calc.SPECIES[9][parenMatch[1].trim()]) {
            species = parenMatch[1].trim();
        } else {
            species = species.split("(")[0].trim();
        }
    }

    // Header: Always use the base species on the header line so Showdown uses setName
    // instead of promoting an in-game nickname as the set key.
    let header = species;

    if (!stripItems) {
        const item = mon.heldItem || mon.itemName || mon.heldItemName;
        if (item && item !== "None" && item !== "0" && item !== "No Item") header += ` @ ${item}`;
    }

    let text = header + "\n";

    const ability = mon.ability || mon.abilityName;
    if (ability && ability !== "None") text += `Ability: ${ability}\n`;

    const level = mon.level || mon.metLevel;
    if (level) text += `Level: ${level}\n`;

    // EVs
    const evParts = [];
    if (mon.hpEV        > 0) evParts.push(`${mon.hpEV} HP`);
    if (mon.attackEV    > 0) evParts.push(`${mon.attackEV} Atk`);
    if (mon.defenseEV   > 0) evParts.push(`${mon.defenseEV} Def`);
    if (mon.spAttackEV  > 0) evParts.push(`${mon.spAttackEV} SpA`);
    if (mon.spDefenseEV > 0) evParts.push(`${mon.spDefenseEV} SpD`);
    if (mon.speedEV     > 0) evParts.push(`${mon.speedEV} Spe`);
    if (evParts.length)      text += `EVs: ${evParts.join(" / ")}\n`;

    // IVs (Showdown assumes 31; only list sub-31 values)
    const ivParts = [];
    if (mon.hpIV        !== undefined && mon.hpIV        < 31) ivParts.push(`${mon.hpIV} HP`);
    if (mon.attackIV    !== undefined && mon.attackIV    < 31) ivParts.push(`${mon.attackIV} Atk`);
    if (mon.defenseIV   !== undefined && mon.defenseIV   < 31) ivParts.push(`${mon.defenseIV} Def`);
    if (mon.spAttackIV  !== undefined && mon.spAttackIV  < 31) ivParts.push(`${mon.spAttackIV} SpA`);
    if (mon.spDefenseIV !== undefined && mon.spDefenseIV < 31) ivParts.push(`${mon.spDefenseIV} SpD`);
    if (mon.speedIV     !== undefined && mon.speedIV     < 31) ivParts.push(`${mon.speedIV} Spe`);
    if (ivParts.length) text += `IVs: ${ivParts.join(" / ")}\n`;

    if (mon.nature && mon.nature !== "None") text += `${mon.nature} Nature\n`;

    // Moves
    const moves = mon.moveNames || mon.moves;
    if (moves && moves.length > 0) {
        moves.forEach(move => {
            if (move && move !== "None" && move !== "(No Move)") text += `- ${move}\n`;
        });
    }

    return text.trim();
}

// ─── Ghost-Set Wipe ────────────────────────────────────────────────────────────

/**
 * Remove any sets whose key starts with "mGBA " (legacy slot-key format).
 * This keeps the set list clean across sync cycles and prevents stale entries
 * from accumulating when a Pokémon is removed from the party / box.
 */
function wipeOldMgbaSets() {
    if (!localStorage.customsets) return;
    let customsets;
    try { customsets = JSON.parse(localStorage.customsets); } catch (e) { return; }

    let changed = false;
    for (const species in customsets) {
        for (const setName in customsets[species]) {
            if (setName.startsWith("mGBA ")) {
                delete customsets[species][setName];
                deleteMovesetFromAllSetdex(species, setName);
                changed = true;
            }
        }
        if (Object.keys(customsets[species]).length === 0) delete customsets[species];
    }

    if (changed) {
        $("#box-poke-list .trainer-pok, #box-poke-list2 .trainer-pok, #team-poke-list .trainer-pok").each(function () {
            if (($(this).attr("data-id") || "").includes("mGBA ")) $(this).remove();
        });
    }
}

// ─── Payload Processing ────────────────────────────────────────────────────────

/**
 * Parse the JSON payload from mGBA and import all Pokémon as custom sets.
 *
 * All imported Pokémon use the set name provided by .import-name-text (defaulting to "Custom Set").
 *
 * @param {object} data
 * @param {{ stripItems?: boolean }} opts
 * @returns {number} number of Pokémon successfully imported
 */
function processPayload(data, { stripItems = false } = {}) {
    // Read set name from .import-name-text or fall back to "Custom Set"
    const setName = (document.querySelector(".import-name-text")?.value.trim()) || "Custom Set";

    // Purge legacy "mGBA "-prefixed sets before re-import
    wipeOldMgbaSets();

    let importedCount = 0;

    // Helper to clean up any legacy sets saved under this mon's nickname
    function cleanupOldNicknameSet(mon, species) {
        if (mon.nickname && mon.nickname !== species) {
            if (typeof deleteMovesetFromAllSetdex === "function") {
                deleteMovesetFromAllSetdex(species, mon.nickname);
            }
            if (localStorage.customsets) {
                try {
                    const cs = JSON.parse(localStorage.customsets);
                    if (cs[species] && cs[species][mon.nickname]) {
                        delete cs[species][mon.nickname];
                        if (Object.keys(cs[species]).length === 0) delete cs[species];
                        localStorage.customsets = JSON.stringify(cs);
                    }
                } catch (_) {}
            }
            $(`.trainer-pok[data-id="${species} (${mon.nickname})"]`).remove();
        }
    }

    // Party
    if (data.party && data.party.length > 0) {
        data.party.forEach((mon) => {
            const species = mon.speciesName || mon.species;
            cleanupOldNicknameSet(mon, species);
            const text = monToShowdownText(mon, { stripItems });
            if (text) {
                console.log(`[mGBA Sync] Party export (${setName}):\n` + text);
                addSets(text, setName);
                importedCount++;
            }
        });
    }

    // PC Boxes
    if (SyncState.SETTINGS.includePc && data.boxes && data.boxes.length > 0) {
        data.boxes.forEach(slotData => {
            if (SyncState.SETTINGS.excludeDeadBox) {
                if (slotData.isDeadBox || (slotData.box >= 11 && slotData.box <= 13)) return;
            }
            const species = slotData.speciesName || slotData.species;
            cleanupOldNicknameSet(slotData, species);
            const text = monToShowdownText(slotData, { stripItems });
            if (text) {
                console.log(`[mGBA Sync] Box export (${setName}):\n` + text);
                addSets(text, setName);
                importedCount++;
            }
        });
    }

    return importedCount;
}

// ─── Status UI ─────────────────────────────────────────────────────────────────

function updateStatusUI(message, isError = false) {
    const el = document.getElementById("mgba-sync-status");
    if (!el) return;
    el.textContent = message;
    if (isError) {
        el.style.color = "#ff6b6b";
    } else if (message === "Déconnecté" || message === "Recherche...") {
        el.style.color = "#a0aab5";
    } else {
        el.style.color = "#4ade80";
    }
}

// ─── Low-level Fetch Helper ────────────────────────────────────────────────────

/**
 * Fetch raw text from the mGBA server, trying the primary URL then the fallback.
 * @returns {Promise<string>} raw JSON text
 * @throws {Error} when neither endpoint responds successfully
 */
async function fetchMgbaRaw() {
    let response;
    try {
        response = await fetch(MGBA_SYNC_URL);
        if (!response.ok) response = await fetch(FALLBACK_URL);
    } catch (_) {
        throw new Error("mGBA non détecté");
    }
    if (!response.ok) throw new Error("mGBA non détecté");
    return response.text();
}

// ─── Manual One-Shot Sync ──────────────────────────────────────────────────────

/**
 * Perform a single, unconditional import (no hash guard).
 * Called by the "Synchroniser Maintenant" button.
 */
async function triggerManualSync() {
    if (SyncState.MANUAL_FETCHING) return;
    SyncState.MANUAL_FETCHING = true;

    const btn          = document.getElementById("mgba-sync-now-btn");
    const originalText = btn ? btn.textContent : "";

    if (btn) {
        btn.disabled    = true;
        btn.textContent = "Syncing...";
    }
    updateStatusUI("Recherche...");

    try {
        const stripItems = SyncState.SETTINGS.stripItems;
        const rawText    = await fetchMgbaRaw();
        const data       = JSON.parse(rawText);
        const count      = processPayload(data, { stripItems });

        // Reset hash so the auto-sync loop re-imports fresh on its next tick
        SyncState.LAST_HASH = null;

        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        updateStatusUI(`Sync manuel : ${count} Pokémon (${timeStr})`);
        if (btn) btn.textContent = `${count} OK`;

    } catch (err) {
        updateStatusUI("Erreur: mGBA non détecté", true);
        if (btn) btn.textContent = "Erreur";

    } finally {
        SyncState.MANUAL_FETCHING = false;
        if (btn) {
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled    = false;
            }, 2000);
        }
    }
}

// ─── Auto-Sync Polling Loop ────────────────────────────────────────────────────

/**
 * One tick of the polling loop.  Re-schedules itself while SyncState.ENABLED is true.
 * Uses a hash guard to skip DOM updates when the mGBA data hasn't changed.
 */
async function pollServer() {
    if (!SyncState.ENABLED) return;

    updateStatusUI("Recherche...");

    try {
        const stripItems = SyncState.SETTINGS.stripItems;
        const rawText    = await fetchMgbaRaw();
        const hash       = hashCode(rawText);

        if (hash !== SyncState.LAST_HASH) {
            SyncState.LAST_HASH = hash;
            const data    = JSON.parse(rawText);
            const count   = processPayload(data, { stripItems });
            const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            updateStatusUI(`Connecté (${count} Pokémon synchronisés — ${timeStr})`);
        }
        // Hash unchanged: connection OK but nothing new → leave the last status message.

    } catch (err) {
        updateStatusUI("Erreur: mGBA non détecté", true);
    }

    if (SyncState.ENABLED) {
        SyncState.TIMEOUT_ID = setTimeout(pollServer, SyncState.POLL_INTERVAL);
    }
}

// ─── Toggle Auto-Sync ─────────────────────────────────────────────────────────

function toggleSync() {
    SyncState.ENABLED = !SyncState.ENABLED;

    const btn = document.getElementById("mgba-sync-btn");
    if (btn) {
        btn.textContent = SyncState.ENABLED ? "Auto-Sync : ON" : "Auto-Sync : OFF";
        btn.classList.toggle("bs-btn-success", SyncState.ENABLED);
        btn.classList.toggle("bs-btn-default", !SyncState.ENABLED);
    }

    saveSettings();

    if (SyncState.ENABLED) {
        SyncState.LAST_HASH = null;
        pollServer();
    } else {
        if (SyncState.TIMEOUT_ID) clearTimeout(SyncState.TIMEOUT_ID);
        updateStatusUI("Déconnecté");
    }
}

// ─── Settings Persistence ─────────────────────────────────────────────────────

function saveSettings() {
    localStorage.setItem("mgbaSyncSettings", JSON.stringify({
        enabled:        SyncState.ENABLED,
        includePc:      SyncState.SETTINGS.includePc,
        excludeDeadBox: SyncState.SETTINGS.excludeDeadBox,
        stripItems:     SyncState.SETTINGS.stripItems
    }));
}

function loadSettings() {
    const saved = localStorage.getItem("mgbaSyncSettings");
    if (!saved) return;
    try {
        const p = JSON.parse(saved);
        SyncState.ENABLED = !!p.enabled;
        if (p.includePc      !== undefined) SyncState.SETTINGS.includePc      = p.includePc;
        if (p.excludeDeadBox !== undefined) SyncState.SETTINGS.excludeDeadBox = p.excludeDeadBox;
        if (p.stripItems     !== undefined) SyncState.SETTINGS.stripItems     = p.stripItems;
    } catch (e) {}
}

// ─── UI Injection ─────────────────────────────────────────────────────────────

function injectUI() {
    const wrapper = document.getElementById("import-1_wrapper");
    if (!wrapper) return; // Page may not have the import panel

    const syncBox = document.createElement("div");
    syncBox.className = "mgba-sync-container";
    syncBox.style.cssText = [
        "margin-bottom:15px",
        "padding:10px",
        "border:1px solid var(--fieldset-color, #ccc)",
        "border-radius:4px"
    ].join(";");

    syncBox.innerHTML = `
        <!-- Row 1: action buttons + live status -->
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <button id="mgba-sync-now-btn"
                    class="bs-btn bs-btn-primary"
                    style="font-weight:bold; white-space:nowrap;"
                    title="Import unique depuis mGBA (sans boucle de polling)">
                Synchroniser Maintenant
            </button>
            <button id="mgba-sync-btn"
                    class="bs-btn ${SyncState.ENABLED ? 'bs-btn-success' : 'bs-btn-default'}"
                    style="font-weight:bold; white-space:nowrap;"
                    title="Activer / désactiver la synchronisation automatique en boucle">
                Auto-Sync : ${SyncState.ENABLED ? 'ON' : 'OFF'}
            </button>
            <span id="mgba-sync-status"
                  style="flex-grow:1; font-size:0.9em; color:#a0aab5;
                         min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${SyncState.ENABLED ? 'Recherche...' : 'Déconnecté'}
            </span>
        </div>
        <!-- Row 2: filter checkboxes -->
        <div style="font-size:0.85em; display:flex; gap:15px; flex-wrap:wrap; align-items:center;">
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="mgba-sync-pc"
                       ${SyncState.SETTINGS.includePc ? 'checked' : ''}>
                Inclure les boîtes PC
            </label>
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="mgba-sync-deadbox"
                       ${SyncState.SETTINGS.excludeDeadBox ? 'checked' : ''}>
                Exclure la Dead Box (Boîtes 11 à 13)
            </label>
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"
                   title="Importe les Pokémon sans leur objet tenu">
                <input type="checkbox" id="mgba-sync-strip-items"
                       ${SyncState.SETTINGS.stripItems ? 'checked' : ''}>
                Sans objets / No Items
            </label>
        </div>
    `;

    wrapper.parentNode.insertBefore(syncBox, wrapper);

    // ── Event wiring ──────────────────────────────────────────────────────────

    document.getElementById("mgba-sync-now-btn").addEventListener("click", (e) => {
        e.preventDefault();
        triggerManualSync();
    });

    document.getElementById("mgba-sync-btn").addEventListener("click", (e) => {
        e.preventDefault();
        toggleSync();
    });

    document.getElementById("mgba-sync-pc").addEventListener("change", (e) => {
        SyncState.SETTINGS.includePc = e.target.checked;
        SyncState.LAST_HASH = null; // Force re-parse on next auto-sync tick
        saveSettings();
    });

    document.getElementById("mgba-sync-deadbox").addEventListener("change", (e) => {
        SyncState.SETTINGS.excludeDeadBox = e.target.checked;
        SyncState.LAST_HASH = null;
        saveSettings();
    });

    document.getElementById("mgba-sync-strip-items").addEventListener("change", (e) => {
        SyncState.SETTINGS.stripItems = e.target.checked;
        SyncState.LAST_HASH = null; // Force re-import so item stripping takes effect immediately
        saveSettings();
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    injectUI();
    if (SyncState.ENABLED) {
        pollServer();
    }
});
