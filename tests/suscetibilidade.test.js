// A camada do SGB só vale onde existe carta: dizer "sem risco" num município sem carta seria o erro grave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS, temCarta, urlTiles } from '../src/suscetibilidade.js';

test('reconhece município com carta, ignorando acento e caixa', () => {
  assert.equal(temCarta('inundacao', 'Gravataí'), true);
  assert.equal(temCarta('movimento', 'são lourenço do sul'), true);
});

test('município sem carta de um tipo não é tratado como coberto', () => {
  assert.equal(temCarta('inundacao', 'Viamão'), false);
  assert.equal(temCarta('movimento', 'Viamão'), true);
  assert.equal(temCarta('inundacao', 'Pelotas'), false);
});

test('URL do WMS mantém o filtro do RS e o marcador de bbox do MapLibre', () => {
  for (const tipo of Object.keys(TIPOS)) {
    const url = urlTiles(tipo);
    assert.match(url, /\{bbox-epsg-3857\}/);
    assert.match(url, /cql_filter=uf%3D%27RS%27/);
    assert.ok(url.startsWith('https://geoservicos.sgb.gov.br/'));
  }
});
