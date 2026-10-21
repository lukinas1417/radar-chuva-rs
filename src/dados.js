// Carrega as fontes e responde perguntas sobre cada município.
import { distanciaKm, indexarMunicipios, municipioDe } from './geo.js';

export const JANELAS = ['1h', '6h', '24h', '48h'];

// Chuva: rampa fria, para nunca se confundir com as cores de risco dos rios (amarelo/laranja/vermelho).
export const FAIXAS = [
  { ate: 0, cor: '#31506b', texto: 'sem chuva' },
  { ate: 10, cor: '#1f9e9a', texto: 'até 10' },
  { ate: 30, cor: '#27b6d9', texto: '10 a 30' },
  { ate: 60, cor: '#3d82f0', texto: '30 a 60' },
  { ate: 100, cor: '#6a5af0', texto: '60 a 100' },
  { ate: Infinity, cor: '#b64df0', texto: 'acima de 100' },
];
export const faixaDe = (mm) => FAIXAS.find((f) => mm <= f.ate);

// Situação informada pela Defesa Civil RS para o nível do rio (0 é normalidade).
export const SITUACOES = [
  { valor: 0, cor: '#69a82f', texto: 'normalidade' },
  { valor: 1, cor: '#ffd23f', texto: 'atenção' },
  { valor: 2, cor: '#ff8a3d', texto: 'alerta' },
  { valor: 3, cor: '#ff3b4e', texto: 'inundação' },
];

const LEITURA_RECENTE_MS = 30 * 60 * 1000;
export const DADO_VELHO_MS = 60 * 60 * 1000; // o workflow roda a cada 15 min; passou disso, a coleta está falhando

async function carregar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function carregarDados() {
  // A Defesa Civil é opcional: se a fonte falhar, o mapa de chuva do CEMADEN continua funcionando.
  const [chuva, malha, rios] = await Promise.all([
    carregar('data/chuva-rs.json'),
    carregar('data/municipios-rs.geojson'),
    carregar('data/rios-rs.json').catch(() => null),
  ]);

  const indice = indexarMunicipios(malha);
  const porCodigo = new Map(indice.map((m) => [m.codIbge, m]));

  const pluviometros = new Map(); // codIbge -> estações de chuva ativas, das duas fontes
  const adicionar = (e, fonte) => {
    if (!e.ativa || !porCodigo.has(e.codIbge)) return;
    if (!pluviometros.has(e.codIbge)) pluviometros.set(e.codIbge, []);
    pluviometros.get(e.codIbge).push({ ...e, fonte });
  };
  chuva.estacoes.forEach((e) => adicionar(e, 'CEMADEN'));
  (rios?.pluviometros ?? []).forEach((e) => adicionar(e, 'Defesa Civil RS'));

  const agora = Date.now();
  const estacoesRio = new Map(); // codIbge -> estações de rio com leitura recente
  for (const e of rios?.estacoes ?? []) {
    const recente = agora - Date.parse(e.ultimaLeitura) <= LEITURA_RECENTE_MS && !e.emManutencao;
    const municipio = municipioDe(indice, e.lon, e.lat);
    if (!municipio) continue;
    if (!estacoesRio.has(municipio.codIbge)) estacoesRio.set(municipio.codIbge, []);
    estacoesRio.get(municipio.codIbge).push({ ...e, recente });
  }

  return { chuva, rios, malha, indice, porCodigo, pluviometros, estacoesRio };
}

// Maior acumulado entre as estações ativas do município; null se não houver nenhuma.
export function valorDoMunicipio(dados, codIbge, janela) {
  const estacoes = dados.pluviometros.get(codIbge);
  if (!estacoes?.length) return null;
  return Math.max(...estacoes.map((e) => e.acumuladoMm[janela] ?? 0));
}

// Pior situação de rio entre as estações recentes do município; null se não houver dado.
export function riscoDoMunicipio(dados, codIbge) {
  const niveis = (dados.estacoesRio.get(codIbge) ?? [])
    .filter((e) => e.recente && e.situacao !== null)
    .map((e) => e.situacao);
  return niveis.length ? Math.max(...niveis) : null;
}

// Municípios com dado de chuva mais próximos de um município sem dado.
export function vizinhosComDado(dados, codIbge, janela, quantos = 3) {
  const origem = dados.porCodigo.get(codIbge);
  return dados.indice
    .filter((m) => m.codIbge !== codIbge && valorDoMunicipio(dados, m.codIbge, janela) !== null)
    .map((m) => ({ municipio: m, km: distanciaKm(origem.centro, m.centro) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, quantos);
}

// Lista dos municípios com rio em atenção, alerta ou inundação, do mais grave ao menos.
export function municipiosEmRisco(dados) {
  return dados.indice
    .map((m) => ({ municipio: m, nivel: riscoDoMunicipio(dados, m.codIbge) }))
    .filter((x) => x.nivel !== null && x.nivel >= 1)
    .sort((a, b) => b.nivel - a.nivel || a.municipio.nome.localeCompare(b.municipio.nome, 'pt-BR'));
}

export const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
