/**
 * quick_apply_damage.js
 * Interactive Damage Roll Quick-Apply (+/- min & max rolls) for Null-Damage-Calc.
 *
 * Allows directly subtracting or adding the lowest and highest damage rolls
 * to the defending Pokémon's Current HP with a Subtraction/Addition mode toggle.
 *
 * Fully integrated with Gear Settings Menu (nullCalcSettings.showQuickApplyDamage).
 */

(function () {
    'use strict';

    var SETTINGS_KEY = 'nullCalcSettings';
    var _mode = 'subtraction'; // 'subtraction' | 'addition'

    /* =========================================================================
     * Settings Persistence
     * ====================================================================== */
    function getSetting() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                var s = JSON.parse(raw);
                if (s && s.showQuickApplyDamage !== undefined) {
                    return s.showQuickApplyDamage !== false;
                }
            }
        } catch (e) {}
        return true; // Default: Enabled
    }

    function saveSetting(val) {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            var s = raw ? JSON.parse(raw) : {};
            s.showQuickApplyDamage = !!val;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        } catch (e) {}
    }

    function applyVisibility(visible) {
        document.documentElement.classList.toggle('hide-feature-quick-apply-damage', !visible);
        var row = document.getElementById('quick-apply-damage-row');
        if (row) {
            row.style.display = visible ? '' : 'none';
        }
        var cb = document.getElementById('setting-toggle-quick-apply-damage');
        if (cb && cb.checked !== !!visible) {
            cb.checked = !!visible;
        }
    }

    /* =========================================================================
     * Active Calculation & Damage Rolls Resolution
     * ====================================================================== */
    function extractRolls() {
        var checked = document.querySelector('.result-move:checked');
        var id = checked ? checked.id : '';
        var isLeftAttacker = true;

        if (id.indexOf('resultMoveR') === 0) {
            isLeftAttacker = false;
        } else if (id.indexOf('resultMoveL') === 0) {
            isLeftAttacker = true;
        } else {
            // If neither is explicitly checked, look for checked on P1 first
            var p1Checked = document.querySelector('#p1 input.result-move:checked, input[id^="resultMoveL"]:checked');
            var p2Checked = document.querySelector('#p2 input.result-move:checked, input[id^="resultMoveR"]:checked');
            if (p2Checked && !p1Checked) isLeftAttacker = false;
        }

        var side = isLeftAttacker ? 0 : 1;
        var result = null;

        if (id && window.resultLocations && window.damageResults && window.damageResults[side]) {
            for (var mi = 0; mi < window.resultLocations[side].length; mi++) {
                if (window.resultLocations[side][mi].move === '#' + id) {
                    result = window.damageResults[side][mi];
                    break;
                }
            }
        }
        if (!result && checked && window.findDamageResult) {
            result = window.findDamageResult(window.jQuery ? window.jQuery(checked) : checked);
        }

        // 1. Try from damageResults and ProbabilityCalc.getFullMoveRolls
        if (result) {
            if (window.ProbabilityCalc && typeof window.ProbabilityCalc.getFullMoveRolls === 'function') {
                var r = window.ProbabilityCalc.getFullMoveRolls(result);
                if (r && r.length > 0) {
                    return { rolls: r, isLeftAttacker: isLeftAttacker, result: result };
                }
            } else if (result.damage !== undefined) {
                var moveName = (result.move && (result.move.name || result.move.originalName)) ||
                               (result.rawDesc && result.rawDesc.moveName) || '';
                var isTripleAxel = (moveName === 'Triple Axel');
                var isTripleKick = (moveName === 'Triple Kick');
                if ((isTripleAxel || isTripleKick) && Array.isArray(result.damage)) {
                    var escalatingBPs = isTripleAxel ? [20, 40, 60] : [10, 20, 30];
                    var H = Math.min(escalatingBPs.length, Math.max(1, result.hits || (result.rawDesc && result.rawDesc.hits) || 3));
                    var baseRolls = Array.isArray(result.damage[0]) ? result.damage[0] : result.damage;
                    var usedBP = (result.rawDesc && result.rawDesc.moveBP) || (H === 1 ? 20 : (H === 2 ? 30 : 40));
                    var hitArrays = [];
                    for (var i = 0; i < H; i++) {
                        var ratio = escalatingBPs[i] / usedBP;
                        hitArrays.push(baseRolls.map(function (d) { return Math.max(1, Math.round(d * ratio)); }));
                    }
                    var combined = hitArrays.reduce(function (acc, curr) {
                        if (!acc.length) return curr;
                        var resArr = [];
                        for (var a = 0; a < acc.length; a++) {
                            for (var b = 0; b < curr.length; b++) resArr.push(acc[a] + curr[b]);
                        }
                        return resArr;
                    }, []);
                    return { rolls: combined, isLeftAttacker: isLeftAttacker, result: result };
                }
                if (typeof result.damage === 'number') {
                    return { rolls: [result.damage], isLeftAttacker: isLeftAttacker, result: result };
                } else if (Array.isArray(result.damage) && result.damage.length > 0) {
                    if (typeof result.damage[0] === 'number') {
                        return { rolls: result.damage.slice(), isLeftAttacker: isLeftAttacker, result: result };
                    }
                }
            }
        }

        // 2. Fallback: Parse from #damageValues text: "Possible damage amounts: (26, 26, ...)"
        var damageValuesEl = document.getElementById('damageValues');
        if (damageValuesEl) {
            var text = damageValuesEl.textContent || '';
            var match = text.match(/\(([^)]+)\)/);
            if (match && match[1]) {
                var rawList = match[1];
                var nums = rawList.match(/\b\d+\b/g);
                if (nums && nums.length > 0) {
                    var parsed = nums.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return !isNaN(n); });
                    if (parsed.length > 0) {
                        return { rolls: parsed, isLeftAttacker: isLeftAttacker, result: result };
                    }
                }
            }
        }

        return { rolls: [], isLeftAttacker: isLeftAttacker, result: result };
    }

    function getDefenderInfo(isLeftAttacker) {
        var defenderPanelId = isLeftAttacker ? 'p2' : 'p1';
        var defenderInput = document.querySelector('#' + defenderPanelId + ' .current-hp') ||
                            document.getElementById(isLeftAttacker ? 'currentHpR1' : 'currentHpL1');
        var maxHpSpan = document.querySelector('#' + defenderPanelId + ' .max-hp');

        var speciesEl = document.querySelector('#' + defenderPanelId + ' .poke-info .species') ||
                        document.querySelector('#' + defenderPanelId + ' .set-selector');
        var speciesName = (speciesEl && (speciesEl.value || speciesEl.textContent)) ? (speciesEl.value || speciesEl.textContent).trim() : (isLeftAttacker ? 'P2' : 'P1');
        if (speciesName.indexOf('(') !== -1) {
            speciesName = speciesName.split('(')[0].trim();
        }

        return {
            side: isLeftAttacker ? 'P2' : 'P1',
            species: speciesName,
            input: defenderInput,
            maxSpan: maxHpSpan
        };
    }

    /* =========================================================================
     * UI Update
     * ====================================================================== */
    function updateUI() {
        var row = document.getElementById('quick-apply-damage-row');
        if (!row) return;

        var modeBtn = document.getElementById('quick-apply-mode-btn');
        var minBtn = document.getElementById('quick-apply-min-btn');
        var maxBtn = document.getElementById('quick-apply-max-btn');
        var targetBadge = document.getElementById('quick-apply-target-badge');

        var data = extractRolls();
        var rolls = data.rolls;
        var isLeftAttacker = data.isLeftAttacker;
        var def = getDefenderInfo(isLeftAttacker);

        var isAddition = (_mode === 'addition');
        var sign = isAddition ? '[+]' : '[-]';
        var modeClass = isAddition ? 'mode-addition' : 'mode-subtraction';
        var oppModeClass = isAddition ? 'mode-subtraction' : 'mode-addition';

        // Mode button
        if (modeBtn) {
            modeBtn.classList.remove(oppModeClass);
            modeBtn.classList.add(modeClass);
            var modeText = modeBtn.querySelector('.mode-text');
            if (modeText) {
                modeText.textContent = isAddition ? '[ Addition ]' : '[ Subtraction ]';
            }
            modeBtn.title = 'Current: ' + (isAddition ? 'Addition' : 'Subtraction') + '. Click to switch to ' + (isAddition ? 'Subtraction' : 'Addition');
        }

        var hasValidRolls = rolls && rolls.length > 0;
        var sortedRolls = hasValidRolls ? rolls.slice().sort(function (a, b) { return a - b; }) : [];
        var minVal = sortedRolls.length > 0 ? sortedRolls[0] : null;
        var maxVal = sortedRolls.length > 0 ? sortedRolls[sortedRolls.length - 1] : null;

        // Min roll button
        if (minBtn) {
            minBtn.classList.remove(oppModeClass);
            minBtn.classList.add(modeClass);
            var minSignEl = minBtn.querySelector('.roll-sign');
            var minValEl = minBtn.querySelector('.roll-val');
            if (minSignEl) minSignEl.textContent = sign;
            if (minValEl) minValEl.textContent = (minVal !== null ? minVal : '--');

            if (minVal !== null && minVal >= 0) {
                minBtn.removeAttribute('disabled');
                minBtn.title = (isAddition ? 'Add ' : 'Subtract ') + minVal + ' HP ' + (isAddition ? 'to ' : 'from ') + def.side + ' (' + def.species + ')';
                minBtn.dataset.roll = minVal;
            } else {
                minBtn.setAttribute('disabled', 'disabled');
                minBtn.title = 'No active damage roll to apply';
                delete minBtn.dataset.roll;
            }
        }

        // Max roll button
        if (maxBtn) {
            maxBtn.classList.remove(oppModeClass);
            maxBtn.classList.add(modeClass);
            var maxSignEl = maxBtn.querySelector('.roll-sign');
            var maxValEl = maxBtn.querySelector('.roll-val');
            if (maxSignEl) maxSignEl.textContent = sign;
            if (maxValEl) maxValEl.textContent = (maxVal !== null ? maxVal : '--');

            if (maxVal !== null && maxVal >= 0) {
                maxBtn.removeAttribute('disabled');
                maxBtn.title = (isAddition ? 'Add ' : 'Subtract ') + maxVal + ' HP ' + (isAddition ? 'to ' : 'from ') + def.side + ' (' + def.species + ')';
                maxBtn.dataset.roll = maxVal;
            } else {
                maxBtn.setAttribute('disabled', 'disabled');
                maxBtn.title = 'No active damage roll to apply';
                delete maxBtn.dataset.roll;
            }
        }

        // Target badge
        if (targetBadge) {
            targetBadge.textContent = '\u2192 ' + def.side + ' (' + def.species + ') HP';
            targetBadge.title = 'Applying rolls will modify ' + def.side + ' (' + def.species + ') Current HP';
        }
    }

    /* =========================================================================
     * Apply Damage Roll to Defender
     * ====================================================================== */
    function applyRoll(damageValue, btnEl) {
        if (damageValue === undefined || damageValue === null || isNaN(damageValue)) return;
        var data = extractRolls();
        var def = getDefenderInfo(data.isLeftAttacker);
        if (!def.input) return;

        var curHP = parseInt(def.input.value, 10);
        if (isNaN(curHP)) curHP = 0;

        var maxHP = parseInt(def.maxSpan ? def.maxSpan.textContent : '0', 10);
        if (isNaN(maxHP) || maxHP <= 0) maxHP = curHP || 100;

        var newHP;
        if (_mode === 'addition') {
            newHP = Math.min(maxHP, curHP + damageValue);
        } else {
            newHP = Math.max(0, curHP - damageValue);
        }

        // Apply new HP and dispatch events for health bar, KO descriptions, and calc updates
        if (window.jQuery) {
            window.jQuery(def.input).val(newHP).trigger('input').trigger('change');
        } else {
            def.input.value = newHP;
            def.input.dispatchEvent(new Event('input', { bubbles: true }));
            def.input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Snappy flash feedback
        if (btnEl) {
            btnEl.classList.add('quick-apply-flash');
            setTimeout(function () {
                btnEl.classList.remove('quick-apply-flash');
            }, 180);
        }
    }

    /* =========================================================================
     * DOM Injection
     * ====================================================================== */
    function injectUI() {
        if (document.getElementById('quick-apply-damage-row')) return;

        var damageValuesEl = document.getElementById('damageValues');
        if (!damageValuesEl) return;

        var smallTextDiv = damageValuesEl.closest('.small-text') || damageValuesEl.parentNode;
        if (!smallTextDiv) return;

        var row = document.createElement('div');
        row.id = 'quick-apply-damage-row';
        row.className = 'quick-apply-damage-row';
        row.setAttribute('aria-label', 'Quick apply damage rolls to defender');

        row.innerHTML =
            '<div class="quick-apply-wrap">' +
              '<button type="button" id="quick-apply-mode-btn" class="quick-apply-btn quick-apply-mode-btn mode-subtraction" title="Toggle between Subtraction and Addition mode">' +
                '<span class="mode-text">[ Subtraction ]</span>' +
              '</button>' +
              '<span class="quick-apply-sep">|</span>' +
              '<button type="button" id="quick-apply-min-btn" class="quick-apply-btn quick-apply-roll-btn mode-subtraction" title="Subtract min damage from defender HP">' +
                '<span class="roll-sign">[-]</span>' +
                '<span class="roll-val">--</span>' +
                '<span class="roll-desc">(min)</span>' +
              '</button>' +
              '<button type="button" id="quick-apply-max-btn" class="quick-apply-btn quick-apply-roll-btn mode-subtraction" title="Subtract max damage from defender HP">' +
                '<span class="roll-sign">[-]</span>' +
                '<span class="roll-val">--</span>' +
                '<span class="roll-desc">(max)</span>' +
              '</button>' +
              '<span id="quick-apply-target-badge" class="quick-apply-target-badge" title="Target Pok\u00e9mon receiving HP change">\u2192 Defender HP</span>' +
            '</div>';

        // Insert directly after the .small-text container
        if (smallTextDiv.nextSibling) {
            smallTextDiv.parentNode.insertBefore(row, smallTextDiv.nextSibling);
        } else {
            smallTextDiv.parentNode.appendChild(row);
        }

        // Wire up buttons
        var modeBtn = document.getElementById('quick-apply-mode-btn');
        if (modeBtn) {
            modeBtn.addEventListener('click', function () {
                _mode = (_mode === 'subtraction' ? 'addition' : 'subtraction');
                updateUI();
            });
        }

        var minBtn = document.getElementById('quick-apply-min-btn');
        if (minBtn) {
            minBtn.addEventListener('click', function () {
                if (minBtn.dataset.roll !== undefined) {
                    applyRoll(parseInt(minBtn.dataset.roll, 10), minBtn);
                }
            });
        }

        var maxBtn = document.getElementById('quick-apply-max-btn');
        if (maxBtn) {
            maxBtn.addEventListener('click', function () {
                if (maxBtn.dataset.roll !== undefined) {
                    applyRoll(parseInt(maxBtn.dataset.roll, 10), maxBtn);
                }
            });
        }

        // Apply initial visibility setting
        applyVisibility(getSetting());

        // Perform initial UI sync
        updateUI();

        // Listen for move selection changes
        if (window.jQuery) {
            window.jQuery(document).on('change', '.result-move', function () {
                setTimeout(updateUI, 0);
            });
        } else {
            document.addEventListener('change', function (e) {
                if (e.target && e.target.classList && e.target.classList.contains('result-move')) {
                    setTimeout(updateUI, 0);
                }
            });
        }

        // Observer for changes in #damageValues
        var mo = new MutationObserver(function () {
            updateUI();
        });
        mo.observe(damageValuesEl, { childList: true, characterData: true, subtree: true });

        // Also wrap performCalculations if available
        var origPerform = window.performCalculations;
        if (typeof origPerform === 'function') {
            window.performCalculations = function () {
                var ret = origPerform.apply(this, arguments);
                setTimeout(updateUI, 0);
                return ret;
            };
        }
    }

    /* =========================================================================
     * Gear Menu Settings Integration
     * ====================================================================== */
    function injectSettingsToggle() {
        var existing = document.getElementById('setting-toggle-quick-apply-damage');
        if (existing) {
            existing.checked = getSetting();
            existing.addEventListener('change', function () {
                saveSetting(existing.checked);
                applyVisibility(existing.checked);
            });
            return;
        }

        var panel = document.getElementById('app-menu-panel');
        if (!panel) return;

        // Find the Null Features section
        var headers = panel.querySelectorAll('.app-menu-section-header');
        var insertBefore = null;
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].textContent.indexOf('Null Features') !== -1) {
                var sibling = headers[i].nextElementSibling;
                while (sibling && !sibling.classList.contains('app-menu-section-header')) {
                    sibling = sibling.nextElementSibling;
                }
                insertBefore = sibling;
                break;
            }
        }

        var label = document.createElement('label');
        label.className = 'app-menu-row app-menu-toggle-row';
        label.innerHTML = [
            '<span class="app-menu-row-label">Quick-Apply Damage Rolls (+/-)</span>',
            '<span class="app-menu-toggle">',
            '  <input type="checkbox" id="setting-toggle-quick-apply-damage" class="app-menu-toggle-input" role="switch" checked />',
            '  <span class="app-menu-toggle-track" aria-hidden="true"></span>',
            '</span>'
        ].join('');

        if (insertBefore && insertBefore.parentNode === panel) {
            panel.insertBefore(label, insertBefore);
        } else {
            panel.appendChild(label);
        }

        var cb = document.getElementById('setting-toggle-quick-apply-damage');
        if (cb) {
            cb.checked = getSetting();
            cb.addEventListener('change', function () {
                saveSetting(cb.checked);
                applyVisibility(cb.checked);
            });
        }
    }

    /* =========================================================================
     * Initialization
     * ====================================================================== */
    function init() {
        injectUI();
        injectSettingsToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.QuickApplyDamage = {
        init: init,
        update: updateUI,
        applyRoll: applyRoll,
        setMode: function (mode) {
            if (mode === 'addition' || mode === 'subtraction') {
                _mode = mode;
                updateUI();
            }
        },
        getMode: function () { return _mode; },
        getSetting: getSetting,
        setSetting: function (val) {
            saveSetting(val);
            applyVisibility(val);
        }
    };

})();
