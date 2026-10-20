/**
 * guigz_special.js
 * "The Guigz Special" easter egg & audio feature for Null-Damage-Calc.
 *
 * Plays a random sound whenever Player 2 (opposing Pokémon) is loaded or selected
 * with "Ancient Power" in its active moveset (slots 1-4, or 1-8 if 8-moves mode is active).
 *
 * Fully integrated with the Gear Settings menu (nullCalcSettings.enableGuigzSpecial).
 */

(function () {
    "use strict";

    var SETTINGS_KEY = "nullCalcSettings";
    var DEBOUNCE_TIME_MS = 300;

    // Dedicated sound pool
    var GUIGZ_SOUNDS = [
        "sounds/guigz/sound1.ogg",
        "sounds/guigz/sound2.ogg",
        "sounds/guigz/sound3.ogg"
    ];

    var currentAudio = null;
    var lastEvaluatedSignature = "";
    var lastTriggerTimestamp = 0;

    /**
     * Case-insensitive / format-agnostic check for Ancient Power.
     * Matches "Ancient Power", "AncientPower", "ancient-power", etc.
     */
    function isAncientPowerMove(moveName) {
        if (!moveName || typeof moveName !== "string") return false;
        var clean = moveName.trim().toLowerCase().replace(/[\s\-_]/g, "");
        return clean === "ancientpower";
    }

    /**
     * Retrieve setting from localStorage or active DOM checkbox.
     * Default: false (Disabled).
     */
    function isGuigzSpecialEnabled() {
        var cb = document.getElementById("setting-toggle-guigz-special");
        if (cb) {
            return cb.checked === true;
        }
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                return parsed.enableGuigzSpecial === true;
            }
        } catch (_) {}
        return false;
    }

    /**
     * Update setting in localStorage and synchronize DOM checkbox.
     */
    function setGuigzSpecialEnabled(enabled) {
        var boolVal = enabled === true;
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            var settings = raw ? JSON.parse(raw) : {};
            settings.enableGuigzSpecial = boolVal;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (_) {}

        var cb = document.getElementById("setting-toggle-guigz-special");
        if (cb && cb.checked !== boolVal) {
            cb.checked = boolVal;
        }

        // Reset last signature on toggle change so enabling will check current mon
        lastEvaluatedSignature = "";
        if (boolVal) {
            checkAndPlayGuigzSpecial($("#p2"));
        }
    }

    /**
     * Stop any currently playing Guigz sound.
     */
    function stopCurrentGuigzSound() {
        if (currentAudio) {
            try {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            } catch (_) {}
            currentAudio = null;
        }
    }

    /**
     * Plays a random sound track from GUIGZ_SOUNDS.
     * Handles autoplay restrictions and audio failures silently.
     */
    function playRandomGuigzSound() {
        if (!GUIGZ_SOUNDS || !GUIGZ_SOUNDS.length) return null;

        var randomIndex = Math.floor(Math.random() * GUIGZ_SOUNDS.length);
        var soundUrl = GUIGZ_SOUNDS[randomIndex];

        try {
            stopCurrentGuigzSound();

            var audio = new Audio(soundUrl);
            currentAudio = audio;

            audio.addEventListener("ended", function () {
                if (currentAudio === audio) currentAudio = null;
            });
            audio.addEventListener("error", function () {
                if (currentAudio === audio) currentAudio = null;
            });

            var playPromise = audio.play();
            if (playPromise !== undefined && typeof playPromise.catch === "function") {
                playPromise.catch(function (_) {
                    // Browser autoplay policy prevented playback or media loading issue - fail silently
                });
            }
            return audio;
        } catch (_) {
            return null;
        }
    }

    /**
     * Extract active moves from a target (PokeInfo DOM / jQuery element or Pokemon object).
     */
    function extractOpponentInfo(target) {
        var $poke = null;
        var moves = [];
        var identifier = "";

        // Check if 8-moveslots mode is active
        var is8Active = false;
        if (typeof window.is8MovesEnabled === "function") {
            is8Active = window.is8MovesEnabled();
        } else {
            var moves8Cb = document.getElementById("setting-toggle-8-moves");
            is8Active = moves8Cb ? moves8Cb.checked : (document.documentElement && document.documentElement.classList.contains("enable-8-moves"));
        }
        var maxSlots = is8Active ? 8 : 4;

        if (typeof jQuery !== "undefined") {
            if (!target) {
                $poke = $("#p2");
            } else if (target instanceof jQuery) {
                $poke = target.closest(".poke-info").length ? target.closest(".poke-info") : $("#p2");
            } else if (target.nodeType) {
                $poke = $(target).closest(".poke-info");
            }
        }

        if ($poke && $poke.length) {
            identifier = $poke.find("input.set-selector").val() || $poke.find(".set-selector").val() || "";
            for (var i = 1; i <= maxSlots; i++) {
                var $moveSel = $poke.find(".move" + i + " select.move-selector");
                if ($moveSel.length) {
                    moves.push($moveSel.val() || "");
                }
            }
        } else if (target && typeof target === "object") {
            identifier = target.name || target.species || "p2";
            if (Array.isArray(target.moves)) {
                for (var j = 0; j < Math.min(target.moves.length, maxSlots); j++) {
                    var mv = target.moves[j];
                    moves.push(typeof mv === "string" ? mv : (mv && mv.name ? mv.name : ""));
                }
            }
        }

        return {
            identifier: identifier,
            moves: moves,
            signature: identifier + "::" + moves.join("|")
        };
    }

    /**
     * Checks if the target opponent Pokémon has Ancient Power in its active moveset
     * and triggers playback if enabled, respecting anti-spam signature and debounce.
     */
    function checkAndPlayGuigzSpecial(target) {
        if (!isGuigzSpecialEnabled()) {
            return false;
        }

        // Ignore intermediate evaluations while calculator is bulk-loading a set
        if (typeof window !== "undefined" && window.NO_CALC) {
            return false;
        }

        var info = extractOpponentInfo(target);
        var signature = info.signature;

        // Anti-spam: only trigger when the opponent set / active moveset changes.
        // Prevents re-triggering during slider drags, HP recalculations, or stat adjustments.
        if (signature === lastEvaluatedSignature) {
            return false;
        }
        // Crucial: unconditionally record the signature whether hasAP is true or false
        lastEvaluatedSignature = signature;

        // Check if Ancient Power is present in active moves
        var hasAP = false;
        for (var k = 0; k < info.moves.length; k++) {
            if (isAncientPowerMove(info.moves[k])) {
                hasAP = true;
                break;
            }
        }

        if (!hasAP) {
            return false;
        }

        // Anti-spam debounce guard
        var now = Date.now();
        if (now - lastTriggerTimestamp < DEBOUNCE_TIME_MS) {
            return false;
        }
        lastTriggerTimestamp = now;

        playRandomGuigzSound();
        return true;
    }

    /**
     * Injects or attaches the "The Guigz Special" toggle in the gear settings menu (#app-menu-panel).
     */
    function initGuigzSpecialToggle() {
        var panel = document.getElementById("app-menu-panel");
        var existingCb = document.getElementById("setting-toggle-guigz-special");

        if (!existingCb && panel) {
            // Find insertion point (after Quick-Apply Damage or at the end of the Null Features section)
            var quickApplyRow = document.getElementById("setting-toggle-quick-apply-damage");
            var anchor = quickApplyRow ? quickApplyRow.closest(".app-menu-row") : null;

            var label = document.createElement("label");
            label.className = "app-menu-row app-menu-toggle-row";
            label.innerHTML = [
                '<span class="app-menu-row-label">The Guigz Special</span>',
                '<span class="app-menu-toggle">',
                '  <input type="checkbox" id="setting-toggle-guigz-special" class="app-menu-toggle-input" role="switch" />',
                '  <span class="app-menu-toggle-track" aria-hidden="true"></span>',
                '</span>'
            ].join("");

            if (anchor && anchor.nextSibling) {
                panel.insertBefore(label, anchor.nextSibling);
            } else {
                panel.appendChild(label);
            }
        }

        var cb = document.getElementById("setting-toggle-guigz-special");
        if (cb) {
            cb.checked = isGuigzSpecialEnabled();
            var isBound = cb.dataset ? cb.dataset.guigzBound : (typeof cb.getAttribute === "function" ? cb.getAttribute("data-guigz-bound") : null);
            if (!isBound) {
                if (cb.dataset) cb.dataset.guigzBound = "true";
                else if (typeof cb.setAttribute === "function") cb.setAttribute("data-guigz-bound", "true");
                if (typeof cb.addEventListener === "function") {
                    cb.addEventListener("change", function () {
                        setGuigzSpecialEnabled(cb.checked);
                    });
                }
            }
        }
    }

    /**
     * Bind delegated change listeners for Player 2 opponent modifications.
     */
    function initOpponentListeners() {
        if (typeof jQuery === "undefined" || !$(document) || typeof $(document).on !== "function") return;

        var opponentUpdateTimer = null;

        // When opponent set selector changes
        $(document).on("change", "#p2 input.set-selector, #p2 .set-selector", function () {
            if (!isGuigzSpecialEnabled()) return;
            clearTimeout(opponentUpdateTimer);
            opponentUpdateTimer = setTimeout(function () {
                if (typeof window !== "undefined" && window.NO_CALC) return;
                checkAndPlayGuigzSpecial($("#p2"));
            }, 70);
        });

        // When individual move dropdown on opponent changes
        $(document).on("change", "#p2 select.move-selector", function () {
            // Ignore cascade change events during bulk set loading
            if (typeof window !== "undefined" && window.NO_CALC) return;
            if (!isGuigzSpecialEnabled()) return;
            clearTimeout(opponentUpdateTimer);
            opponentUpdateTimer = setTimeout(function () {
                if (typeof window !== "undefined" && window.NO_CALC) return;
                checkAndPlayGuigzSpecial($("#p2"));
            }, 60);
        });
    }

    function init() {
        initGuigzSpecialToggle();
        initOpponentListeners();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Public API
    window.GUIGZ_SOUNDS = GUIGZ_SOUNDS;
    window.isGuigzSpecialEnabled = isGuigzSpecialEnabled;
    window.setGuigzSpecialEnabled = setGuigzSpecialEnabled;
    window.playRandomGuigzSound = playRandomGuigzSound;
    window.stopCurrentGuigzSound = stopCurrentGuigzSound;
    window.checkAndPlayGuigzSpecial = checkAndPlayGuigzSpecial;

    window.GuigzSpecial = {
        sounds: GUIGZ_SOUNDS,
        isEnabled: isGuigzSpecialEnabled,
        setEnabled: setGuigzSpecialEnabled,
        playSound: playRandomGuigzSound,
        stopSound: stopCurrentGuigzSound,
        checkAndPlay: checkAndPlayGuigzSpecial,
        isAncientPowerMove: isAncientPowerMove
    };
})();
