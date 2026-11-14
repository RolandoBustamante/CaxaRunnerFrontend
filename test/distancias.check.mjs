import assert from "node:assert";
import { readFileSync } from "node:fs";

// ParticipantFilters.jsx trae JSX, asi que node no lo importa directo.
// Se recortan las dos funciones puras, igual que server/test/deadline.check.mjs.
const src = readFileSync("client/src/components/ParticipantFilters.jsx", "utf8");
const parts = [
  src.match(/const norm = [^\n]+/)[0],
  src.match(/export function distanceOptions[\s\S]*?\n}/)[0],
  src.match(/export function distanceSelectOptions[\s\S]*?\n}/)[0],
];
const { distanceOptions, distanceSelectOptions } = await import(
  "data:text/javascript," + encodeURIComponent(parts.join("\n"))
);

// --- distanceOptions: la carrera manda; si no hay, se deduce de los datos ---
assert.deepStrictEqual(
  distanceOptions(["21K", "10k", " 5K "], [{ distancia: "42K" }]),
  ["21K", "10K", "5K"],
  "las distancias de la carrera ganan y se normalizan"
);
assert.deepStrictEqual(
  distanceOptions([], [{ distancia: "21K" }, { distancia: "21k" }, { distancia: "" }]),
  ["21K"],
  "sin distancias configuradas se deducen de los participantes, sin duplicados"
);
assert.deepStrictEqual(distanceOptions(null, null), [], "sin nada, lista vacia");

// --- distanceSelectOptions: el bug que motivo el cambio ---
// Antes los <select> de alta y edicion tenian 5K/10K hardcodeados, asi que en
// una carrera de 21K el participante se grababa con la distancia equivocada y
// eso se propagaba al podio por categoria.
assert.ok(
  distanceSelectOptions(["21K"], "21K").includes("21K"),
  "una carrera de 21K ofrece 21K"
);
assert.deepStrictEqual(
  distanceSelectOptions(["5K", "10K"], "21K"),
  ["5K", "10K", "21K"],
  "un valor heredado fuera de la lista se conserva en vez de coercionarse"
);
assert.deepStrictEqual(
  distanceSelectOptions(["10K"], "10k"),
  ["10K"],
  "el valor actual no duplica la opcion que ya existe"
);
assert.deepStrictEqual(
  distanceSelectOptions([], "10K"),
  ["10K"],
  "carrera sin distancias cargadas: el select nunca queda vacio"
);
assert.deepStrictEqual(
  distanceSelectOptions(["21K"], ""),
  ["21K"],
  "sin valor actual no se cuela una opcion vacia"
);

console.log("ok");
