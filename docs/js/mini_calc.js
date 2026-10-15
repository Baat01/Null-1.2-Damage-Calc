/**
 * mini_calc.js
 * Embedded desktop-style mini calculator widget for Null-Damage-Calc.
 * Placed in the empty area below the opposing Pokémon panel (P2).
 *
 * Supports Light, Dark, and Original-Dark themes.
 * Keyboard accessible when focused.
 * Toggleable via the Gear Settings menu (nullCalcSettings.showMiniCalc).
 */

(function () {
    'use strict';

    var SETTINGS_KEY = 'nullCalcSettings';

    /* =========================================================================
     * Safe Expression Evaluator (Shunting-Yard Algorithm)
     * No unsafe eval() or Function() constructor used.
     * ====================================================================== */
    var SafeEvaluator = {
        evaluate: function (expr) {
            if (!expr || typeof expr !== 'string') return 0;

            // Normalize operators and decimal separator
            var sanitized = expr
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/,/g, '.')
                .trim();

            if (!sanitized) return 0;

            var tokens = [];
            var i = 0;
            var len = sanitized.length;

            while (i < len) {
                var ch = sanitized[i];

                if (ch === ' ' || ch === '\t') {
                    i++;
                    continue;
                }

                if (ch === '+' || ch === '*' || ch === '/') {
                    tokens.push({ type: 'op', val: ch });
                    i++;
                } else if (ch === '-') {
                    var prev = tokens[tokens.length - 1];
                    // Unary minus if at start or immediately after another operator
                    if (!prev || prev.type === 'op') {
                        i++;
                        var negNum = '-';
                        while (i < len && ((sanitized[i] >= '0' && sanitized[i] <= '9') || sanitized[i] === '.')) {
                            negNum += sanitized[i];
                            i++;
                        }
                        if (negNum === '-') return NaN;
                        tokens.push({ type: 'num', val: parseFloat(negNum) });
                    } else {
                        tokens.push({ type: 'op', val: '-' });
                        i++;
                    }
                } else if ((ch >= '0' && ch <= '9') || ch === '.') {
                    var numStr = '';
                    while (i < len && ((sanitized[i] >= '0' && sanitized[i] <= '9') || sanitized[i] === '.')) {
                        numStr += sanitized[i];
                        i++;
                    }
                    tokens.push({ type: 'num', val: parseFloat(numStr) });
                } else {
                    return NaN; // Unexpected character
                }
            }

            if (tokens.length === 0) return 0;

            // Infix to Postfix (RPN) via Shunting-Yard
            var precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
            var output = [];
            var ops = [];

            for (var k = 0; k < tokens.length; k++) {
                var t = tokens[k];
                if (t.type === 'num') {
                    output.push(t);
                } else if (t.type === 'op') {
                    while (
                        ops.length > 0 &&
                        precedence[ops[ops.length - 1].val] >= precedence[t.val]
                    ) {
                        output.push(ops.pop());
                    }
                    ops.push(t);
                }
            }

            while (ops.length > 0) {
                output.push(ops.pop());
            }

            // Postfix Evaluation
            var stack = [];
            for (var m = 0; m < output.length; m++) {
                var item = output[m];
                if (item.type === 'num') {
                    stack.push(item.val);
                } else if (item.type === 'op') {
                    if (stack.length < 2) return NaN;
                    var b = stack.pop();
                    var a = stack.pop();
                    var res = 0;

                    if (item.val === '+') res = a + b;
                    else if (item.val === '-') res = a - b;
                    else if (item.val === '*') res = a * b;
                    else if (item.val === '/') {
                        if (b === 0) return 'Div by 0';
                        res = a / b;
                    }
                    stack.push(res);
                }
            }

            if (stack.length !== 1) return NaN;
            var finalRes = stack[0];

            if (typeof finalRes === 'number') {
                if (isNaN(finalRes)) return 'Error';
                if (!isFinite(finalRes)) return 'Overflow';
                // Eliminate floating point representation artifacts like 0.1 + 0.2
                return Math.round(finalRes * 1e10) / 1e10;
            }

            return finalRes;
        }
    };

    /* =========================================================================
     * Calculator State
     * ====================================================================== */
    var state = {
        formula: '',        // Expression shown in upper sub-line, e.g. "125 × 0.85"
        currentEntry: '0',   // Current number being typed or evaluated result
        evaluated: false,    // Set to true immediately after '=' evaluation
        lastOperator: ''     // Last active operator
    };

    /* =========================================================================
     * Settings Storage
     * ====================================================================== */
    function getShowMiniCalcSetting() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                return parsed.showMiniCalc === true;
            }
        } catch (e) {}
        return false;
    }

    function setShowMiniCalcSetting(val) {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            var parsed = raw ? JSON.parse(raw) : {};
            parsed.showMiniCalc = !!val;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
        } catch (e) {}
    }

    /* =========================================================================
     * Calculator Actions & State Machine
     * ====================================================================== */
    function inputDigit(digit) {
        if (state.evaluated) {
            state.formula = '';
            state.currentEntry = String(digit);
            state.evaluated = false;
        } else if (state.currentEntry === '0' || state.currentEntry === '-0') {
            state.currentEntry = (state.currentEntry === '-0' ? '-' : '') + String(digit);
        } else {
            // Prevent overly long numbers that overflow screen
            if (state.currentEntry.replace(/[-.]/g, '').length < 14) {
                state.currentEntry += String(digit);
            }
        }
        updateDisplay();
    }

    function inputDecimal() {
        if (state.evaluated) {
            state.formula = '';
            state.currentEntry = '0.';
            state.evaluated = false;
        } else if (state.currentEntry.indexOf('.') === -1) {
            state.currentEntry += '.';
        }
        updateDisplay();
    }

    function toggleSign() {
        if (state.currentEntry === '0' || state.currentEntry === '0.') return;
        if (state.currentEntry.startsWith('-')) {
            state.currentEntry = state.currentEntry.slice(1);
        } else {
            state.currentEntry = '-' + state.currentEntry;
        }
        updateDisplay();
    }

    function inputPercent() {
        var val = parseFloat(state.currentEntry);
        if (isNaN(val)) return;

        // If part of an addition/subtraction (e.g. 100 + 20%), compute 20% of 100 = 20
        var opMatch = state.formula.trim().match(/([+\-×÷*\/])\s*$/);
        if (opMatch && (opMatch[1] === '+' || opMatch[1] === '-')) {
            var prevExpr = state.formula.slice(0, state.formula.lastIndexOf(opMatch[1]));
            var baseVal = SafeEvaluator.evaluate(prevExpr);
            if (typeof baseVal === 'number' && !isNaN(baseVal)) {
                val = Math.round((baseVal * (val / 100)) * 1e10) / 1e10;
                state.currentEntry = String(val);
                updateDisplay();
                return;
            }
        }

        // Standard percent: divide by 100
        val = Math.round((val / 100) * 1e10) / 1e10;
        state.currentEntry = String(val);
        updateDisplay();
    }

    function handleOperator(op) {
        var displayOp = (op === '*' || op === '×') ? '×' : (op === '/' || op === '÷') ? '÷' : op;

        if (state.evaluated) {
            state.formula = state.currentEntry + ' ' + displayOp + ' ';
            state.currentEntry = '0';
            state.evaluated = false;
        } else if (state.formula && state.currentEntry === '0' && state.formula.trim().match(/[+\-×÷]$/)) {
            // Replace previous operator if entry hasn't been modified
            state.formula = state.formula.trim().slice(0, -1) + displayOp + ' ';
        } else {
            state.formula += state.currentEntry + ' ' + displayOp + ' ';
            state.currentEntry = '0';
        }

        state.lastOperator = displayOp;
        updateDisplay();
    }

    function evaluateResult() {
        if (!state.formula && !state.evaluated) return;

        var fullExpr = state.formula + state.currentEntry;
        var result = SafeEvaluator.evaluate(fullExpr);

        state.formula = fullExpr + ' =';
        state.currentEntry = String(result);
        state.evaluated = true;
        updateDisplay();
    }

    function clearAll() {
        state.formula = '';
        state.currentEntry = '0';
        state.evaluated = false;
        state.lastOperator = '';
        updateDisplay();
    }

    function clearEntry() {
        state.currentEntry = '0';
        if (state.evaluated) {
            state.formula = '';
            state.evaluated = false;
        }
        updateDisplay();
    }

    function backspace() {
        if (state.evaluated) {
            clearAll();
            return;
        }
        if (state.currentEntry.length > 1) {
            if (state.currentEntry.length === 2 && state.currentEntry.startsWith('-')) {
                state.currentEntry = '0';
            } else {
                state.currentEntry = state.currentEntry.slice(0, -1);
            }
        } else {
            state.currentEntry = '0';
        }
        updateDisplay();
    }

    /* =========================================================================
     * UI Rendering & DOM Binding
     * ====================================================================== */
    var formulaEl, displayEl, containerEl, copyTooltipEl;

    function formatNumberForDisplay(str) {
        if (str === 'Error' || str === 'Div by 0' || str === 'Overflow') return str;
        // Keep trailing decimals intact while user is typing (e.g. "12.")
        if (str.endsWith('.')) return str;
        var parts = str.split('.');
        var integerPart = parts[0];
        // Format thousands separator
        var formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        if (parts.length > 1) {
            return formattedInt + '.' + parts[1];
        }
        return formattedInt;
    }

    function updateDisplay() {
        if (formulaEl) {
            formulaEl.textContent = state.formula;
        }
        if (displayEl) {
            displayEl.textContent = formatNumberForDisplay(state.currentEntry);
        }
    }

    function copyResultToClipboard() {
        var textToCopy = state.currentEntry;
        if (!textToCopy || textToCopy === 'Error' || textToCopy === 'Div by 0') return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(function () {
                showCopyTooltip();
            });
        } else {
            var temp = document.createElement('textarea');
            temp.value = textToCopy;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            showCopyTooltip();
        }
    }

    function showCopyTooltip() {
        if (!copyTooltipEl) return;
        copyTooltipEl.classList.add('mini-calc-tooltip--visible');
        setTimeout(function () {
            copyTooltipEl.classList.remove('mini-calc-tooltip--visible');
        }, 1500);
    }

    /* =========================================================================
     * DOM Construction
     * ====================================================================== */
    function injectMiniCalcDOM() {
        // Find or create #mini-calc-container
        containerEl = document.getElementById('mini-calc-container');
        if (!containerEl) {
            containerEl = document.createElement('fieldset');
            containerEl.id = 'mini-calc-container';
            containerEl.className = 'mini-calc-box';
            containerEl.setAttribute('tabindex', '0');
            containerEl.setAttribute('aria-label', 'Mini Calculator');
            containerEl.setAttribute('role', 'region');

            // Find placement: directly below .opposing-team-box or right panel
            var opposingBox = document.querySelector('.opposing-team-box');
            if (opposingBox && opposingBox.parentNode) {
                opposingBox.parentNode.insertBefore(containerEl, opposingBox.nextSibling);
            } else {
                var p2 = document.getElementById('p2');
                if (p2 && p2.parentNode) {
                    p2.parentNode.appendChild(containerEl);
                }
            }
        }

        // Apply visibility
        var isVisible = getShowMiniCalcSetting();
        containerEl.classList.toggle('mini-calc--hidden', !isVisible);

        // Render widget inner HTML
        containerEl.innerHTML = [
            '<legend align="center" class="mini-calc-legend">Mini Calculatrice / Calculator</legend>',
            '<div class="mini-calc-screen" id="mini-calc-screen" title="Click to copy result">',
            '  <div class="mini-calc-formula" id="mini-calc-formula"></div>',
            '  <div class="mini-calc-display-wrap">',
            '    <div class="mini-calc-display" id="mini-calc-display">0</div>',
            '    <span class="mini-calc-tooltip" id="mini-calc-copy-tooltip">Copied!</span>',
            '  </div>',
            '</div>',
            '<div class="mini-calc-grid">',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--clear" data-action="C" title="Clear All (Escape)">C</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--clear" data-action="CE" title="Clear Entry (Delete)">CE</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--clear" data-action="backspace" title="Backspace (⌫)">⌫</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--op" data-action="percent" title="Percentage (%)">%</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="7">7</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="8">8</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="9">9</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--op" data-action="op" data-val="÷" title="Divide (/)">÷</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="4">4</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="5">5</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="6">6</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--op" data-action="op" data-val="×" title="Multiply (*)">×</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="1">1</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="2">2</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="3">3</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--op" data-action="op" data-val="-" title="Subtract (-)">-</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="sign" title="Negate (±)">±</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="digit" data-val="0">0</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--num" data-action="decimal" title="Decimal point (.)">.</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--op" data-action="op" data-val="+" title="Add (+)">+</button>',
            '  <button type="button" class="mini-calc-btn mini-calc-btn--equals" data-action="equals" title="Calculate (Enter / =)">=</button>',
            '</div>'
        ].join('');

        formulaEl = document.getElementById('mini-calc-formula');
        displayEl = document.getElementById('mini-calc-display');
        copyTooltipEl = document.getElementById('mini-calc-copy-tooltip');

        // Click-to-copy screen listener
        var screenEl = document.getElementById('mini-calc-screen');
        if (screenEl) {
            screenEl.addEventListener('click', function () {
                copyResultToClipboard();
            });
        }

        // Button clicks delegation
        var gridEl = containerEl.querySelector('.mini-calc-grid');
        if (gridEl) {
            gridEl.addEventListener('click', function (e) {
                var btn = e.target.closest('.mini-calc-btn');
                if (!btn) return;

                var action = btn.getAttribute('data-action');
                var val = btn.getAttribute('data-val');

                if (action === 'digit') {
                    inputDigit(val);
                } else if (action === 'decimal') {
                    inputDecimal();
                } else if (action === 'sign') {
                    toggleSign();
                } else if (action === 'percent') {
                    inputPercent();
                } else if (action === 'op') {
                    handleOperator(val);
                } else if (action === 'equals') {
                    evaluateResult();
                } else if (action === 'C') {
                    clearAll();
                } else if (action === 'CE') {
                    clearEntry();
                } else if (action === 'backspace') {
                    backspace();
                }
            });
        }

        // Keyboard navigation when calculator container or its children have focus
        containerEl.addEventListener('keydown', function (e) {
            var key = e.key;

            if (key >= '0' && key <= '9') {
                e.preventDefault();
                inputDigit(key);
            } else if (key === '.' || key === ',') {
                e.preventDefault();
                inputDecimal();
            } else if (key === '+' || key === '-' || key === '*' || key === '/') {
                e.preventDefault();
                handleOperator(key);
            } else if (key === 'Enter' || key === '=') {
                e.preventDefault();
                evaluateResult();
            } else if (key === 'Backspace') {
                e.preventDefault();
                backspace();
            } else if (key === 'Escape') {
                e.preventDefault();
                clearAll();
            } else if (key === 'Delete') {
                e.preventDefault();
                clearEntry();
            } else if (key === '%') {
                e.preventDefault();
                inputPercent();
            }
        });

        updateDisplay();
    }

    /* =========================================================================
     * Settings Menu Hook (Gear Menu ⚙️)
     * ====================================================================== */
    function injectSettingsToggle() {
        var panel = document.getElementById('app-menu-panel');
        if (!panel) return;

        var existingCb = document.getElementById('setting-toggle-mini-calc');
        if (existingCb) {
            existingCb.checked = getShowMiniCalcSetting();
            existingCb.addEventListener('change', function () {
                var isChecked = existingCb.checked;
                setShowMiniCalcSetting(isChecked);
                if (containerEl) {
                    containerEl.classList.toggle('mini-calc--hidden', !isChecked);
                }
            });
            return;
        }

        // Locate insertion point: under "Null Features / Affichage" header
        var headers = panel.querySelectorAll('.app-menu-section-header');
        var insertBefore = null;
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].textContent.indexOf('Null Features') !== -1) {
                // Find next section header or append at end of this section
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
            '<span class="app-menu-row-label">Mini Calculatrice / Mini Calculator</span>',
            '<span class="app-menu-toggle">',
            '  <input type="checkbox" id="setting-toggle-mini-calc" class="app-menu-toggle-input" role="switch" />',
            '  <span class="app-menu-toggle-track" aria-hidden="true"></span>',
            '</span>'
        ].join('');

        if (insertBefore && insertBefore.parentNode === panel) {
            panel.insertBefore(label, insertBefore);
        } else {
            panel.appendChild(label);
        }

        var cb = document.getElementById('setting-toggle-mini-calc');
        if (cb) {
            cb.checked = getShowMiniCalcSetting();
            cb.addEventListener('change', function () {
                var isChecked = cb.checked;
                setShowMiniCalcSetting(isChecked);
                if (containerEl) {
                    containerEl.classList.toggle('mini-calc--hidden', !isChecked);
                }
            });
        }
    }

    /* =========================================================================
     * Initialization
     * ====================================================================== */
    function init() {
        injectMiniCalcDOM();
        injectSettingsToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for testing and external access
    window.MiniCalc = {
        state: state,
        SafeEvaluator: SafeEvaluator,
        evaluate: function (expr) { return SafeEvaluator.evaluate(expr); },
        inputDigit: inputDigit,
        inputDecimal: inputDecimal,
        handleOperator: handleOperator,
        evaluateResult: evaluateResult,
        clearAll: clearAll,
        getShowMiniCalcSetting: getShowMiniCalcSetting,
        setShowMiniCalcSetting: function (val) {
            setShowMiniCalcSetting(val);
            if (containerEl) containerEl.classList.toggle('mini-calc--hidden', !val);
            var cb = document.getElementById('setting-toggle-mini-calc');
            if (cb) cb.checked = !!val;
        }
    };
})();
