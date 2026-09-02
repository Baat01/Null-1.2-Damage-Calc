/**
 * mGBA Live Auto-Sync Integration
 * Connects to the local Vs. Link / Vs. Recorder server on port 31123.
 */

const MGBA_SYNC_URL = "http://localhost:31123/vs/all";
const FALLBACK_URL = "http://localhost:31123/update";

const SyncState = {
    ENABLED: false,
    POLL_INTERVAL: 3000,
    LAST_HASH: null,
    TIMEOUT_ID: null,
    SETTINGS: {
        includePc: true,
        excludeDeadBox: true
    }
};

// Simple string hashing function to avoid redundant DOM updates
function hashCode(str) {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        let chr = str.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

// Format an individual mGBA mon object into a Showdown text block
function monToShowdownText(mon) {
    let species = mon.speciesName || mon.species;
    if (!species || species === "None" || species === "0" || species === 0) return null;
    if (mon.isEgg || mon.isBadEgg) return null;

    // Build header: Nickname (Species) @ Item
    let header = "";
    if (mon.nickname && mon.nickname !== species) {
        header += `${mon.nickname} (${species})`;
    } else {
        header += species;
    }
    
    let item = mon.heldItem || mon.itemName || mon.heldItemName;
    if (item && item !== "None" && item !== "0") {
        header += ` @ ${item}`;
    }

    let text = header + "\n";
    
    let ability = mon.ability || mon.abilityName;
    if (ability && ability !== "None") text += `Ability: ${ability}\n`;
    
    let level = mon.level || mon.metLevel;
    if (level) text += `Level: ${level}\n`;

    // EVs
    let evStrings = [];
    if (mon.hpEV > 0) evStrings.push(`${mon.hpEV} HP`);
    if (mon.attackEV > 0) evStrings.push(`${mon.attackEV} Atk`);
    if (mon.defenseEV > 0) evStrings.push(`${mon.defenseEV} Def`);
    if (mon.spAttackEV > 0) evStrings.push(`${mon.spAttackEV} SpA`);
    if (mon.spDefenseEV > 0) evStrings.push(`${mon.spDefenseEV} SpD`);
    if (mon.speedEV > 0) evStrings.push(`${mon.speedEV} Spe`);
    
    if (evStrings.length > 0) text += `EVs: ${evStrings.join(" / ")}\n`;

    // IVs (Showdown assumes 31, only list if < 31)
    let ivStrings = [];
    if (mon.hpIV !== undefined && mon.hpIV < 31) ivStrings.push(`${mon.hpIV} HP`);
    if (mon.attackIV !== undefined && mon.attackIV < 31) ivStrings.push(`${mon.attackIV} Atk`);
    if (mon.defenseIV !== undefined && mon.defenseIV < 31) ivStrings.push(`${mon.defenseIV} Def`);
    if (mon.spAttackIV !== undefined && mon.spAttackIV < 31) ivStrings.push(`${mon.spAttackIV} SpA`);
    if (mon.spDefenseIV !== undefined && mon.spDefenseIV < 31) ivStrings.push(`${mon.spDefenseIV} SpD`);
    if (mon.speedIV !== undefined && mon.speedIV < 31) ivStrings.push(`${mon.speedIV} Spe`);
    
    if (ivStrings.length > 0) text += `IVs: ${ivStrings.join(" / ")}\n`;

    if (mon.nature && mon.nature !== "None") text += `${mon.nature} Nature\n`;

    // Moves
    let moves = mon.moveNames || mon.moves;
    if (moves && moves.length > 0) {
        moves.forEach(move => {
            if (move && move !== "None" && move !== "(No Move)") {
                text += `- ${move}\n`;
            }
        });
    }

    return text.trim();
}

// Ensure old synced sets are wiped if the team changes, so we don't build up ghosts
function wipeOldMgbaSets() {
    if (!localStorage.customsets) return;
    let customsets;
    try {
        customsets = JSON.parse(localStorage.customsets);
    } catch(e) { return; }

    let changed = false;
    for (const species in customsets) {
        for (const setName in customsets[species]) {
            if (setName.startsWith("mGBA ")) {
                delete customsets[species][setName];
                deleteMovesetFromAllSetdex(species, setName);
                changed = true;
            }
        }
        if (Object.keys(customsets[species]).length === 0) {
            delete customsets[species];
        }
    }
    
    if (changed) {
        // Just clear the UI box markers matching mGBA
        $("#box-poke-list .trainer-pok, #box-poke-list2 .trainer-pok, #team-poke-list .trainer-pok").each(function () {
            let dataId = $(this).attr("data-id") || "";
            if (dataId.includes("mGBA ")) {
                $(this).remove();
            }
        });
    }
}


function processPayload(data) {
    let importedCount = 0;
    
    // First, clear previous mGBA sets so ghosts disappear
    wipeOldMgbaSets();

    // Process Party
    if (data.party && data.party.length > 0) {
        data.party.forEach((mon, index) => {
            let text = monToShowdownText(mon);
            if (text) {
                // By providing a unique name like "mGBA Party 1", addSets overwrites gracefully
                addSets(text, `mGBA Party ${index + 1}`);
                importedCount++;
            }
        });
    }

    // Process PC Boxes
    if (SyncState.SETTINGS.includePc && data.boxes && data.boxes.length > 0) {
        data.boxes.forEach(slotData => {
            if (SyncState.SETTINGS.excludeDeadBox) {
                if (slotData.isDeadBox || (slotData.box >= 11 && slotData.box <= 13)) {
                    return;
                }
            }
            // In the JSON provided, slotData ITSELF is the Pokemon object
            let text = monToShowdownText(slotData);
            if (text) {
                addSets(text, `mGBA B${slotData.box + 1} S${slotData.slot + 1}`);
                importedCount++;
            }
        });
    }
    
    return importedCount;
}

function updateStatusUI(message, isError = false) {
    const statusEl = document.getElementById("mgba-sync-status");
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = isError ? "#ff6b6b" : "#4ade80"; // Red for error, Green for OK
        if (message === "Déconnecté" || message === "Recherche...") {
            statusEl.style.color = "#a0aab5"; // Neutral
        }
    }
}

async function pollServer() {
    if (!SyncState.ENABLED) return;

    try {
        updateStatusUI("Recherche...");
        
        let response = await fetch(MGBA_SYNC_URL);
        if (!response.ok) {
            response = await fetch(FALLBACK_URL);
        }

        if (response.ok) {
            const rawText = await response.text();
            const hash = hashCode(rawText);

            if (hash !== SyncState.LAST_HASH) {
                SyncState.LAST_HASH = hash;
                const data = JSON.parse(rawText);
                const count = processPayload(data);
                
                const now = new Date();
                const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                updateStatusUI(`Connecté (${count} Pokémon synchronisés - ${timeString})`);
            } else {
                // Just keep the last connected status time, no UI change needed if hash is same.
                // It means we successfully connected but nothing changed.
            }
        } else {
            updateStatusUI("Erreur: mGBA non détecté", true);
        }
    } catch (err) {
        updateStatusUI("Erreur: mGBA non détecté", true);
    }

    if (SyncState.ENABLED) {
        SyncState.TIMEOUT_ID = setTimeout(pollServer, SyncState.POLL_INTERVAL);
    }
}

function toggleSync() {
    SyncState.ENABLED = !SyncState.ENABLED;
    
    const btn = document.getElementById("mgba-sync-btn");
    if (btn) {
        btn.textContent = SyncState.ENABLED ? "Auto-Sync mGBA : ON" : "Auto-Sync mGBA : OFF";
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

function saveSettings() {
    localStorage.setItem("mgbaSyncSettings", JSON.stringify({
        enabled: SyncState.ENABLED,
        includePc: SyncState.SETTINGS.includePc,
        excludeDeadBox: SyncState.SETTINGS.excludeDeadBox
    }));
}

function loadSettings() {
    const saved = localStorage.getItem("mgbaSyncSettings");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            SyncState.ENABLED = !!parsed.enabled;
            if (typeof parsed.includePc !== "undefined") SyncState.SETTINGS.includePc = parsed.includePc;
            if (typeof parsed.excludeDeadBox !== "undefined") SyncState.SETTINGS.excludeDeadBox = parsed.excludeDeadBox;
        } catch (e) {}
    }
}

function injectUI() {
    const wrapper = document.getElementById("import-1_wrapper");
    if (!wrapper) return; // Might not exist on all calc pages

    const syncBox = document.createElement("div");
    syncBox.className = "mgba-sync-container";
    syncBox.style.marginBottom = "15px";
    syncBox.style.padding = "10px";
    syncBox.style.border = "1px solid var(--fieldset-color, #ccc)";
    syncBox.style.borderRadius = "4px";

    syncBox.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <button id="mgba-sync-btn" class="bs-btn ${SyncState.ENABLED ? 'bs-btn-success' : 'bs-btn-default'}" style="margin-right: 15px; font-weight: bold;">
                Auto-Sync mGBA : ${SyncState.ENABLED ? 'ON' : 'OFF'}
            </button>
            <span id="mgba-sync-status" style="flex-grow: 1; font-size: 0.9em; color: #a0aab5;">
                ${SyncState.ENABLED ? 'Recherche...' : 'Déconnecté'}
            </span>
        </div>
        <div style="font-size: 0.85em; display: flex; gap: 15px;">
            <label>
                <input type="checkbox" id="mgba-sync-pc" ${SyncState.SETTINGS.includePc ? 'checked' : ''}>
                Inclure les boîtes PC
            </label>
            <label>
                <input type="checkbox" id="mgba-sync-deadbox" ${SyncState.SETTINGS.excludeDeadBox ? 'checked' : ''}>
                Exclure la Dead Box (Boîtes 11 à 13)
            </label>
        </div>
    `;

    // Insert right before the import form
    wrapper.parentNode.insertBefore(syncBox, wrapper);

    document.getElementById("mgba-sync-btn").addEventListener("click", (e) => {
        e.preventDefault();
        toggleSync();
    });

    document.getElementById("mgba-sync-pc").addEventListener("change", (e) => {
        SyncState.SETTINGS.includePc = e.target.checked;
        SyncState.LAST_HASH = null; // force re-parse next poll
        saveSettings();
    });

    document.getElementById("mgba-sync-deadbox").addEventListener("change", (e) => {
        SyncState.SETTINGS.excludeDeadBox = e.target.checked;
        SyncState.LAST_HASH = null; // force re-parse next poll
        saveSettings();
    });
}

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    injectUI();
    if (SyncState.ENABLED) {
        pollServer();
    }
});
