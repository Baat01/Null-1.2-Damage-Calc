/**
 * move_categories.js — Custom Move Categories (Move Tags / Bundles)
 *
 * Allows users to create, edit, and delete named groups of moves (e.g.
 * "Hazards", "Setup", "Priority"). Categories are persisted in localStorage
 * and can be selected in the move filter to highlight box Pokemon.
 *
 * Public API: window.MoveCategories
 *   .getAll()              -> Array of { id, name, moves[] }
 *   .getById(id)           -> single category or null
 *   .openManager()         -> open the CRUD modal
 *   .onCategoriesChange    -> assign a callback(categories) for external listeners
 */

(function () {
    'use strict';

    var STORAGE_KEY = 'customMoveCategories';
    var _categories = [];
    var _onChange = null;

    // ---- Persistence --------------------------------------------------------

    function _load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) _categories = JSON.parse(raw) || [];
        } catch (e) { _categories = []; }
        _categories = _categories.filter(function (c) {
            return c && typeof c.name === 'string' && Array.isArray(c.moves);
        });
    }

    function _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_categories)); }
        catch (e) { console.warn('[MoveCategories] localStorage write failed:', e); }
        if (typeof _onChange === 'function') _onChange(_categories.slice());
    }

    function _uid() {
        return 'mc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    // ---- CRUD ---------------------------------------------------------------

    function _getAll() { return _categories.slice(); }

    function _getById(id) {
        for (var i = 0; i < _categories.length; i++) {
            if (_categories[i].id === id) return _categories[i];
        }
        return null;
    }

    function _create(name, moves) {
        var cat = { id: _uid(), name: name.trim(), moves: moves.slice() };
        _categories.push(cat);
        _save();
        return cat;
    }

    function _update(id, name, moves) {
        var cat = _getById(id);
        if (!cat) return false;
        cat.name = name.trim();
        cat.moves = moves.slice();
        _save();
        return true;
    }

    function _delete(id) {
        var idx = -1;
        for (var i = 0; i < _categories.length; i++) {
            if (_categories[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return false;
        _categories.splice(idx, 1);
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
                '<h2 id="mc-modal-title">&#127991; Move Categories</h2>' +
                '<button type="button" id="mc-modal-close" aria-label="Close">&#x2715;</button>' +
              '</div>' +
              '<div id="mc-modal-body">' +
                '<div id="mc-list-panel">' +
                  '<div id="mc-list-header">' +
                    '<span class="mc-list-title">Your categories</span>' +
                    '<button type="button" id="mc-new-btn" class="mc-btn mc-btn-primary">+ New</button>' +
                  '</div>' +
                  '<ul id="mc-category-list" role="listbox" aria-label="Move categories"></ul>' +
                  '<p id="mc-list-empty" class="mc-empty-msg">No categories yet.<br>Click <strong>+ New</strong> to create one.</p>' +
                '</div>' +
                '<div id="mc-editor-panel">' +
                  '<p id="mc-editor-placeholder" class="mc-empty-msg">Select a category to edit,<br>or create a new one.</p>' +
                  '<div id="mc-editor-form" hidden>' +
                    '<label class="mc-field-label" for="mc-cat-name">Category name</label>' +
                    '<input id="mc-cat-name" class="mc-text-input" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="e.g. Hazards">' +
                    '<label class="mc-field-label" for="mc-moves-input">Moves <span class="mc-label-hint">(one per line)</span></label>' +
                    '<textarea id="mc-moves-input" class="mc-textarea" rows="10" placeholder="Stealth Rock&#10;Spikes&#10;Toxic Spikes"></textarea>' +
                    '<div id="mc-editor-actions">' +
                      '<button type="button" id="mc-save-btn"   class="mc-btn mc-btn-primary">Save</button>' +
                      '<button type="button" id="mc-cancel-btn" class="mc-btn">Cancel</button>' +
                      '<button type="button" id="mc-delete-btn" class="mc-btn mc-btn-danger" hidden>Delete</button>' +
                    '</div>' +
                    '<p id="mc-error-msg" class="mc-error-msg" hidden></p>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';

        document.body.appendChild(_modalEl);

        document.getElementById('mc-modal-close').addEventListener('click', _closeModal);
        document.getElementById('mc-new-btn').addEventListener('click',     _onNewClick);
        document.getElementById('mc-save-btn').addEventListener('click',    _onSaveClick);
        document.getElementById('mc-cancel-btn').addEventListener('click',  _onCancelClick);
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
        var list  = document.getElementById('mc-category-list');
        var empty = document.getElementById('mc-list-empty');
        if (!list) return;
        list.innerHTML = '';
        if (!_categories.length) {
            if (empty) empty.removeAttribute('hidden');
            return;
        }
        if (empty) empty.setAttribute('hidden', '');

        for (var i = 0; i < _categories.length; i++) {
            (function (cat) {
                var li = document.createElement('li');
                li.className = 'mc-list-item';
                li.setAttribute('role', 'option');
                li.setAttribute('data-catid', cat.id);
                li.tabIndex = 0;

                var ns = document.createElement('span');
                ns.className = 'mc-list-item-name';
                ns.textContent = cat.name;

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
            })(_categories[i]);
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

        var form      = document.getElementById('mc-editor-form');
        var ph        = document.getElementById('mc-editor-placeholder');
        var nameInput = document.getElementById('mc-cat-name');
        var movesTA   = document.getElementById('mc-moves-input');
        var delBtn    = document.getElementById('mc-delete-btn');
        var errMsg    = document.getElementById('mc-error-msg');

        if (ph)     ph.setAttribute('hidden', '');
        if (form)   form.removeAttribute('hidden');
        if (errMsg) errMsg.setAttribute('hidden', '');

        if (cat) {
            nameInput.value = cat.name;
            movesTA.value   = cat.moves.join('\n');
            if (delBtn) delBtn.removeAttribute('hidden');
        } else {
            nameInput.value = '';
            movesTA.value   = '';
            if (delBtn) delBtn.setAttribute('hidden', '');
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
            _update(_editingId, name, moves);
        } else {
            var created = _create(name, moves);
            _editingId = created.id;
        }
        _renderList();
        _showEditorPlaceholder();
        _editingId = null;
        _notifyMoveSearch();
    }

    function _onDeleteClick() {
        if (!_editingId) return;
        var cat = _getById(_editingId);
        if (!cat) return;
        if (!confirm('Delete category "' + cat.name + '"? This cannot be undone.')) return;
        _delete(_editingId);
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
        if (document.getElementById('header-categories-button')) return;
        var tabGroup = document.querySelector('.app-header-tabs');
        if (!tabGroup) return;

        var btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'btn btn-small app-header-tab';
        btn.id        = 'header-categories-button';
        btn.title     = 'Manage custom move categories';
        btn.innerHTML = '&#127991; Move Categories';
        btn.addEventListener('click', _openModal);
        tabGroup.appendChild(btn);
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
        getAll:      _getAll,
        getById:     _getById,
        openManager: _openModal,
        get onCategoriesChange() { return _onChange; },
        set onCategoriesChange(fn) { _onChange = fn; }
    };

})();
