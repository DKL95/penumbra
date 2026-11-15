<?php
/* =========================================================
   PENUMBRA — Utilidades del servicio web
   Conexión PDO (MySQL; SQLite solo para las pruebas
   automáticas), creación de tablas, respuestas JSON, CORS y
   sesiones por token.
   ========================================================= */

function cfg(?string $key = null)
{
    static $c = null;
    if ($c === null) $c = require __DIR__ . '/config.php';
    return $key === null ? $c : ($c[$key] ?? null);
}

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    json_out(['ok' => false, 'error' => $msg], $code);
}

function cors(): void
{
    header('Access-Control-Allow-Origin: ' . cfg('cors_origin'));
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Penumbra-Token');
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function method(): string
{
    return $_SERVER['REQUEST_METHOD'] ?? 'GET';
}

function body(): array
{
    $raw = file_get_contents('php://input');
    $d = json_decode($raw ?: '[]', true);
    return is_array($d) ? $d : [];
}

/* ---------------- Base de datos ---------------- */

// Lanza PDOException si no se puede conectar.
function db_connect(): PDO
{
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (cfg('db_driver') === 'sqlite') {
        $file = cfg('db_sqlite');
        if (!is_dir(dirname($file))) mkdir(dirname($file), 0777, true);
        $pdo = new PDO('sqlite:' . $file, null, null, $opts);
        $pdo->exec('PRAGMA foreign_keys = ON');
        return $pdo;
    }
    $host = cfg('db_host');
    $port = cfg('db_port');
    $name = cfg('db_name');
    try {
        return new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", cfg('db_user'), cfg('db_pass'), $opts);
    } catch (PDOException $e) {
        // 1049 = la base no existe todavía: se crea la primera vez
        if ((int)($e->errorInfo[1] ?? 0) !== 1049 && strpos($e->getMessage(), '1049') === false) throw $e;
        $root = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", cfg('db_user'), cfg('db_pass'), $opts);
        $root->exec("CREATE DATABASE IF NOT EXISTS `" . str_replace('`', '', $name) . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        return new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", cfg('db_user'), cfg('db_pass'), $opts);
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    try {
        $pdo = db_connect();
        migrate($pdo);
    } catch (PDOException $e) {
        error_log('[penumbra] BD: ' . $e->getMessage());
        fail('No se pudo conectar a la base de datos. Revisa api/config.local.php.', 503);
    }
    return $pdo;
}

// Crea las tablas si no existen (el mismo esquema está en api/sql/schema.sql)
function migrate(PDO $pdo): void
{
    if (cfg('db_driver') === 'sqlite') {
        $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proveedor TEXT NOT NULL, proveedor_id TEXT NOT NULL, nombre TEXT NOT NULL, foto TEXT,
            creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ultimo_acceso DATETIME,
            UNIQUE (proveedor, proveedor_id))");
        $pdo->exec("CREATE TABLE IF NOT EXISTS sesiones (
            token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)");
        $pdo->exec("CREATE TABLE IF NOT EXISTS puntajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            modo TEXT NOT NULL, escenario TEXT NOT NULL, dificultad TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'survivor',
            resultado TEXT NOT NULL, puntos INTEGER NOT NULL, segundos INTEGER NOT NULL, reliquias INTEGER NOT NULL DEFAULT 0,
            creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)");
        return;
    }
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents(__DIR__ . '/../sql/schema.sql'));
    foreach (preg_split('/;\s*(\r?\n|$)/', $sql) as $stmt) {
        if (trim($stmt) !== '') $pdo->exec($stmt);
    }
}

/* ---------------- Sesiones ---------------- */

function request_token(): ?string
{
    $t = $_SERVER['HTTP_X_PENUMBRA_TOKEN'] ?? '';
    if (!$t) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (stripos($auth, 'Bearer ') === 0) $t = substr($auth, 7);
    }
    $t = trim($t);
    return preg_match('/^[a-f0-9]{48}$/', $t) ? $t : null;
}

function current_user(): ?array
{
    $t = request_token();
    if (!$t) return null;
    $st = db()->prepare('SELECT u.id, u.proveedor, u.nombre, u.foto FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?');
    $st->execute([$t]);
    return $st->fetch() ?: null;
}

function require_user(): array
{
    $u = current_user();
    if (!$u) fail('Inicia sesión para guardar tu puntaje.', 401);
    return $u;
}

function new_session(int $userId): string
{
    $token = bin2hex(random_bytes(24));
    db()->prepare('INSERT INTO sesiones (token, usuario_id) VALUES (?, ?)')->execute([$token, $userId]);
    return $token;
}

function public_user(array $u): array
{
    return [
        'id' => (int)$u['id'],
        'name' => $u['nombre'],
        'photo' => $u['foto'] ?: null,
        'provider' => $u['proveedor'],
    ];
}

function clean_name(string $s): string
{
    $s = trim(preg_replace('/\s+/u', ' ', strip_tags($s)));
    return mb_substr($s, 0, 40);
}
