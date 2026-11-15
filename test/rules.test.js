/* =========================================================
   PENUMBRA — Pruebas de las reglas (js/rules.js)
   ========================================================= */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("../js/rules.js");

test("hay al menos 2 dificultades y difieren en algo distinto al tiempo", () => {
  const ids = Object.keys(Rules.DIFFICULTY);
  assert.ok(ids.length >= 2);
  const [a, b] = ids.map((id) => Rules.DIFFICULTY[id]);
  assert.notEqual(a.hp, b.hp);
  assert.ok(b.monsterChase > a.monsterChase);
  assert.ok(b.vision > a.vision);
  // cada nivel es más difícil que el anterior
  const list = ids.map((id) => Rules.DIFFICULTY[id]);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i].hp <= list[i - 1].hp);
    assert.ok(list[i].drain >= list[i - 1].drain);
    assert.ok(list[i].mult > list[i - 1].mult);
  }
});

test("difficulty() con un id desconocido usa Normal", () => {
  assert.equal(Rules.difficulty("xyz"), Rules.DIFFICULTY.normal);
});

test("hay al menos 3 tipos de ítem utilizables además de la reliquia", () => {
  assert.ok(Rules.INVENTORY.length >= 3);
  for (const k of Rules.INVENTORY) assert.ok(Rules.ITEMS[k].key, `${k} necesita tecla`);
});

test("itemsFor quita los ítems marcados para esa dificultad", () => {
  const list = [{ kind: "relic" }, { kind: "battery", skip: ["blackout"] }, { kind: "medkit", skip: ["dark", "blackout"] }];
  assert.equal(Rules.itemsFor(list, "normal").length, 3);
  assert.equal(Rules.itemsFor(list, "dark").length, 2);
  assert.deepEqual(Rules.itemsFor(list, "blackout").map((i) => i.kind), ["relic"]);
});

test("addItem respeta el máximo por tipo y no guarda reliquias", () => {
  const inv = Rules.emptyInventory();
  for (let i = 0; i < Rules.ITEMS.battery.max; i++) assert.equal(Rules.addItem(inv, "battery"), true);
  assert.equal(Rules.addItem(inv, "battery"), false);
  assert.equal(inv.battery, Rules.ITEMS.battery.max);
  assert.equal(Rules.addItem(inv, "relic"), false);
  assert.equal(Rules.addItem(inv, "nada"), false);
});

test("3 escenarios y la campaña los recorre todos", () => {
  assert.equal(Object.keys(Rules.SCENARIOS).length, 3);
  assert.deepEqual([...Rules.CAMPAIGN].sort(), Object.keys(Rules.SCENARIOS).sort());
});

test("puntaje: escapar vale más que ser atrapado y la dificultad multiplica", () => {
  const base = { mode: "escape", role: "survivor", difficulty: "normal", levels: 3, levelsPlayed: 3, relics: 9, hp: 2, seconds: 600 };
  const esc = Rules.score({ ...base, escaped: true });
  const caught = Rules.score({ ...base, escaped: false, levels: 2 });
  assert.ok(esc > caught);
  assert.equal(Rules.score({ ...base, escaped: true, difficulty: "blackout" }), Math.round(esc * 2.2));
});

test("puntaje: escapar más rápido da más puntos", () => {
  const s = { mode: "escape", role: "survivor", difficulty: "normal", levels: 1, levelsPlayed: 1, relics: 3, hp: 3, escaped: true };
  assert.ok(Rules.score({ ...s, seconds: 120 }) > Rules.score({ ...s, seconds: 280 }));
});

test("puntaje: supervivencia premia reliquias y tiempo; el monstruo solo puntúa si gana", () => {
  assert.equal(Rules.score({ mode: "survival", difficulty: "normal", relics: 5, seconds: 100 }), 5 * 300 + 200);
  assert.equal(Rules.score({ mode: "versus", role: "monster", difficulty: "normal", won: false, seconds: 90 }), 0);
  assert.equal(Rules.score({ mode: "versus", role: "monster", difficulty: "normal", won: true, seconds: 100 }), 1500 + 600);
});

test("formatTime", () => {
  assert.equal(Rules.formatTime(0), "00:00");
  assert.equal(Rules.formatTime(75.9), "01:15");
  assert.equal(Rules.formatTime(3600), "60:00");
});
