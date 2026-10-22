// Busca as estações de nível de rio da Defesa Civil do RS e grava data/rios-rs.json.
// API: https://sistemas.defesacivil.rs.gov.br/api-redehidrometeorologica
// A API só aceita o texto exato da consulta documentada (scripts/consultas/tags_data.graphql).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { indexarMunicipios } from '../src/geo.js';
import { normalizarDefesaCivil } from '../src/normalizar.js';

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

const { qualle_meteorologia: bruto } = await buscar();

// O município de cada estação vem de ponto-em-polígono na malha do IBGE.
const indice = indexarMunicipios(JSON.parse(await readFile(new URL('../data/municipios-rs.geojson', import.meta.url), 'utf8')));
const { estacoes, pluviometros } = normalizarDefesaCivil(bruto, Date.now(), indice);
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
