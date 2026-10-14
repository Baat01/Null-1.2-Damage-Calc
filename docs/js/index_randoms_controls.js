$("#p2 .ability").bind("keyup change", function () {
	autosetWeather($(this).val(), 1);
	autosetTerrain($(this).val(), 1);
});

$("#p2 .item").bind("keyup change", function () {
	autosetStatus("#p2", $(this).val());
});

lastManualStatus["#p2"] = "Healthy";
lastAutoStatus["#p1"] = "Healthy";

var resultLocations = [[], []];
for (var i = 0; i < 8; i++) {
	resultLocations[0].push({
		"move": "#resultMoveL" + (i + 1),
		"damage": "#resultDamageL" + (i + 1)
	});
	resultLocations[1].push({
		"move": "#resultMoveR" + (i + 1),
		"damage": "#resultDamageR" + (i + 1)
	});
}

var damageResults;

/** Same markup as emi.dev ck+ display.js (speed-indicator + speed-faster | speed-tied | speed-slower). */
function updateSpeedTierIcons(p1spe, p2spe) {
	var p1kind = p1spe > p2spe ? "F" : p1spe < p2spe ? "S" : "T";
	var p2kind = p2spe > p1spe ? "F" : p2spe < p1spe ? "S" : "T";
	var labels = { F: "Faster than opponent", T: "Speed tie", S: "Slower than opponent" };
	function apply($panel, kind) {
		var $m = $panel.find(".sp .speed-indicator");
		if (!$m.length) return;
		if (kind === "F") {
			$m.html('<div class="speed-faster">&laquo;</div>');
		} else if (kind === "S") {
			$m.html('<div class="speed-slower">&laquo;</div>');
		} else {
			$m.html('<div class="speed-tied">-</div>');
		}
		$m.attr("title", labels[kind]);
		$m.attr("aria-label", labels[kind]);
		$m.removeAttr("hidden");
	}
	apply($("#p1"), p1kind);
	apply($("#p2"), p2kind);
}

function performCalculations() {
	var p1info = $("#p1");
	var p2info = $("#p2");
	var p1 = createPokemon(p1info);
	var p2 = createPokemon(p2info);
	var p1field = createField();
	var p2field = p1field.clone().swap();

	damageResults = calculateAllMoves(gen, p1, p1field, p2, p2field);
	p1 = damageResults[0][0].attacker;
	p2 = damageResults[1][0].attacker;
	var battling = [p1, p2];
	p1.maxDamages = [];
	p2.maxDamages = [];
	p1info.find(".sp .totalMod").text(p1.stats.spe);
	p2info.find(".sp .totalMod").text(p2.stats.spe);
	updateSpeedTierIcons(p1.stats.spe, p2.stats.spe);
	var fastestSide = p1.stats.spe > p2.stats.spe ? 0 : p1.stats.spe === p2.stats.spe ? "tie" : 1;

	var result, maxDamage;
	var bestResult;
	var zProtectAlerted = false;
	var numMovesP1 = p1.moves.length;
	var numMovesP2 = p2.moves.length;
	var maxMoves = Math.max(numMovesP1, numMovesP2, (typeof is8MovesEnabled === "function" && is8MovesEnabled()) ? 8 : 4);
	for (var i = 0; i < maxMoves; i++) {
		// P1
		if (i < numMovesP1 && damageResults[0] && damageResults[0][i] && p1.moves[i]) {
			result = damageResults[0][i];
			maxDamage = result.range()[1] * p1.moves[i].hits;
			if (!zProtectAlerted && maxDamage > 0 && (p1.item || "").indexOf(" Z") === -1 && p1field.defenderSide.isProtected && p1.moves[i].isZ) {
				alert('Although only possible while hacking, Z-Moves fully damage through protect without a Z-Crystal');
				zProtectAlerted = true;
			}
			p1.maxDamages.push({moveOrder: i, maxDamage: maxDamage});
			p1.maxDamages.sort(function (firstMove, secondMove) {
				return secondMove.maxDamage - firstMove.maxDamage;
			});
			var mName1 = p1.moves[i].name || "(No Move)";
			$(resultLocations[0][i].move + " + label").text(mName1.replace("Hidden Power", "HP"));
			$(resultLocations[0][i].damage).text(result.moveDesc(notation));
		} else if (resultLocations[0][i]) {
			$(resultLocations[0][i].move + " + label").text("(No Move)");
			$(resultLocations[0][i].damage).text("??? - ???%");
		}

		// P2
		if (i < numMovesP2 && damageResults[1] && damageResults[1][i] && p2.moves[i]) {
			result = damageResults[1][i];
			maxDamage = result.range()[1] * p2.moves[i].hits;
			if (!zProtectAlerted && maxDamage > 0 && (p2.item || "").indexOf(" Z") === -1 && p2field.defenderSide.isProtected && p2.moves[i].isZ) {
				alert('Although only possible while hacking, Z-Moves fully damage through protect without a Z-Crystal');
				zProtectAlerted = true;
			}
			p2.maxDamages.push({moveOrder: i, maxDamage: maxDamage});
			p2.maxDamages.sort(function (firstMove, secondMove) {
				return secondMove.maxDamage - firstMove.maxDamage;
			});
			var mName2 = p2.moves[i].name || "(No Move)";
			$(resultLocations[1][i].move + " + label").text(mName2.replace("Hidden Power", "HP"));
			$(resultLocations[1][i].damage).text(result.moveDesc(notation));
		} else if (resultLocations[1][i]) {
			$(resultLocations[1][i].move + " + label").text("(No Move)");
			$(resultLocations[1][i].damage).text("??? - ???%");
		}
	}

	// BOTH
	var bestMove;
	if (fastestSide === "tie") {
		// Technically the order should be random in a speed tie, but this non-determinism makes manual testing more difficult.
		// battling.sort(function () { return 0.5 - Math.random(); });
		bestMove = (battling[0].maxDamages[0] && battling[0].maxDamages[0].moveOrder !== undefined) ? battling[0].maxDamages[0].moveOrder : 0;
		var chosenPokemon = battling[0] === p1 ? "0" : "1";
		bestResult = $(resultLocations[chosenPokemon][bestMove].move);
	} else {
		bestMove = (battling[fastestSide].maxDamages[0] && battling[fastestSide].maxDamages[0].moveOrder !== undefined) ? battling[fastestSide].maxDamages[0].moveOrder : 0;
		bestResult = $(resultLocations[fastestSide][bestMove].move);
	}
	if ($('.locked-move').length) {
		bestResult = $('.locked-move');
	} else if (bestResult && bestResult.length) {
		stickyMoves.setSelectedMove(bestResult.prop("id"));
	}
	if (bestResult && bestResult.length) {
		bestResult.prop("checked", true);
		bestResult.change();
	}
	$("#resultHeaderL").text(p1.name + "'s Moves (select one to show detailed results)");
	$("#resultHeaderR").text(p2.name + "'s Moves (select one to show detailed results)");
}


function calculationsColors(p1info, p2) {
	if (!p2) {
		var p2info = $("#p2");
		var p2 = createPokemon(p2info);
	}
	var p1 = createPokemon(p1info);
	var p1field = createField();
	var p2field = p1field.clone().swap();

	// Local only: color-code runs once per box/team icon and must NOT overwrite global
	// damageResults (used by performCalculations + the detailed result line), or the
	// last icon processed (often the last slot in Box 2) replaces the main matchup.
	var ccResults = calculateAllMoves(gen, p1, p1field, p2, p2field);
	p1 = ccResults[0][0].attacker;
	p2 = ccResults[1][0].attacker;
	p1.maxDamages = [];
	p2.maxDamages = [];
	var p1s = p1.stats.spe;
	var p2s = p2.stats.spe;
	//Faster Tied Slower
	var fastest = p1s > p2s ? "F" : p1s < p2s ? "S" : p1s === p2s ? "T" : undefined;
	var result, highestRoll, lowestRoll, damage = 0;
	//goes from the most optimist to the least optimist
	var p1KO = 0, p2KO = 0;
	//Highest damage
	var p1HD = 0, p2HD = 0;
	var numMovesCalcP1 = Math.min(p1.moves.length, ccResults[0].length);
	for (var i = 0; i < numMovesCalcP1; i++) {
		// P1
		result = ccResults[0][i];
		//lowest rolls in %
		damage = result.damage[0] ? result.damage[0] : result.damage;
		lowestRoll = damage * p1.moves[i].hits / p2.stats.hp * 100;
		damage = result.damage[15] ? result.damage[15] : result.damage;
		highestRoll = damage * p1.moves[i].hits / p2.stats.hp * 100;
		if (highestRoll > p1HD) {
			p1HD = highestRoll;
		}
		if (lowestRoll >= 100) {
			p1KO = 1;
		} else { //if lowest kill obviously highest will
			//highest rolls in %
			if (highestRoll >= 100) {
				if (p1KO == 0) {
					p1KO = 2;
				}
			}
		}
	}

	var numMovesCalcP2 = Math.min(p2.moves.length, ccResults[1].length);
	for (var i = 0; i < numMovesCalcP2; i++) {
		// P2
		result = ccResults[1][i];
		//some damage like sonic boom acts a bit weird.
		damage = result.damage[0] ? result.damage[0] : result.damage;
		lowestRoll = damage * p2.moves[i].hits / p1.stats.hp * 100;
		damage = result.damage[15] ? result.damage[15] : result.damage;
		highestRoll = damage * p2.moves[i].hits / p1.stats.hp * 100;
		if (highestRoll > p2HD) {
			p2HD = highestRoll;
		}
		if (lowestRoll >= 100) {
			p2KO = 4;
		} else {
			if (highestRoll >= 100) {
				if (p2KO < 3) {
					p2KO = 3;
				}
			}
		}
	}
	// Checks if the pokemon walls it
	// i wouldn't mind change this algo for a smarter one.

	// if the adversary don't three shots our pokemon
	if (Math.round(p2HD * 3) < 100) {
		// And if our pokemon does more damage
		if (p1HD > p2HD) {
			if (p1HD > 100) {
				// Then i consider it a wall that may OHKO
				return {speed: fastest, code: "WMO"};
			}
			// if not Then i consider it a good wall
			return {speed: fastest, code: "W"};
		}
	}
	p1KO = p1KO > 0 ? p1KO.toString() : "";
	p2KO = p2KO > 0 ? p2KO.toString() : "";
	return {speed: fastest, code: p1KO + p2KO};
}

$(".result-move").change(function () {
	if (damageResults) {
		var result = findDamageResult($(this));
		if (result) {
			var desc = result.fullDesc(notation, false);
			if (desc.indexOf('--') === -1) desc += ' -- possibly the worst move ever';
			$("#mainResult").text(desc);
			$("#damageValues").text("Possible damage amounts: (" + displayDamageHits(result.damage) + ")");
		}
	}
});

function displayDamageHits(damage) {
	// Fixed Damage
	if (typeof damage === 'number') return damage;
	// Standard Damage
	if (damage.length > 2) return damage.join(', ');
	// Fixed Parental Bond Damage
	if (typeof damage[0] === 'number' && typeof damage[1] === 'number') {
		return '1st Hit: ' + damage[0] + '; 2nd Hit: ' + damage[1];
	}
	// Parental Bond Damage
	return '1st Hit: ' + damage[0].join(', ') + '; 2nd Hit: ' + damage[1].join(', ');
}

function findDamageResult(resultMoveObj) {
	var selector = "#" + resultMoveObj.attr("id");
	for (var i = 0; i < resultLocations.length; i++) {
		for (var j = 0; j < resultLocations[i].length; j++) {
			if (resultLocations[i][j].move === selector) {
				return damageResults[i][j];
			}
		}
	}
}

function checkStatBoost(p1, p2) {
	if ($('#StatBoostL').prop("checked")) {
		for (var stat in p1.boosts) {
			if (stat === 'hp') continue;
			p1.boosts[stat] = Math.min(6, p1.boosts[stat] + 1);
		}
	}
	if ($('#StatBoostR').prop("checked")) {
		for (var stat in p2.boosts) {
			if (stat === 'hp') continue;
			p2.boosts[stat] = Math.min(6, p2.boosts[stat] + 1);
		}
	}
}

function calculateAllMoves(gen, p1, p1field, p2, p2field) {
	checkStatBoost(p1, p2);
	var results = [[], []];
	var maxMoves = Math.max(p1.moves.length, p2.moves.length, (typeof is8MovesEnabled === "function" && is8MovesEnabled()) ? 8 : 4);
	for (var i = 0; i < maxMoves; i++) {
		if (i < p1.moves.length) {
			results[0][i] = calc.calculate(gen, p1, p2, p1.moves[i], p1field);
		}
		if (i < p2.moves.length) {
			results[1][i] = calc.calculate(gen, p2, p1, p2.moves[i], p2field);
		}
	}
	return results;
}

$(".mode").change(function () {
	var params = new URLSearchParams(window.location.search);
	params.set('mode', $(this).attr("id"));
	var mode = params.get('mode');
	if (mode === 'randoms') {
		window.location.replace('randoms' + linkExtension + '?' + params);
	} else if (mode === 'one-vs-one') {
		window.location.replace('index' + linkExtension + '?' + params);
	} else {
		window.location.replace('honkalculate' + linkExtension + '?' + params);
	}
});

$(".notation").change(function () {
	performCalculations();
});

$(document).ready(function () {
	var params = new URLSearchParams(window.location.search);
	var m = params.get('mode');
	if (m) {
		if (m !== 'one-vs-one' && m !== 'randoms') {
			window.location.replace('honkalculate' + linkExtension + '?' + params);
		} else {
			if ($('#randoms').prop('checked')) {
				if (m === 'one-vs-one') {
					window.location.replace('index' + linkExtension + '?' + params);
				}
			} else {
				if (m === 'randoms') {
					window.location.replace('randoms' + linkExtension + '?' + params);
				}
			}
		}
	}
	$(".calc-trigger").bind("change keyup", function (ev) {
		/*
			This prevents like 8 performCalculations out of 8 that were useless
			without causing bugs (so far)
		*/
		if (window.NO_CALC) {
			return;
		}
		if (document.getElementById("cc-auto-refr").checked) {
			window.refreshColorCode();
		}
		performCalculations();
	});
	performCalculations();
});

/* Click-to-copy function */
$("#mainResult").click(function () {
	navigator.clipboard.writeText($("#mainResult").text()).then(function () {
		document.getElementById('tooltipText').style.visibility = 'visible';
		setTimeout(function () {
			document.getElementById('tooltipText').style.visibility = 'hidden';
		}, 2000);
	});
});
