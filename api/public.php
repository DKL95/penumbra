<?php
/* =========================================================
   GET /api/public.php
   Estado del servicio y configuración pública para el juego
   (el App ID de Facebook no es secreto; el App Secret sí, y
   nunca sale del servidor).
   ========================================================= */
require __DIR__ . '/lib/db.php';
cors();

$dbOk = true;
try {
    migrate(db_connect());
} catch (Throwable $e) {
    $dbOk = false;
}

json_out([
    'ok' => true,
    'service' => 'PENUMBRA API',
    'version' => 1,
    'db' => cfg('db_driver'),
    'dbOk' => $dbOk,
    'facebookAppId' => (string)cfg('facebook_app_id'),
]);
