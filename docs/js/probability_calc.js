/**
 * probability_calc.js
 * Probability Calculator - math engine
 *
 * Faithful JavaScript port of Naiyo's "Calculator Probability Pokemon.py".
 *
 * Feature 1  -- Overlapping Roll Indicator (AI move-selection probabilities)
 *   computeMoveOverlapProba(rollArrays, hp)
 *     rollArrays : Array of 2-8 number[] (each move's TOTAL combined damage rolls)
 *     hp         : number|null  -- current HP target. null/undefined/0 = pure overlap.
 *                                  Positive value activates kill-priority if at
 *                                  least one roll actually reaches hp (matching Python).
 *     returns    : number[]     -- probability for each move to be selected (0-100)
 *
 * Feature 2  -- Compound KO Probability across N moves (2-7)
 *   computeMultiRollKillProba(rollArrays, hp)
 *     rollArrays : Array of 2-7 number[]
 *     hp         : number        -- target HP to reach for KO
 *     returns    : number        -- probability (0-100) that the sum >= hp
 *
 * Multi-hit moves:
 *   getFullMoveRolls(result) / flattenDamage(damage) normalises the raw result/damage
 *   value from the calc into a flat number[] of TOTAL (combined) damage rolls.
 */

(function (window) {
    'use strict';

    /* =========================================================================
     * MULTI-HIT NORMALISATION
     * ====================================================================== */

    /**
     * getFullMoveRolls(result)
     *
     * Extracts and convolves the total combined damage rolls for a move result.
     * Supports:
     *   - Case A: dmg is an array of arrays [[...], [...]] (Parental Bond, multi-hit)
     *   - Case B: dmg is an array of numbers with hits > 1 (Dual Wingbeat, Bullet Seed, etc.)
     *   - Case C: fixed damage number or [n, n] (fixed 2-hit)
     *   - Case D: standard 16-roll array
     */
    function getFullMoveRolls(result) {
        if (!result) return [];
        var dmg = (result && result.damage !== undefined) ? result.damage : result;
        if (dmg === null || dmg === undefined) return [];

        // Fixed damage single number
        if (typeof dmg === 'number') {
            return [dmg];
        }

        if (!Array.isArray(dmg) || dmg.length === 0) {
            return [];
        }

        // Case A: dmg is an array of arrays [[...], [...]]
        if (Array.isArray(dmg[0])) {
            return dmg.reduce(function (acc, hitRolls) {
                if (!acc.length) return hitRolls;
                var combined = [];
                for (var a = 0; a < acc.length; a++) {
                    for (var b = 0; b < hitRolls.length; b++) {
                        combined.push(acc[a] + hitRolls[b]);
                    }
                }
                return combined;
            }, []);
        }

        // Fixed 2-hit damage: [n, n] without multi-roll hits
        if (dmg.length === 2 && typeof dmg[0] === 'number' && typeof dmg[1] === 'number' &&
            (!result || (!result.hits && !(result.move && result.move.hits)))) {
            return [dmg[0] + dmg[1]];
        }

        // Case B: dmg is an array of numbers, but hits > 1
        var hits = 1;
        if (result && typeof result === 'object' && result.damage !== undefined) {
            hits = result.hits || (result.move && result.move.hits) || 1;
        }

        if (typeof dmg[0] === 'number') {
            if (hits > 1) {
                var combined = dmg.slice();
                for (var h = 1; h < hits; h++) {
                    var next = [];
                    for (var a = 0; a < combined.length; a++) {
                        for (var b = 0; b < dmg.length; b++) {
                            next.push(combined[a] + dmg[b]);
                        }
                    }
                    combined = next;
                }
                return combined;
            }
            return dmg.slice();
        }

        return dmg.map(Number).filter(function (v) { return !isNaN(v); });
    }

    /**
     * flattenDamage(resultOrDamage)
     * Compatibility wrapper for getFullMoveRolls. Accepts either full calc result or raw damage.
     */
    function flattenDamage(resultOrDamage) {
        if (!resultOrDamage) return [];
        if (typeof resultOrDamage === 'object' && resultOrDamage.damage !== undefined) {
            return getFullMoveRolls(resultOrDamage);
        }
        return getFullMoveRolls({ damage: resultOrDamage });
    }

    /* =========================================================================
     * FEATURE 1 - OVERLAPPING ROLL INDICATOR (2-8 moves)
     * ====================================================================== */

    /**
     * computeMoveOverlapProba(rollArrays, hp)
     *
     * Faithfully implements Naiyo's overlap2/3/4 and overlap2_kill/3_kill/4_kill combinatorial
     * rules, with exact divisor: prod(length of active non-empty roll arrays).
     *
     * Rules:
     *   - If hp > 0 AND at least one roll array has max_roll >= hp:
     *     Strict kill-priority logic. For any tuple of rolls:
     *       - Any move that reaches/exceeds hp takes priority over non-killing moves.
     *       - Ties among killing moves split points evenly (0.5 for 2-way, 1/3 for 3-way, 0.25 for 4-way, etc.).
     *       - If no move kills on that tuple, falls through to highest damage roll (ties split evenly).
     *   - When no move can kill current HP (or HP is empty/null/0/full):
     *     Pure overlap logic (overlap2/3/4).
     *       - Highest roll wins; ties split evenly.
     *       - Strictly lower moves in all comparisons receive 0%.
     *
     * Uses efficient independent-event factorization to support 2 up to 8 moves without
     * browser lag, yielding identical results down to full floating-point precision.
     */
    function computeMoveOverlapProba(rollArrays, hp) {
        var k = rollArrays.length;
        if (k < 2) return [];

        // Check if any move has at least one roll >= hp to activate kill mode
        var effectiveHP = null;
        if (hp !== null && hp !== undefined && hp !== '' && +hp > 0) {
            for (var i = 0; i < k; i++) {
                var arr = rollArrays[i];
                if (arr && arr.length > 0 && arr[arr.length - 1] >= +hp) {
                    effectiveHP = +hp;
                    break;
                }
            }
        }

        var expectedPoints = new Array(k).fill(0);

        // Part A: Killing combinations (when at least one move reaches effectiveHP)
        if (effectiveHP !== null) {
            for (var m = 0; m < k; m++) {
                var arrM = rollArrays[m];
                var killCountM = 0;
                for (var r0 = 0; r0 < arrM.length; r0++) {
                    if (arrM[r0] >= effectiveHP) killCountM++;
                }
                if (killCountM === 0) continue;
                var p_kill_m = killCountM / arrM.length;

                // DP over other moves to find distribution of number of other killers
                var dp = [1];
                for (var j = 0; j < k; j++) {
                    if (j === m) continue;
                    var arrJ = rollArrays[j];
                    var cKillJ = 0;
                    for (var rj = 0; rj < arrJ.length; rj++) {
                        if (arrJ[rj] >= effectiveHP) cKillJ++;
                    }
                    var p_j = cKillJ / arrJ.length;
                    var q_j = 1 - p_j;
                    var nextDp = new Array(dp.length + 1).fill(0);
                    for (var t = 0; t < dp.length; t++) {
                        nextDp[t] += dp[t] * q_j;
                        nextDp[t + 1] += dp[t] * p_j;
                    }
                    dp = nextDp;
                }

                // If t other moves kill, total killers = t + 1, move m gets 1 / (t + 1)
                var ev_m = 0;
                for (var t0 = 0; t0 < dp.length; t0++) {
                    ev_m += dp[t0] / (t0 + 1);
                }
                expectedPoints[m] += p_kill_m * ev_m;
            }
        }

        // Part B: Non-killing combinations (all moves roll < effectiveHP)
        // If effectiveHP is null, all rolls are considered < effectiveHP.
        var uniqueValuesSet = {};
        for (var i1 = 0; i1 < k; i1++) {
            var arr1 = rollArrays[i1];
            for (var r1 = 0; r1 < arr1.length; r1++) {
                var val = arr1[r1];
                if (effectiveHP === null || val < effectiveHP) {
                    uniqueValuesSet[val] = true;
                }
            }
        }
        var sortedValues = Object.keys(uniqueValuesSet).map(Number).sort(function (a, b) { return a - b; });

        for (var m1 = 0; m1 < k; m1++) {
            var arrM1 = rollArrays[m1];
            var lenM = arrM1.length;

            for (var vi = 0; vi < sortedValues.length; vi++) {
                var v = sortedValues[vi];
                var countV = 0;
                for (var rm = 0; rm < lenM; rm++) {
                    if (arrM1[rm] === v) countV++;
                }
                if (countV === 0) continue;
                var p_m_v = countV / lenM;

                // Move m wins with roll v if all other moves roll <= v (and < effectiveHP).
                // If t other moves also roll exactly v, tie split is 1 / (t + 1).
                var dp1 = [1];
                var possible = true;
                for (var j1 = 0; j1 < k; j1++) {
                    if (j1 === m1) continue;
                    var arrJ1 = rollArrays[j1];
                    var c_less = 0, c_eq = 0;
                    for (var rj1 = 0; rj1 < arrJ1.length; rj1++) {
                        var rval = arrJ1[rj1];
                        if (rval < v) c_less++;
                        else if (rval === v) c_eq++;
                    }
                    var p_less = c_less / arrJ1.length;
                    var p_eq = c_eq / arrJ1.length;
                    if (p_less === 0 && p_eq === 0) {
                        possible = false;
                        break;
                    }
                    var nextDp1 = new Array(dp1.length + 1).fill(0);
                    for (var t1 = 0; t1 < dp1.length; t1++) {
                        nextDp1[t1] += dp1[t1] * p_less;
                        nextDp1[t1 + 1] += dp1[t1] * p_eq;
                    }
                    dp1 = nextDp1;
                }
                if (!possible) continue;

                var ev_v = 0;
                for (var t2 = 0; t2 < dp1.length; t2++) {
                    ev_v += dp1[t2] / (t2 + 1);
                }
                expectedPoints[m1] += p_m_v * ev_v;
            }
        }

        return expectedPoints.map(function (p) { return p * 100; });
    }

    /* =========================================================================
     * FEATURE 2 - COMPOUND KO PROBABILITY (2-7 moves, DP convolution)
     * ====================================================================== */

    /**
     * computeMultiRollThresholdProba(rollArrays, initialHP, minRemainingHP)
     *
     * Computes the compound probability distribution across 2-7 moves.
     * Supports both standard KO threshold and Target Remaining HP threshold.
     */
    function computeMultiRollThresholdProba(rollArrays, initialHP, minRemainingHP) {
        var k = rollArrays.length;
        if (k < 2 || k > 7) {
            throw new Error('computeMultiRollThresholdProba supports 2-7 moves, got ' + k);
        }

        var rem = (minRemainingHP !== undefined && minRemainingHP !== null) ? +minRemainingHP : 0;
        if (isNaN(rem) || rem < 0) rem = 0;

        var dp = {};
        dp['0'] = 1;
        var totalWays = 1;

        for (var mi = 0; mi < k; mi++) {
            var rolls = rollArrays[mi];
            var n = rolls.length;
            totalWays *= n;

            var next = {};
            var sums = Object.keys(dp);
            for (var si = 0; si < sums.length; si++) {
                var s = +sums[si];
                var c = dp[sums[si]];
                for (var ri = 0; ri < n; ri++) {
                    var ns = '' + (s + rolls[ri]);
                    next[ns] = (next[ns] || 0) + c;
                }
            }
            dp = next;
        }

        var maxAllowedDamage = initialHP - rem;
        var killCount = 0;
        var surviveCount = 0;
        var keys = Object.keys(dp);

        for (var ki = 0; ki < keys.length; ki++) {
            var dmgVal = +keys[ki];
            var count = dp[keys[ki]];
            if (dmgVal >= initialHP) {
                killCount += count;
            }
            if (dmgVal <= maxAllowedDamage) {
                surviveCount += count;
            }
        }

        var killProba = (killCount / totalWays) * 100;
        var surviveProba = (surviveCount / totalWays) * 100;
        var dropBelowProba = ((totalWays - surviveCount) / totalWays) * 100;

        return {
            totalWays: totalWays,
            initialHP: initialHP,
            minRemainingHP: rem,
            maxAllowedDamage: maxAllowedDamage,
            killProba: killProba,
            surviveProba: surviveProba,
            dropBelowProba: dropBelowProba
        };
    }

    /**
     * computeMultiRollKillProba(rollArrays, hp, minRemainingHP)
     *
     * Mathematically identical to Naiyo proba_2roll...proba_7roll but uses
     * DP convolution to avoid O(16^7) browser-freezing iteration.
     */
    function computeMultiRollKillProba(rollArrays, hp, minRemainingHP) {
        var res = computeMultiRollThresholdProba(rollArrays, hp, minRemainingHP);
        if (minRemainingHP !== undefined && minRemainingHP !== null && +minRemainingHP > 0) {
            return res.surviveProba;
        }
        return res.killProba;
    }

    /* =========================================================================
     * OVERLAP DETECTION
     * ====================================================================== */

    /**
     * detectOverlapOrKill(movesData, hp)
     *
     * movesData : Array<{rolls: number[], canKill: boolean}>
     * hp        : number
     *
     * Returns: {hasOverlap: boolean, hasMultiKill: boolean}
     */
    function detectOverlapOrKill(movesData, hp) {
        var i, a, b;
        var killerCount = 0;
        for (i = 0; i < movesData.length; i++) {
            if (movesData[i].canKill) killerCount++;
        }
        var hasMultiKill = killerCount >= 2;

        var maxMax = -Infinity;
        for (i = 0; i < movesData.length; i++) {
            var rolls = movesData[i].rolls;
            if (!rolls || rolls.length === 0) continue;
            var maxRoll = rolls[rolls.length - 1];
            if (maxRoll > maxMax) maxMax = maxRoll;
        }

        var atMax = 0;
        for (i = 0; i < movesData.length; i++) {
            var r = movesData[i].rolls;
            if (!r || r.length === 0) continue;
            if (r[r.length - 1] >= maxMax) atMax++;
        }
        var hasOverlap = atMax >= 2;

        if (!hasOverlap && movesData.length >= 2) {
            outer:
            for (a = 0; a < movesData.length; a++) {
                var ra = movesData[a].rolls;
                if (!ra || ra.length === 0) continue;
                var maxA = ra[ra.length - 1];
                for (b = 0; b < movesData.length; b++) {
                    if (a === b) continue;
                    var rb = movesData[b].rolls;
                    if (!rb || rb.length === 0) continue;
                    var minB = rb[0];
                    if (maxA >= minB) {
                        hasOverlap = true;
                        break outer;
                    }
                }
            }
        }

        return { hasOverlap: hasOverlap, hasMultiKill: hasMultiKill };
    }

    /* =========================================================================
     * ROLL PARSING HELPER
     * ====================================================================== */

    /**
     * parseRollString("16, 17, 18") => [16, 17, 18]
     * Returns [] for empty/invalid input.
     */
    function parseRollString(str) {
        if (!str || !str.trim()) return [];
        var parts = str.split(',');
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            var v = parseInt(parts[i].trim(), 10);
            if (!isNaN(v)) result.push(v);
        }
        return result;
    }

    /* =========================================================================
     * PUBLIC API
     * ====================================================================== */

    window.ProbabilityCalc = {
        computeMoveOverlapProba:        computeMoveOverlapProba,
        computeMultiRollKillProba:      computeMultiRollKillProba,
        computeMultiRollThresholdProba: computeMultiRollThresholdProba,
        detectOverlapOrKill:            detectOverlapOrKill,
        parseRollString:                parseRollString,
        flattenDamage:                  flattenDamage,
        getFullMoveRolls:               getFullMoveRolls
    };

})(window);