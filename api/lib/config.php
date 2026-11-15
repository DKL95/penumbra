<?php
/* =========================================================
   PENUMBRA — Configuración del servicio web
   Orden de prioridad: valores por defecto < api/config.local.php
   < variables de entorno (DB_HOST, DB_PASS, FACEBOOK_APP_ID…).

   NO escribas contraseñas aquí: copia
   api/config.local.example.php como api/config.local.php
   (ese archivo está en .gitignore).
   ========================================================= */

$cfg = [
    'db_driver'           => 'mysql',            // mysql | sqlite (sqlite solo para pruebas)
    'db_host'             => '127.0.0.1',
    'db_port'             => '3306',
    'db_name'             => 'penumbra',
    'db_user'             => 'root',
    'db_pass'             => '',
    'db_sqlite'           => __DIR__ . '/../data/penumbra.sqlite',
    'facebook_app_id'     => '',
    'facebook_app_secret' => '',                 // opcional: valida que el token sea de tu app
    'cors_origin'         => '*',
];

$local = __DIR__ . '/../config.local.php';
if (is_file($local)) {
    $over = require $local;
    if (is_array($over)) $cfg = array_merge($cfg, $over);
}

$env = [
    'db_driver' => 'DB_DRIVER', 'db_host' => 'DB_HOST', 'db_port' => 'DB_PORT', 'db_name' => 'DB_NAME',
    'db_user' => 'DB_USER', 'db_pass' => 'DB_PASS', 'db_sqlite' => 'DB_SQLITE',
    'facebook_app_id' => 'FACEBOOK_APP_ID', 'facebook_app_secret' => 'FACEBOOK_APP_SECRET',
    'cors_origin' => 'CORS_ORIGIN',
];
foreach ($env as $key => $var) {
    $v = getenv($var);
    if ($v !== false) $cfg[$key] = $v;
}

return $cfg;
