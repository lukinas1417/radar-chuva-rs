// Camadas que o usuário pode ligar e desligar, para o mapa não ficar poluído. Sem DOM e sem mapa: só a lista, os
// atalhos e a leitura/gravação da escolha, para poderem ser testados.

// `grupo` só organiza o painel. A ordem é a de exibição.
export const CAMADAS = [
  { id: 'chuva', grupo: 'Chuva e rios', rotulo: 'Chuva nos municípios', nota: 'a cor de cada município' },
  { id: 'risco', grupo: 'Chuva e rios', rotulo: 'Contorno dos rios em risco', nota: 'Defesa Civil; o aviso no topo continua' },
  { id: 'ana', grupo: 'Chuva e rios', rotulo: 'Estações da ANA', nota: 'pontos com a leitura, ao aproximar o mapa' },
  { id: 'inundacao', grupo: 'Terreno', rotulo: 'Carta de inundação', nota: 'SGB, só em alguns municípios' },
  { id: 'movimento', grupo: 'Terreno', rotulo: 'Carta de movimento de massa', nota: 'SGB, só em alguns municípios' },
  { id: 'sombra', grupo: 'Terreno', rotulo: 'Sombreado do relevo', nota: '' },
  { id: 'noticias', grupo: 'Painéis', rotulo: 'Notícias', nota: '' },
  { id: 'legenda', grupo: 'Painéis', rotulo: 'Legenda', nota: '' },
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
