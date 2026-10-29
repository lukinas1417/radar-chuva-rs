// Cartas de Suscetibilidade do SGB (Serviço Geológico do Brasil), consumidas ao vivo pelo WMS: nada é copiado para cá.
// Uso autorizado pela Ouvidoria do SGB/CPRM, com citação da fonte e aviso de escala, finalidade e limitações.
import { semAcento } from './dados.js';

const WMS = 'https://geoservicos.sgb.gov.br/geoserver/gestao-territorial/wms';
// Zoom a partir do qual a camada aparece: a carta é de escala municipal e, no estado todo, viraria só mancha.
export const ZOOM_MINIMO_CARTA = 7;

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

// O estilo do SGB (azul/roxo chapado) se confundiria com a escala de chuva, e o servidor ignora estilo enviado na
// requisição (sld_body). Então o matiz é girado no navegador: cada camada tem um giro próprio (a de inundação nasce azul e a de movimento de massa nasce marrom/amarela): inundação em âmbar, movimento de massa em rosa.
export const TIPOS = {
  inundacao: {
    rotulo: 'Inundação',
    camada: 'gestao-territorial:suscet_inundacao',
    giro: 155,
    cor: '#ffb84d',
    municipios: new Set(MUNICIPIOS_INUNDACAO.map(semAcento)),
  },
  movimento: {
    rotulo: 'Movimento de massa',
    camada: 'gestao-territorial:suscet_movimento_de_massa',
    giro: 300,
    cor: '#ff6b9a',
    municipios: new Set(MUNICIPIOS_MOVIMENTO.map(semAcento)),
  },
};

export function urlTiles(tipo) {
  const camada = encodeURIComponent(TIPOS[tipo].camada);
  return `${WMS}?service=WMS&version=1.1.1&request=GetMap&layers=${camada}&styles=&format=image/png&transparent=true`
    + `&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&cql_filter=uf%3D%27RS%27`;
}

export const temCarta = (tipo, nomeMunicipio) => TIPOS[tipo].municipios.has(semAcento(nomeMunicipio));
