/**
 * move_categories.js — Move Categories (Built-in & Custom Move Tags / Bundles)
 *
 * Provides competitive default move categories out-of-the-box, while allowing
 * users to create, customize, override, and restore categories locally.
 *
 * Public API: window.MoveCategories
 *   .getAll()              -> Array of { id, name, moves[], isDefault, isOverridden }
 *   .getAllCategories()    -> Alias for getAll()
 *   .getById(id)           -> single category or null
 *   .getDefaults()         -> Array of default category definitions
 *   .restoreDefault(id)    -> reverts an overridden default category to preset
 *   .openManager()         -> open the CRUD modal
 *   .onCategoriesChange    -> assign a callback(categories) for external listeners
 */

(function () {
    'use strict';

    var STORAGE_KEY = 'customMoveCategories';

    // ---- Built-in Default Categories ----------------------------------------
    var DEFAULT_MOVE_CATEGORIES = [
        {
            id: "default-protect",
            name: "Protect Moves",
            isDefault: true,
            moves: [
                "Protect", "Detect", "Obstruct", "Silk Trap",
                "King's Shield", "Spiky Shield", "Baneful Bunker", "Burning Bulwark"
            ]
        },
        {
            id: "default-hazards",
            name: "Hazards",
            isDefault: true,
            moves: [
                "Stealth Rock", "Spikes", "Toxic Spikes", "Sticky Web",
                "Stone Axe", "Ceaseless Edge"
            ]
        },
        {
            id: "default-speed-drop",
            name: "Speed Drop Attacks",
            isDefault: true,
            moves: [
                "Rock Tomb", "Electroweb", "Bulldoze", "Icy Wind",
                "Low Sweep", "Pounce"
            ]
        },
        {
            id: "default-def-drop",
            name: "Defense Drop Attacks",
            isDefault: true,
            moves: [
                "Fire Lash", "Rock Smash", "Thunderous Kick"
            ]
        },
        {
            id: "default-pivot",
            name: "Pivot Moves",
            isDefault: true,
            moves: [
                "U-turn", "Volt Switch", "Flip Turn", "Parting Shot",
                "Teleport", "Baton Pass", "Chilly Reception", "Shed Tail"
            ]
        },
        {
            id: "default-hazard-removal",
            name: "Hazard Removal",
            isDefault: true,
            moves: [
                "Rapid Spin", "Defog", "Court Change", "Mortal Spin", "Tidy Up"
            ]
        },
        {
            id: "default-screen-removal",
            name: "Screen Removal",
            isDefault: true,
            moves: [
                "Brick Break", "Psychic Fangs", "Defog", "Raging Bull"
            ]
        },
        {
            id: "default-anti-setup",
            name: "Anti Setup",
            isDefault: true,
            moves: [
                "Whirlwind", "Dragon Tail", "Circle Throw", "Roar", "Freezy Frost", "Haze", "Clear Smog", "Topsy Turvy"
            ]
        },
        {
            id: "default-phazing",
            name: "Phazing Moves",
            isDefault: true,
            moves: [
                "Whirlwind", "Dragon Tail", "Circle Throw", "Roar"
            ]
        },
        {
            id: "default-anti-offensive-attack-setup",
            name: "Anti Offensive Attack Setup",
            isDefault: true,
            moves: [
                "Burning Jealousy", "Alluring Voice", "Foul Play"
            ]
        },
        {
            id: "default-Trapping",
            name: "Binding Moves",
            isDefault: true,
            moves: [
                "Clamp", "Infestation", "Sand Tomb", "Whirlpool", "Wrap", "Fire Spin", "Thunder Cage", "Magma Storm", "Snap Trap"
            ]
        }
    ];

    var _userCategories = [];
    var _onChange = null;

    // ---- Persistence --------------------------------------------------------

    function _load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) _userCategories = JSON.parse(raw) || [];
        } catch (e) { _userCategories = []; }
        _userCategories = _userCategories.filter(function (c) {
            return c && typeof c.name === 'string' && Array.isArray(c.moves);
        });
    }

    function _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_userCategories)); }
        catch (e) { console.warn('[MoveCategories] localStorage write failed:', e); }
        if (typeof _onChange === 'function') _onChange(_getAll());
    }

    function _uid() {
        return 'mc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    // ---- Merging & Accessors ------------------------------------------------

    function _isDefaultId(id) {
        for (var i = 0; i < DEFAULT_MOVE_CATEGORIES.length; i++) {
            if (DEFAULT_MOVE_CATEGORIES[i].id === id) return true;
        }
        return false;
    }

    function _getDefaultCategory(id) {
        for (var i = 0; i < DEFAULT_MOVE_CATEGORIES.length; i++) {
            if (DEFAULT_MOVE_CATEGORIES[i].id === id) {
                var d = DEFAULT_MOVE_CATEGORIES[i];
                return {
                    id: d.id,
                    name: d.name,
                    moves: d.moves.slice(),
                    isDefault: true,
                    isOverridden: false
                };
            }
        }
        return null;
    }

    function _getAll() {
        var result = [];
        var matchedUserIds = Object.create(null);

        // 1. Process default categories in their defined order
        for (var i = 0; i < DEFAULT_MOVE_CATEGORIES.length; i++) {
            var def = DEFAULT_MOVE_CATEGORIES[i];
            var override = null;

            // Check if user has an override matching ID or matching case-insensitive name
            for (var u = 0; u < _userCategories.length; u++) {
                var uc = _userCategories[u];
                if (uc.id === def.id || (uc.name && uc.name.trim().toLowerCase() === def.name.toLowerCase())) {
                    override = uc;
                    matchedUserIds[uc.id] = true;
                    break;
                }
            }

            if (override) {
                result.push({
                    id: def.id,
                    name: override.name,
                    moves: override.moves.slice(),
                    isDefault: true,
                    isOverridden: true
                });
            } else {
                result.push({
                    id: def.id,
                    name: def.name,
                    moves: def.moves.slice(),
                    isDefault: true,
                    isOverridden: false
                });
            }
        }

        // 2. Append remaining user-defined categories
        for (var j = 0; j < _userCategories.length; j++) {
            var userCat = _userCategories[j];
            if (!matchedUserIds[userCat.id]) {
                result.push({
                    id: userCat.id,
                    name: userCat.name,
                    moves: userCat.moves.slice(),
                    isDefault: false,
                    isOverridden: false
                });
            }
        }

        return result;
    }

    function _getById(id) {
        var all = _getAll();
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === id) return all[i];
        }
        return null;
    }

    // ---- CRUD ---------------------------------------------------------------

    function _createUserCategory(name, moves) {
        var cat = { id: _uid(), name: name.trim(), moves: moves.slice(), isDefault: false };
        _userCategories.push(cat);
        _save();
        return cat;
    }

    function _updateUserCategory(id, name, moves) {
        for (var i = 0; i < _userCategories.length; i++) {
            if (_userCategories[i].id === id) {
                _userCategories[i].name = name.trim();
                _userCategories[i].moves = moves.slice();
                _save();
                return true;
            }
        }
        return false;
    }

    function _saveDefaultOverride(defaultId, name, moves) {
        var found = false;
        var def = _getDefaultCategory(defaultId);
        for (var i = 0; i < _userCategories.length; i++) {
            var uc = _userCategories[i];
            if (uc.id === defaultId || (def && uc.name && uc.name.trim().toLowerCase() === def.name.toLowerCase())) {
                uc.id = defaultId;
                uc.name = name.trim();
                uc.moves = moves.slice();
                uc.isDefault = true;
                found = true;
                break;
            }
        }
        if (!found) {
            _userCategories.push({
                id: defaultId,
                name: name.trim(),
                moves: moves.slice(),
                isDefault: true
            });
        }
        _save();
    }

    function _restoreDefault(defaultId) {
        var def = _getDefaultCategory(defaultId);
        if (!def) return false;
        var filtered = [];
        for (var i = 0; i < _userCategories.length; i++) {
            var uc = _userCategories[i];
            if (uc.id === defaultId || (uc.name && uc.name.trim().toLowerCase() === def.name.toLowerCase())) {
                continue; // drop override
            }
            filtered.push(uc);
        }
        _userCategories = filtered;
        _save();
        return true;
    }

    function _deleteUserCategory(id) {
        var idx = -1;
        for (var i = 0; i < _userCategories.length; i++) {
            if (_userCategories[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return false;
        _userCategories.splice(idx, 1);
        _save();
        return true;
    }

    // ---- Modal DOM ----------------------------------------------------------

    var _modalEl   = null;
    var _editingId = null;

    function _buildModal() {
        if (_modalEl) return;
        _modalEl = document.createElement('div');
        _modalEl.id = 'mc-modal-overlay';
        _modalEl.setAttribute('role', 'dialog');
        _modalEl.setAttribute('aria-modal', 'true');
        _modalEl.setAttribute('aria-labelledby', 'mc-modal-title');
        _modalEl.setAttribute('hidden', '');

        _modalEl.innerHTML =
            '<div id="mc-modal" role="document">' +
              '<div id="mc-modal-header">' +
                '<h2 id="mc-modal-title">Move Categories</h2>' +
                '<button type="button" id="mc-modal-close" aria-label="Close">&#x2715;</button>' +
              '</div>' +
              '<div id="mc-modal-body">' +
                '<div id="mc-list-panel" class="mc-list-panel">' +
                  '<div class="mc-sidebar-header">' +
                    '<button type="button" id="mc-btn-new" class="btn btn-primary mc-btn-new">+ New Category</button>' +
                  '</div>' +
                  '<div id="mc-category-list" class="mc-category-list" role="listbox" aria-label="Move categories"></div>' +
                '</div>' +
                '<div id="mc-editor-panel">' +
                  '<p id="mc-editor-placeholder" class="mc-empty-msg">Select a category to edit,<br>or create a new one.</p>' +
                  '<div id="mc-editor-form" hidden>' +
                    '<label class="mc-field-label" for="mc-cat-name">Category name</label>' +
                    '<input id="mc-cat-name" class="mc-text-input" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="e.g. Hazards">' +
                    '<label class="mc-field-label" for="mc-moves-input">Moves <span class="mc-label-hint">(one per line)</span></label>' +
                    '<textarea id="mc-moves-input" class="mc-textarea" rows="10" placeholder="Stealth Rock&#10;Spikes&#10;Toxic Spikes"></textarea>' +
                    '<div id="mc-editor-actions">' +
                      '<button type="button" id="mc-save-btn"    class="mc-btn mc-btn-primary">Save</button>' +
                      '<button type="button" id="mc-cancel-btn"  class="mc-btn">Cancel</button>' +
                      '<button type="button" id="mc-restore-btn" class="mc-btn mc-btn-warning" hidden title="Restore built-in default moves">Restore Default</button>' +
                      '<button type="button" id="mc-delete-btn"  class="mc-btn mc-btn-danger" hidden>Delete</button>' +
                    '</div>' +
                    '<p id="mc-error-msg" class="mc-error-msg" hidden></p>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';

        document.body.appendChild(_modalEl);

        document.getElementById('mc-modal-close').addEventListener('click', _closeModal);
        var newBtn = document.getElementById('mc-btn-new');
        if (newBtn) newBtn.addEventListener('click', _onNewClick);
        document.getElementById('mc-save-btn').addEventListener('click',    _onSaveClick);
        document.getElementById('mc-cancel-btn').addEventListener('click',  _onCancelClick);
        document.getElementById('mc-restore-btn').addEventListener('click', _onRestoreClick);
        document.getElementById('mc-delete-btn').addEventListener('click',  _onDeleteClick);

        _modalEl.addEventListener('mousedown', function (e) {
            if (e.target === _modalEl) _closeModal();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !_modalEl.hasAttribute('hidden')) _closeModal();
        });
    }

    // ---- Open / close -------------------------------------------------------

    function _openModal() {
        _buildModal();
        _editingId = null;
        _renderList();
        _showEditorPlaceholder();
        _modalEl.removeAttribute('hidden');
        setTimeout(function () {
            var el = document.getElementById('mc-modal-close');
            if (el) el.focus();
        }, 50);
    }

    function _closeModal() {
        if (_modalEl) _modalEl.setAttribute('hidden', '');
        var btn = document.getElementById('header-categories-button');
        if (btn) btn.focus();
        _notifyMoveSearch();
    }

    function _notifyMoveSearch() {
        if (typeof window.MoveSearch !== 'undefined' &&
            typeof window.MoveSearch.refreshCategoryPicker === 'function') {
            window.MoveSearch.refreshCategoryPicker();
        }
    }

    // ---- List ---------------------------------------------------------------

    function _renderList() {
        var list = document.getElementById('mc-category-list');
        if (!list) return;
        list.innerHTML = '';
        var allCats = _getAll();
        if (!allCats.length) {
            var empty = document.createElement('p');
            empty.id = 'mc-list-empty';
            empty.className = 'mc-empty-msg';
            empty.innerHTML = 'No categories yet.<br>Click <strong>+ New Category</strong> to create one.';
            list.appendChild(empty);
            return;
        }

        for (var i = 0; i < allCats.length; i++) {
            (function (cat) {
                var li = document.createElement('li');
                li.className = 'mc-list-item';
                li.setAttribute('role', 'option');
                li.setAttribute('data-catid', cat.id);
                li.tabIndex = 0;

                var ns = document.createElement('span');
                ns.className = 'mc-list-item-name';

                var nameText = document.createElement('span');
                nameText.className = 'mc-name-text';
                nameText.textContent = cat.name;
                ns.appendChild(nameText);

                if (cat.isDefault) {
                    var bDef = document.createElement('span');
                    bDef.className = 'mc-badge mc-badge-default';
                    bDef.textContent = 'Built-in';
                    bDef.title = 'Default built-in category';
                    ns.appendChild(bDef);

                    if (cat.isOverridden) {
                        var bMod = document.createElement('span');
                        bMod.className = 'mc-badge mc-badge-modified';
                        bMod.textContent = 'Modified';
                        bMod.title = 'Customized locally in browser';
                        ns.appendChild(bMod);
                    }
                }

                var cs = document.createElement('span');
                cs.className = 'mc-list-item-count';
                cs.textContent = cat.moves.length + ' move' + (cat.moves.length !== 1 ? 's' : '');

                li.appendChild(ns);
                li.appendChild(cs);
                li.addEventListener('click', function () { _openEditor(cat.id); });
                li.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { _openEditor(cat.id); e.preventDefault(); }
                });
                if (_editingId === cat.id) li.classList.add('mc-list-item-active');
                list.appendChild(li);
            })(allCats[i]);
        }
    }

    // ---- Editor -------------------------------------------------------------

    function _showEditorPlaceholder() {
        var ph   = document.getElementById('mc-editor-placeholder');
        var form = document.getElementById('mc-editor-form');
        if (ph)   ph.removeAttribute('hidden');
        if (form) form.setAttribute('hidden', '');
    }

    function _openEditor(id) {
        _editingId = id;
        var cat = id ? _getById(id) : null;

        var form       = document.getElementById('mc-editor-form');
        var ph         = document.getElementById('mc-editor-placeholder');
        var nameInput  = document.getElementById('mc-cat-name');
        var movesTA    = document.getElementById('mc-moves-input');
        var delBtn     = document.getElementById('mc-delete-btn');
        var restoreBtn = document.getElementById('mc-restore-btn');
        var errMsg     = document.getElementById('mc-error-msg');

        if (ph)     ph.setAttribute('hidden', '');
        if (form)   form.removeAttribute('hidden');
        if (errMsg) errMsg.setAttribute('hidden', '');

        if (cat) {
            nameInput.value = cat.name;
            movesTA.value   = cat.moves.join('\n');

            if (cat.isDefault) {
                if (delBtn) delBtn.setAttribute('hidden', '');
                if (restoreBtn) {
                    if (cat.isOverridden) {
                        restoreBtn.removeAttribute('hidden');
                    } else {
                        restoreBtn.setAttribute('hidden', '');
                    }
                }
            } else {
                if (delBtn) delBtn.removeAttribute('hidden');
                if (restoreBtn) restoreBtn.setAttribute('hidden', '');
            }
        } else {
            nameInput.value = '';
            movesTA.value   = '';
            if (delBtn) delBtn.setAttribute('hidden', '');
            if (restoreBtn) restoreBtn.setAttribute('hidden', '');
        }
        _renderList();
        if (nameInput) nameInput.focus();
    }

    function _onNewClick()    { _editingId = null; _openEditor(null); }
    function _onCancelClick() { _editingId = null; _renderList(); _showEditorPlaceholder(); }

    function _onSaveClick() {
        var nameInput = document.getElementById('mc-cat-name');
        var movesTA   = document.getElementById('mc-moves-input');
        var name      = (nameInput.value || '').trim();
        var lines     = (movesTA.value || '').split('\n');
        var moves     = [];
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].trim();
            if (m) moves.push(m);
        }
        if (!name)         { _showError('Please enter a category name.'); nameInput.focus(); return; }
        if (!moves.length) { _showError('Please add at least one move.'); movesTA.focus();   return; }

        if (_editingId) {
            if (_isDefaultId(_editingId)) {
                _saveDefaultOverride(_editingId, name, moves);
            } else {
                _updateUserCategory(_editingId, name, moves);
            }
        } else {
            var matchedDef = null;
            for (var d = 0; d < DEFAULT_MOVE_CATEGORIES.length; d++) {
                if (DEFAULT_MOVE_CATEGORIES[d].name.toLowerCase() === name.toLowerCase()) {
                    matchedDef = DEFAULT_MOVE_CATEGORIES[d];
                    break;
                }
            }
            if (matchedDef) {
                _saveDefaultOverride(matchedDef.id, name, moves);
                _editingId = matchedDef.id;
            } else {
                var created = _createUserCategory(name, moves);
                _editingId = created.id;
            }
        }
        _renderList();
        _showEditorPlaceholder();
        _editingId = null;
        _notifyMoveSearch();
    }

    function _onRestoreClick() {
        if (!_editingId || !_isDefaultId(_editingId)) return;
        var def = _getDefaultCategory(_editingId);
        if (!def) return;
        if (!confirm('Restore "' + def.name + '" to its default built-in moves?')) return;
        _restoreDefault(_editingId);
        _renderList();
        _openEditor(_editingId);
        _notifyMoveSearch();
    }

    function _onDeleteClick() {
        if (!_editingId || _isDefaultId(_editingId)) return;
        var cat = _getById(_editingId);
        if (!cat) return;
        if (!confirm('Delete category "' + cat.name + '"? This cannot be undone.')) return;
        _deleteUserCategory(_editingId);
        _editingId = null;
        _renderList();
        _showEditorPlaceholder();
        _notifyMoveSearch();
    }

    function _showError(msg) {
        var el = document.getElementById('mc-error-msg');
        if (!el) return;
        el.textContent = msg;
        el.removeAttribute('hidden');
    }

    // ---- Nav button ---------------------------------------------------------

    function _injectNavButton() {
        var btn = document.getElementById('header-categories-button');
        if (!btn) {
            var tabGroup = document.querySelector('.app-header-tabs');
            if (!tabGroup) return;
            btn = document.createElement('button');
            btn.type      = 'button';
            btn.className = 'btn btn-small app-header-tab';
            btn.id        = 'header-categories-button';
            tabGroup.appendChild(btn);
        }
        btn.title     = 'Manage custom move categories';
        btn.innerHTML = 'Move<br>Categories';
        btn.onclick   = _openModal;
    }

    // ---- Init ---------------------------------------------------------------

    function init() {
        _load();
        _injectNavButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ---- Public API ---------------------------------------------------------
    window.MoveCategories = {
        getAll:            _getAll,
        getAllCategories:  _getAll,
        getById:           _getById,
        getDefaults:       function () { return DEFAULT_MOVE_CATEGORIES.slice(); },
        restoreDefault:    _restoreDefault,
        openManager:       _openModal,
        get onCategoriesChange() { return _onChange; },
        set onCategoriesChange(fn) { _onChange = fn; }
    };

})();
