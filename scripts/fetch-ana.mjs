// Busca o nível dos rios e a chuva na API HidroWebService da ANA e grava data/rios-ana.json e data/chuva-ana.json.
// Documentação (OpenAPI): https://www.ana.gov.br/hidrowebservice/api-docs
//
// Credenciais: ANA_IDENTIFICADOR e ANA_SENHA, lidas só do ambiente (segredos do GitHub no workflow; .env no
// computador, carregado com `node --env-file=.env scripts/fetch-ana.mjs`). Nada disso é impresso nem gravado.
//
// Uma única rodada de consultas (48 h de leituras) alimenta os dois arquivos. Eles são separados de propósito, para
// cada um ter a própria data de coleta e o próprio reaproveitamento do último dado publicado.
//
// O cadastro das estações (data/ana-estacoes-rs.json) é versionado: muda raramente e o inventário completo do
// estado tem ~7 MB. Para refazê-lo: `node --env-file=.env scripts/fetch-ana.mjs --atualizar-cadastro`.
//   - Estações de rio: as telemétricas em operação, menos as da Defesa Civil RS (já são fonte do mapa).
//   - Pluviômetros: o inventário marca como "telemétricos" ~480, mas só uma fração tem dado na API (observado: 34),
//     e nenhum campo do inventário diz quais. Ao refazer o cadastro, cada um é sondado e só os que respondem ficam;
//     assim a coleta de 15 em 15 min não faz dezenas de consultas inúteis. Estação que voltar a transmitir só
//     reaparece no próximo refazer do cadastro.
//   - A chuva também vem das estações de rio que têm pluviômetro acoplado (a maioria).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { indexarMunicipios } from '../src/geo.js';
import { cadastroAna, cadastroAnaChuva, normalizarAna, normalizarAnaChuva } from '../src/normalizar.js';

const BASE = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas';
const CADASTRO = new URL('../data/ana-estacoes-rs.json', import.meta.url);
const SAIDA_RIOS = new URL('../data/rios-ana.json', import.meta.url);
const SAIDA_CHUVA = new URL('../data/chuva-ana.json', import.meta.url);

const POR_REQUISICAO = 10; // limite da API: "Permitido até no Máximo 10 Estações por Requisição"
const SIMULTANEAS = 3; // educado com o servidor da ANA, que oscila (login de 19 s e 504 já observados)
const TENTATIVAS = 3;
const TIMEOUT_MS = 60_000;
// 48 h: a janela de 24 h de chuva termina na última leitura da estação, que pode estar atrasada.
const JANELA = 'DIAS_2';
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

const dataDeBrasilia = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const sessao = { headers: await entrar() };

// Consulta a série de todas as estações, 10 por vez e poucas em paralelo. Devolve as linhas e quantos lotes falharam.
// ATENÇÃO: quando nenhuma estação do lote tem dado, a API devolve linhas de OUTRAS estações (observado). Por isso
// quem usa estas linhas sempre as cruza com o cadastro, e nunca confia que o que voltou foi o que foi pedido.
async function coletar(estacoes, rotulo) {
  const lotes = [];
  for (let i = 0; i < estacoes.length; i += POR_REQUISICAO) lotes.push(estacoes.slice(i, i + POR_REQUISICAO));
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
        const corpo = await comTentativas(`${rotulo} ${proximo}/${lotes.length}`, async () => {
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
    throw new Error(`${rotulo}: ${falhos} de ${lotes.length} lotes falharam: mantendo o último dado publicado`);
  }
  return { linhas, falhos };
}

async function carregarCadastro(atualizar) {
  if (!atualizar) {
    try {
      const { estacoes, pluviometros } = JSON.parse(await readFile(CADASTRO, 'utf8'));
      if (estacoes?.length && pluviometros?.length) return { estacoes, pluviometros };
    } catch {
      /* cai para o inventário */
    }
    console.warn('cadastro das estações ausente ou incompleto; buscando o inventário da ANA');
  }
  const corpo = await comTentativas('inventário', () =>
    requisitar(`${BASE}/HidroInventarioEstacoes/v1?${new URLSearchParams({ 'Unidade Federativa': 'RS' })}`, sessao.headers),
  );
  const estacoes = cadastroAna(corpo.items ?? []);
  const candidatas = cadastroAnaChuva(corpo.items ?? []);
  // não sobrescreve o cadastro com um inventário truncado
  if (estacoes.length < 100 || candidatas.length < 100) throw new Error(`inventário suspeito: ${estacoes.length} rios, ${candidatas.length} pluviômetros`);

  // Sonda os pluviômetros: só ficam os que devolvem linhas com o PRÓPRIO código.
  const { linhas } = await coletar(candidatas, 'sondagem');
  const comDado = new Set(linhas.map((l) => String(l.codigoestacao)));
  const pluviometros = candidatas.filter((p) => comDado.has(p.codigo));
  if (pluviometros.length < 5) throw new Error(`sondagem suspeita: só ${pluviometros.length} de ${candidatas.length} pluviômetros responderam`);

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(CADASTRO, JSON.stringify({ geradoEm: new Date().toISOString(), fonte: 'ANA HidroWebService', estacoes, pluviometros }, null, 1));
  console.log(`cadastro: ${estacoes.length} estações de rio e ${pluviometros.length} de ${candidatas.length} pluviômetros com dado -> data/ana-estacoes-rs.json`);
  return { estacoes, pluviometros };
}

const cadastro = await carregarCadastro(process.argv.includes('--atualizar-cadastro'));
const indice = indexarMunicipios(JSON.parse(await readFile(new URL('../data/municipios-rs.geojson', import.meta.url), 'utf8')));

const gravar = (destino, objeto) => mkdir(new URL('../data/', import.meta.url), { recursive: true }).then(() => writeFile(destino, JSON.stringify(objeto, null, 1)));

// Uma só rodada de consultas para os dois arquivos: rios e pluviômetros não se repetem (códigos distintos).
const agora = Date.now();
const { linhas, falhos } = await coletar([...cadastro.estacoes, ...cadastro.pluviometros], 'coleta');

let falhou = false;

const rios = normalizarAna(cadastro.estacoes, linhas);
if (rios.length) {
  await gravar(SAIDA_RIOS, { geradoEm: new Date(agora).toISOString(), fonte: 'ANA', lotesFalhos: falhos, estacoes: rios });
  console.log(`rios: ${rios.length} de ${cadastro.estacoes.length} estações com leitura (${falhos} lotes falhos) -> data/rios-ana.json`);
} else {
  console.error('rios: nenhuma estação com leitura válida: mantendo o último dado publicado');
  falhou = true;
}

// A chuva vem dos pluviômetros e também das estações de rio que têm pluviômetro acoplado.
const todosPluv = normalizarAnaChuva([...cadastro.pluviometros, ...cadastro.estacoes], linhas, agora, indice);
const pluviometros = todosPluv.filter((p) => p.codIbge !== null);
if (pluviometros.length) {
  await gravar(SAIDA_CHUVA, { geradoEm: new Date(agora).toISOString(), fonte: 'ANA', lotesFalhos: falhos, pluviometros });
  const ativos = pluviometros.filter((p) => p.ativa).length;
  console.log(`chuva: ${pluviometros.length} estações com chuva medida, ${ativos} ativas (${todosPluv.length - pluviometros.length} fora da malha) -> data/chuva-ana.json`);
} else {
  console.error('chuva: nenhuma estação com leitura válida: mantendo o último dado publicado');
  falhou = true;
}

if (falhou) process.exitCode = 1;
