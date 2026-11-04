// Busca o nível dos rios na API HidroWebService da ANA e grava data/rios-ana.json.
// Documentação (OpenAPI): https://www.ana.gov.br/hidrowebservice/api-docs
//
// Credenciais: ANA_IDENTIFICADOR e ANA_SENHA, lidas só do ambiente (segredos do GitHub no workflow; .env no
// computador, carregado com `node --env-file=.env scripts/fetch-ana.mjs`). Nada disso é impresso nem gravado.
//
// O cadastro das estações (data/ana-estacoes-rs.json) é versionado: muda raramente e o inventário completo do
// estado tem ~7 MB. Para refazê-lo: `node --env-file=.env scripts/fetch-ana.mjs --atualizar-cadastro`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cadastroAna, normalizarAna } from '../src/normalizar.js';

const BASE = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas';
const CADASTRO = new URL('../data/ana-estacoes-rs.json', import.meta.url);
const SAIDA = new URL('../data/rios-ana.json', import.meta.url);

const POR_REQUISICAO = 10; // limite da API: "Permitido até no Máximo 10 Estações por Requisição"
const SIMULTANEAS = 3; // educado com o servidor da ANA, que oscila (login de 19 s e 504 já observados)
const TENTATIVAS = 3;
const TIMEOUT_MS = 60_000;
const JANELA = 'HORA_6'; // leituras das últimas 6 h: dá a última e a variação
const FALHA_MAXIMA = 0.25; // acima disso a coleta é considerada falha e o último dado publicado é mantido

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Mensagem de erro sem corpo de resposta: o corpo de um 401 pode refletir o cabeçalho enviado.
async function requisitar(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function comTentativas(rotulo, fn) {
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`${rotulo}: tentativa ${i}/${TENTATIVAS} falhou: ${err.message} (${err.cause?.code ?? err.name})`);
      if (i === TENTATIVAS || err.status === 400 || err.status === 406) throw err; // repetir não adianta
      await esperar(2000 * i);
    }
  }
}

async function entrar() {
  const { ANA_IDENTIFICADOR: id, ANA_SENHA: senha } = process.env;
  if (!id || !senha) throw new Error('ANA_IDENTIFICADOR e ANA_SENHA não definidos');
  return comTentativas('login', async () => {
    const corpo = await requisitar(`${BASE}/OAUth/v1`, { Identificador: id, Senha: senha });
    // O portador é o JWT em `tokenautenticacao`; o campo `token` é outra coisa e não serve no Authorization.
    const jwt = corpo.items?.tokenautenticacao;
    if (!corpo.items?.sucesso || !jwt) throw new Error('login recusado');
    return { Authorization: `Bearer ${jwt}` };
  });
}

async function carregarCadastro(sessao, atualizar) {
  if (!atualizar) {
    try {
      return JSON.parse(await readFile(CADASTRO, 'utf8')).estacoes;
    } catch {
      console.warn('cadastro das estações ausente; buscando o inventário da ANA');
    }
  }
  const corpo = await comTentativas('inventário', () =>
    requisitar(`${BASE}/HidroInventarioEstacoes/v1?${new URLSearchParams({ 'Unidade Federativa': 'RS' })}`, sessao.headers),
  );
  const estacoes = cadastroAna(corpo.items ?? []);
  if (estacoes.length < 100) throw new Error(`inventário suspeito: só ${estacoes.length} estações`); // não sobrescreve com lixo
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(CADASTRO, JSON.stringify({ geradoEm: new Date().toISOString(), fonte: 'ANA HidroWebService', estacoes }, null, 1));
  console.log(`cadastro: ${estacoes.length} estações de rio -> data/ana-estacoes-rs.json`);
  return estacoes;
}

const dataDeBrasilia = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const sessao = { headers: await entrar() };
const cadastro = await carregarCadastro(sessao, process.argv.includes('--atualizar-cadastro'));

const lotes = [];
for (let i = 0; i < cadastro.length; i += POR_REQUISICAO) lotes.push(cadastro.slice(i, i + POR_REQUISICAO));

const linhas = [];
let falhos = 0;
let proximo = 0;
async function trabalhador() {
  while (proximo < lotes.length) {
    const lote = lotes[proximo++];
    try {
      const url = `${BASE}/HidroinfoanaSerieTelemetricaAdotada/v2?${new URLSearchParams({
        Codigos_Estacoes: lote.map((e) => e.codigo).join(','),
        'Tipo Filtro Data': 'DATA_LEITURA',
        'Data de Busca (yyyy-MM-dd)': dataDeBrasilia(),
        'Range Intervalo de busca': JANELA,
      })}`;
      const corpo = await comTentativas(`lote ${proximo}/${lotes.length}`, async () => {
        try {
          return await requisitar(url, sessao.headers);
        } catch (err) {
          if (err.status !== 401) throw err;
          sessao.headers = await entrar(); // sessão expirou no meio da coleta
          throw err;
        }
      });
      linhas.push(...(corpo.items ?? []));
    } catch {
      falhos++;
    }
  }
}
await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhador));

if (falhos / lotes.length > FALHA_MAXIMA) {
  throw new Error(`${falhos} de ${lotes.length} lotes falharam: mantendo o último dado publicado`);
}

const estacoes = normalizarAna(cadastro, linhas);
if (!estacoes.length) throw new Error('nenhuma estação com leitura válida: mantendo o último dado publicado');

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  SAIDA,
  JSON.stringify({ geradoEm: new Date().toISOString(), fonte: 'ANA', lotesFalhos: falhos, estacoes }, null, 1),
);
console.log(
  `${estacoes.length} de ${cadastro.length} estações com leitura (${cadastro.length - estacoes.length} sem leitura nas últimas 6 h; ${falhos} lotes falhos) -> data/rios-ana.json`,
);
