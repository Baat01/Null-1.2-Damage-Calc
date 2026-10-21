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
    var PROBA_STORAGE_KEY = 'nullProbaCalcState';
    var PC = window.ProbabilityCalc;

    /* =========================================================================
     * SETTINGS: showOverlapRoll
     * ====================================================================== */
    function getOverlapRollSetting() {
        try {
            var storage = window.localStorage || localStorage;
            var raw = storage.getItem('nullCalcSettings');
            if (raw) {
                var s = JSON.parse(raw);
                return s.showOverlapRoll === true;
            }
        } catch (e) {}
        return false;
    }

    function saveOverlapRollSetting(val) {
        try {
            var storage = window.localStorage || localStorage;
            var raw = storage.getItem('nullCalcSettings');
            var s = raw ? JSON.parse(raw) : {};
            s.showOverlapRoll = val;
            storage.setItem('nullCalcSettings', JSON.stringify(s));
        } catch (e) {}
    }

    /* =========================================================================
     * MODAL STATE (persisted to localStorage)
     * ====================================================================== */
    var probaState = {
        hp: '',
        minRemainingHP: '0',
        rows: []   // [{name: string, rolls: string}]
    };

    function loadProbaState() {
        try {
            var storage = window.localStorage || localStorage;
            var raw = storage.getItem(PROBA_STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed.rows && Array.isArray(parsed.rows)) {
                    probaState.hp             = parsed.hp || '';
                    probaState.minRemainingHP = (parsed.minRemainingHP !== undefined && parsed.minRemainingHP !== null) ? String(parsed.minRemainingHP) : '0';
                    probaState.rows           = parsed.rows;
                    return;
                }
            }
        } catch (e) {}
        probaState.hp             = '';
        probaState.minRemainingHP = '0';
        probaState.rows           = [];
    }

    function saveProbaState() {
        try {
            var storage = window.localStorage || localStorage;
            storage.setItem(PROBA_STORAGE_KEY, JSON.stringify(probaState));
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
            '    <div class="proba-hp-field">',
            '      <label for="proba-hp-input">Initial HP / PV Actuels:</label>',
            '      <input type="number" id="proba-hp-input" min="1" placeholder="e.g. 241" />',
            '    </div>',
            '    <div class="proba-hp-field">',
            '      <label for="proba-input-min-remaining-hp">Min Left HP / PV Restants Min:</label>',
            '      <input type="number" id="proba-input-min-remaining-hp" min="0" placeholder="0" value="0" />',
            '    </div>',
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
        var minRemInput = document.getElementById('proba-input-min-remaining-hp');
        if (minRemInput) minRemInput.value = probaState.minRemainingHP || '0';
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
        btn.disabled = false;
    }

    /**
     * Formats integer denominator for 1/x probability display with space grouping
     * when x exceeds 3 digits (e.g. 10 000, 1 000 000).
     */
    function formatDenominator(val) {
        if (val === null || val === undefined) return '';
        var num = Math.round(Number(val));
        if (isNaN(num)) return String(val);
        if (!isFinite(num)) return '\u221E';
        return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
            resultArea.innerHTML = '<span class="proba-result-placeholder">Enter a valid Initial HP</span>';
            return;
        }

        var minRemEl = document.getElementById('proba-input-min-remaining-hp');
        var minRem = parseInt(minRemEl ? minRemEl.value : '0', 10);
        if (isNaN(minRem) || minRem < 0) minRem = 0;

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
            var res = PC.computeMultiRollThresholdProba(validRolls, hp, minRem);
            var mainLine, fracLine;

            function formatPct(p) {
                if (p <= 0) return '0%';
                if (p >= 100) return '100%';
                if (p < 0.01) return p.toFixed(4) + '%';
                var s = p.toFixed(2);
                return s + '%';
            }

            if (minRem === 0) {
                // Standard KO mode
                var prob = res.killProba;
                var rounded = formatPct(prob);

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
                    mainLine = rounded + ' chance to KO';
                    var n = Math.round(100 / prob);
                    fracLine = '~1/' + formatDenominator(n) + ' chance de KO';
                }
            } else {
                // Threshold mode: leave at least minRem HP vs drop below minRem HP
                var surv = res.surviveProba;
                var drop = res.dropBelowProba;
                var roundedSurv = formatPct(surv);
                var roundedDrop = formatPct(drop);

                if (surv >= 100) {
                    resultArea.classList.add('proba-result--ready');
                    mainLine = '100% chance to leave at least ' + minRem + ' HP';
                    fracLine = 'Guaranteed survival (1/1) \u2022 0% chance to drop below ' + minRem + ' HP';
                } else if (surv <= 0) {
                    resultArea.classList.add('proba-result--zero');
                    mainLine = '0% chance to leave at least ' + minRem + ' HP';
                    fracLine = 'Impossible to survive (0%) \u2022 100% chance to drop below ' + minRem + ' HP';
                } else {
                    resultArea.classList.add('proba-result--ready');
                    mainLine = roundedSurv + ' chance to leave at least ' + minRem + ' HP (' + roundedDrop + ' to drop below)';
                    var nDrop = Math.max(1, Math.round(100 / drop));
                    var nSurv = Math.max(1, Math.round(100 / surv));
                    fracLine = '~1/' + formatDenominator(nDrop) + ' chance to drop below ' + minRem + ' HP' + (nSurv > 1 ? ' (\u22481/' + formatDenominator(nSurv) + ' to survive)' : '');
                }
            }

            resultArea.innerHTML =
                '<span class="proba-result-main">' + mainLine + '</span>' +
                '<span class="proba-result-frac">' + fracLine + '</span>';
        } catch (err) {
            resultArea.innerHTML = '<span class="proba-result-placeholder">Error: ' + err.message + '</span>';
        }
    }

    /* =========================================================================
     * BATCH INSERTION & DYNAMIC ROW GENERATION HELPER
     * ====================================================================== */
    /**
     * Batch inserts an array of move/hit objects into the Probability Calculator.
     * hitsArray: [ { name: "Move (Hit 1)", rolls: [number] | string }, ... ]
     *
     * Rules:
     *   - Fills existing empty rows first.
     *   - If all existing rows are occupied or more hits are needed, dynamically appends new rows.
     *   - No 7-move limit (dynamically expands for Population Bomb 10-hit, multi-turn sequences, etc.).
     *   - Syncs HP, modal DOM elements, and triggers compound KO recalculation.
     */
    function addMultipleMoveRows(hitsArray) {
        if (!hitsArray || !hitsArray.length) return 0;

        loadProbaState();

        // Fill HP from P1 if empty
        if (!probaState.hp || probaState.hp === '0') {
            var p1HP = getP1CurrentHP();
            if (p1HP > 0) probaState.hp = String(p1HP);
        }

        var addedCount = 0;
        hitsArray.forEach(function (hit) {
            var rollsStr = '';
            if (Array.isArray(hit.rolls)) {
                rollsStr = hit.rolls.join(', ');
            } else if (hit.rolls !== undefined && hit.rolls !== null) {
                rollsStr = String(hit.rolls);
            }
            if (!rollsStr) return;

            // 1. Look for the first empty row
            var emptyIdx = -1;
            for (var i = 0; i < probaState.rows.length; i++) {
                var r = probaState.rows[i];
                if (!r || !r.rolls || !r.rolls.trim()) {
                    emptyIdx = i;
                    break;
                }
            }

            if (emptyIdx !== -1) {
                probaState.rows[emptyIdx] = {
                    name: hit.name || '',
                    rolls: rollsStr
                };
            } else {
                probaState.rows.push({
                    name: hit.name || '',
                    rolls: rollsStr
                });
            }
            addedCount++;
        });

        if (addedCount > 0) {
            saveProbaState();
            renderHP();
            renderModalRows();
            updateProbaResult();
        }

        return addedCount;
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
        var side = -1;
        var mi = -1;
        for (var s = 0; s < resultLocations.length; s++) {
            for (var m = 0; m < resultLocations[s].length; m++) {
                if (resultLocations[s][m].move === '#' + id) {
                    side = s;
                    mi = m;
                    result = window.damageResults[s] ? window.damageResults[s][m] : null;
                    var label = document.querySelector('label[for="' + id + '"]');
                    moveName = label ? label.textContent.trim() : ('Move ' + (m + 1));
                    break;
                }
            }
            if (result) break;
        }

        if (!result) return;

        var panelSelector = (side === 0) ? '#p1' : '#p2';
        var moveContainer = window.$ ? window.$(panelSelector).find('.move' + (mi + 1)) : null;

        var canonicalMoveName = (result.move && (result.move.name || result.move.originalName)) || moveName;
        var isPopBomb = (canonicalMoveName === 'Population Bomb');

        // Hit Count Detection:
        // Read active hit count from DOM select element .move-hits:visible associated with the active move
        var isMulti = false;
        var hitsSelect = null;
        if (moveContainer && moveContainer.length) {
            var visibleHits = moveContainer.find(".move-hits:visible, select.move-hits:visible");
            if (visibleHits.length && visibleHits.is(':visible') && !visibleHits.hasClass('hide')) {
                isMulti = true;
                hitsSelect = visibleHits;
            }
        }

        // Check metadata from calculation result (hits on result, rawDesc, or move)
        var resHits = (result.hits !== undefined && result.hits !== null && !isNaN(result.hits)) ? Number(result.hits) : 0;
        var rawDescHits = (result.rawDesc && result.rawDesc.hits !== undefined && !isNaN(result.rawDesc.hits)) ? Number(result.rawDesc.hits) : 0;
        var moveHits = (result.move && result.move.hits !== undefined && !isNaN(result.move.hits)) ? Number(result.move.hits) : 0;
        var metaHits = resHits || rawDescHits || moveHits;

        if (metaHits > 1) isMulti = true;
        if (Array.isArray(result.damage) && Array.isArray(result.damage[0])) isMulti = true;
        if (canonicalMoveName === 'Triple Axel' || canonicalMoveName === 'Triple Kick' || isPopBomb) isMulti = true;
        if (window.calc && window.calc.MOVES) {
            var genNum = typeof window.gen !== 'undefined' ? window.gen : 9;
            var genMoves = window.calc.MOVES[genNum];
            if (genMoves && genMoves[canonicalMoveName] && genMoves[canonicalMoveName].multihit) isMulti = true;
        }
        if (window.moves && window.moves[canonicalMoveName] && window.moves[canonicalMoveName].multihit) isMulti = true;

        var hitCount = 1;
        if (isMulti) {
            if (hitsSelect && hitsSelect.length) {
                var parsedVal = parseInt(hitsSelect.val(), 10);
                if (!isNaN(parsedVal) && parsedVal >= 1) {
                    hitCount = parsedVal;
                }
            } else if (metaHits >= 1) {
                hitCount = metaHits;
            } else if (isPopBomb) {
                hitCount = 10;
            }

            // For Population Bomb: ensure hitCount correctly reads active value from .move-hits:visible
            // or result.hits up to 10.
            if (isPopBomb) {
                if (hitsSelect && hitsSelect.length) {
                    var parsedVal = parseInt(hitsSelect.val(), 10);
                    if (!isNaN(parsedVal) && parsedVal >= 1) {
                        hitCount = parsedVal;
                    } else if (metaHits >= 1) {
                        hitCount = metaHits;
                    } else {
                        hitCount = 10;
                    }
                } else if (metaHits >= 1) {
                    hitCount = metaHits;
                } else {
                    hitCount = 10;
                }
                hitCount = Math.min(10, Math.max(1, hitCount));
            }
        }
        if (isNaN(hitCount) || hitCount < 1) hitCount = 1;

        var isTripleAxel = (canonicalMoveName === 'Triple Axel');
        var isTripleKick = (canonicalMoveName === 'Triple Kick');
        var isEscalating = isTripleAxel || isTripleKick;

        var hitsArray = [];

        if (isEscalating) {
            // Escalating multi-hit: Triple Axel (20, 40, 60 BP), Triple Kick (10, 20, 30 BP)
            var escalatingBPs = isTripleAxel ? [20, 40, 60] : [10, 20, 30];
            var H = Math.min(escalatingBPs.length, Math.max(1, hitCount));

            if (Array.isArray(result.damage) && Array.isArray(result.damage[0])) {
                // calcResult.damage is pre-split into arrays for each hit
                for (var i = 0; i < H; i++) {
                    var hitRolls = result.damage[i] || result.damage[0];
                    hitsArray.push({
                        name: canonicalMoveName + ' (Hit ' + (i + 1) + ')',
                        rolls: hitRolls
                    });
                }
            } else {
                // calcResult.damage is not pre-split. Scale rolls proportional to each hit's base power
                var baseRolls = Array.isArray(result.damage) ? result.damage : [result.damage];
                var usedBP = (result.rawDesc && result.rawDesc.moveBP) ||
                             (result.desc && typeof result.desc === 'object' && result.desc.moveBP) ||
                             null;
                if (!usedBP) {
                    usedBP = (H === 1 ? 20 : (H === 2 ? 30 : 40));
                }
                for (var i = 0; i < H; i++) {
                    var hitBP = escalatingBPs[i];
                    var ratio = hitBP / usedBP;
                    var scaledRolls = baseRolls.map(function (d) {
                        return Math.max(1, Math.round(d * ratio));
                    });
                    hitsArray.push({
                        name: canonicalMoveName + ' (Hit ' + (i + 1) + ')',
                        rolls: scaledRolls
                    });
                }
            }
        } else if (Array.isArray(result.damage) && Array.isArray(result.damage[0])) {
            // Pre-split array of arrays (e.g. Parental Bond)
            var count = Math.min(result.damage.length, hitCount > 1 ? hitCount : result.damage.length);
            for (var i = 0; i < count; i++) {
                hitsArray.push({
                    name: canonicalMoveName + (count > 1 ? ' (Hit ' + (i + 1) + ')' : ''),
                    rolls: result.damage[i]
                });
            }
        } else if (hitCount > 1 || isPopBomb) {
            // Regular multi-hit with constant base power (Rock Blast, Bullet Seed, Population Bomb, Dual Wingbeat, etc.)
            var singleHitRolls = Array.isArray(result.damage) ? result.damage.slice() : [result.damage];
            var count = Math.max(1, hitCount);
            for (var i = 0; i < count; i++) {
                hitsArray.push({
                    name: canonicalMoveName + ' (Hit ' + (i + 1) + ')',
                    rolls: singleHitRolls.slice()
                });
            }
        } else {
            // Standard single-hit move
            var singleRolls = Array.isArray(result.damage) ? result.damage.slice() : [result.damage];
            hitsArray.push({
                name: canonicalMoveName,
                rolls: singleRolls
            });
        }

        if (!hitsArray.length) return;

        var addedCount = addMultipleMoveRows(hitsArray);

        if (addedCount > 0) {
            var btn = document.getElementById('btn-add-to-proba');
            if (btn) {
                if (btn._flashTimeout) clearTimeout(btn._flashTimeout);
                btn.classList.add('added-flash', 'proba-added');
                btn.textContent = addedCount > 1 ? ('\u2713 Added (' + addedCount + ' hits)') : '\u2713 Added';
                btn._flashTimeout = setTimeout(function () {
                    btn.classList.remove('added-flash', 'proba-added');
                    btn.textContent = '[+]';
                    btn._flashTimeout = null;
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

    // Expose UI helpers and state for external integration and testing
    window.ProbabilityCalcUI = {
        probaState: probaState,
        addMultipleMoveRows: addMultipleMoveRows,
        handleAddToProba: handleAddToProba,
        openModal: openModal,
        closeModal: closeModal,
        renderModalRows: renderModalRows,
        updateProbaResult: updateProbaResult,
        formatDenominator: formatDenominator
    };
    if (PC) {
        PC.addMultipleMoveRows = addMultipleMoveRows;
        PC.formatDenominator = formatDenominator;
    }

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

        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeModal();
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('proba-open')) {
                closeModal();
            }
        });

        // HP inputs
        var hpInput = document.getElementById('proba-hp-input');
        if (hpInput) {
            hpInput.addEventListener('input', function () {
                probaState.hp = hpInput.value;
                saveProbaState();
                updateProbaResult();
            });
        }

        var minRemInput = document.getElementById('proba-input-min-remaining-hp');
        if (minRemInput) {
            minRemInput.addEventListener('input', function () {
                probaState.minRemainingHP = minRemInput.value;
                saveProbaState();
                updateProbaResult();
            });
        }

        // Add row button
        var addRowBtn = document.getElementById('proba-add-row-btn');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', function () {
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
