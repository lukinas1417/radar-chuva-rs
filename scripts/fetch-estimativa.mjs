// Estimativa (últimas horas) e previsão (próximas horas) de chuva por modelo (Open-Meteo) no centro de cada município, gravada em data/estimativa-rs.json.
// Não é medição: complementa os pluviômetros onde eles não existem ou estão sem dado.
// API gratuita para uso não comercial (CC BY 4.0), com limite de chamadas: cada município conta como uma.
// Por isso a coleta é de 3 em 3 horas, mesmo com o workflow rodando a cada 15 minutos: se o arquivo
// já publicado (variável PUBLICADO) é recente, ele é reaproveitado sem consultar a API.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { indexarMunicipios } from '../src/geo.js';
import { VERSAO_ESTIMATIVA, estimativaPrecisaRenovar, normalizarEstimativa } from '../src/normalizar.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const SAIDA = new URL('../data/estimativa-rs.json', import.meta.url);
const POR_PEDIDO = 50;
const TENTATIVAS = 4;
const MINIMO_COBERTURA = 0.9;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const gravar = async (conteudo) => {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(SAIDA, JSON.stringify(conteudo, null, 1));
};

async function reaproveitar() {
  if (!process.env.PUBLICADO) return false;
  try {
    const res = await fetch(process.env.PUBLICADO, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return false;
    const anterior = await res.json();
    if (anterior.versao !== VERSAO_ESTIMATIVA || estimativaPrecisaRenovar(anterior.geradoEm, Date.now())) return false;
    await gravar(anterior);
    console.log(`estimativa de ${anterior.geradoEm} ainda é recente; reaproveitada sem consultar a API`);
    return true;
  } catch {
    return false;
  }
}

async function buscarLote(pontos) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('latitude', pontos.map((p) => p.lat).join(','));
  url.searchParams.set('longitude', pontos.map((p) => p.lon).join(','));
  url.searchParams.set('hourly', 'precipitation');
  url.searchParams.set('past_days', '2');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('timeformat', 'unixtime');
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const corpo = await res.json();
      const lista = Array.isArray(corpo) ? corpo : [corpo];
      if (lista.length !== pontos.length) throw new Error(`esperava ${pontos.length} pontos, veio ${lista.length}`);
      return lista;
    } catch (err) {
      console.warn(`lote: tentativa ${i}/${TENTATIVAS} falhou: ${err.message}`);
      if (i === TENTATIVAS) throw err;
      await dormir(20_000 * i); // inclui o caso de limite de chamadas (HTTP 429)
    }
  }
}

if (!(await reaproveitar())) {
  const malha = JSON.parse(await readFile(new URL('../data/municipios-rs.geojson', import.meta.url), 'utf8'));
  const indice = indexarMunicipios(malha);
  const pontos = indice.map((m) => ({ lon: m.centro[0].toFixed(2), lat: m.centro[1].toFixed(2) }));
  const respostas = [];
  for (let i = 0; i < pontos.length; i += POR_PEDIDO) {
    if (i) await dormir(2000);
    respostas.push(...(await buscarLote(pontos.slice(i, i + POR_PEDIDO))));
  }
  const agora = Date.now();
  const municipios = normalizarEstimativa(respostas, indice.map((m) => m.codIbge), agora);
  if (municipios.length < indice.length * MINIMO_COBERTURA) {
    throw new Error(`só ${municipios.length} de ${indice.length} municípios com estimativa completa; dado descartado`);
  }
  await gravar({ versao: VERSAO_ESTIMATIVA, geradoEm: new Date(agora).toISOString(), fonte: 'Open-Meteo', municipios });
  console.log(`${municipios.length} de ${indice.length} municípios -> data/estimativa-rs.json`);
}
