import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherIdioma, PT_HTML } from '../src/i18n.js';
import { readFileSync } from 'node:fs';

test('inglês é o padrão; ?lang e a escolha salva mandam, nessa ordem', () => {
  assert.equal(escolherIdioma(null, null), 'en');
  assert.equal(escolherIdioma(null, 'pt'), 'pt');
  assert.equal(escolherIdioma('en', 'pt'), 'en');
  assert.equal(escolherIdioma('pt', 'en'), 'pt');
  assert.equal(escolherIdioma('fr', 'xx'), 'en');
});

test('toda chave data-i18n do HTML tem tradução em português', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const chaves = new Set();
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) chaves.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(';')) chaves.add(p.split(':')[1]);
  const faltam = [...chaves].filter((c) => !(c in PT_HTML));
  assert.deepEqual(faltam, []);
});
