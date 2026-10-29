// Geometria: atribuir um ponto ao município certo. Um erro aqui põe a chuva de uma estação na cidade errada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaKm2, distanciaKm, indexarMunicipios, municipioDe } from '../src/geo.js';

const quadrado = (x, y, lado = 1) => [[[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]];

const malha = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { codIbge: 1, nome: 'Alfa' }, geometry: { type: 'Polygon', coordinates: quadrado(0, 0) } },
    // município com um buraco no meio (enclave que pertence a outro município)
    {
      type: 'Feature',
      properties: { codIbge: 2, nome: 'Anel' },
      geometry: { type: 'Polygon', coordinates: [...quadrado(10, 10, 4), [[11, 11], [13, 11], [13, 13], [11, 13], [11, 11]]] },
    },
    { type: 'Feature', properties: { codIbge: 3, nome: 'Enclave' }, geometry: { type: 'Polygon', coordinates: quadrado(11, 11, 2) } },
    // município em duas partes separadas
    {
      type: 'Feature',
      properties: { codIbge: 4, nome: 'Ilhas' },
      geometry: { type: 'MultiPolygon', coordinates: [quadrado(20, 20), quadrado(30, 30)] },
    },
  ],
};
const indice = indexarMunicipios(malha);

test('ponto dentro de um município devolve esse município', () => {
  assert.equal(municipioDe(indice, 0.5, 0.5)?.codIbge, 1);
});

test('ponto fora de todos os municípios devolve null, não o mais próximo', () => {
  assert.equal(municipioDe(indice, 5, 5), null);
});

test('o buraco de um município não conta como dele: o ponto pertence ao enclave', () => {
  assert.equal(municipioDe(indice, 12, 12)?.codIbge, 3);
  assert.equal(municipioDe(indice, 10.5, 10.5)?.codIbge, 2);
});

test('município com várias partes é encontrado em qualquer uma delas', () => {
  assert.equal(municipioDe(indice, 20.5, 20.5)?.codIbge, 4);
  assert.equal(municipioDe(indice, 30.5, 30.5)?.codIbge, 4);
  assert.equal(municipioDe(indice, 25, 25), null);
});

test('indexar guarda a caixa e o centro de cada município', () => {
  const alfa = indice.find((m) => m.codIbge === 1);
  assert.deepEqual(alfa.caixa, [0, 0, 1, 1]);
  assert.deepEqual(alfa.centro, [0.5, 0.5]);
});

test('distância entre Porto Alegre e Caxias do Sul fica perto dos ~96 km reais', () => {
  const km = distanciaKm([-51.2177, -30.0346], [-51.1794, -29.1678]);
  assert.ok(km > 90 && km < 102, `distância calculada: ${km.toFixed(1)} km`);
});

test('a distância de um ponto a ele mesmo é zero', () => {
  assert.equal(distanciaKm([-51, -30], [-51, -30]), 0);
});

test('área: um quadrado de 1 grau na linha do equador tem ~12.300 km², e o buraco é descontado', () => {
  const quadradoEq = { type: 'Polygon', coordinates: quadrado(0, 0) };
  assert.ok(Math.abs(areaKm2(quadradoEq) - 111.32 * 110.57) < 5);
  const comBuraco = { type: 'Polygon', coordinates: [...quadrado(0, 0, 4), [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
  const cheio = areaKm2({ type: 'Polygon', coordinates: quadrado(0, 0, 4) });
  assert.ok(Math.abs(areaKm2(comBuraco) - cheio * 0.75) < 5);
});

test('área: MultiPolygon soma as partes', () => {
  const duas = { type: 'MultiPolygon', coordinates: [quadrado(20, 20), quadrado(30, 30)] };
  const partes = [quadrado(20, 20), quadrado(30, 30)].map((c) => areaKm2({ type: 'Polygon', coordinates: c }));
  assert.ok(Math.abs(areaKm2(duas) - (partes[0] + partes[1])) < 1e-6);
});
