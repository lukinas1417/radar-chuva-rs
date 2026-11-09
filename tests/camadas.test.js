// Camadas ligáveis: a escolha salva nunca pode deixar a página quebrada nem sem camadas por um valor ruim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMADAS, CHAVE_CAMADAS, carregarCamadas, desligadas, gravarCamadas, lerCamadas, soChuva, todasLigadas } from '../src/camadas.js';

test('sem nada salvo, tudo fica ligado, como o mapa sempre foi', () => {
  assert.deepEqual(lerCamadas(null), todasLigadas());
  assert.ok(CAMADAS.every((c) => todasLigadas()[c.id] === true));
});

test('só a chuva: liga a chuva e a legenda e desliga o resto', () => {
  const s = soChuva();
  assert.equal(s.chuva, true);
  assert.equal(s.legenda, true);
  assert.deepEqual(CAMADAS.filter((c) => s[c.id]).map((c) => c.id), ['chuva', 'legenda']);
});

test('a escolha salva é lida de volta', () => {
  const salvo = { ...todasLigadas(), ana: false, noticias: false };
  assert.deepEqual(lerCamadas(JSON.stringify(salvo)), salvo);
});

test('texto corrompido ou de tipo errado cai no padrão, sem lançar erro', () => {
  for (const ruim of ['{', 'undefined', '[]', '"ana"', '42', '', null, undefined]) {
    assert.deepEqual(lerCamadas(ruim), todasLigadas(), String(ruim));
  }
});

test('valor que não é verdadeiro/falso e chave desconhecida são ignorados; o resto vale', () => {
  const lido = lerCamadas(JSON.stringify({ ana: 'false', risco: 0, chuva: false, camadaAntiga: false }));
  assert.equal(lido.ana, true); // "false" como texto não conta
  assert.equal(lido.risco, true);
  assert.equal(lido.chuva, false);
  assert.equal('camadaAntiga' in lido, false);
});

test('armazenamento que falta ou lança erro não derruba a página', () => {
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.deepEqual(carregarCamadas(quebrado), todasLigadas());
  assert.doesNotThrow(() => gravarCamadas(soChuva(), quebrado));
  assert.deepEqual(carregarCamadas(undefined), todasLigadas());
});

test('grava e relê pelo armazenamento', () => {
  const mem = new Map();
  const arm = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  gravarCamadas(soChuva(), arm);
  assert.ok(mem.has(CHAVE_CAMADAS));
  assert.deepEqual(carregarCamadas(arm), soChuva());
});

test('conta as camadas desligadas', () => {
  assert.equal(desligadas(todasLigadas()), 0);
  assert.equal(desligadas(soChuva()), CAMADAS.length - 2);
});
