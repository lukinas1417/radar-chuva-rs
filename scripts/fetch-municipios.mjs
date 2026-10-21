// Baixa a malha municipal do RS (IBGE) e grava data/municipios-rs.geojson.
// Cada feature recebe codIbge (7 dígitos) e nome.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://servicodados.ibge.gov.br/api';
const MALHA = `${BASE}/v3/malhas/estados/43?intrarregiao=municipio&formato=application/vnd.geo%2Bjson&qualidade=minima`;
const NOMES = `${BASE}/v1/localidades/estados/43/municipios`;

const json = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
};

const [malha, municipios] = await Promise.all([json(MALHA), json(NOMES)]);
const nomePorCodigo = new Map(municipios.map((m) => [String(m.id), m.nome]));

const features = malha.features.map((f) => {
  const codIbge = Number(f.properties.codarea);
  return { ...f, properties: { codIbge, nome: nomePorCodigo.get(String(codIbge)) ?? null } };
});

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../data/municipios-rs.geojson', import.meta.url),
  JSON.stringify({ type: 'FeatureCollection', features }),
);
console.log(`${features.length} municípios -> data/municipios-rs.geojson`);
