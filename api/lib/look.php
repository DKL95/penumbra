<?php
/* =========================================================
   PENUMBRA — Opciones de personalización en el servidor
   Mismos ids que Rules.LOOK (js/rules.js). La primera opción
   de cada grupo es la de fábrica. El servidor nunca guarda
   valores fuera de estas listas.
   (test/api.test.js comprueba que ambas listas coinciden.)
   ========================================================= */

const LOOK_OPTIONS = [
    'survivorColor' => ['original', 'carmesi', 'bosque', 'noche', 'ceniza', 'mostaza', 'violeta'],
    'flashColor'    => ['calida', 'blanca', 'azul', 'roja', 'verde'],
    'monsterType'   => ['carnicero', 'slasher', 'demonio', 'llorona'],
    'monsterSkin'   => ['original', 'sombra', 'ceniza', 'hueso', 'palido', 'sangre'],
    'monsterEyes'   => ['ninguno', 'rojo', 'ambar', 'blanco', 'verde'],
    'hat'           => ['ninguno', 'copa', 'corona', 'cuernos', 'mascara'],
];

// deja solo claves e ids conocidos; lo demás vuelve al valor de fábrica
function sanitize_look($look): array
{
    $out = [];
    foreach (LOOK_OPTIONS as $key => $ids) {
        $v = is_array($look) ? ($look[$key] ?? null) : null;
        $out[$key] = (is_string($v) && in_array($v, $ids, true)) ? $v : $ids[0];
    }
    return $out;
}
