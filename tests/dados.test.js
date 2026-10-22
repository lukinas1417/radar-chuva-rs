// Regras de negócio sobre os dados já carregados: o que o mapa afirma para cada município.
// Aqui ficam os testes do erro real de "falsa normalidade" e da regra "estado desconhecido nunca vira normal".
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { carregarDados, faixaDe, municipiosEmRisco, riscoDoMunicipio, semAcento, valorDoMunicipio, vizinhosComDado } from '../src/dados.js';

const quadrado = (x, y) => [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]];
const malha = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { codIbge: 1, nome: 'Alfa' }, geometry: { type: 'Polygon', coordinates: quadrado(0, 0) } },
    { type: 'Feature', properties: { codIbge: 2, nome: 'Beta' }, geometry: { type: 'Polygon', coordinates: quadrado(1, 0) } },
    { type: 'Feature', properties: { codIbge: 3, nome: 'Ágata' }, geometry: { type: 'Polygon', coordinates: quadrado(0, 1) } },
  ],
};

const chuvaEst = (codIbge, ativa, acumulados) => ({
  id: codIbge,
  codIbge,
  nome: `Estação ${codIbge}`,
  ultimaLeitura: '2026-10-22T11:50:00-03:00',
  ativa,
  acumuladoMm: { '1h': null, '6h': null, '24h': null, '48h': null, ...acumulados },
});
const COLETA = '2026-10-22T12:00:00-03:00';
const minutosAntes = (min) => new Date(Date.parse(COLETA) - min * 60_000).toISOString();
const rio = (nome, lon, lat, situacao, minAntesDaColeta = 5, extra = {}) => ({
  codigo: nome,
  nome,
  lon,
  lat,
  ultimaLeitura: minutosAntes(minAntesDaColeta),
  situacao,
  emManutencao: false,
  nivelM: 1,
  ...extra,
});

// Troca o fetch global por respostas fixas: nenhum teste usa a rede.
const original = globalThis.fetch;
function fontes({ chuva, rios }) {
  globalThis.fetch = async (url) => {
    const corpo = { 'data/municipios-rs.geojson': malha, 'data/chuva-rs.json': chuva, 'data/rios-rs.json': rios }[url];
    if (!corpo) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => corpo };
  };
}
afterEach(() => {
  globalThis.fetch = original;
});

const chuvaPadrao = {
  geradoEm: COLETA,
  estacoes: [
    chuvaEst(1, true, { '1h': 0, '6h': 2, '24h': 10, '48h': 12 }),
    chuvaEst(1, true, { '1h': 1, '6h': 4, '24h': 25, '48h': 30 }),
    chuvaEst(2, true, { '1h': 0, '6h': 0, '24h': 0, '48h': 0 }),
    chuvaEst(2, false, { '24h': null }),
  ],
};

// ---------- chuva ----------

test('o valor do município é o MAIOR acumulado entre as estações ativas', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados();
  assert.equal(valorDoMunicipio(dados, 1, '24h'), 25);
  assert.equal(valorDoMunicipio(dados, 1, '1h'), 1);
});

test('município com estação ativa que mediu 0 mostra 0, e não "sem dado"', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados();
  assert.equal(valorDoMunicipio(dados, 2, '24h'), 0);
});

test('município sem nenhuma estação ativa é "sem dado" (null), nunca 0', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados();
  assert.equal(valorDoMunicipio(dados, 3, '24h'), null);
});

test('estação inativa é ignorada, mesmo trazendo um valor alto', async () => {
  const chuva = { geradoEm: COLETA, estacoes: [chuvaEst(1, true, { '24h': 5 }), chuvaEst(1, false, { '24h': 999 })] };
  fontes({ chuva, rios: null });
  const dados = await carregarDados();
  assert.equal(valorDoMunicipio(dados, 1, '24h'), 5);
});

test('as duas fontes de chuva são somadas: pluviômetro da Defesa Civil cobre um município sem CEMADEN', async () => {
  const rios = {
    geradoEm: COLETA,
    estacoes: [],
    pluviometros: [{ codigo: 'DC-1', nome: 'DC 1', codIbge: 3, ultimaLeitura: minutosAntes(2), ativa: true, acumuladoMm: { '1h': 0, '6h': 1, '24h': 8, '48h': 9 } }],
  };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.equal(valorDoMunicipio(dados, 3, '24h'), 8);
  assert.equal(dados.pluviometros.get(3)[0].fonte, 'Defesa Civil RS');
});

// ---------- rios: o erro da "falsa normalidade" ----------

test('REGRESSÃO: coleta de rios antiga ainda mostra o risco que ela registrou', async () => {
  // A coleta foi há 5 horas, mas as leituras eram recentes NO MOMENTO DA COLETA. A versão com erro comparava com o
  // relógio de agora, descartava todas as estações e a pílula dizia "Nenhum rio fora da normalidade".
  const geradoEm = '2026-10-22T07:00:00-03:00';
  const rios = { geradoEm, estacoes: [{ ...rio('R1', 0.5, 0.5, 2), ultimaLeitura: '2026-10-22T06:55:00-03:00' }], pluviometros: [] };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.equal(riscoDoMunicipio(dados, 1), 2);
  assert.equal(dados.riosComLeitura, 1);
});

test('estação de rio sem leitura recente NÃO conta como normal: o risco é null, não 0', async () => {
  const rios = { geradoEm: COLETA, estacoes: [rio('R1', 0.5, 0.5, 0, 180)], pluviometros: [] };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.equal(riscoDoMunicipio(dados, 1), null);
  assert.equal(dados.riosComLeitura, 0);
});

test('sem o arquivo de rios (fonte fora do ar), nada é afirmado: risco null e zero municípios em risco', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados();
  assert.equal(dados.rios, null);
  assert.equal(riscoDoMunicipio(dados, 1), null);
  assert.equal(dados.riosComLeitura, 0);
  assert.deepEqual(municipiosEmRisco(dados), []);
});

test('estação sem limiar cadastrado (situação null) não conta como normalidade', async () => {
  const rios = { geradoEm: COLETA, estacoes: [rio('R1', 0.5, 0.5, null)], pluviometros: [] };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.equal(riscoDoMunicipio(dados, 1), null);
});

test('estação em manutenção é ignorada no risco', async () => {
  const rios = { geradoEm: COLETA, estacoes: [rio('R1', 0.5, 0.5, 3, 5, { emManutencao: true })], pluviometros: [] };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.equal(riscoDoMunicipio(dados, 1), null);
});

test('o risco do município é a PIOR situação entre as estações dele', async () => {
  const rios = { geradoEm: COLETA, estacoes: [rio('R1', 0.3, 0.3, 0), rio('R2', 0.6, 0.6, 2), rio('R3', 0.7, 0.2, 1)], pluviometros: [] };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.equal(riscoDoMunicipio(dados, 1), 2);
});

test('municípios em risco vêm do mais grave ao menos grave e só incluem atenção ou pior', async () => {
  const rios = { geradoEm: COLETA, estacoes: [rio('R1', 0.5, 0.5, 1), rio('R2', 1.5, 0.5, 3), rio('R3', 0.5, 1.5, 0)], pluviometros: [] };
  fontes({ chuva: chuvaPadrao, rios });
  const dados = await carregarDados();
  assert.deepEqual(
    municipiosEmRisco(dados).map((x) => [x.municipio.codIbge, x.nivel]),
    [[2, 3], [1, 1]],
  );
});

// ---------- vizinhos, faixas e busca ----------

test('vizinhos com dado vêm por distância e nunca incluem municípios sem dado', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados();
  // Ágata (3) não tem dado; Alfa (1) está mais perto dela do que Beta (2)
  const vizinhos = vizinhosComDado(dados, 3, '24h');
  assert.deepEqual(vizinhos.map((x) => x.municipio.codIbge), [1, 2]);
  assert.ok(vizinhos[0].km < vizinhos[1].km);
});

test('as faixas de chuva respeitam os limites: 0 é "sem chuva" e 10 ainda é "até 10"', () => {
  assert.equal(faixaDe(0).texto, 'sem chuva');
  assert.equal(faixaDe(0.1).texto, 'até 10');
  assert.equal(faixaDe(10).texto, 'até 10');
  assert.equal(faixaDe(10.1).texto, '10 a 30');
  assert.equal(faixaDe(100).texto, '60 a 100');
  assert.equal(faixaDe(100.1).texto, 'acima de 100');
});

test('a busca ignora acentos e maiúsculas', () => {
  assert.equal(semAcento('São José do Norte'), 'sao jose do norte');
  assert.equal(semAcento('ÁGATA'), 'agata');
});
