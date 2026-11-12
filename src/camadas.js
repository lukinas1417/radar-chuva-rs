// Camadas que o usuário pode ligar e desligar, para o mapa não ficar poluído. Sem DOM e sem mapa: só a lista, os
// atalhos e a leitura/gravação da escolha, para poderem ser testados.

// `grupo` só organiza o painel. A ordem é a de exibição.
export const CAMADAS = [
  { id: 'chuva', grupo: 'Chuva e rios', grupoEn: 'Rain and rivers', rotulo: 'Chuva nos municípios', rotuloEn: 'Rain by municipality', nota: 'a cor de cada município', notaEn: 'the colour of each municipality' },
  { id: 'risco', grupo: 'Chuva e rios', grupoEn: 'Rain and rivers', rotulo: 'Contorno dos rios em risco', rotuloEn: 'Outline of rivers at risk', nota: 'Defesa Civil; o aviso no topo continua', notaEn: 'Civil Defense; the notice at the top stays' },
  { id: 'ana', grupo: 'Chuva e rios', grupoEn: 'Rain and rivers', rotulo: 'Estações da ANA', rotuloEn: 'ANA stations', nota: 'pontos com a leitura, ao aproximar o mapa', notaEn: 'dots with the reading, when zoomed in' },
  { id: 'inundacao', grupo: 'Terreno', grupoEn: 'Terrain', rotulo: 'Carta de inundação', rotuloEn: 'Flood chart', nota: 'SGB, só em alguns municípios', notaEn: 'SGB, only some municipalities' },
  { id: 'movimento', grupo: 'Terreno', grupoEn: 'Terrain', rotulo: 'Carta de movimento de massa', rotuloEn: 'Mass movement chart', nota: 'SGB, só em alguns municípios', notaEn: 'SGB, only some municipalities' },
  { id: 'sombra', grupo: 'Terreno', grupoEn: 'Terrain', rotulo: 'Sombreado do relevo', rotuloEn: 'Terrain shading', nota: '', notaEn: '' },
  { id: 'noticias', grupo: 'Painéis', grupoEn: 'Panels', rotulo: 'Notícias', rotuloEn: 'News', nota: '', notaEn: '' },
  { id: 'legenda', grupo: 'Painéis', grupoEn: 'Panels', rotulo: 'Legenda', rotuloEn: 'Legend', nota: '', notaEn: '' },
];

const IDS = CAMADAS.map((c) => c.id);

// Tudo ligado, como o mapa sempre foi.
export const todasLigadas = () => Object.fromEntries(IDS.map((id) => [id, true]));

// Atalho para despoluir: só a chuva (e a legenda dela). O aviso de rios em risco, no topo, não é uma camada e fica.
export const soChuva = () => ({ ...Object.fromEntries(IDS.map((id) => [id, false])), chuva: true, legenda: true });

// Texto salvo -> estado completo. Aceita só chaves conhecidas com valor verdadeiro/falso; o resto (texto corrompido,
// chave antiga, tipo errado) cai no padrão, em vez de deixar a página sem camada alguma por causa de um valor ruim.
export function lerCamadas(texto) {
  const estado = todasLigadas();
  let salvo;
  try {
    salvo = JSON.parse(texto);
  } catch {
    return estado;
  }
  if (!salvo || typeof salvo !== 'object' || Array.isArray(salvo)) return estado;
  for (const id of IDS) if (typeof salvo[id] === 'boolean') estado[id] = salvo[id];
  return estado;
}

export const CHAVE_CAMADAS = 'radar-camadas';

// O armazenamento do navegador pode faltar ou lançar erro (navegação privada, bloqueio): a escolha vale na sessão.
export function carregarCamadas(armazenamento = globalThis.localStorage) {
  try {
    return lerCamadas(armazenamento.getItem(CHAVE_CAMADAS));
  } catch {
    return todasLigadas();
  }
}

export function gravarCamadas(estado, armazenamento = globalThis.localStorage) {
  try {
    armazenamento.setItem(CHAVE_CAMADAS, JSON.stringify(estado));
  } catch {
    /* sem armazenamento: não persiste, e tudo bem */
  }
}

// Quantas camadas estão desligadas, para o botão avisar que algo está oculto.
export const desligadas = (estado) => CAMADAS.filter((c) => !estado[c.id]).length;
