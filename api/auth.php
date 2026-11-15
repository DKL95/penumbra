<?php
/* =========================================================
   /api/auth.php — Inicio de sesión
   POST   { provider: "facebook", accessToken }   → verifica el token con la
          Graph API de Facebook y crea/actualiza al usuario
   POST   { provider: "guest", name, guestId? }   → jugador invitado
   GET    (con X-Penumbra-Token)                  → usuario de la sesión
   DELETE (con X-Penumbra-Token)                  → cierra la sesión
   DELETE ?cuenta=1 (con X-Penumbra-Token)        → borra la cuenta y sus puntajes
   Respuesta: { ok, token, user: { id, name, photo, provider } }
   ========================================================= */
require __DIR__ . '/lib/db.php';
cors();

switch (method()) {
    case 'GET':
        $u = current_user();
        if (!$u) fail('Sin sesión.', 401);
        json_out(['ok' => true, 'user' => public_user($u)]);

    case 'DELETE':
        // ?cuenta=1 → borra al usuario con todos sus puntajes y sesiones (requisito de Meta)
        if (!empty($_GET['cuenta'])) {
            $u = require_user();
            db()->prepare('DELETE FROM puntajes WHERE usuario_id = ?')->execute([$u['id']]);
            db()->prepare('DELETE FROM sesiones WHERE usuario_id = ?')->execute([$u['id']]);
            db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$u['id']]);
            json_out(['ok' => true, 'deleted' => true]);
        }
        $t = request_token();
        if ($t) db()->prepare('DELETE FROM sesiones WHERE token = ?')->execute([$t]);
        json_out(['ok' => true]);

    case 'POST':
        $b = body();
        $provider = $b['provider'] ?? '';
        if ($provider === 'facebook') login_facebook((string)($b['accessToken'] ?? ''));
        if ($provider === 'guest') login_guest((string)($b['name'] ?? ''), (string)($b['guestId'] ?? ''));
        fail('Proveedor no válido (facebook | guest).');

    default:
        fail('Método no permitido.', 405);
}

/* ---------------- Facebook ---------------- */
function graph_get(string $url): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 6]);
        $raw = curl_exec($ch);
        curl_close($ch);
    } else {
        $raw = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]));
    }
    $d = json_decode($raw ?: '', true);
    return is_array($d) ? $d : [];
}

function login_facebook(string $token): void
{
    if ($token === '' || strlen($token) > 1024) fail('Falta el token de Facebook.');
    $appId = (string)cfg('facebook_app_id');
    $secret = (string)cfg('facebook_app_secret');

    // Con el App Secret se confirma que el token fue emitido para ESTA app
    if ($appId !== '' && $secret !== '') {
        $dbg = graph_get('https://graph.facebook.com/debug_token?' . http_build_query([
            'input_token' => $token, 'access_token' => "$appId|$secret",
        ]));
        $data = $dbg['data'] ?? [];
        if (empty($data['is_valid']) || (string)($data['app_id'] ?? '') !== $appId) fail('El token de Facebook no es válido para esta aplicación.', 401);
    }

    $q = ['fields' => 'id,name,picture.type(large)', 'access_token' => $token];
    if ($secret !== '') $q['appsecret_proof'] = hash_hmac('sha256', $token, $secret);
    $me = graph_get('https://graph.facebook.com/me?' . http_build_query($q));
    if (empty($me['id'])) {
        $msg = $me['error']['message'] ?? 'sin respuesta';
        fail('Facebook rechazó el inicio de sesión: ' . $msg, 401);
    }
    $user = upsert_user('facebook', (string)$me['id'], clean_name((string)($me['name'] ?? 'Jugador')), $me['picture']['data']['url'] ?? null);
    json_out(['ok' => true, 'token' => new_session((int)$user['id']), 'user' => public_user($user)]);
}

/* ---------------- Invitado ---------------- */
function login_guest(string $name, string $guestId): void
{
    $name = clean_name($name);
    if (mb_strlen($name) < 2 || mb_strlen($name) > 20) fail('El nombre debe tener entre 2 y 20 caracteres.');
    if (!preg_match('/^[a-f0-9]{32}$/', $guestId)) $guestId = bin2hex(random_bytes(16));
    $user = upsert_user('invitado', $guestId, $name, null);
    json_out(['ok' => true, 'token' => new_session((int)$user['id']), 'user' => public_user($user), 'guestId' => $guestId]);
}

function upsert_user(string $provider, string $providerId, string $name, ?string $photo): array
{
    $pdo = db();
    $st = $pdo->prepare('SELECT id FROM usuarios WHERE proveedor = ? AND proveedor_id = ?');
    $st->execute([$provider, $providerId]);
    $id = $st->fetchColumn();
    $now = date('Y-m-d H:i:s');
    if ($id) {
        $pdo->prepare('UPDATE usuarios SET nombre = ?, foto = ?, ultimo_acceso = ? WHERE id = ?')->execute([$name, $photo, $now, $id]);
    } else {
        $pdo->prepare('INSERT INTO usuarios (proveedor, proveedor_id, nombre, foto, ultimo_acceso) VALUES (?, ?, ?, ?, ?)')
            ->execute([$provider, $providerId, $name, $photo, $now]);
        $id = $pdo->lastInsertId();
    }
    return ['id' => (int)$id, 'proveedor' => $provider, 'nombre' => $name, 'foto' => $photo];
}
