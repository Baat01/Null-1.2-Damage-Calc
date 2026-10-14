/**
 * move_search.js — Move Search / Learnset Filter
 *
 * Highlights Pokémon in the player's box (box-poke-list, box-poke-list2, team-poke-list)
 * based on their relationship to a searched move.
 *
 * Border priority (highest first):
 *   1. KNOWN   – move is in the active 4-slot moveset               → green  (#28a745)
 *   2. TUTOR   – learnable via Tutor (T flag)                       → yellow (#ffc107)
 *   3. TM      – learnable via TM/Machine (M flag)                  → orange (#fd7e14)
 *   4. SCALE   – learnable via level-up at level ≤ current level    → red    (#dc3545)
 *   5. null    – cannot learn / future level                        → no border (fallback to speed border)
 *
 * Data source: ./learnsets.js  (exports.BattleLearnsets – lazy-loaded asynchronously)
 * Move names in learnsets are lowercase, no spaces  (e.g. "grassknot").
 * Showdown move display names like "Grass Knot" are normalised for lookup.
 */

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────

    /** @type {Object|null}  BattleLearnsets map once loaded */
    var LEARNSETS = null;

    /** @type {boolean}  true while the fetch is in-flight */
    var _loading = false;

    /** @type {Function[]}  callbacks queued while loading */
    var _onLoadCallbacks = [];

    /** @type {string}  currently active (display) move name, or '' */
    var _activeMove = '';

    /** @type {string|null}  id of the active category filter, or null */
    var _activeCategoryId = null;

    /** @type {string[]}  all move display-names extracted from learnsets (for autocomplete) */
    var _allMoveNames = [];

    // ── Learnset Loader ───────────────────────────────────────────────────────

    /**
     * Fetch learnsets.js once, parse out BattleLearnsets, then notify subscribers.
     * @param {Function} [cb]  called with no args once ready
     */
    function ensureLearnsets(cb) {
        if (LEARNSETS) { if (cb) cb(); return; }
        if (cb) _onLoadCallbacks.push(cb);
        if (_loading) return;
        _loading = true;

        var xhr = new XMLHttpRequest();
        xhr.open('GET', './learnsets.js', true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status === 200 || xhr.status === 0) {
                try {
                    // The file uses `exports.BattleLearnsets = {...}`.
                    // Evaluate in a sandbox with a local `exports` so we don't
                    // overwrite the calc-engine's global `exports` shim.
                    var localExports = {};
                    // eslint-disable-next-line no-new-func
                    (new Function('exports', xhr.responseText))(localExports);
                    LEARNSETS = localExports.BattleLearnsets || {};
                } catch (e) {
                    console.error('[MoveSearch] Failed to parse learnsets.js:', e);
                    LEARNSETS = {};
                }
                _buildMoveNameList();
            } else {
                console.warn('[MoveSearch] Could not load learnsets.js (status ' + xhr.status + ')');
                LEARNSETS = {};
            }
            _loading = false;
            var cbs = _onLoadCallbacks.splice(0);
            for (var i = 0; i < cbs.length; i++) cbs[i]();
        };
        xhr.send();
    }

    // ── Move Name Normalisation ───────────────────────────────────────────────

    /**
     * Convert a Showdown display move name → learnset lookup key.
     * "Grass Knot" → "grassknot", "Hidden Power Fire" → "hiddenpowerfire"
     * @param {string} name
     * @returns {string}
     */
    function normaliseMoveKey(name) {
        return (name || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    /**
     * Build a deduplicated, display-ready list of move names from learnset data.
     * Prefers canonical display names found in the DOM's move-selector <option> elements.
     */
    function _buildMoveNameList() {
        if (!LEARNSETS) return;

        // Collect all move keys present in learnsets
        var seenKeys = Object.create(null);
        for (var species in LEARNSETS) {
            if (!Object.prototype.hasOwnProperty.call(LEARNSETS, species)) continue;
            var ls = LEARNSETS[species].learnset;
            if (!ls) continue;
            for (var moveKey in ls) {
                if (Object.prototype.hasOwnProperty.call(ls, moveKey)) seenKeys[moveKey] = true;
            }
        }

        // Prefer display names from DOM move-selector options
        var nameMap = Object.create(null); // learnsetKey → displayName
        var domNames = _collectDomMoveNames();
        for (var i = 0; i < domNames.length; i++) {
            var k = normaliseMoveKey(domNames[i]);
            if (k) nameMap[k] = domNames[i];
        }

        // Fill remaining with title-cased key
        for (var moveKey2 in seenKeys) {
            if (!nameMap[moveKey2]) {
                nameMap[moveKey2] = moveKey2.charAt(0).toUpperCase() + moveKey2.slice(1);
            }
        }

        _allMoveNames = [];
        for (var key in nameMap) {
            if (Object.prototype.hasOwnProperty.call(nameMap, key)) {
                _allMoveNames.push(nameMap[key]);
            }
        }
        _allMoveNames.sort();
    }

    /** Collect all move display names from existing <option> elements in .move-selector selects. */
    function _collectDomMoveNames() {
        var opts = document.querySelectorAll('.move-selector option');
        var seen = Object.create(null);
        var result = [];
        for (var i = 0; i < opts.length; i++) {
            var txt = (opts[i].textContent || opts[i].innerText || '').trim();
            if (txt && txt !== '(No Move)' && txt !== '-' && !seen[txt]) {
                seen[txt] = true;
                result.push(txt);
            }
        }
        return result;
    }

    // ── Species Name Normalisation ────────────────────────────────────────────

    var _SPECIES_ALIAS = {
        'nidoran-m':  'nidoranm',
        'nidoran-f':  'nidoranf',
        'nidoran♂':   'nidoranm',
        'nidoran♀':   'nidoranf',
        'farfetch\'d': 'farfetchd',
        'mr. mime':   'mrmime',
        'mr.mime':    'mrmime',
        'mime jr.':   'mimejr',
        'mimejr.':    'mimejr',
        'porygon-z':  'porygonz',
        'ho-oh':      'hooh',
        'jangmo-o':   'jangmoo',
        'hakamo-o':   'hakamoo',
        'kommo-o':    'kommoo',
        'tapu koko':  'tapukoko',
        'tapu lele':  'tapulele',
        'tapu bulu':  'tapubulu',
        'tapu fini':  'tapufini',
        'type: null': 'typenull',
        'type:null':  'typenull',
        'flabebe':    'flabebe'
    };

    /**
     * Resolve a Showdown/SETDEX species name to the BattleLearnsets key.
     * @param {string} speciesName
     * @returns {string}  learnset key, or ''
     */
    function resolveLearnsetKey(speciesName) {
        if (!LEARNSETS || !speciesName) return '';
        var raw = speciesName.trim();

        // 1. Alias table (handles special characters / multi-word names)
        var aliasKey = _SPECIES_ALIAS[raw.toLowerCase()];
        if (aliasKey && LEARNSETS[aliasKey]) return aliasKey;

        // 2. Direct lowercase match
        var lower = raw.toLowerCase();
        if (LEARNSETS[lower]) return lower;

        // 3. Strip forme suffix: "Venusaur-Mega" → "venusaur"
        var baseKey = lower.split('-')[0];
        if (LEARNSETS[baseKey]) return baseKey;

        // 4. Remove all non-alphanumeric chars: "Farfetch'd" → "farfetchd"
        var stripped = lower.replace(/[^a-z0-9]/g, '');
        if (LEARNSETS[stripped]) return stripped;

        // 5. Strip forme from stripped version
        var strippedBase = stripped.split('-')[0];
        if (LEARNSETS[strippedBase]) return strippedBase;

        return '';
    }

    // ── Learn Method Lookup ───────────────────────────────────────────────────

    /**
     * Determine how (or if) a Pokémon can obtain a given move.
     *
     * @param {string}  dataId     element data-id: "SpeciesName (SetName)"
     * @param {string}  moveName   display name of the move (e.g. "Grass Knot")
     * @returns {'KNOWN'|'TUTOR'|'TM'|'SCALE'|null}
     */
    function getMoveLearnMethod(dataId, moveName) {
        if (!LEARNSETS || !dataId || !moveName) return null;

        // ── Parse data-id ─────────────────────────────────────────────────────
        // Optional prefix: "[index]SpeciesName (SetName)"
        var raw = dataId;
        if (raw.charAt(0) === '[') {
            var cb = raw.indexOf(']');
            if (cb >= 0) raw = raw.slice(cb + 1);
        }
        var parenIdx = raw.indexOf(' (');
        if (parenIdx === -1) return null;
        var speciesName = raw.substring(0, parenIdx).trim();
        var setName     = raw.substring(parenIdx + 2, raw.lastIndexOf(')')).trim();

        // ── Look up SETDEX entry for level + known moves ───────────────────────
        var setdexEntry = null;
        if (typeof SETDEX_SV !== 'undefined' && SETDEX_SV) {
            var speciesEntry = SETDEX_SV[speciesName];
            if (!speciesEntry && typeof resolveSetdexKey === 'function') {
                var alt = resolveSetdexKey(speciesName);
                if (alt) speciesEntry = SETDEX_SV[alt];
            }
            if (speciesEntry) setdexEntry = speciesEntry[setName];
        }

        var currentLevel = (setdexEntry && setdexEntry.level) ? (Number(setdexEntry.level) || 100) : 100;
        var knownMoves   = (setdexEntry && Array.isArray(setdexEntry.moves)) ? setdexEntry.moves : [];
        var searchKey    = normaliseMoveKey(moveName);

        // ── 1. KNOWN ──────────────────────────────────────────────────────────
        for (var i = 0; i < knownMoves.length; i++) {
            if (normaliseMoveKey(knownMoves[i]) === searchKey) return 'KNOWN';
        }

        // ── 2-4. Learnset check ────────────────────────────────────────────────
        var lsKey = resolveLearnsetKey(speciesName);
        if (!lsKey) return null;
        var ls = LEARNSETS[lsKey] && LEARNSETS[lsKey].learnset;
        if (!ls) return null;
        var methods = ls[searchKey];
        if (!methods || !methods.length) return null;

        var hasT = false, hasM = false, hasScale = false;
        for (var j = 0; j < methods.length; j++) {
            var m = methods[j];
            if (m === 'T') { hasT = true; }
            else if (m === 'M') { hasM = true; }
            else if (m.charAt(0) === 'L') {
                var lvl = parseInt(m.slice(1), 10);
                if (!isNaN(lvl) && lvl <= currentLevel) hasScale = true;
            }
        }

        if (hasT)     return 'TUTOR';
        if (hasM)     return 'TM';
        if (hasScale) return 'SCALE';
        return null;
    }

    // ── DOM Update Logic ──────────────────────────────────────────────────────

    var BOX_QUERY = '#box-poke-list .trainer-pok, #box-poke-list2 .trainer-pok, #team-poke-list .trainer-pok';

    var MOVE_CLASS = {
        'KNOWN': 'move-filter-known',
        'TUTOR': 'move-filter-tutor',
        'TM':    'move-filter-tm',
        'SCALE': 'move-filter-scale'
    };
    var ALL_MOVE_CLASSES = ['move-filter-known', 'move-filter-tutor', 'move-filter-tm', 'move-filter-scale'];

    /** Priority order for choosing the best method across multiple moves. */
    var METHOD_PRIORITY = { 'KNOWN': 4, 'TUTOR': 3, 'TM': 2, 'SCALE': 1 };

    /**
     * Apply (or remove) move-filter border classes on all box Pokémon elements.
     * @param {string|string[]} moveNameOrList  single display name, array of names, or '' to clear.
     */
    function applyMoveFilter(moveNameOrList) {
        var moveList = [];
        if (Array.isArray(moveNameOrList)) {
            moveList = moveNameOrList.filter(function (n) { return n && normaliseMoveKey(n); });
        } else if (moveNameOrList) {
            moveList = [moveNameOrList];
        }

        var nodes = document.querySelectorAll(BOX_QUERY);

        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            // Always strip previous move-filter classes
            for (var c = 0; c < ALL_MOVE_CLASSES.length; c++) el.classList.remove(ALL_MOVE_CLASSES[c]);
            if (!moveList.length) continue;

            var dataId = el.getAttribute('data-id');
            if (!dataId) continue;

            // For multi-move (category) mode: pick the highest-priority method
            var bestMethod = null;
            var bestPriority = 0;
            for (var m = 0; m < moveList.length; m++) {
                var method = getMoveLearnMethod(dataId, moveList[m]);
                var prio   = method ? (METHOD_PRIORITY[method] || 0) : 0;
                if (prio > bestPriority) { bestPriority = prio; bestMethod = method; }
            }
            if (bestMethod && MOVE_CLASS[bestMethod]) el.classList.add(MOVE_CLASS[bestMethod]);
        }
    }

    /** Clear filter completely and reset input and category picker. */
    function clearMoveFilter() {
        _activeMove       = '';
        _activeCategoryId = null;
        applyMoveFilter('');
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = '';
        if (clearBtn) clearBtn.setAttribute('hidden', '');
        _hideDropdown();
        // Reset category select
        var catSel = document.getElementById('mc-filter-select');
        if (catSel) catSel.value = '';
    }

    /**
     * Re-populate the category <select> with current categories from MoveCategories.
     * Called after the modal closes (save/delete) or on first inject.
     */
    function refreshCategoryPicker() {
        var catSel = document.getElementById('mc-filter-select');
        if (!catSel) return;
        var prevVal = catSel.value;
        // Keep only the placeholder option, repopulate
        catSel.innerHTML = '<option value="">-- Category --</option>';
        if (typeof window.MoveCategories === 'undefined') return;
        var cats = window.MoveCategories.getAll();
        for (var i = 0; i < cats.length; i++) {
            var opt = document.createElement('option');
            opt.value       = cats[i].id;
            opt.textContent = cats[i].name + ' (' + cats[i].moves.length + ')';
            catSel.appendChild(opt);
        }
        // Restore previous selection if it still exists
        if (prevVal) catSel.value = prevVal;
        // If the previously active category was deleted, clear filter
        if (_activeCategoryId && catSel.value !== _activeCategoryId) {
            _activeCategoryId = null;
            applyMoveFilter('');
        }
    }

    function _applyCategoryFilter(catId) {
        _activeCategoryId = catId || null;
        if (!_activeCategoryId) {
            applyMoveFilter('');
            return;
        }
        if (typeof window.MoveCategories === 'undefined') return;
        var cat = window.MoveCategories.getById(_activeCategoryId);
        if (!cat || !cat.moves.length) { applyMoveFilter(''); return; }
        // Clear the single-move search so they don't conflict
        _activeMove = '';
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = '';
        if (clearBtn) clearBtn.setAttribute('hidden', '');
        _hideDropdown();
        ensureLearnsets(function () { applyMoveFilter(cat.moves); });
    }

    // ── Autocomplete Dropdown ─────────────────────────────────────────────────

    var _dropdownEl = null;

    function _showDropdown(matches) {
        if (!_dropdownEl) return;
        _dropdownEl.innerHTML = '';
        if (!matches.length) { _hideDropdown(); return; }
        var limit = Math.min(matches.length, 12);
        for (var i = 0; i < limit; i++) {
            var item = document.createElement('div');
            item.className = 'move-search-dropdown-item';
            item.setAttribute('role', 'option');
            item.textContent = matches[i];
            (function (name) {
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    _selectMove(name);
                });
            })(matches[i]);
            _dropdownEl.appendChild(item);
        }
        _dropdownEl.removeAttribute('hidden');
    }

    function _hideDropdown() {
        if (_dropdownEl) _dropdownEl.setAttribute('hidden', '');
    }

    function _selectMove(name) {
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = name;
        if (clearBtn) clearBtn.removeAttribute('hidden');
        _activeMove = name;
        _hideDropdown();
        ensureLearnsets(function () { applyMoveFilter(name); });
    }

    function _onInputChange(e) {
        var val = (e.target.value || '').trim();
        if (!val) { clearMoveFilter(); return; }

        var lower   = val.toLowerCase();
        var matches = _allMoveNames.filter(function (n) { return n.toLowerCase().indexOf(lower) !== -1; });
        _showDropdown(matches);

        // Exact match → apply immediately
        var searchKey = normaliseMoveKey(val);
        for (var i = 0; i < _allMoveNames.length; i++) {
            if (normaliseMoveKey(_allMoveNames[i]) === searchKey) {
                _activeMove = _allMoveNames[i];
                ensureLearnsets(function () { applyMoveFilter(_activeMove); });
                break;
            }
        }
    }

    // ── MutationObserver – re-apply after mGBA sync / box changes ────────────

    function _installBoxObserver() {
        var ids = ['box-poke-list', 'box-poke-list2', 'team-poke-list'];
        if (!window.MutationObserver) return;
        for (var t = 0; t < ids.length; t++) {
            (function (id) {
                var el = document.getElementById(id);
                if (!el) return;
                new MutationObserver(function () {
                    if (_activeMove) {
                        ensureLearnsets(function () { applyMoveFilter(_activeMove); });
                    } else if (_activeCategoryId) {
                        _applyCategoryFilter(_activeCategoryId);
                    }
                }).observe(el, { childList: true });
            })(ids[t]);
        }
    }

    // ── UI Injection ──────────────────────────────────────────────────────────

    function injectMoveSearchUI() {
        var wrapper = document.getElementById('import-1_wrapper');
        if (!wrapper) return;

        var container = document.createElement('div');
        container.id  = 'move-search-container';

        container.innerHTML =
            '<div class="move-search-row">' +
              '<label class="move-search-label" for="move-search-input">' +
                '<span aria-hidden="true">\uD83D\uDD0E</span> Move Filter' +
              '</label>' +
              '<div class="move-search-input-wrap">' +
                '<input id="move-search-input" class="move-search-input" type="text"' +
                '  autocomplete="off" spellcheck="false" placeholder="Search a move\u2026"' +
                '  aria-label="Filter box Pok\u00e9mon by move" aria-autocomplete="list"' +
                '  aria-controls="move-search-dropdown" />' +
                '<button id="move-search-clear" class="move-search-clear" type="button"' +
                '  title="Clear move filter" aria-label="Clear move filter" hidden>\u2715</button>' +
              '</div>' +
            '</div>' +
            '<div id="move-search-dropdown" class="move-search-dropdown"' +
            '  role="listbox" aria-label="Move suggestions" hidden></div>' +
            '<div id="mc-filter-row" class="move-search-row">' +
              '<label id="mc-filter-label" class="move-search-label" for="mc-filter-select">' +
                '&#127991; Category' +
              '</label>' +
              '<select id="mc-filter-select" aria-label="Filter box Pok\u00e9mon by move category">' +
                '<option value="">-- Category --</option>' +
              '</select>' +
              '<button id="mc-filter-clear" type="button" title="Clear category filter"' +
                ' aria-label="Clear category filter">\u2715</button>' +
            '</div>' +
            '<div class="move-search-legend">' +
              '<span class="msleg msleg-known">&#9632; Knows</span>' +
              '<span class="msleg msleg-tutor">&#9632; Tutor</span>' +
              '<span class="msleg msleg-tm">&#9632; TM</span>' +
              '<span class="msleg msleg-scale">&#9632; Relearner</span>' +
            '</div>';

        wrapper.parentNode.insertBefore(container, wrapper);
        _dropdownEl = document.getElementById('move-search-dropdown');

        // Category select events
        var catSel   = document.getElementById('mc-filter-select');
        var catClear = document.getElementById('mc-filter-clear');
        catSel.addEventListener('change', function () {
            var val = catSel.value;
            if (!val) {
                _activeCategoryId = null;
                applyMoveFilter('');
            } else {
                _applyCategoryFilter(val);
            }
        });
        catClear.addEventListener('click', function () {
            catSel.value = '';
            _activeCategoryId = null;
            applyMoveFilter('');
        });
        // Populate with any already-stored categories
        refreshCategoryPicker();

        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');

        input.addEventListener('focus', function () {
            ensureLearnsets(function () {
                if (!_allMoveNames.length) _buildMoveNameList();
            });
        });

        input.addEventListener('input', function (e) {
            var hasVal = !!(e.target.value || '').trim();
            if (hasVal) clearBtn.removeAttribute('hidden');
            else        clearBtn.setAttribute('hidden', '');
            _onInputChange(e);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                clearMoveFilter();
            } else if (e.key === 'Enter') {
                var first = _dropdownEl && _dropdownEl.querySelector('.move-search-dropdown-item');
                if (first) { _selectMove(first.textContent); }
                _hideDropdown();
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                var firstItem = _dropdownEl && _dropdownEl.querySelector('.move-search-dropdown-item');
                if (firstItem) { firstItem.focus(); e.preventDefault(); }
            }
        });

        input.addEventListener('blur', function () { setTimeout(_hideDropdown, 160); });

        clearBtn.addEventListener('click', function () {
            clearMoveFilter();
            input.focus();
        });

        // Keyboard nav inside dropdown
        _dropdownEl.addEventListener('keydown', function (e) {
            var focused = document.activeElement;
            if (!focused || !focused.classList.contains('move-search-dropdown-item')) return;
            if (e.key === 'ArrowDown') {
                var next = focused.nextElementSibling;
                if (next) { next.focus(); e.preventDefault(); }
            } else if (e.key === 'ArrowUp') {
                var prev = focused.previousElementSibling;
                if (prev) { prev.focus(); e.preventDefault(); }
                else { input.focus(); e.preventDefault(); }
            } else if (e.key === 'Enter') {
                _selectMove(focused.textContent);
                e.preventDefault();
            } else if (e.key === 'Escape') {
                clearMoveFilter();
                input.focus();
            }
        });
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function init() {
        injectMoveSearchUI();
        _installBoxObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.MoveSearch = {
        getMoveLearnMethod:   getMoveLearnMethod,
        clearFilter:          clearMoveFilter,
        applyFilter:          function (name) { _selectMove(name); },
        getLearnsets:         function () { return LEARNSETS; },
        refreshCategoryPicker: refreshCategoryPicker
    };

})();
