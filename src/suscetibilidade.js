// Cartas de Suscetibilidade do SGB (Serviço Geológico do Brasil), consumidas ao vivo pelo WMS: nada é copiado para cá.
// Uso autorizado pela Ouvidoria do SGB/CPRM, com citação da fonte e aviso de escala, finalidade e limitações.
import { semAcento } from './dados.js';

const WMS = 'https://geoservicos.sgb.gov.br/geoserver/gestao-territorial/wms';

// Municípios do RS com carta publicada (consulta ao WFS do SGB em 29/10/2026; a página oficial do SGB é a referência).
const MUNICIPIOS_INUNDACAO = [
  'ALEGRETE', 'ALTO FELIZ', 'ALVORADA', 'BENTO GONÇALVES', 'CACHOEIRINHA', 'CANOAS', 'CAPÃO DO LEÃO', 'CAXIAS DO SUL',
  'DOM PEDRITO', 'ELDORADO DO SUL', 'ENCANTADO', 'ESTRELA', 'GRAMADO', 'GRAVATAÍ', 'IGREJINHA', 'LAJEADO', 'MAMPITUBA',
  'NOVO HAMBURGO', 'PORTO ALEGRE', 'RIO GRANDE', 'SANTA MARIA', 'SÃO LOURENÇO DO SUL', 'TORRES', 'URUGUAIANA',
];
const MUNICIPIOS_MOVIMENTO = [
  'ALEGRETE', 'ALTO FELIZ', 'ALVORADA', 'BENTO GONÇALVES', 'CACHOEIRINHA', 'CANOAS', 'CAPÃO DO LEÃO', 'CAXIAS DO SUL',
  'DOM PEDRITO', 'ELDORADO DO SUL', 'ESTRELA', 'FARROUPILHA', 'GRAMADO', 'GRAVATAÍ', 'IGREJINHA', 'LAJEADO', 'MAMPITUBA',
  'NOVA PETRÓPOLIS', 'NOVO HAMBURGO', 'PORTO ALEGRE', 'RIO GRANDE', 'SANTA MARIA', 'SÃO LOURENÇO DO SUL', 'TORRES',
  'URUGUAIANA', 'VIAMÃO',
];

// O estilo do SGB (cor chapada) se confundiria com a escala de chuva e esconderia o que há embaixo, e o servidor ignora
// estilo enviado na requisição (sld_body). Então o navegador baixa o tile do WMS, descobre a classe de cada pixel pela
// cor original do SGB e redesenha como hachura: o ângulo das linhas diz o tipo, a espessura diz a classe.
const PERIODO = 16; // px no tile de 1024: 8 px de tela, o mesmo espaçamento em qualquer zoom
export const TIPOS = {
  inundacao: {
    rotulo: 'Inundação',
    camada: 'gestao-territorial:suscet_inundacao',
    cor: [255, 184, 77], // âmbar
    cor_css: '#ffb84d',
    diagonal: 1, // linhas "/"
    classes: { alta: [90, 90, 255], media: [160, 160, 255], baixa: [208, 208, 255] }, // cores originais do SGB
    municipios: new Set(MUNICIPIOS_INUNDACAO.map(semAcento)),
  },
  movimento: {
    rotulo: 'Movimento de massa',
    camada: 'gestao-territorial:suscet_movimento_de_massa',
    cor: [255, 107, 154], // rosa
    cor_css: '#ff6b9a',
    diagonal: -1, // linhas "\"
    classes: { alta: [196, 109, 27], media: [247, 195, 72], baixa: [255, 255, 128] },
    municipios: new Set(MUNICIPIOS_MOVIMENTO.map(semAcento)),
  },
};
// Largura da linha (px do tile) e opacidade por classe: quanto mais alta a classe, mais cheia a hachura.
const TRACO = { alta: [9, 240], media: [5, 225], baixa: [3, 205] };

// Troca, no próprio vetor de pixels RGBA, a cor chapada do SGB pela hachura. Pixel quase transparente fica transparente.
export function hachurar(rgba, largura, altura, tipo) {
  const { classes, cor, diagonal } = TIPOS[tipo];
  const nomes = Object.keys(classes);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      if (rgba[i + 3] < 100) { rgba[i + 3] = 0; continue; }
      let melhor = 'baixa';
      let menor = Infinity;
      for (const n of nomes) {
        const c = classes[n];
        const d = (rgba[i] - c[0]) ** 2 + (rgba[i + 1] - c[1]) ** 2 + (rgba[i + 2] - c[2]) ** 2;
        if (d < menor) { menor = d; melhor = n; }
      }
      const [espessura, opacidade] = TRACO[melhor];
      const fase = (((x + diagonal * y) % PERIODO) + PERIODO) % PERIODO;
      rgba[i] = cor[0]; rgba[i + 1] = cor[1]; rgba[i + 2] = cor[2];
      rgba[i + 3] = fase < espessura ? opacidade : 0;
    }
  }
  return rgba;
}

// Caixa (EPSG:3857) de um tile XYZ.
export function caixaDoTile(z, x, y) {
  const mundo = 40075016.68557849;
  const lado = mundo / 2 ** z;
  const minX = -mundo / 2 + x * lado;
  const maxY = mundo / 2 - y * lado;
  return [minX, maxY - lado, minX + lado, maxY];
}

export function urlWms(tipo, caixa, px = 1024) {
  const camada = encodeURIComponent(TIPOS[tipo].camada);
  return `${WMS}?service=WMS&version=1.1.1&request=GetMap&layers=${camada}&styles=&format=image/png&transparent=true`
    + `&srs=EPSG:3857&bbox=${caixa.join(',')}&width=${px}&height=${px}&cql_filter=uf%3D%27RS%27`;
}

export const temCarta = (tipo, nomeMunicipio) => TIPOS[tipo].municipios.has(semAcento(nomeMunicipio));

// ---------- consultas ao WFS (sem geometria: só classe, área e ano) ----------
const WFS = WMS.replace('/wms', '/ows');

function urlWfs(tipo, filtro, propriedades, formato) {
  const p = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: TIPOS[tipo].camada,
    outputFormat: formato,
    propertyName: propriedades,
    cql_filter: filtro,
  });
  return WFS + '?' + p;
}

const CLASSES = { alta: 'alta', media: 'media', baixa: 'baixa' };
const classeDe = (texto) => CLASSES[semAcento(texto.trim())] ?? null;

// Soma a área (km²) de cada classe a partir do CSV do WFS (colunas FID, classe, area_km2, ano).
export function somarAreas(csv) {
  const [cabecalho, ...linhas] = csv.trim().split(/\r?\n/);
  const col = cabecalho.split(',');
  const [iClasse, iArea, iAno] = ['classe', 'area_km2', 'ano'].map((c) => col.indexOf(c));
  const areas = { alta: 0, media: 0, baixa: 0 };
  const anos = new Set();
  for (const linha of linhas) {
    const c = linha.split(',');
    const classe = classeDe(c[iClasse] ?? '');
    const area = Number(c[iArea]);
    if (!classe || !Number.isFinite(area)) continue;
    areas[classe] += area;
    if (c[iAno]) anos.add(Number(c[iAno]));
  }
  return { ...areas, total: areas.alta + areas.media + areas.baixa, anos: [...anos].sort() };
}

const escapar = (texto) => texto.replace(/'/g, "''");
const memoria = new Map();

// Área por classe de um município. Fica em memória: o mesmo município não é consultado duas vezes.
export function areasDoMunicipio(tipo, nome) {
  const chave = tipo + '|' + nome;
  if (!memoria.has(chave)) {
    const filtro = "uf='RS' AND municipio='" + escapar(nome.toUpperCase()) + "'";
    const pedido = fetch(urlWfs(tipo, filtro, 'classe,area_km2,ano', 'csv')).then(async (res) => {
      if (!res.ok) throw new Error('SGB respondeu ' + res.status);
      return somarAreas(await res.text());
    });
    pedido.catch(() => memoria.delete(chave)); // falha não fica guardada: tenta de novo na próxima vez
    memoria.set(chave, pedido);
  }
  return memoria.get(chave);
}

// Classe e ano da carta no ponto clicado, ou null se o ponto está fora da área mapeada. No WFS 2.0 a ordem é latitude, longitude.
export async function classeNoPonto(tipo, lon, lat) {
  const filtro = 'INTERSECTS(geom,POINT(' + lat + ' ' + lon + '))';
  const res = await fetch(urlWfs(tipo, filtro, 'classe,ano', 'application/json'));
  if (!res.ok) throw new Error('SGB respondeu ' + res.status);
  const p = (await res.json()).features?.[0]?.properties;
  const classe = p ? classeDe(p.classe) : null;
  return classe ? { classe, ano: p.ano } : null;
}
