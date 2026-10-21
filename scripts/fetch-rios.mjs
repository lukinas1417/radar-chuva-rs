// Busca as estações de nível de rio da Defesa Civil do RS e grava data/rios-rs.json.
// API: https://sistemas.defesacivil.rs.gov.br/api-redehidrometeorologica
// A API só aceita o texto exato da consulta documentada (scripts/consultas/tags_data.graphql).
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ENDPOINT = 'https://redehidrometeorologica.defesacivil.rs.gov.br/graphql';
const QUERY = await readFile(new URL('./consultas/tags_data.graphql', import.meta.url), 'utf8');
const SAIDA = new URL('../data/rios-rs.json', import.meta.url);
const TENTATIVAS = 3;

async function buscar() {
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: QUERY, operationName: 'Tags_data' }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const corpo = await res.json();
      if (corpo.errors) throw new Error(JSON.stringify(corpo.errors).slice(0, 200));
      return corpo.data.tags_data;
    } catch (err) {
      console.warn(`tentativa ${i}/${TENTATIVAS} falhou: ${err.message} (${err.cause?.code ?? err.name})`);
      if (i === TENTATIVAS) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// "2026-10-21T16:55:00.000" (horário de Brasília, sem offset) -> ISO com offset
const paraIso = (t) => (t ? `${t.slice(0, 19)}-03:00` : null);
const valor = (campo) => campo?.value ?? null;

const { qualle_meteorologia: bruto } = await buscar();

// --- município de cada estação, por ponto-em-polígono na malha do IBGE ---
const malha = JSON.parse(await readFile(new URL('../data/municipios-rs.geojson', import.meta.url), 'utf8'));

function dentroDoAnel([x, y], anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
const dentroDoPoligono = (ponto, [externo, ...buracos]) =>
  dentroDoAnel(ponto, externo) && !buracos.some((b) => dentroDoAnel(ponto, b));

function municipioDe(lon, lat) {
  for (const f of malha.features) {
    const { type, coordinates } = f.geometry;
    const poligonos = type === 'Polygon' ? [coordinates] : coordinates;
    if (poligonos.some((p) => dentroDoPoligono([lon, lat], p))) return f.properties.codIbge;
  }
  return null;
}

const estacoes = bruto
  .filter((e) => e.show === 'true' && valor(e.data?.rio?.rio_nivel) !== null)
  .map((e) => ({
    codigo: e.codigo,
    nome: e.name.general,
    bacia: e.position.bacia,
    regiao: e.position.regiao,
    lat: e.position.latitude,
    lon: e.position.longitude,
    ultimaLeitura: paraIso(e.timestamp),
    nivelM: valor(e.data.rio.rio_nivel),
    variacaoM: valor(e.data.rio.rio_nivel_tendencia),
    // 0 normalidade, 1 atenção, 2 alerta, 3 inundação, null sem leitura/sem limiar cadastrado
    situacao: e.data.rio.rio_alarmes?.inundacao?.ativo?.value
      ? valor(e.data.rio.rio_alarmes.inundacao.status)
      : null,
    emManutencao: e.resource?.estacao?.estado?.manutencao?.value === true,
    sensorValido: e.data.rio.homologacao?.relacao?.valido?.value !== false,
    chuvaMm: {
      '1h': valor(e.data.chuva?.acumulado?.h001),
      '24h': valor(e.data.chuva?.acumulado?.h024),
      '7d': valor(e.data.chuva?.acumulado?.h168),
    },
  }));

// Pluviômetros: todas as estações com chuva válida, inclusive as sem sensor de rio.
// valor null = a estação não enviou a medida nos últimos 20 minutos (documentação da API).
const LEITURA_RECENTE_MS = 30 * 60 * 1000;
const agora = Date.now();
const pluviometros = bruto
  .filter((e) => e.show === 'true' && e.data?.chuva?.homologacao?.relacao?.valido?.value !== false)
  .map((e) => {
    const ac = e.data?.chuva?.acumulado;
    const ultimaLeitura = paraIso(e.timestamp);
    const acumuladoMm = {
      '1h': valor(ac?.h001),
      '6h': valor(ac?.h006),
      '24h': valor(ac?.h024),
      '48h': valor(ac?.h048),
    };
    const ativa =
      Date.parse(ultimaLeitura) >= agora - LEITURA_RECENTE_MS &&
      e.resource?.estacao?.estado?.manutencao?.value !== true &&
      Object.values(acumuladoMm).every((v) => v !== null);
    return {
      codigo: e.codigo,
      nome: e.name.general,
      codIbge: municipioDe(e.position.longitude, e.position.latitude),
      ultimaLeitura,
      ativa,
      acumuladoMm,
    };
  });
const semMunicipio = pluviometros.filter((p) => p.codIbge === null);

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  SAIDA,
  JSON.stringify(
    { geradoEm: new Date().toISOString(), fonte: 'Defesa Civil RS', estacoes, pluviometros: pluviometros.filter((p) => p.codIbge !== null) },
    null,
    1,
  ),
);
console.log(
  `${estacoes.length} estações de rio, ${pluviometros.length - semMunicipio.length} pluviômetros (${semMunicipio.length} sem município na malha) -> data/rios-rs.json`,
);
