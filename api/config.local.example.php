<?php
/* =========================================================
   Copia este archivo como  api/config.local.php  y pon tus
   datos. config.local.php NO se sube al repositorio.
   ========================================================= */
return [
    // MySQL (el de XAMPP o MySQL Server 8). La base "penumbra" y sus
    // tablas se crean solas la primera vez.
    'db_host' => '127.0.0.1',
    'db_port' => '3306',
    'db_name' => 'penumbra',
    'db_user' => 'root',
    'db_pass' => '',

    // Facebook Login: https://developers.facebook.com/apps → tu app →
    // Configuración → Básica. Agrega "http://localhost:8777/" en
    // Inicio de sesión con Facebook → URI de redireccionamiento / dominios.
    'facebook_app_id' => '',
    'facebook_app_secret' => '',   // opcional, recomendado
];
