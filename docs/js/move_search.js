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

    /** @type {string}  currently active (display) ability name, or '' */
    var _activeAbility = '';

    /** @type {string|null}  id of the active category filter, or null */
    var _activeCategoryId = null;

    /** @type {string[]}  all move display-names extracted from learnsets (for autocomplete) */
    var _allMoveNames = [];

    /** @type {string[]}  all ability display-names (for autocomplete) */
    var _allAbilityNames = [];

    /** @type {Object.<string, string>}  normalised ability key -> canonical display name */
    var _abilityKeyToName = Object.create(null);

    // ── Learnset Loader ───────────────────────────────────────────────────────

    /**
     * Fetch learnsets.js once, parse out BattleLearnsets, then notify subscribers.
     * @param {Function} [cb]  called with no args once ready
     */
    function ensureLearnsets(cb) {
        if (LEARNSETS && Object.keys(LEARNSETS).length) { if (cb) cb(); return; }
        if (cb) _onLoadCallbacks.push(cb);
        if (_loading) return;
        _loading = true;

        function _finishLoading() {
            _loading = false;
            var cbs = _onLoadCallbacks.splice(0);
            for (var i = 0; i < cbs.length; i++) cbs[i]();
        }

        function _fallbackLoadScript() {
            if (typeof BattleLearnsets !== 'undefined' && BattleLearnsets) {
                LEARNSETS = BattleLearnsets;
                _buildMoveNameList();
                _finishLoading();
                return;
            }
            if (typeof exports !== 'undefined' && exports.BattleLearnsets) {
                LEARNSETS = exports.BattleLearnsets;
                _buildMoveNameList();
                _finishLoading();
                return;
            }
            var s = document.createElement('script');
            s.type = 'text/javascript';
            s.src = './learnsets.js';
            s.onload = function () {
                if (typeof BattleLearnsets !== 'undefined') {
                    LEARNSETS = BattleLearnsets;
                } else if (typeof exports !== 'undefined' && exports.BattleLearnsets) {
                    LEARNSETS = exports.BattleLearnsets;
                }
                _buildMoveNameList();
                _finishLoading();
            };
            s.onerror = function () {
                console.warn('[MoveSearch] Could not load learnsets.js via script tag either.');
                LEARNSETS = {};
                _finishLoading();
            };
            document.head.appendChild(s);
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './learnsets.js', true);
            xhr.onerror = function () {
                _fallbackLoadScript();
            };
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
                    try {
                        var localExports = {};
                        (new Function('exports', xhr.responseText))(localExports);
                        LEARNSETS = localExports.BattleLearnsets || {};
                    } catch (e) {
                        console.error('[MoveSearch] Failed to parse learnsets.js:', e);
                        LEARNSETS = {};
                    }
                    _buildMoveNameList();
                    _finishLoading();
                } else {
                    _fallbackLoadScript();
                }
            };
            xhr.send();
        } catch (e) {
            _fallbackLoadScript();
        }
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

    // ── Ability Name Normalisation & Indexing ──────────────────────────────────

    /**
     * Convert an Ability display name -> lookup key.
     * "Soul-Heart" -> "soulheart", "Battle Armor" -> "battlearmor"
     * @param {string} name
     * @returns {string}
     */
    function normaliseAbilityKey(name) {
        return (name || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    /**
     * Build deduplicated, display-ready list of ability names from dex, calc, DOM, and sets.
     */
    function _buildAbilityNameList() {
        var seen = Object.create(null);
        var result = [];

        function addName(name) {
            if (!name || typeof name !== 'string') return;
            var trimmed = name.trim();
            if (!trimmed || trimmed === '(other)' || trimmed === '-') return;
            var key = normaliseAbilityKey(trimmed);
            if (key && !seen[key]) {
                seen[key] = trimmed;
                result.push(trimmed);
            }
        }

        // 1. calc.ABILITIES (all gens)
        if (typeof calc !== 'undefined' && calc && calc.ABILITIES) {
            if (Array.isArray(calc.ABILITIES)) {
                for (var g = 0; g < calc.ABILITIES.length; g++) {
                    var genList = calc.ABILITIES[g];
                    if (Array.isArray(genList)) {
                        for (var a = 0; a < genList.length; a++) addName(genList[a]);
                    }
                }
            }
        }

        // 2. ABILITIES global object (from dex/abilities.js)
        if (typeof ABILITIES !== 'undefined' && ABILITIES) {
            for (var abId in ABILITIES) {
                if (Object.prototype.hasOwnProperty.call(ABILITIES, abId)) {
                    var abObj = ABILITIES[abId];
                    if (abObj) {
                        if (abObj.name) addName(abObj.name);
                        else if (abObj.calcName) addName(abObj.calcName);
                    }
                }
            }
        }

        // 3. DOM select.ability options
        var domAbOpts = document.querySelectorAll('select.ability option, .ability-select option');
        for (var d = 0; d < domAbOpts.length; d++) {
            var optVal = (domAbOpts[d].value || domAbOpts[d].textContent || '').trim();
            if (optVal && optVal !== '(other)') addName(optVal);
        }

        // 4. pokedex species abilities
        if (typeof pokedex !== 'undefined' && pokedex) {
            for (var sp in pokedex) {
                if (Object.prototype.hasOwnProperty.call(pokedex, sp)) {
                    var spAb = pokedex[sp] && pokedex[sp].abilities;
                    if (spAb) {
                        if (Array.isArray(spAb)) {
                            for (var i = 0; i < spAb.length; i++) addName(spAb[i]);
                        } else if (typeof spAb === 'object') {
                            for (var k in spAb) addName(spAb[k]);
                        }
                    }
                }
            }
        }

        // 5. customsets in localStorage
        if (typeof localStorage !== 'undefined' && localStorage.customsets) {
            try {
                var cs = JSON.parse(localStorage.customsets);
                for (var csp in cs) {
                    for (var cset in cs[csp]) {
                        if (cs[csp][cset] && cs[csp][cset].ability) addName(cs[csp][cset].ability);
                    }
                }
            } catch (e) {}
        }

        result.sort();
        _allAbilityNames = result;
        _abilityKeyToName = seen;
    }

    /**
     * Determine the active ability of a Pokémon element or data-id.
     *
     * @param {string} [dataId]
     * @param {HTMLElement} [el]
     * @returns {string} active ability display name, or ''
     */
    function getPokemonAbility(dataId, el) {
        // 1. Direct object inspection (dataId or el.mon or el.pokemon)
        var mon = null;
        if (dataId && typeof dataId === 'object') {
            mon = dataId.mon || dataId.pokemon || dataId;
        }
        if (!mon && el) {
            mon = el.mon || el.pokemon || (el.parentElement && (el.parentElement.mon || el.parentElement.pokemon)) || null;
        }
        if (!mon && el && typeof jQuery !== 'undefined') {
            try { mon = jQuery(el).data('mon') || jQuery(el).data('pokemon'); } catch (e) {}
        }
        if (mon) {
            if (typeof mon.ability === 'string' && mon.ability) return mon.ability;
            if (typeof mon.abilityName === 'string' && mon.abilityName) return mon.abilityName;
        }

        // 2. Resolve via data-id string
        var idStr = typeof dataId === 'string' ? dataId : '';
        if (!idStr && el && el.getAttribute) {
            idStr = el.getAttribute('data-id') || (el.dataset && el.dataset.id) || '';
        }
        if (!idStr) return '';

        var raw = idStr;
        if (raw.charAt(0) === '[') {
            var cb = raw.indexOf(']');
            if (cb >= 0) raw = raw.slice(cb + 1);
        }
        var speciesName = '';
        var setName = '';
        var parenIdx = raw.indexOf(' (');
        if (parenIdx !== -1) {
            speciesName = raw.substring(0, parenIdx).trim();
            setName = raw.substring(parenIdx + 2, raw.lastIndexOf(')')).trim();
        } else {
            speciesName = raw.trim();
        }
        if (!speciesName) return '';

        // 3. SETDEX entry
        var setdexEntry = null;
        if (typeof SETDEX_SV !== 'undefined' && SETDEX_SV) {
            var speciesEntry = SETDEX_SV[speciesName];
            if (!speciesEntry && typeof resolveSetdexKey === 'function') {
                var alt = resolveSetdexKey(speciesName);
                if (alt) speciesEntry = SETDEX_SV[alt];
            }
            if (speciesEntry) {
                setdexEntry = setName ? speciesEntry[setName] : speciesEntry[Object.keys(speciesEntry)[0]];
            }
        }

        // 4. customsets (memory / localStorage)
        if (!setdexEntry && typeof customsets !== 'undefined' && customsets && customsets[speciesName]) {
            setdexEntry = setName ? customsets[speciesName][setName] : customsets[speciesName][Object.keys(customsets[speciesName])[0]];
        }
        if (!setdexEntry && typeof localStorage !== 'undefined' && localStorage.customsets) {
            try {
                var cs2 = JSON.parse(localStorage.customsets);
                if (cs2 && cs2[speciesName]) {
                    setdexEntry = setName ? cs2[speciesName][setName] : cs2[speciesName][Object.keys(cs2[speciesName])[0]];
                }
            } catch (e) {}
        }

        if (setdexEntry && typeof setdexEntry.ability === 'string' && setdexEntry.ability) {
            return setdexEntry.ability;
        }

        // 5. Fallback to pokedex default ability
        if (typeof pokedex !== 'undefined' && pokedex && pokedex[speciesName]) {
            var pEntry = pokedex[speciesName];
            if (pEntry && pEntry.abilities) {
                if (typeof pEntry.abilities === 'object') {
                    var first = pEntry.abilities[0] || pEntry.abilities['0'];
                    if (first) return first;
                }
            }
        }
        if (typeof SPECIES !== 'undefined' && SPECIES) {
            var spKey = speciesName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (SPECIES[spKey] && SPECIES[spKey].abilities && SPECIES[spKey].abilities.length) {
                var abId = SPECIES[spKey].abilities[0];
                if (typeof ABILITIES !== 'undefined' && ABILITIES && ABILITIES[abId] && ABILITIES[abId].name) {
                    return ABILITIES[abId].name;
                }
                return abId;
            }
        }

        return '';
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

        // 6. Check baseSpecies from pokedex
        if (typeof pokedex !== 'undefined' && pokedex && pokedex[speciesName] && pokedex[speciesName].baseSpecies) {
            var bKey = resolveLearnsetKey(pokedex[speciesName].baseSpecies);
            if (bKey) return bKey;
        }

        return '';
    }

    // ── Learn Method Lookup ───────────────────────────────────────────────────

    // ── Method Filter Settings & Persistence ──────────────────────────────────
    function getMoveFilterMethodsSetting() {
        try {
            var raw = localStorage.getItem('nullCalcSettings');
            if (raw) {
                var s = JSON.parse(raw);
                if (s && s.moveFilterMethods) {
                    return {
                        known:     s.moveFilterMethods.known !== false,
                        tutor:     s.moveFilterMethods.tutor !== false,
                        tm:        s.moveFilterMethods.tm !== false,
                        relearner: s.moveFilterMethods.relearner !== false
                    };
                }
            }
        } catch (e) {}
        return { known: true, tutor: true, tm: true, relearner: true };
    }

    function saveMoveFilterMethodsSetting(methods) {
        try {
            var raw = localStorage.getItem('nullCalcSettings');
            var s = raw ? JSON.parse(raw) : {};
            s.moveFilterMethods = methods;
            localStorage.setItem('nullCalcSettings', JSON.stringify(s));
        } catch (e) {}
    }

    function getActiveMethodFilters() {
        var items = document.querySelectorAll('.move-legend-item');
        if (!items || !items.length) {
            return getMoveFilterMethodsSetting();
        }
        var res = {};
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var m = el.getAttribute('data-method');
            if (m) {
                res[m] = !el.classList.contains('inactive');
            }
        }
        return {
            known:     res.known !== false,
            tutor:     res.tutor !== false,
            tm:        res.tm !== false,
            relearner: res.relearner !== false
        };
    }

    /**
     * Determine how (or if) a Pokémon can obtain a given move.
     *
     * @param {string}  dataId     element data-id: "SpeciesName (SetName)"
     * @param {string}  moveName   display name of the move (e.g. "Grass Knot")
     * @returns {'KNOWN'|'TUTOR'|'TM'|'SCALE'|null}
     */
    function getMoveLearnMethod(dataId, moveName, el) {
        if (!LEARNSETS || (!dataId && !el) || !moveName) return null;

        var activeFilters = getActiveMethodFilters();

        // ── Resolve mon object (if passed or on element) ──────────────────────
        var mon = null;
        if (dataId && typeof dataId === 'object') {
            mon = dataId.mon || dataId.pokemon || dataId;
        }
        if (!mon && el) {
            mon = el.mon || el.pokemon || (el.parentElement && (el.parentElement.mon || el.parentElement.pokemon)) || null;
        }
        if (!mon && el && typeof jQuery !== 'undefined') {
            try { mon = jQuery(el).data('mon') || jQuery(el).data('pokemon'); } catch (e) {}
        }

        // ── Parse data-id string ──────────────────────────────────────────────
        // Optional prefix: "[index]SpeciesName (SetName)"
        var raw = (typeof dataId === 'string' ? dataId : '') || (el && el.getAttribute && (el.getAttribute('data-id') || (el.dataset && el.dataset.id))) || '';
        if (raw.charAt(0) === '[') {
            var cb = raw.indexOf(']');
            if (cb >= 0) raw = raw.slice(cb + 1);
        }
        var speciesName = '';
        var setName     = '';
        var parenIdx = raw.indexOf(' (');
        if (parenIdx !== -1) {
            speciesName = raw.substring(0, parenIdx).trim();
            setName     = raw.substring(parenIdx + 2, raw.lastIndexOf(')')).trim();
        } else {
            speciesName = raw.trim();
        }

        if (!speciesName && mon) {
            speciesName = (mon.speciesName || mon.species || mon.name || '').trim();
        }
        if (!speciesName) return null;

        // ── Look up SETDEX entry for level + known moves ───────────────────────
        var setdexEntry = null;
        if (typeof SETDEX_SV !== 'undefined' && SETDEX_SV) {
            var speciesEntry = SETDEX_SV[speciesName];
            if (!speciesEntry && typeof resolveSetdexKey === 'function') {
                var alt = resolveSetdexKey(speciesName);
                if (alt) speciesEntry = SETDEX_SV[alt];
            }
            if (speciesEntry) {
                setdexEntry = setName ? speciesEntry[setName] : speciesEntry[Object.keys(speciesEntry)[0]];
            }
        }
        if (!setdexEntry && typeof customsets !== 'undefined' && customsets && customsets[speciesName]) {
            setdexEntry = setName ? customsets[speciesName][setName] : customsets[speciesName][Object.keys(customsets[speciesName])[0]];
        }
        if (!setdexEntry && typeof localStorage !== 'undefined' && localStorage.customsets) {
            try {
                var cs = JSON.parse(localStorage.customsets);
                if (cs && cs[speciesName]) {
                    setdexEntry = setName ? cs[speciesName][setName] : cs[speciesName][Object.keys(cs[speciesName])[0]];
                }
            } catch (e) {}
        }

        var currentLevel = 100;
        var knownMoves   = [];
        if (mon && Array.isArray(mon.moves)) {
            knownMoves = mon.moves;
            if (mon.level) currentLevel = Number(mon.level) || 100;
        } else if (setdexEntry) {
            if (Array.isArray(setdexEntry.moves)) knownMoves = setdexEntry.moves;
            if (setdexEntry.level) currentLevel = Number(setdexEntry.level) || 100;
        }

        var searchKey    = normaliseMoveKey(moveName);

        // ── 1. KNOWN ──────────────────────────────────────────────────────────
        var knowsMove = false;
        for (var i = 0; i < knownMoves.length; i++) {
            if (normaliseMoveKey(knownMoves[i]) === searchKey) {
                knowsMove = true;
                break;
            }
        }
        if (knowsMove && activeFilters.known) {
            return 'KNOWN';
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

        if (hasT && activeFilters.tutor)         return 'TUTOR';
        if (hasM && activeFilters.tm)            return 'TM';
        if (hasScale && activeFilters.relearner) return 'SCALE';
        return null;
    }

    /**
     * Evaluate a Pokémon against a category (moves + abilities).
     *
     * @param {Object|string[]} categoryOrItems - category object or array of items
     * @param {string} dataId - element data-id or mon identifier
     * @param {HTMLElement} [el] - Pokémon DOM element
     * @returns {'KNOWN'|'TUTOR'|'TM'|'SCALE'|null}
     */
    function evaluateCategory(categoryOrItems, dataId, el) {
        if (!categoryOrItems) return null;
        var items = [];
        if (Array.isArray(categoryOrItems)) {
            items = categoryOrItems;
        } else if (categoryOrItems.items || categoryOrItems.moves) {
            items = categoryOrItems.items || categoryOrItems.moves;
        }
        if (!items || !items.length) return null;

        var activeFilters = getActiveMethodFilters();

        // 1. Ability match check (highest priority alongside known moves -> 'KNOWN')
        if (activeFilters.known) {
            var monAbility = getPokemonAbility(dataId, el);
            if (monAbility) {
                var monAbKey = normaliseAbilityKey(monAbility);
                for (var a = 0; a < items.length; a++) {
                    if (normaliseAbilityKey(items[a]) === monAbKey) {
                        return 'KNOWN';
                    }
                }
            }
        }

        // 2. Move match check (KNOWN -> TUTOR -> TM -> SCALE)
        var bestMethod = null;
        var bestPriority = 0;
        for (var m = 0; m < items.length; m++) {
            var item = items[m];
            var method = getMoveLearnMethod(dataId, item, el);
            var prio = method ? (METHOD_PRIORITY[method] || 0) : 0;
            if (prio > bestPriority) {
                bestPriority = prio;
                bestMethod = method;
                if (prio === 4) break; // 'KNOWN' is maximum priority
            }
        }

        return bestMethod;
    }

    // ── DOM Update Logic ──────────────────────────────────────────────────────

    var BOX_QUERY = '#box-poke-list .trainer-pok, #box-poke-list2 .trainer-pok, #team-poke-list .trainer-pok, .pokemon-slot, .box-mon';

    var MOVE_CLASS = {
        'KNOWN': 'move-filter-known',
        'TUTOR': 'move-filter-tutor',
        'TM':    'move-filter-tm',
        'SCALE': 'move-filter-scale'
    };
    var BORDER_MOVE_CLASS = {
        'KNOWN': 'border-move-known',
        'TUTOR': 'border-move-tutor',
        'TM':    'border-move-tm',
        'SCALE': 'border-move-scale'
    };
    var ALL_MOVE_CLASSES = [
        'move-filter-known', 'move-filter-tutor', 'move-filter-tm', 'move-filter-scale',
        'border-move-known', 'border-move-tutor', 'border-move-tm', 'border-move-scale'
    ];

    /** Priority order for choosing the best method across multiple moves. */
    var METHOD_PRIORITY = { 'KNOWN': 4, 'TUTOR': 3, 'TM': 2, 'SCALE': 1 };

    var _lastFilterPayload = null;

    /**
     * Apply (or remove) move/ability/category filter border classes on all box Pokémon elements.
     * @param {string|string[]|Object} payload  single name, array of names, filter object, or '' to clear.
     */
    function applyMoveFilter(payload) {
        _lastFilterPayload = payload;

        var resolved = null;
        if (!payload) {
            resolved = null;
        } else if (Array.isArray(payload)) {
            resolved = { type: 'category', category: { items: payload } };
        } else if (typeof payload === 'object') {
            if (payload.type) resolved = payload;
            else if (payload.items || payload.moves) resolved = { type: 'category', category: payload };
        } else if (typeof payload === 'string') {
            resolved = _resolveFilter(payload);
            if (!resolved && payload.trim()) {
                var raw = payload.trim();
                var abK = normaliseAbilityKey(raw);
                if (_abilityKeyToName[abK]) {
                    resolved = { type: 'ability', abilityName: _abilityKeyToName[abK] };
                } else {
                    resolved = { type: 'move', moveName: raw };
                }
            }
        }

        var nodes = document.querySelectorAll(BOX_QUERY);

        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            // Always strip previous move-filter classes
            for (var c = 0; c < ALL_MOVE_CLASSES.length; c++) el.classList.remove(ALL_MOVE_CLASSES[c]);
            if (!resolved) continue;

            var dataId = el.getAttribute('data-id') || (el.dataset && el.dataset.id);
            if (!dataId && !el.mon && !el.pokemon) continue;

            var bestMethod = null;
            if (resolved.type === 'ability') {
                var activeFilters = getActiveMethodFilters();
                if (activeFilters.known) {
                    var monAb = getPokemonAbility(dataId, el);
                    if (monAb && normaliseAbilityKey(monAb) === normaliseAbilityKey(resolved.abilityName)) {
                        bestMethod = 'KNOWN';
                    }
                }
            } else if (resolved.type === 'category') {
                bestMethod = evaluateCategory(resolved.category, dataId, el);
            } else if (resolved.type === 'move') {
                bestMethod = getMoveLearnMethod(dataId, resolved.moveName, el);
            }

            if (bestMethod && MOVE_CLASS[bestMethod]) {
                el.classList.add(MOVE_CLASS[bestMethod]);
                el.classList.add(BORDER_MOVE_CLASS[bestMethod]);
            }
        }
    }

    /** Re-evaluate and re-apply current filter without resetting search input or category */
    function reapplyActiveFilter() {
        if (_activeCategoryId) {
            var cats = _getAllCategories();
            for (var i = 0; i < cats.length; i++) {
                if (cats[i].id === _activeCategoryId) {
                    var cat = cats[i];
                    ensureLearnsets(function () { applyMoveFilter({ type: 'category', category: cat }); });
                    return;
                }
            }
        }
        if (_activeAbility) {
            var abName = _activeAbility;
            applyMoveFilter({ type: 'ability', abilityName: abName });
            return;
        }
        if (_activeMove) {
            var moveName = _activeMove;
            ensureLearnsets(function () { applyMoveFilter({ type: 'move', moveName: moveName }); });
            return;
        }
        var input = document.getElementById('move-search-input');
        var val = (input ? input.value : '') || '';
        if (val.trim()) {
            var resolved = _resolveFilter(val);
            if (resolved) {
                if (resolved.type === 'category') {
                    ensureLearnsets(function () { applyMoveFilter({ type: 'category', category: resolved.category }); });
                } else if (resolved.type === 'ability') {
                    applyMoveFilter({ type: 'ability', abilityName: resolved.abilityName });
                } else {
                    ensureLearnsets(function () { applyMoveFilter({ type: 'move', moveName: resolved.moveName }); });
                }
                return;
            }
        }
        if (_lastFilterPayload) {
            var payload = _lastFilterPayload;
            ensureLearnsets(function () { applyMoveFilter(payload); });
        }
    }

    /** Clear filter completely and reset input and category picker. */
    function clearMoveFilter() {
        _activeMove        = '';
        _activeAbility     = '';
        _activeCategoryId  = null;
        _lastFilterPayload = null;
        applyMoveFilter('');
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = '';
        if (clearBtn) clearBtn.setAttribute('hidden', '');
        _hideDropdown();
    }

    function _getAllCategories() {
        if (typeof window.MoveCategories !== 'undefined') {
            if (typeof window.MoveCategories.getAllCategories === 'function') {
                return window.MoveCategories.getAllCategories() || [];
            }
            if (typeof window.MoveCategories.getAll === 'function') {
                return window.MoveCategories.getAll() || [];
            }
        }
        return [];
    }

    /**
     * Resolve an input string to either:
     *   { type: 'category', category: catObj, name: string }
     *   { type: 'ability', abilityName: string, name: string }
     *   { type: 'move', moveName: string, name: string }
     *   null
     */
    function _resolveFilter(text) {
        var raw = (text || '').trim();
        if (!raw) return null;

        if (!_allAbilityNames.length) _buildAbilityNameList();

        var cats = _getAllCategories();
        var lower = raw.toLowerCase();

        // 1. Explicit [Category] prefix
        var catPrefix = '[category]';
        if (lower.indexOf(catPrefix) === 0) {
            var catName = raw.slice(catPrefix.length).trim().toLowerCase();
            for (var i = 0; i < cats.length; i++) {
                if (cats[i].name.toLowerCase() === catName) {
                    return { type: 'category', category: cats[i], name: cats[i].name };
                }
            }
            for (var j = 0; j < cats.length; j++) {
                if (cats[j].name.toLowerCase().indexOf(catName) === 0) {
                    return { type: 'category', category: cats[j], name: cats[j].name };
                }
            }
            return null;
        }

        // 2. Explicit [Ability] prefix
        var abPrefix = '[ability]';
        if (lower.indexOf(abPrefix) === 0) {
            var abQuery = raw.slice(abPrefix.length).trim();
            var abKey = normaliseAbilityKey(abQuery);
            if (_abilityKeyToName[abKey]) {
                return { type: 'ability', abilityName: _abilityKeyToName[abKey], name: _abilityKeyToName[abKey] };
            }
            for (var a = 0; a < _allAbilityNames.length; a++) {
                if (_allAbilityNames[a].toLowerCase().indexOf(abQuery.toLowerCase()) === 0) {
                    return { type: 'ability', abilityName: _allAbilityNames[a], name: _allAbilityNames[a] };
                }
            }
            if (abQuery) {
                return { type: 'ability', abilityName: abQuery, name: abQuery };
            }
            return null;
        }

        // 3. Explicit [Move] prefix
        var movePrefix = '[move]';
        if (lower.indexOf(movePrefix) === 0) {
            var mQuery = raw.slice(movePrefix.length).trim();
            var mKey = normaliseMoveKey(mQuery);
            for (var mi = 0; mi < _allMoveNames.length; mi++) {
                if (normaliseMoveKey(_allMoveNames[mi]) === mKey) {
                    return { type: 'move', moveName: _allMoveNames[mi], name: _allMoveNames[mi] };
                }
            }
            if (mQuery) return { type: 'move', moveName: mQuery, name: mQuery };
            return null;
        }

        // 4. Exact match to a registered category name (case-insensitive)
        for (var k = 0; k < cats.length; k++) {
            if (cats[k].name.toLowerCase() === lower) {
                return { type: 'category', category: cats[k], name: cats[k].name };
            }
        }

        // 5. Match against canonical abilities
        var aKey = normaliseAbilityKey(raw);
        if (aKey && _abilityKeyToName[aKey]) {
            return { type: 'ability', abilityName: _abilityKeyToName[aKey], name: _abilityKeyToName[aKey] };
        }

        // 6. Match against canonical move names
        var key = normaliseMoveKey(raw);
        if (key) {
            for (var m = 0; m < _allMoveNames.length; m++) {
                if (normaliseMoveKey(_allMoveNames[m]) === key) {
                    return { type: 'move', moveName: _allMoveNames[m], name: _allMoveNames[m] };
                }
            }
        }

        return null;
    }

    function _selectCategory(cat) {
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = '[Category] ' + cat.name;
        if (clearBtn) clearBtn.removeAttribute('hidden');
        _activeMove       = '';
        _activeAbility    = '';
        _activeCategoryId = cat.id;
        _hideDropdown();
        ensureLearnsets(function () { applyMoveFilter({ type: 'category', category: cat }); });
    }

    function _selectAbility(name) {
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = '[Ability] ' + name;
        if (clearBtn) clearBtn.removeAttribute('hidden');
        _activeMove       = '';
        _activeAbility    = name;
        _activeCategoryId = null;
        _hideDropdown();
        applyMoveFilter({ type: 'ability', abilityName: name });
    }

    function _selectMove(name) {
        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');
        if (input)    input.value = name;
        if (clearBtn) clearBtn.removeAttribute('hidden');
        _activeMove       = name;
        _activeAbility    = '';
        _activeCategoryId = null;
        _hideDropdown();
        ensureLearnsets(function () { applyMoveFilter({ type: 'move', moveName: name }); });
    }

    function _selectItem(item) {
        if (!item) return;
        if (item.type === 'category') {
            _selectCategory(item.category);
        } else if (item.type === 'ability') {
            _selectAbility(item.name || item.abilityName);
        } else if (item.type === 'move') {
            _selectMove(item.name || item.moveName);
        }
    }

    /**
     * Synchronise active category filter when categories are modified/deleted in modal.
     */
    function refreshCategoryPicker() {
        if (_activeCategoryId) {
            var cats = _getAllCategories();
            var active = null;
            for (var i = 0; i < cats.length; i++) {
                if (cats[i].id === _activeCategoryId) { active = cats[i]; break; }
            }
            if (!active) {
                clearMoveFilter();
            } else {
                var input = document.getElementById('move-search-input');
                if (input) input.value = '[Category] ' + active.name;
                ensureLearnsets(function () { applyMoveFilter({ type: 'category', category: active }); });
            }
        }
    }

    // ── Autocomplete Dropdown ─────────────────────────────────────────────────

    var _dropdownEl = null;

    function _getSuggestions(raw) {
        var query = (raw || '').trim();
        if (!query) return [];

        if (!_allAbilityNames.length) _buildAbilityNameList();

        var lower = query.toLowerCase();
        var isCatQuery = lower.indexOf('[category]') === 0;
        var isAbQuery  = lower.indexOf('[ability]') === 0;
        var isMoveQuery = lower.indexOf('[move]') === 0;

        var catSearch = isCatQuery ? lower.slice(10).trim() : lower;
        var abSearch  = isAbQuery  ? lower.slice(9).trim()  : lower;
        var moveSearch = isMoveQuery ? lower.slice(6).trim() : lower;

        var catMatches = [];
        if (!isAbQuery && !isMoveQuery) {
            var cats = _getAllCategories();
            for (var i = 0; i < cats.length; i++) {
                var cName = cats[i].name;
                var cLower = cName.toLowerCase();
                if (!catSearch || cLower.indexOf(catSearch) !== -1 || ('[category] ' + cLower).indexOf(lower) !== -1) {
                    catMatches.push({
                        type: 'category',
                        category: cats[i],
                        name: cName,
                        label: '[Category] ' + cName
                    });
                }
            }
        }

        var abilityMatches = [];
        if (!isCatQuery && !isMoveQuery) {
            var abKeySearch = normaliseAbilityKey(abSearch);
            for (var a = 0; a < _allAbilityNames.length; a++) {
                var abName = _allAbilityNames[a];
                var abLower = abName.toLowerCase();
                if (!abSearch || abLower.indexOf(abSearch) !== -1 || ('[ability] ' + abLower).indexOf(lower) !== -1 || (abKeySearch && normaliseAbilityKey(abName).indexOf(abKeySearch) !== -1)) {
                    abilityMatches.push({
                        type: 'ability',
                        name: abName,
                        label: '[Ability] ' + abName
                    });
                }
            }
        }

        var moveMatches = [];
        if (!isCatQuery && !isAbQuery) {
            for (var j = 0; j < _allMoveNames.length; j++) {
                if (!moveSearch || _allMoveNames[j].toLowerCase().indexOf(moveSearch) !== -1) {
                    moveMatches.push({
                        type: 'move',
                        name: _allMoveNames[j],
                        label: _allMoveNames[j]
                    });
                }
            }
        }

        return catMatches.concat(abilityMatches).concat(moveMatches);
    }

    function _showDropdown(matches) {
        if (!_dropdownEl) return;
        _dropdownEl.innerHTML = '';
        if (!matches || !matches.length) { _hideDropdown(); return; }

        var limit = Math.min(matches.length, 16);
        for (var i = 0; i < limit; i++) {
            var match = matches[i];
            var item = document.createElement('div');
            var cls = 'move-search-dropdown-item';
            if (match.type === 'category') cls += ' is-category';
            else if (match.type === 'ability') cls += ' is-ability';
            item.className = cls;
            item.setAttribute('role', 'option');
            item.tabIndex = -1;
            item.textContent = match.label;
            item._match = match;
            (function (m) {
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    _selectItem(m);
                });
            })(match);
            _dropdownEl.appendChild(item);
        }
        _dropdownEl.removeAttribute('hidden');
    }

    function _hideDropdown() {
        if (_dropdownEl) _dropdownEl.setAttribute('hidden', '');
    }

    function _onInputChange(e) {
        var input = (e && e.target) ? e.target : document.getElementById('move-search-input');
        var val = (input && input.value ? input.value : '').trim();
        if (!val) { clearMoveFilter(); return; }

        ensureLearnsets(function () {
            if (!_allMoveNames.length) _buildMoveNameList();
            if (!_allAbilityNames.length) _buildAbilityNameList();
            var matches = _getSuggestions(val);
            _showDropdown(matches);
        });

        var matches = _getSuggestions(val);
        _showDropdown(matches);

        // Immediate resolution if user typed exact move, ability, or category name
        var resolved = _resolveFilter(val);
        if (resolved) {
            if (resolved.type === 'category') {
                _activeCategoryId = resolved.category.id;
                _activeAbility    = '';
                _activeMove       = '';
                ensureLearnsets(function () { applyMoveFilter({ type: 'category', category: resolved.category }); });
            } else if (resolved.type === 'ability') {
                _activeCategoryId = null;
                _activeAbility    = resolved.abilityName;
                _activeMove       = '';
                applyMoveFilter({ type: 'ability', abilityName: resolved.abilityName });
            } else if (resolved.type === 'move') {
                _activeCategoryId = null;
                _activeAbility    = '';
                _activeMove       = resolved.moveName;
                ensureLearnsets(function () { applyMoveFilter({ type: 'move', moveName: resolved.moveName }); });
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
                    reapplyActiveFilter();
                }).observe(el, { childList: true });
            })(ids[t]);
        }
    }

    // ── UI Injection ──────────────────────────────────────────────────────────

    function injectMoveSearchUI() {
        var existing = document.getElementById('move-search-container');
        if (existing) return;

        var wrapper = document.getElementById('import-1_wrapper');
        if (!wrapper) return;

        var container = document.createElement('div');
        container.id  = 'move-search-container';

        container.innerHTML =
            '<div class="move-search-row">' +
              '<label class="move-search-label" for="move-search-input">Move Filter</label>' +
              '<div class="move-search-input-wrap">' +
                '<input id="move-search-input" class="move-search-input" type="text"' +
                '  autocomplete="off" spellcheck="false" placeholder="Search a move, ability, or category\u2026"' +
                '  aria-label="Filter box Pok\u00e9mon by move, ability, or category" aria-autocomplete="list"' +
                '  aria-controls="move-search-dropdown" />' +
                '<button id="move-search-clear" class="move-search-clear" type="button"' +
                '  title="Clear move filter" aria-label="Clear move filter" hidden>\u2715</button>' +
                '<div id="move-search-dropdown" class="move-search-dropdown"' +
                '  role="listbox" aria-label="Move and category suggestions" hidden></div>' +
              '</div>' +
            '</div>' +
            '<div class="move-search-legend" id="move-search-legend">' +
              '<span class="move-legend-item active" data-method="known" role="button" tabindex="0" title="Toggle Knows filter">' +
                '<span class="legend-square legend-square-known"></span>' +
                '<span class="legend-text">Knows</span>' +
              '</span>' +
              '<span class="move-legend-item active" data-method="tutor" role="button" tabindex="0" title="Toggle Tutor filter">' +
                '<span class="legend-square legend-square-tutor"></span>' +
                '<span class="legend-text">Tutor</span>' +
              '</span>' +
              '<span class="move-legend-item active" data-method="tm" role="button" tabindex="0" title="Toggle TM filter">' +
                '<span class="legend-square legend-square-tm"></span>' +
                '<span class="legend-text">TM</span>' +
              '</span>' +
              '<span class="move-legend-item active" data-method="relearner" role="button" tabindex="0" title="Toggle Relearner filter">' +
                '<span class="legend-square legend-square-relearner"></span>' +
                '<span class="legend-text">Relearner</span>' +
              '</span>' +
            '</div>';

        wrapper.parentNode.insertBefore(container, wrapper);
        _dropdownEl = document.getElementById('move-search-dropdown');

        // Wire up method filter toggles (classic text + colored square, no checkboxes)
        var savedMethods = getMoveFilterMethodsSetting();
        var legendItems = container.querySelectorAll('.move-legend-item');

        function updateLegendItemState(item, active) {
            item.classList.toggle('active', !!active);
            item.classList.toggle('inactive', !active);
            item.setAttribute('aria-pressed', active ? 'true' : 'false');
        }

        for (var li = 0; li < legendItems.length; li++) {
            (function (item) {
                var key = item.getAttribute('data-method');
                var isInitiallyActive = savedMethods[key] !== false;
                updateLegendItemState(item, isInitiallyActive);

                function toggle() {
                    var nowActive = item.classList.contains('inactive');
                    updateLegendItemState(item, nowActive);
                    var current = getActiveMethodFilters();
                    saveMoveFilterMethodsSetting(current);
                    reapplyActiveFilter();
                }

                item.addEventListener('click', toggle);
                item.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle();
                    }
                });
            })(legendItems[li]);
        }

        var input    = document.getElementById('move-search-input');
        var clearBtn = document.getElementById('move-search-clear');

        input.addEventListener('focus', function () {
            ensureLearnsets(function () {
                if (!_allMoveNames.length) _buildMoveNameList();
                if (!_allAbilityNames.length) _buildAbilityNameList();
            });
        });

        input.addEventListener('input', function (e) {
            var hasVal = !!(e.target.value || '').trim();
            if (hasVal) clearBtn.removeAttribute('hidden');
            else        clearBtn.setAttribute('hidden', '');
            _onInputChange(e);
        });

        input.addEventListener('change', function (e) {
            _onInputChange(e);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                clearMoveFilter();
            } else if (e.key === 'Enter') {
                var first = _dropdownEl && _dropdownEl.querySelector('.move-search-dropdown-item');
                if (first && !_dropdownEl.hasAttribute('hidden')) {
                    var matchFirst = first._match || _resolveFilter(first.textContent);
                    if (matchFirst) {
                        _selectItem(matchFirst);
                    }
                } else {
                    var val = (input.value || '').trim();
                    var resolved = _resolveFilter(val);
                    if (resolved) {
                        _selectItem(resolved);
                    }
                }
                _hideDropdown();
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                var firstItem = _dropdownEl && _dropdownEl.querySelector('.move-search-dropdown-item');
                if (firstItem && !_dropdownEl.hasAttribute('hidden')) {
                    firstItem.focus();
                    e.preventDefault();
                }
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
                var resolved = focused._match || _resolveFilter(focused.textContent);
                if (resolved) {
                    _selectItem(resolved);
                }
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
        _buildAbilityNameList();
        ensureLearnsets();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.initMoveSearch = init;
    window.MoveSearch = {
        init:                   init,
        getMoveLearnMethod:     getMoveLearnMethod,
        getPokemonAbility:      getPokemonAbility,
        evaluateCategory:       evaluateCategory,
        getActiveMethodFilters: getActiveMethodFilters,
        clearFilter:            clearMoveFilter,
        reapplyFilter:          reapplyActiveFilter,
        applyFilter:            function (name) {
            if (!name) { clearMoveFilter(); return; }
            var r = _resolveFilter(name);
            if (r) _selectItem(r);
            else _selectMove(name);
        },
        getLearnsets:           function () { return LEARNSETS; },
        refreshCategoryPicker:  refreshCategoryPicker
    };

})();
