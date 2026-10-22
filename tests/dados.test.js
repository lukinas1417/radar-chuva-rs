// Regras de negócio sobre os dados já carregados: o que o mapa afirma para cada município.
// Aqui ficam os testes do erro real de "falsa normalidade" e da regra "estado desconhecido nunca vira normal".
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { carregarDados, chuvaDoMunicipio, temChuvaEmDia, ehPrevisao, previsaoDoMunicipio, faixaDe, municipiosEmRisco, riscoDoMunicipio, semAcento, valorDoMunicipio, vizinhosComDado } from '../src/dados.js';

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
function fontes({ chuva, rios, estimativa = null }) {
  globalThis.fetch = async (url) => {
    const corpo = { 'data/municipios-rs.geojson': malha, 'data/chuva-rs.json': chuva, 'data/rios-rs.json': rios, 'data/estimativa-rs.json': estimativa }[url];
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

// ---------- estimativa e previsão por modelo ----------

const AGORA = Date.parse(COLETA) + 10 * 60_000;
const horasAntes = (h) => new Date(AGORA - h * 3_600_000).toISOString();
// Série horária em torno de AGORA: `passado` mm/h até ele e `futuro` mm/h depois (a hora em ponto seguinte é a 1ª prevista).
function serieEm(passado, futuro) {
  const primeira = Math.floor(AGORA / 3_600_000) * 3_600_000 - 29 * 3_600_000;
  const mm = Array.from({ length: 66 }, (_, i) => (primeira + i * 3_600_000 <= AGORA ? passado : futuro));
  return { inicio: primeira / 1000, mm };
}
const estimativaPadrao = (geradoEm = horasAntes(1)) => ({
  versao: 2,
  geradoEm,
  fonte: 'Open-Meteo',
  municipios: [
    { codIbge: 1, serie: serieEm(0.375, 1) }, // 24h = 9 mm
    { codIbge: 3, serie: serieEm(0.5, 2) }, // 24h = 12 mm; +6h = 12; +24h = 48
  ],
});

test('medição em dia vence a estimativa', async () => {
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: estimativaPadrao() });
  const dados = await carregarDados(AGORA);
  assert.deepEqual(chuvaDoMunicipio(dados, 1, '24h'), { mm: 25, tipo: 'medido' });
});

test('município sem pluviômetro mostra a estimativa, marcada como estimada', async () => {
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: estimativaPadrao() });
  const dados = await carregarDados(AGORA);
  assert.deepEqual(chuvaDoMunicipio(dados, 3, '24h'), { mm: 12, tipo: 'estimado' });
});

test('sem estimativa, município sem pluviômetro continua sem dado', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados(AGORA);
  assert.equal(chuvaDoMunicipio(dados, 3, '24h'), null);
});

test('CEMADEN desatualizado: a medição velha cede lugar à estimativa, que nunca é apresentada como medição', async () => {
  const velha = { ...chuvaPadrao, geradoEm: horasAntes(5) };
  fontes({ chuva: velha, rios: null, estimativa: estimativaPadrao() });
  const dados = await carregarDados(AGORA);
  assert.deepEqual(chuvaDoMunicipio(dados, 1, '24h'), { mm: 9, tipo: 'estimado' });
});

test('CEMADEN desatualizado e sem estimativa: mantém a última medição (a interface avisa que está velha)', async () => {
  const velha = { ...chuvaPadrao, geradoEm: horasAntes(5) };
  fontes({ chuva: velha, rios: null });
  const dados = await carregarDados(AGORA);
  assert.deepEqual(chuvaDoMunicipio(dados, 1, '24h'), { mm: 25, tipo: 'medido' });
});

test('estimativa com mais de 6 h não é usada', async () => {
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: estimativaPadrao(horasAntes(7)) });
  const dados = await carregarDados(AGORA);
  assert.equal(chuvaDoMunicipio(dados, 3, '24h'), null);
  assert.equal(chuvaDoMunicipio(dados, 3, '+6h'), null);
  assert.equal(dados.estimativaGeradoEm, null);
});

test('estimativa com data inválida ou de outra versão do formato é descartada', async () => {
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: estimativaPadrao('ontem') });
  assert.equal(chuvaDoMunicipio(await carregarDados(AGORA), 3, '24h'), null);
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: { ...estimativaPadrao(), versao: 1 } });
  assert.equal(chuvaDoMunicipio(await carregarDados(AGORA), 3, '24h'), null);
});

test('previsão: vem só do modelo, é marcada como prevista e vale mesmo onde há pluviômetro', async () => {
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: estimativaPadrao() });
  const dados = await carregarDados(AGORA);
  assert.deepEqual(chuvaDoMunicipio(dados, 3, '+6h'), { mm: 12, tipo: 'previsto' });
  assert.deepEqual(chuvaDoMunicipio(dados, 3, '+24h'), { mm: 48, tipo: 'previsto' });
  assert.equal(chuvaDoMunicipio(dados, 1, '+6h').tipo, 'previsto'); // o município 1 tem pluviômetro
});

test('sem estimativa não existe previsão: nunca vira 0 mm', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  const dados = await carregarDados(AGORA);
  assert.equal(chuvaDoMunicipio(dados, 1, '+6h'), null);
  assert.equal(previsaoDoMunicipio(dados, 1), null);
});

test('a previsão horária tem 24 horas, todas depois de agora', async () => {
  fontes({ chuva: chuvaPadrao, rios: null, estimativa: estimativaPadrao() });
  const horas = previsaoDoMunicipio(await carregarDados(AGORA), 3);
  assert.equal(horas.length, 24);
  assert.ok(horas.every((h) => h.t > AGORA && h.mm === 2));
});

test('só as janelas com "+" são previsão', () => {
  assert.equal(ehPrevisao('+6h'), true);
  assert.equal(ehPrevisao('24h'), false);
});

// ---------- quando a página inteira conta como desatualizada ----------

test('com CEMADEN e Defesa Civil velhos, a estimativa em dia mantém a página como atualizada', async () => {
  const velha = { ...chuvaPadrao, geradoEm: horasAntes(5) };
  fontes({ chuva: velha, rios: null, estimativa: estimativaPadrao() });
  assert.equal(temChuvaEmDia(await carregarDados(AGORA)), true);
});

test('com a estimativa fora e só o CEMADEN em dia, continua atualizada', async () => {
  fontes({ chuva: chuvaPadrao, rios: null });
  assert.equal(temChuvaEmDia(await carregarDados(AGORA)), true);
});

test('só é desatualizada quando TODAS as fontes de chuva caem', async () => {
  const velha = { ...chuvaPadrao, geradoEm: horasAntes(5) };
  fontes({ chuva: velha, rios: null });
  assert.equal(temChuvaEmDia(await carregarDados(AGORA)), false);
  fontes({ chuva: velha, rios: null, estimativa: estimativaPadrao(horasAntes(7)) }); // estimativa velha demais não conta
  assert.equal(temChuvaEmDia(await carregarDados(AGORA)), false);
});
