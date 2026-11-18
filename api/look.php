<?php
/* =========================================================
   /api/look.php — Personalización guardada en la cuenta
   GET  (con X-Penumbra-Token) → { ok, look | null, updated }
        null = el jugador todavía no guarda ninguna
   POST (con X-Penumbra-Token) { look: { survivorColor, flashColor,
        monsterSkin, monsterEyes, hat } }
        → { ok, look }   (look ya validado: ids desconocidos
                          vuelven al valor de fábrica)
   ========================================================= */

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/look.php';
cors();

if (method() === 'GET') get_look();
if (method() === 'POST') save_look();
fail('Método no permitido.', 405);

function get_look(): void
{
    $u = require_user();
    $st = db()->prepare('SELECT datos, actualizado FROM personalizacion WHERE usuario_id = ?');
    $st->execute([$u['id']]);
    $row = $st->fetch();
    if (!$row) json_out(['ok' => true, 'look' => null, 'updated' => null]);
    json_out(['ok' => true, 'look' => sanitize_look(json_decode($row['datos'], true)), 'updated' => $row['actualizado']]);
}

function save_look(): void
{
    $u = require_user();
    $b = body();
    if (!isset($b['look']) || !is_array($b['look'])) fail('Falta la personalización.');
    $look = sanitize_look($b['look']);
    $json = json_encode($look);
    $now = date('Y-m-d H:i:s');

    $pdo = db();
    $st = $pdo->prepare('SELECT 1 FROM personalizacion WHERE usuario_id = ?');
    $st->execute([$u['id']]);
    if ($st->fetchColumn()) {
        $pdo->prepare('UPDATE personalizacion SET datos = ?, actualizado = ? WHERE usuario_id = ?')->execute([$json, $now, $u['id']]);
    } else {
        $pdo->prepare('INSERT INTO personalizacion (usuario_id, datos, actualizado) VALUES (?, ?, ?)')->execute([$u['id'], $json, $now]);
    }
    json_out(['ok' => true, 'look' => $look]);
}
