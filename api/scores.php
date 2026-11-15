<?php
/* =========================================================
   /api/scores.php — Tabla de puntajes
   GET  ?mode=escape|survival|versus&scenario=…&difficulty=…&limit=10&mine=1
        → { ok, scores: [{ rank, name, photo, provider, mode, scenario,
                           difficulty, result, points, seconds, relics, date }] }
   POST (con X-Penumbra-Token) estadísticas de la partida
        { mode, scenario, difficulty, role, result, seconds, relics,
          levels, levelsPlayed, hp }
        → { ok, id, points, rank, best }
        Los puntos se RECALCULAN aquí (api/lib/rules.php).
   ========================================================= */
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/rules.php';
cors();

if (method() === 'GET') list_scores();
if (method() === 'POST') save_score();
fail('Método no permitido.', 405);

function list_scores(): void
{
    $where = [];
    $args = [];
    $mode = $_GET['mode'] ?? '';
    if (in_array($mode, MODES, true)) { $where[] = 'p.modo = ?'; $args[] = $mode; }
    $sc = $_GET['scenario'] ?? '';
    if (in_array($sc, SCENARIOS, true)) { $where[] = 'p.escenario = ?'; $args[] = $sc; }
    $diff = $_GET['difficulty'] ?? '';
    if (isset(DIFFICULTY_MULT[$diff])) { $where[] = 'p.dificultad = ?'; $args[] = $diff; }
    if (!empty($_GET['mine'])) {
        $u = require_user();
        $where[] = 'p.usuario_id = ?';
        $args[] = $u['id'];
    }
    $limit = max(1, min(50, (int)($_GET['limit'] ?? 10)));
    $sql = 'SELECT p.id, u.nombre, u.foto, u.proveedor, p.modo, p.escenario, p.dificultad, p.rol, p.resultado,
                   p.puntos, p.segundos, p.reliquias, p.creado
            FROM puntajes p JOIN usuarios u ON u.id = p.usuario_id'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . " ORDER BY p.puntos DESC, p.segundos ASC, p.id ASC LIMIT $limit";
    $st = db()->prepare($sql);
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $i => $r) {
        $rows[] = [
            'rank' => $i + 1,
            'name' => $r['nombre'],
            'photo' => $r['foto'] ?: null,
            'provider' => $r['proveedor'],
            'mode' => $r['modo'],
            'scenario' => $r['escenario'],
            'difficulty' => $r['dificultad'],
            'role' => $r['rol'],
            'result' => $r['resultado'],
            'points' => (int)$r['puntos'],
            'seconds' => (int)$r['segundos'],
            'relics' => (int)$r['reliquias'],
            'date' => $r['creado'],
        ];
    }
    json_out(['ok' => true, 'scores' => $rows]);
}

function save_score(): void
{
    $u = require_user();
    $b = body();
    $mode = $b['mode'] ?? '';
    $scenario = $b['scenario'] ?? '';
    $difficulty = $b['difficulty'] ?? '';
    $result = $b['result'] ?? '';
    $role = ($b['role'] ?? 'survivor') === 'monster' ? 'monster' : 'survivor';
    if (!in_array($mode, MODES, true)) fail('Modo no válido.');
    if (!in_array($scenario, SCENARIOS, true)) fail('Escenario no válido.');
    if (!isset(DIFFICULTY_MULT[$difficulty])) fail('Dificultad no válida.');
    if (!in_array($result, RESULTS, true)) fail('Resultado no válido.');
    if ($scenario === 'campaign' && $mode !== 'escape') fail('La campaña solo existe en modo Escape.');

    $seconds = (int)($b['seconds'] ?? -1);
    $relics = (int)($b['relics'] ?? -1);
    $levels = (int)($b['levels'] ?? 0);
    $played = (int)($b['levelsPlayed'] ?? 1);
    $hp = (int)($b['hp'] ?? 0);
    if ($seconds < 1 || $seconds > 6 * 3600) fail('Duración no válida.');
    if ($relics < 0 || $relics > 500) fail('Reliquias no válidas.');
    if ($levels < 0 || $levels > 3 || $played < 1 || $played > 3 || $levels > $played) fail('Niveles no válidos.');
    if ($hp < 0 || $hp > 3) fail('Vida no válida.');
    // en Escape no se pueden tener más reliquias de las que existen
    if ($mode !== 'survival' && $relics > 3 * $played) fail('Reliquias no válidas.');

    $escaped = $result === 'escaped';
    $won = $escaped || $result === 'won';
    $points = score_points([
        'mode' => $mode, 'role' => $role, 'difficulty' => $difficulty, 'escaped' => $escaped, 'won' => $won,
        'seconds' => $seconds, 'relics' => $relics, 'levels' => $levels, 'levelsPlayed' => $played, 'hp' => $hp,
    ]);

    $pdo = db();
    $pdo->prepare('INSERT INTO puntajes (usuario_id, modo, escenario, dificultad, rol, resultado, puntos, segundos, reliquias)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$u['id'], $mode, $scenario, $difficulty, $role, $result, $points, $seconds, $relics]);
    $id = (int)$pdo->lastInsertId();

    $st = $pdo->prepare('SELECT COUNT(*) FROM puntajes WHERE modo = ? AND puntos > ?');
    $st->execute([$mode, $points]);
    $rank = (int)$st->fetchColumn() + 1;
    $st = $pdo->prepare('SELECT MAX(puntos) FROM puntajes WHERE modo = ? AND usuario_id = ?');
    $st->execute([$mode, $u['id']]);
    $best = (int)$st->fetchColumn();

    json_out(['ok' => true, 'id' => $id, 'points' => $points, 'rank' => $rank, 'best' => $best], 201);
}
