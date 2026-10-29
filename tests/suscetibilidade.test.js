// A camada do SGB só vale onde existe carta: dizer "sem risco" num município sem carta seria o erro grave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS, caixaDoTile, hachurar, somarAreas, temCarta, urlWms } from '../src/suscetibilidade.js';

test('reconhece município com carta, ignorando acento e caixa', () => {
  assert.equal(temCarta('inundacao', 'Gravataí'), true);
  assert.equal(temCarta('movimento', 'são lourenço do sul'), true);
});

test('município sem carta de um tipo não é tratado como coberto', () => {
  assert.equal(temCarta('inundacao', 'Viamão'), false);
  assert.equal(temCarta('movimento', 'Viamão'), true);
  assert.equal(temCarta('inundacao', 'Pelotas'), false);
});

test('URL do WMS mantém o filtro do RS e a caixa do tile', () => {
  for (const tipo of Object.keys(TIPOS)) {
    const url = urlWms(tipo, [1, 2, 3, 4]);
    assert.match(url, /bbox=1,2,3,4/);
    assert.match(url, /cql_filter=uf%3D%27RS%27/);
    assert.ok(url.startsWith('https://geoservicos.sgb.gov.br/'));
  }
});

test('caixa do tile 0/0/0 é o mundo todo e os filhos a dividem ao meio', () => {
  const [a, b, c, d] = caixaDoTile(0, 0, 0);
  assert.ok(Math.abs(a + c) < 1e-6 && Math.abs(b + d) < 1e-6 && c > 2e7);
  const [fa, , fc] = caixaDoTile(1, 1, 0);
  assert.ok(Math.abs(fa) < 1e-6 && Math.abs(fc - c) < 1e-6);
});

// Um pixel da cor original do SGB vira traço (ou vão) na cor do tipo; classe mais alta tem traço mais largo.
function cobertura(tipo, cor) {
  const n = 64;
  const rgba = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) rgba.set([...cor, 255], i * 4);
  hachurar(rgba, n, n, tipo);
  let cheios = 0;
  for (let i = 0; i < n * n; i++) if (rgba[i * 4 + 3] > 0) cheios++;
  return cheios / (n * n);
}

test('hachura: classe mais alta cobre mais área que a baixa', () => {
  for (const tipo of Object.keys(TIPOS)) {
    const { alta, media, baixa } = TIPOS[tipo].classes;
    const [a, m, b] = [alta, media, baixa].map((c) => cobertura(tipo, c));
    assert.ok(a > m && m > b && b > 0, tipo + ': ' + a + ' ' + m + ' ' + b);
  }
});

test('hachura: pixel transparente continua transparente e a cor sai na do tipo', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 0, ...TIPOS.inundacao.classes.alta, 255]);
  hachurar(rgba, 2, 1, 'inundacao');
  assert.equal(rgba[3], 0);
  assert.deepEqual([...rgba.slice(4, 7)], TIPOS.inundacao.cor);
});

test('soma a área por classe e junta os anos do levantamento', () => {
  const csv = 'FID,classe,area_km2,ano\nf.1,Alta,3.5,2017\nf.2,Média,10,2017\nf.3,Baixa,1.25,2023\nf.4,Alta,0.5,2017\n';
  const r = somarAreas(csv);
  assert.equal(r.alta, 4);
  assert.equal(r.media, 10);
  assert.equal(r.baixa, 1.25);
  assert.equal(r.total, 15.25);
  assert.deepEqual(r.anos, [2017, 2023]);
});

test('soma de áreas ignora linhas sem classe conhecida ou sem área, em vez de quebrar', () => {
  const r = somarAreas('FID,classe,area_km2,ano\nf.1,Desconhecida,5,2017\nf.2,Alta,abc,2017\nf.3,Baixa,2,2017\n');
  assert.equal(r.total, 2);
  assert.equal(somarAreas('FID,classe,area_km2,ano\n').total, 0);
});
