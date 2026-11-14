import assert from "node:assert";
import { readFileSync } from "node:fs";

// Acreditacion.jsx trae JSX; se recorta la funcion pura, como distancias.check.mjs.
const src = readFileSync("client/src/components/Acreditacion.jsx", "utf8");
const { prendaLabel } = await import(
  "data:text/javascript," +
    encodeURIComponent("export " + src.match(/function prendaLabel[\s\S]*?\n}/)[0])
);

assert.strictEqual(prendaLabel({ garmentType: "POLO", garmentSize: "M" }), "Polo · Talla M");
assert.strictEqual(prendaLabel({ garmentType: "BIVIDI", garmentSize: "XL" }), "Bividi · Talla XL");
// El importado por Excel no tiene inscripcion: no se inventa prenda
assert.strictEqual(prendaLabel({ garmentType: null, garmentSize: null }), "");
assert.strictEqual(prendaLabel(null), "");

console.log("prenda.check OK");
