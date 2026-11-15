<?php
/* =========================================================
   PENUMBRA — Reglas del puntaje en el servidor
   Es la misma fórmula que js/rules.js (Rules.score). El
   servidor RECALCULA los puntos con las estadísticas de la
   partida en lugar de creer el número que manda el navegador.
   (test/api.test.js comprueba que ambas fórmulas coinciden.)
   ========================================================= */

const MODES = ['escape', 'survival', 'versus'];
const SCENARIOS = ['campaign', 'mansion', 'hospital', 'forest'];
const DIFFICULTY_MULT = ['normal' => 1, 'dark' => 1.5, 'blackout' => 2.2];
const RESULTS = ['escaped', 'caught', 'won', 'lost'];

function score_points(array $s): int
{
    $mult = DIFFICULTY_MULT[$s['difficulty']] ?? 1;
    $secs = max(0, (int)($s['seconds'] ?? 0));
    $relics = max(0, (int)($s['relics'] ?? 0));
    if (($s['role'] ?? 'survivor') === 'monster') {
        $pts = !empty($s['won']) ? 1500 + max(0, 300 - $secs) * 3 : 0;
    } elseif (($s['mode'] ?? '') === 'survival') {
        $pts = $relics * 300 + $secs * 2;
    } else {
        $levels = max(0, (int)($s['levels'] ?? 0));
        $played = max(1, (int)($s['levelsPlayed'] ?? ($levels ?: 1)));
        $pts = $levels * 1000 + $relics * 250;
        if (!empty($s['escaped'])) $pts += max(0, (int)($s['hp'] ?? 0)) * 200 + max(0, 300 * $played - $secs) * 2;
    }
    return (int)round($pts * $mult);
}
