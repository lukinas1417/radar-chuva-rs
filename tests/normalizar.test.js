// Normalização das fontes. A regra que mais importa: "sem dado" nunca pode virar "zero" nem "normal".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarMunicipios } from '../src/geo.js';
import { acumularEstimativa, estimativaPrecisaRenovar, normalizarChuvaCemaden, normalizarEstimativa, normalizarDefesaCivil, paraIsoCemaden, paraIsoDefesaCivil } from '../src/normalizar.js';

// ---------- CEMADEN ----------

test('data do CEMADEN vira ISO com o fuso de Brasília', () => {
  assert.equal(paraIsoCemaden('21/10/26 19:10'), '2026-10-21T19:10:00-03:00');
  assert.equal(paraIsoCemaden('1/2/26 9:05'), '2026-02-01T09:05:00-03:00');
});

test('data inválida ou ausente vira null, não uma data inventada', () => {
  assert.equal(paraIsoCemaden(null), null);
  assert.equal(paraIsoCemaden(''), null);
  assert.equal(paraIsoCemaden('ontem'), null);
});

const AGORA_CEMADEN = Date.parse('2026-10-21T19:50:00-03:00');
const estacaoCemaden = (extra) => ({
  idestacao: 1,
  codibge: 4305108,
  cidade: 'CAXIAS DO SUL',
  nomeestacao: 'Centro',
  ultimovalor: 0,
  datahoraUltimovalor: '21/10/26 19:40',
  acc1hr: '-',
  acc3hr: '-',
  acc6hr: '-',
  acc12hr: '-',
  acc24hr: '-',
  acc48hr: '-',
  acc72hr: '-',
  acc96hr: '-',
  tipoestacao: 1,
  ...extra,
});
const normalizarUma = (extra) => normalizarChuvaCemaden([estacaoCemaden(extra)], AGORA_CEMADEN)[0];

test('"-" em estação ativa significa 0 mm: o CEMADEN só preenche o acumulado quando choveu', () => {
  const e = normalizarUma({});
  assert.equal(e.ativa, true);
  assert.equal(e.acumuladoMm['24h'], 0);
  assert.equal(e.acumuladoMm['96h'], 0);
});

test('"-" em estação SEM leitura recente é "sem dado" (null), nunca 0', () => {
  const e = normalizarUma({ datahoraUltimovalor: '21/10/26 15:00' });
  assert.equal(e.ativa, false);
  assert.equal(e.acumuladoMm['24h'], null);
  assert.equal(e.acumuladoMm['96h'], null);
});

test('valor numérico da fonte é preservado como veio', () => {
  const e = normalizarUma({ acc1hr: 1.2, acc24hr: 14.8 });
  assert.equal(e.acumuladoMm['1h'], 1.2);
  assert.equal(e.acumuladoMm['24h'], 14.8);
});

test('o limite de 3 horas é inclusivo: exatamente 3 h ainda é ativa, 3 h e 1 min não', () => {
  assert.equal(normalizarUma({ datahoraUltimovalor: '21/10/26 16:50' }).ativa, true);
  assert.equal(normalizarUma({ datahoraUltimovalor: '21/10/26 16:49' }).ativa, false);
});

test('estação sem data de leitura nunca é considerada ativa', () => {
  const e = normalizarUma({ datahoraUltimovalor: null });
  assert.equal(e.ativa, false);
  assert.equal(e.ultimaLeitura, null);
  assert.equal(e.acumuladoMm['24h'], null);
});

// ---------- Defesa Civil RS ----------

const malha = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { codIbge: 1, nome: 'Alfa' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
  ],
};
const indice = indexarMunicipios(malha);
const AGORA_DC = Date.parse('2026-10-22T12:00:00-03:00');

const v = (value) => ({ value });
function estacaoDC({ codigo = 'DCRS-1', lon = 0.5, lat = 0.5, ts = '2026-10-22T11:55:00.000', show = 'true', nivel = 1.5, ativo = true, status = 0, manut = false, chuva = {}, chuvaValida = true } = {}) {
  const ac = { h001: v(0), h006: v(0), h024: v(0), h048: v(0), h168: v(0), ...chuva };
  return {
    codigo,
    name: { general: codigo },
    show,
    timestamp: ts,
    position: { bacia: 'Teste', regiao: 'Teste', latitude: lat, longitude: lon },
    data: {
      rio: {
        rio_nivel: nivel === null ? null : v(nivel),
        rio_nivel_tendencia: v(0),
        rio_alarmes: { inundacao: { ativo: v(ativo), status: v(status) } },
        homologacao: { relacao: { valido: v(true) } },
      },
      chuva: { acumulado: ac, homologacao: { relacao: { valido: v(chuvaValida) } } },
    },
    resource: { estacao: { estado: { manutencao: v(manut) } } },
  };
}
const normalizarDC = (...estacoes) => normalizarDefesaCivil(estacoes, AGORA_DC, indice);

test('a data da Defesa Civil (sem fuso) vira ISO com o fuso de Brasília', () => {
  assert.equal(paraIsoDefesaCivil('2026-10-21T16:55:00.000'), '2026-10-21T16:55:00-03:00');
  assert.equal(paraIsoDefesaCivil(null), null);
});

test('o status da fonte (0 a 3) é repassado, sem o sistema inventar uma classificação', () => {
  for (const status of [0, 1, 2, 3]) {
    assert.equal(normalizarDC(estacaoDC({ status })).estacoes[0].situacao, status);
  }
});

test('estação sem limiar cadastrado (ativo: false) tem situação null, não "normal"', () => {
  const { estacoes } = normalizarDC(estacaoDC({ ativo: false, status: 0 }));
  assert.equal(estacoes[0].situacao, null);
});

test('estação marcada para não exibir fica de fora das duas listas', () => {
  const r = normalizarDC(estacaoDC({ show: 'false' }));
  assert.equal(r.estacoes.length, 0);
  assert.equal(r.pluviometros.length, 0);
});

test('estação sem sensor de rio não entra em "rios", mas o pluviômetro dela entra', () => {
  const r = normalizarDC(estacaoDC({ nivel: null }));
  assert.equal(r.estacoes.length, 0);
  assert.equal(r.pluviometros.length, 1);
});

test('pluviômetro com leitura recente e todas as janelas medidas é ativo', () => {
  assert.equal(normalizarDC(estacaoDC()).pluviometros[0].ativa, true);
});

test('o limite de 30 minutos é inclusivo: 30 min ainda é ativo, 31 min não', () => {
  assert.equal(normalizarDC(estacaoDC({ ts: '2026-10-22T11:30:00.000' })).pluviometros[0].ativa, true);
  assert.equal(normalizarDC(estacaoDC({ ts: '2026-10-22T11:29:00.000' })).pluviometros[0].ativa, false);
});

test('uma janela de chuva sem medida (null) basta para o pluviômetro não ser ativo', () => {
  const r = normalizarDC(estacaoDC({ chuva: { h024: v(null) } }));
  assert.equal(r.pluviometros[0].ativa, false);
});

test('estação em manutenção não é considerada ativa', () => {
  assert.equal(normalizarDC(estacaoDC({ manut: true })).pluviometros[0].ativa, false);
  assert.equal(normalizarDC(estacaoDC({ manut: true })).estacoes[0].emManutencao, true);
});

test('chuva marcada como não homologada é descartada', () => {
  assert.equal(normalizarDC(estacaoDC({ chuvaValida: false })).pluviometros.length, 0);
});

test('estação fora da malha municipal fica com codIbge null (e não no município vizinho)', () => {
  assert.equal(normalizarDC(estacaoDC({ lon: 50, lat: 50 })).pluviometros[0].codIbge, null);
  assert.equal(normalizarDC(estacaoDC()).pluviometros[0].codIbge, 1);
});

// ---------- Open-Meteo (estimativa) ----------

const AGORA_EST = Date.parse('2026-10-22T14:40:00Z');
// 72 horas em ponto, de 20/10 00:00Z a 22/10 23:00Z (a previsão do dia vem junto). Cada hora válida marca 1 mm.
function horario(valorDe = () => 1) {
  const inicio = Date.parse('2026-10-20T00:00:00Z') / 1000;
  const time = Array.from({ length: 72 }, (_, i) => inicio + i * 3600);
  return { time, precipitation: time.map((t) => valorDe(t)) };
}

test('estimativa soma só as horas já terminadas; a previsão que vem junto é ignorada', () => {
  // até 22/10 14:00Z há 62 horas passadas; as de 15:00Z em diante são futuras e valem 100 mm cada
  const h = horario((t) => (t * 1000 <= AGORA_EST ? 1 : 100));
  assert.deepEqual(acumularEstimativa(h, AGORA_EST), { '1h': 1, '6h': 6, '24h': 24, '48h': 48 });
});

test('estimativa: janela com buraco (null) vira null, não uma soma parcial', () => {
  const h = horario();
  h.precipitation[h.time.findIndex((t) => t * 1000 === Date.parse('2026-10-22T10:00:00Z'))] = null;
  const r = acumularEstimativa(h, AGORA_EST);
  assert.equal(r['1h'], 1);
  assert.equal(r['6h'], null);
  assert.equal(r['24h'], null);
});

test('estimativa: poucas horas disponíveis não completam a janela de 48 h', () => {
  const h = { time: horario().time.slice(30, 72), precipitation: Array(42).fill(1) };
  const r = acumularEstimativa(h, AGORA_EST);
  assert.equal(r['24h'], 24);
  assert.equal(r['48h'], null);
});

test('estimativa arredonda a 0,1 mm', () => {
  const h = horario(() => 0.1);
  assert.equal(acumularEstimativa(h, AGORA_EST)['6h'], 0.6);
});

test('normalizarEstimativa descarta município sem resposta completa', () => {
  const ok = { hourly: horario() };
  const furado = { hourly: horario((t) => (t * 1000 > AGORA_EST - 3600_000 && t * 1000 <= AGORA_EST ? null : 1)) };
  const r = normalizarEstimativa([ok, furado, undefined], [10, 20, 30], AGORA_EST);
  assert.deepEqual(r.map((m) => m.codIbge), [10]);
});

test('a estimativa só é renovada depois de 3 h; data inválida força renovação', () => {
  const agora = Date.parse('2026-10-22T15:00:00Z');
  assert.equal(estimativaPrecisaRenovar('2026-10-22T13:00:00Z', agora), false);
  assert.equal(estimativaPrecisaRenovar('2026-10-22T11:30:00Z', agora), true);
  assert.equal(estimativaPrecisaRenovar(undefined, agora), true);
  assert.equal(estimativaPrecisaRenovar('lixo', agora), true);
});
