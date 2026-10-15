/**
 * probability_calc_ui.js
 *
 * Wires together:
 *   - Feature 1: Overlapping Roll Indicator badge on opponent move buttons
 *   - Feature 2: Probability Calculator modal (compound KO)
 *   - [+] Quick-Add button next to "Possible damage amounts"
 *   - Settings toggle (#setting-toggle-overlap-roll) -> localStorage
 *
 * Depends on: probability_calc.js (window.ProbabilityCalc) being loaded first.
 *
 * This file is loaded AFTER shared_controls.js and index_randoms_controls.js
 * so that performCalculations() and getNullCalcSettings/saveNullCalcSettings
 * are already available.
 */

(function (window, document) {
    'use strict';

    /* =========================================================================
     * CONSTANTS
     * ====================================================================== */
    var MAX_MOVE_ROWS = 7;
    var PROBA_STORAGE_KEY = 'nullProbaCalcState';
    var PC = window.ProbabilityCalc;

    /* =========================================================================
     * SETTINGS: showOverlapRoll
     * ====================================================================== */
    function getOverlapRollSetting() {
        try {
            var raw = localStorage.getItem('nullCalcSettings');
            if (raw) {
                var s = JSON.parse(raw);
                return s.showOverlapRoll === true;
            }
        } catch (e) {}
        return false;
    }

    function saveOverlapRollSetting(val) {
        try {
            var raw = localStorage.getItem('nullCalcSettings');
            var s = raw ? JSON.parse(raw) : {};
            s.showOverlapRoll = val;
            localStorage.setItem('nullCalcSettings', JSON.stringify(s));
        } catch (e) {}
    }

    /* =========================================================================
     * MODAL STATE (persisted to localStorage)
     * ====================================================================== */
    var probaState = {
        hp: '',
        rows: []   // [{name: string, rolls: string}]
    };

    function loadProbaState() {
        try {
            var raw = localStorage.getItem(PROBA_STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed.rows && Array.isArray(parsed.rows)) {
                    probaState.hp   = parsed.hp || '';
                    probaState.rows = parsed.rows;
                    return;
                }
            }
        } catch (e) {}
        probaState.hp   = '';
        probaState.rows = [];
    }

    function saveProbaState() {
        try {
            localStorage.setItem(PROBA_STORAGE_KEY, JSON.stringify(probaState));
        } catch (e) {}
    }

    /* =========================================================================
     * DOM INJECTION: Modal HTML
     * ====================================================================== */
    function injectModalHTML() {
        var overlay = document.createElement('div');
        overlay.id = 'proba-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'proba-modal-title-txt');
        overlay.innerHTML = [
            '<div id="proba-modal">',
            '  <div class="proba-modal-header">',
            '    <span class="proba-modal-title" id="proba-modal-title-txt">Range Calculator</span>',
            '    <button type="button" id="proba-modal-close" title="Close" aria-label="Close">&times;</button>',
            '  </div>',
            '  <div class="proba-hp-row">',
            '    <label for="proba-hp-input">Target HP:</label>',
            '    <input type="number" id="proba-hp-input" min="1" placeholder="e.g. 241" />',
            '  </div>',
            '  <div id="proba-moves-list"></div>',
            '  <button type="button" id="proba-add-row-btn">+ Add Move</button>',
            '  <div class="proba-result-area" id="proba-result-area">',
            '    <span class="proba-result-placeholder">Enter HP and at least 2 moves to calculate</span>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);
    }

    /* =========================================================================
     * DOM INJECTION: [+] Button beside damageValues
     * ====================================================================== */
    function injectAddButton() {
        var damageValuesEl = document.getElementById('damageValues');
        if (!damageValuesEl) return;
        var parent = damageValuesEl.parentNode;
        if (!parent) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-add-to-proba';
        btn.className = 'btn-add-to-proba';
        btn.title = 'Add rolls to Range Calculator';
        btn.setAttribute('aria-label', 'Add damage rolls to Range Calculator');
        btn.textContent = '[+]';

        // Insert after the damageValues span
        var next = damageValuesEl.nextSibling;
        if (next) {
            parent.insertBefore(btn, next);
        } else {
            parent.appendChild(btn);
        }

        btn.addEventListener('click', handleAddToProba);
    }

    /* =========================================================================
     * DOM INJECTION: Range Calculator tab button in header
     * ====================================================================== */
    function injectHeaderButton() {
        var tabs = document.querySelector('.app-header-tabs');
        if (!tabs) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-small app-header-tab';
        btn.id = 'header-proba-button';
        btn.title = 'Range Calculator';
        btn.setAttribute('aria-label', 'Range Calculator');
        btn.innerHTML = 'Range<br>Calculator';
        tabs.appendChild(btn);
        btn.addEventListener('click', openModal);
    }

    /* =========================================================================
     * DOM INJECTION: Settings toggle in gear menu
     * ====================================================================== */
    function injectSettingsToggle() {
        var panel = document.getElementById('app-menu-panel');
        if (!panel) return;
        // Find the "Null Features" section header
        var headers = panel.querySelectorAll('.app-menu-section-header');
        var insertBefore = null;
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].textContent.indexOf('Null Features') !== -1) {
                // Insert the toggle AFTER this header, before any existing toggles
                insertBefore = headers[i].nextSibling;
                break;
            }
        }

        var label = document.createElement('label');
        label.className = 'app-menu-row app-menu-toggle-row';
        label.innerHTML = [
            '<span class="app-menu-row-label">Overlapping Roll Indicator</span>',
            '<span class="app-menu-toggle">',
            '  <input type="checkbox" id="setting-toggle-overlap-roll" class="app-menu-toggle-input" role="switch" />',
            '  <span class="app-menu-toggle-track" aria-hidden="true"></span>',
            '</span>'
        ].join('');

        if (insertBefore && insertBefore.parentNode === panel) {
            panel.insertBefore(label, insertBefore);
        } else {
            panel.appendChild(label);
        }

        // Wire it up
        var cb = document.getElementById('setting-toggle-overlap-roll');
        if (cb) {
            cb.checked = getOverlapRollSetting();
            cb.addEventListener('change', function () {
                saveOverlapRollSetting(cb.checked);
                updateOverlapBadges();
            });
        }
    }

    /* =========================================================================
     * MODAL: Open / Close
     * ====================================================================== */
    var overlay;

    function openModal() {
        if (!overlay) return;
        loadProbaState();
        renderModalRows();
        renderHP();
        updateProbaResult();
        overlay.classList.add('proba-open');
        // Prefill HP from P1 current HP if empty
        var hpInput = document.getElementById('proba-hp-input');
        if (hpInput && (!hpInput.value || hpInput.value === '0')) {
            var p1CurrentHP = getP1CurrentHP();
            if (p1CurrentHP > 0) {
                hpInput.value = p1CurrentHP;
                probaState.hp = String(p1CurrentHP);
                saveProbaState();
            }
        }
    }

    function closeModal() {
        if (!overlay) return;
        // Persist state before closing (already saved on each change)
        overlay.classList.remove('proba-open');
    }

    /* =========================================================================
     * MODAL: Rendering rows
     * ====================================================================== */
    function renderHP() {
        var hpInput = document.getElementById('proba-hp-input');
        if (hpInput) hpInput.value = probaState.hp || '';
    }

    function renderModalRows() {
        var list = document.getElementById('proba-moves-list');
        if (!list) return;
        list.innerHTML = '';
        for (var i = 0; i < probaState.rows.length; i++) {
            list.appendChild(buildMoveRow(i));
        }
        updateAddRowButtonState();
    }

    function buildMoveRow(idx) {
        var row = probaState.rows[idx];
        var div = document.createElement('div');
        div.className = 'proba-move-row';
        div.setAttribute('data-row-idx', idx);

        var label = document.createElement('span');
        label.className = 'proba-move-label';
        label.textContent = 'Move ' + (idx + 1);

        var name = document.createElement('span');
        name.className = 'proba-move-name';
        name.textContent = row.name || '';
        name.title = row.name || '';

        var rollsInput = document.createElement('input');
        rollsInput.type = 'text';
        rollsInput.className = 'proba-rolls-input';
        rollsInput.placeholder = 'e.g. 16, 17, 18, 19…';
        rollsInput.value = row.rolls || '';
        rollsInput.setAttribute('aria-label', 'Damage rolls for move ' + (idx + 1));
        rollsInput.setAttribute('data-row-idx', idx);
        rollsInput.addEventListener('input', function (e) {
            var i2 = parseInt(e.target.getAttribute('data-row-idx'), 10);
            probaState.rows[i2].rolls = e.target.value;
            saveProbaState();
            updateProbaResult();
        });

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'proba-move-delete';
        delBtn.title = 'Remove this move';
        delBtn.setAttribute('aria-label', 'Remove move ' + (idx + 1));
        delBtn.textContent = '\u2715';
        delBtn.setAttribute('data-row-idx', idx);
        delBtn.addEventListener('click', function (e) {
            var i3 = parseInt(e.currentTarget.getAttribute('data-row-idx'), 10);
            probaState.rows.splice(i3, 1);
            saveProbaState();
            renderModalRows();
            updateProbaResult();
        });

        div.appendChild(label);
        if (row.name) div.appendChild(name);
        div.appendChild(rollsInput);
        div.appendChild(delBtn);
        return div;
    }

    function updateAddRowButtonState() {
        var btn = document.getElementById('proba-add-row-btn');
        if (!btn) return;
        btn.disabled = probaState.rows.length >= MAX_MOVE_ROWS;
    }

    /* =========================================================================
     * MODAL: Calculate & Display Result
     * ====================================================================== */
    function updateProbaResult() {
        var resultArea = document.getElementById('proba-result-area');
        if (!resultArea) return;

        resultArea.className = 'proba-result-area';

        var hpEl = document.getElementById('proba-hp-input');
        var hp = parseInt(hpEl ? hpEl.value : '', 10);
        if (isNaN(hp) || hp <= 0) {
            resultArea.innerHTML = '<span class="proba-result-placeholder">Enter a valid Target HP</span>';
            return;
        }

        var validRolls = [];
        for (var i = 0; i < probaState.rows.length; i++) {
            var parsed = PC.parseRollString(probaState.rows[i].rolls);
            if (parsed.length > 0) validRolls.push(parsed);
        }

        if (validRolls.length < 2) {
            resultArea.innerHTML = '<span class="proba-result-placeholder">Enter at least 2 moves with rolls</span>';
            return;
        }

        try {
            var prob = PC.computeMultiRollKillProba(validRolls, hp);
            var rounded = prob.toFixed(4);
            var mainLine, fracLine;

            if (prob <= 0) {
                resultArea.classList.add('proba-result--zero');
                mainLine = '0% chance to KO';
                fracLine = 'Impossible (0%)';
            } else if (prob >= 100) {
                resultArea.classList.add('proba-result--ready');
                mainLine = '100% chance to KO';
                fracLine = 'Guaranteed KO (1/1)';
            } else {
                resultArea.classList.add('proba-result--ready');
                mainLine = rounded + '% chance to KO';
                var n = Math.round(100 / prob);
                fracLine = '~1/' + n + ' chance de KO';
            }

            resultArea.innerHTML =
                '<span class="proba-result-main">' + mainLine + '</span>' +
                '<span class="proba-result-frac">' + fracLine + '</span>';
        } catch (err) {
            resultArea.innerHTML = '<span class="proba-result-placeholder">Error: ' + err.message + '</span>';
        }
    }

    /* =========================================================================
     * [+] QUICK-ADD HANDLER
     * ====================================================================== */
    function handleAddToProba() {
        if (!window.damageResults) return;

        // Find currently-selected result-move radio
        var checked = document.querySelector('.result-move:checked');
        if (!checked) return;
        var id = checked.id;

        // Determine which damageResults entry this corresponds to
        var resultLocations = window.resultLocations;
        if (!resultLocations) return;

        var result = null;
        var moveName = '';
        for (var side = 0; side < resultLocations.length; side++) {
            for (var mi = 0; mi < resultLocations[side].length; mi++) {
                if (resultLocations[side][mi].move === '#' + id) {
                    var r = window.damageResults[side][mi];
                    if (r) {
                        result = r;
                        // Try to get move name from label
                        var label = document.querySelector('label[for="' + id + '"]');
                        moveName = label ? label.textContent.trim() : ('Move ' + (mi + 1));
                    }
                    break;
                }
            }
            if (result) break;
        }

        if (!result) return;

        // Extract total damage rolls, handling multi-hit moves via getFullMoveRolls
        var rolls = PC.getFullMoveRolls ? PC.getFullMoveRolls(result) : PC.flattenDamage(result);
        if (rolls.length === 0) return;

        // Load current state
        loadProbaState();

        // Fill HP from P1 if empty
        if (!probaState.hp || probaState.hp === '0') {
            var p1HP = getP1CurrentHP();
            if (p1HP > 0) probaState.hp = String(p1HP);
        }

        // Find first empty slot or append
        var inserted = false;
        if (probaState.rows.length < MAX_MOVE_ROWS) {
            probaState.rows.push({
                name: moveName,
                rolls: rolls.join(', ')
            });
            inserted = true;
        }

        if (inserted) {
            saveProbaState();
            // Visual feedback
            var btn = document.getElementById('btn-add-to-proba');
            if (btn) {
                btn.classList.add('added-flash', 'proba-added');
                btn.textContent = '\u2713 Added';
                setTimeout(function () {
                    btn.classList.remove('added-flash', 'proba-added');
                    btn.textContent = '[+]';
                }, 1400);
            }
        }
    }

    /* =========================================================================
     * HELPER: Get P1 current HP
     * ====================================================================== */
    function getP1CurrentHP() {
        // Try the current-hp input inside #p1
        var el = document.querySelector('#p1 .current-hp');
        if (el) {
            var v = parseInt(el.value, 10);
            if (!isNaN(v) && v > 0) return v;
        }
        // Fallback: try to read from damageResults P2 attacking P1 (defender HP = P1 total)
        if (window.damageResults && window.damageResults[1] && window.damageResults[1][0]) {
            var def = window.damageResults[1][0].defender;
            if (def && def.stats && def.stats.hp) return def.stats.hp;
        }
        return 0;
    }

    /* =========================================================================
     * FEATURE 1: OVERLAP ROLL BADGES
     * ====================================================================== */

    /**
     * Reads current damageResults for P2's moves (opponent),
     * computes overlap/kill probabilities across all valid damaging moves (up to 8),
     * and appends inline badges to damage spans with zero-suppression.
     * Called after performCalculations() completes.
     */
    function updateOverlapBadges() {
        // Always remove old badges first
        var oldBadges = document.querySelectorAll('.overlap-proba-badge');
        for (var ob = 0; ob < oldBadges.length; ob++) {
            if (oldBadges[ob].parentNode) {
                oldBadges[ob].parentNode.removeChild(oldBadges[ob]);
            }
        }

        if (!getOverlapRollSetting()) return;
        if (!window.damageResults) return;

        // Work on P2 (opponent = side 1)
        var p2Results = window.damageResults[1];
        if (!p2Results) return;

        // Get P1 current HP (the target being hit)
        var targetHP = getP1CurrentHP();

        // Collect all valid damaging moves (multi-hit normalised via getFullMoveRolls)
        var movesData = [];
        for (var i = 0; i < p2Results.length; i++) {
            var res = p2Results[i];
            if (!res) continue;
            var flatRolls = PC.getFullMoveRolls ? PC.getFullMoveRolls(res) : PC.flattenDamage(res);
            if (!flatRolls || flatRolls.length === 0) continue;
            var maxRoll = flatRolls[flatRolls.length - 1];
            if (maxRoll <= 0) continue; // Non-damaging move

            var canKill = targetHP > 0 ? (maxRoll >= targetHP) : false;
            movesData.push({ rolls: flatRolls, canKill: canKill, idx: i });
        }

        if (movesData.length < 2) return;

        // Pass all valid moves together into computeMoveOverlapProba
        var rollArrays = [];
        for (var j = 0; j < movesData.length; j++) {
            rollArrays.push(movesData[j].rolls);
        }

        var hp = targetHP > 0 ? targetHP : null;
        var probs;
        try {
            probs = PC.computeMoveOverlapProba(rollArrays, hp);
        } catch (e) {
            console.warn('Overlap calculation error:', e);
            return;
        }

        // Append inline overlap text to damage spans (zero-suppressed)
        var resultLocations = window.resultLocations;
        if (!resultLocations || !resultLocations[1]) return;

        for (var k = 0; k < movesData.length; k++) {
            var pct = probs[k];
            if (pct <= 0.001) continue; // Zero-suppression: do not display anything extra for 0% moves

            var originalIdx = movesData[k].idx;
            var loc = resultLocations[1][originalIdx];
            if (!loc) continue;
            var damageSpan = document.querySelector(loc.damage);
            if (!damageSpan) continue;

            var badge = document.createElement('span');
            badge.className = 'overlap-proba-badge';
            badge.title = 'AI move selection probability';
            // Format: " | X% Overlapp" appended inline after the damage range text
            badge.textContent = ' | ' + pct.toFixed(2) + '% Overlapp';
            damageSpan.appendChild(badge);
        }
    }

    // Expose so index_randoms_controls can call it after performCalculations
    window.updateOverlapBadges = updateOverlapBadges;

    /* =========================================================================
     * INIT — runs after DOM is ready
     * ====================================================================== */
    function init() {
        if (!PC) {
            console.error('probability_calc_ui: ProbabilityCalc not loaded');
            return;
        }

        loadProbaState();

        // Inject DOM elements
        injectModalHTML();
        injectHeaderButton();
        injectSettingsToggle();
        injectAddButton();

        // Wire overlay / modal close
        overlay = document.getElementById('proba-modal-overlay');
        var modal = document.getElementById('proba-modal');

        var closeBtn = document.getElementById('proba-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('proba-open')) {
                closeModal();
            }
        });

        // HP input
        var hpInput = document.getElementById('proba-hp-input');
        if (hpInput) {
            hpInput.addEventListener('input', function () {
                probaState.hp = hpInput.value;
                saveProbaState();
                updateProbaResult();
            });
        }

        // Add row button
        var addRowBtn = document.getElementById('proba-add-row-btn');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', function () {
                if (probaState.rows.length >= MAX_MOVE_ROWS) return;
                probaState.rows.push({ name: '', rolls: '' });
                saveProbaState();
                renderModalRows();
                updateProbaResult();
            });
        }

        // Patch performCalculations to also update overlap badges
        var origPerformCalculations = window.performCalculations;
        if (typeof origPerformCalculations === 'function') {
            window.performCalculations = function () {
                origPerformCalculations.apply(this, arguments);
                updateOverlapBadges();
            };
        }

        // Initial state sync for overlap-roll setting toggle
        var overlapCb = document.getElementById('setting-toggle-overlap-roll');
        if (overlapCb) {
            overlapCb.checked = getOverlapRollSetting();
        }
    }

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Already loaded (script at bottom of body)
        setTimeout(init, 0);
    }

})(window, document);
