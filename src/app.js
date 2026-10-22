// Interface: busca, localização, cartão do município, legenda e estado na URL.
import {
  DADO_VELHO_MS,
  FAIXAS,
  JANELAS,
  SITUACOES,
  carregarDados,
  faixaDe,
  municipiosEmRisco,
  semAcento,
  valorDoMunicipio,
  vizinhosComDado,
} from './dados.js';
import { municipioDe } from './geo.js';
import { criarMapa } from './mapa.js';
import { noticiasPara } from './noticias.js';

const $ = (id) => document.getElementById(id);
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const fmtMm = (v) => (v === 0 ? '0' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtM = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
function fmtHora(iso) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return mesmoDia(d, new Date()) ? hora : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

const TEXTO_JANELA = {
  '1h': 'na última hora',
  '6h': 'nas últimas 6 horas',
  '24h': 'nas últimas 24 horas',
  '48h': 'nas últimas 48 horas',
};
const GRAVIDADE = ['normalidade', 'atenção', 'alerta', 'inundação'];
const COR_ALERTA = '#ffd23f';

// ---------- aviso temporário ----------
let temporizadorAviso;
function mostrarAviso(texto, alerta = false, ms = 7000) {
  const el = $('aviso');
  el.textContent = texto;
  el.classList.toggle('alerta', alerta);
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.hidden = true), ms);
}

// ---------- dados ----------
let dados;
try {
  dados = await carregarDados();
} catch (erro) {
  console.error(erro);
  $('status-texto').textContent = 'Sem dados';
  mostrarAviso('Não foi possível carregar os dados agora. Tente novamente em instantes.', true, 15000);
  throw erro;
}

// ---------- estado ----------
const parametros = new URLSearchParams(location.hash.slice(1));
let janela = JANELAS.includes(parametros.get('j')) ? parametros.get('j') : '24h';
let selecionado = null;

function gravarEstado() {
  const p = new URLSearchParams();
  if (selecionado !== null) p.set('m', selecionado);
  if (janela !== '24h') p.set('j', janela);
  const texto = p.toString();
  history.replaceState(null, '', texto ? `#${texto}` : location.pathname + location.search);
}

// ---------- mapa ----------
// O controle deslizante vai do zoom mínimo ao máximo do mapa (que dependem do tamanho da tela).
const slider = $('zoom-slider');
function atualizarSlider(zoom, minimo, maximo) {
  slider.value = String(Math.round(((zoom - minimo) / (maximo - minimo)) * 100));
}

const mapa = criarMapa({
  container: 'mapa',
  dados,
  aoSelecionar: (cod) => selecionar(cod, { voar: false }),
  aoPassar: mostrarDica,
  aoAfastar: (afastado) => $('recentrar').classList.toggle('oculto', !afastado),
  aoZoom: atualizarSlider,
});
slider.addEventListener('input', () => {
  const { min, max } = mapa.faixaZoom();
  mapa.definirZoom(min + (Number(slider.value) / 100) * (max - min));
});
$('recentrar').addEventListener('click', () => mapa.enquadrar());
mapa.pintar(janela);

function mostrarDica(cod, ponto) {
  const dica = $('dica');
  if (cod === null) {
    dica.hidden = true;
    return;
  }
  const mm = valorDoMunicipio(dados, cod, janela);
  dica.innerHTML = `<b>${esc(dados.porCodigo.get(cod).nome)}</b><span>${mm === null ? 'sem dado' : `${fmtMm(mm)} mm`}</span>`;
  dica.hidden = false;
  const { width } = dica.getBoundingClientRect();
  dica.style.left = `${Math.min(ponto.x + 16, innerWidth - width - 8)}px`;
  dica.style.top = `${ponto.y + 16}px`;
}

// ---------- legenda ----------
function desenharLegenda() {
  const marcas = ['0', '10', '30', '60', '100', '100+'];
  $('legenda').innerHTML = `
    <div class="titulo"><span>Chuva acumulada (mm)</span><b>${janela.replace('h', ' h')}</b></div>
    <div class="escala">${FAIXAS.map((f) => `<i style="--c:${f.cor}"></i>`).join('')}</div>
    <div class="marcas">${marcas.map((m) => `<span>${m}</span>`).join('')}</div>
    <div class="linha2">
      <span><i class="semdado"></i>sem pluviômetro</span>
      ${SITUACOES.slice(1)
        .map((s) => `<span><i class="brilho" style="--c:${s.cor}"></i><span class="prefixo">rio em </span>${s.texto}</span>`)
        .join('')}
    </div>`;
}

// ---------- status e resumo de risco ----------
const dadoVelho = (iso) => Date.now() - Date.parse(iso) > DADO_VELHO_MS;
const chuvaVelha = dadoVelho(dados.chuva.geradoEm);
const riosVelhos = dados.rios ? dadoVelho(dados.rios.geradoEm) : false;

function desenharStatus() {
  const fontes = [dados.chuva.geradoEm, ...(dados.rios ? [dados.rios.geradoEm] : [])];
  const maisAntiga = fontes.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b));
  const velho = chuvaVelha || riosVelhos;
  document.body.classList.toggle('dado-velho', velho); // a hora com data é mais larga: no celular a marca cede espaço
  const semRios = !dados.rios;
  const ponto = $('status-ponto');
  ponto.style.setProperty('--c', velho || semRios ? COR_ALERTA : '#69d38a');
  ponto.classList.toggle('pulsa', velho || semRios);
  $('status-texto').innerHTML = `<span class="palavra">${velho ? 'Desatualizado ' : 'Atualizado '}</span><b>${fmtHora(maisAntiga)}</b>`;
  $('status').title = [
    `Chuva do CEMADEN: ${fmtHora(dados.chuva.geradoEm)}`,
    dados.rios ? `Defesa Civil RS (chuva e rios): ${fmtHora(dados.rios.geradoEm)}` : 'Defesa Civil RS: indisponível',
  ].join('\n');
  if (velho) {
    const quais = [
      chuvaVelha && `chuva do CEMADEN (desde ${fmtHora(dados.chuva.geradoEm)})`,
      riosVelhos && `rios e parte da chuva da Defesa Civil RS (desde ${fmtHora(dados.rios.geradoEm)})`,
    ].filter(Boolean);
    mostrarAviso(`Dados desatualizados: ${quais.join(' e ')}. A fonte está instável e o que aparece pode não refletir a situação atual. Consulte a Defesa Civil.`, true, 15000);
  }
  else if (semRios) mostrarAviso('Os dados da Defesa Civil RS (rios e parte da chuva) estão indisponíveis no momento.', true, 9000);
}

const emRisco = municipiosEmRisco(dados);
function desenharAtencao() {
  const botao = $('atencao');
  const ponto = botao.querySelector('.ponto');
  if (!dados.rios) {
    ponto.style.setProperty('--c', COR_ALERTA);
    $('atencao-texto').textContent = 'Rios indisponíveis';
    return;
  }
  if (!dados.riosComLeitura) {
    ponto.style.setProperty('--c', COR_ALERTA);
    $('atencao-texto').textContent = 'Sem leitura recente dos rios';
    botao.disabled = true;
    return;
  }
  // Com a coleta de rios antiga, o resumo diz de quando é o dado, em vez de parecer atual.
  const prefixo = riosVelhos ? `Rios de ${fmtHora(dados.rios.geradoEm)}: ` : '';
  if (!emRisco.length) {
    ponto.style.setProperty('--c', riosVelhos ? COR_ALERTA : '#69d38a');
    $('atencao-texto').textContent = `${prefixo}${riosVelhos ? 'nenhum fora da normalidade' : 'Nenhum rio fora da normalidade'}`;
    botao.disabled = true;
    return;
  }
  const pior = SITUACOES[emRisco[0].nivel];
  ponto.style.setProperty('--c', pior.cor);
  ponto.classList.add('pulsa');
  const n = emRisco.length;
  $('atencao-texto').textContent = `${prefixo}${n} ${n === 1 ? 'município' : 'municípios'} com rio fora da normalidade`;
  $('lista-atencao').innerHTML = emRisco
    .map(
      ({ municipio, nivel }) => `<li><button type="button" data-ir="${municipio.codIbge}">
        <i class="ponto" style="--c:${SITUACOES[nivel].cor}"></i>${esc(municipio.nome)}<span class="nivel">${GRAVIDADE[nivel]}</span></button></li>`,
    )
    .join('');
}
$('atencao').addEventListener('click', () => {
  const aberto = $('lista-atencao').hidden;
  $('lista-atencao').hidden = !aberto;
  $('atencao').setAttribute('aria-expanded', String(aberto));
});
$('lista-atencao').addEventListener('click', (ev) => {
  const alvo = ev.target.closest('[data-ir]');
  if (!alvo) return;
  $('lista-atencao').hidden = true;
  $('atencao').setAttribute('aria-expanded', 'false');
  selecionar(Number(alvo.dataset.ir));
});

// ---------- cartão do município ----------
// O cartão abre compacto (nome, chuva e rio) e expande os detalhes sob demanda; a escolha vale na sessão.
let cartaoExpandido = false;

function htmlCartao(cod, euEstou) {
  const m = dados.porCodigo.get(cod);
  const estacoes = dados.pluviometros.get(cod) ?? [];
  const rios = [...(dados.estacoesRio.get(cod) ?? [])].sort((a, b) => (b.situacao ?? -1) - (a.situacao ?? -1));
  const vizinhos = estacoes.length ? [] : vizinhosComDado(dados, cod, janela);

  // ----- resumo (sempre visível) -----
  let html = `
    <div class="cartao-topo">
      <div>
        <h2>${esc(m.nome)}</h2>
        ${euEstou ? '<span class="etiqueta">Você está aqui</span>' : ''}
      </div>
      <button class="icone" type="button" data-fechar aria-label="Fechar">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>`;

  if (estacoes.length) {
    const v = valorDoMunicipio(dados, cod, janela);
    html += `
      <p class="grande"><span class="num">${fmtMm(v)}</span><span class="un">mm</span></p>
      <p class="sub">${TEXTO_JANELA[janela]} · ${estacoes.length} ${estacoes.length === 1 ? 'estação' : 'estações'}</p>`;
  } else {
    html += '<p class="sub" style="margin-top:12px">Sem pluviômetro ativo neste município. Isso não significa que não está chovendo.</p>';
  }

  const principal = rios.find((e) => e.recente && e.situacao !== null);
  if (principal) {
    const sit = SITUACOES.find((x) => x.valor === principal.situacao);
    const outros = rios.length > 1 ? ` +${rios.length - 1}` : '';
    html += `<p class="resumo-rio"><span class="chip" style="--c:${sit.cor}">rio em ${sit.texto}</span><span>${esc(principal.nome)}${outros}</span></p>`;
  }

  html += `<button class="expandir" type="button" data-expandir aria-expanded="${cartaoExpandido}">
      <span>${cartaoExpandido ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;

  // ----- detalhes (expansíveis) -----
  html += '<div class="detalhes">';
  if (estacoes.length) {
    html += `<div class="barras">${JANELAS.map((j) => {
      const x = valorDoMunicipio(dados, cod, j);
      return `<div class="barra${j === janela ? ' ativa' : ''}" style="--c:${faixaDe(x).cor}">
        <span class="rot">${j}</span><span class="trilho"><i style="width:${Math.min(100, x)}%"></i></span><span class="val">${fmtMm(x)} mm</span></div>`;
    }).join('')}</div>`;
  } else if (vizinhos.length) {
    html += `<h3>Dado mais próximo</h3>${vizinhos
      .map(({ municipio, km }) => {
        const v = valorDoMunicipio(dados, municipio.codIbge, janela);
        return `<button class="vizinho" type="button" data-ir="${municipio.codIbge}"><span>${esc(municipio.nome)}</span>
          <span class="mm" style="color:${faixaDe(v).cor}">${fmtMm(v)} mm</span><span class="km">${Math.round(km)} km</span></button>`;
      })
      .join('')}`;
  }

  if (rios.length) {
    html += `<h3>Rios</h3>${rios
      .map((e) => {
        const sit = SITUACOES.find((x) => x.valor === e.situacao);
        const cor = e.recente && sit ? sit.cor : '#93a6b8';
        const texto = !e.recente ? 'sem leitura recente' : sit ? sit.texto : 'sem limiar';
        const variacao = e.variacaoM === null ? '' : ` · variação ${e.variacaoM > 0 ? '+' : ''}${e.variacaoM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
        return `<div class="rio"><span>${esc(e.nome)}</span><span class="chip" style="--c:${cor}">${texto}</span>
          <span class="detalhe">nível ${fmtM(e.nivelM)}${variacao}</span></div>`;
      })
      .join('')}`;
    if (rios.some((e) => e.recente && e.situacao >= 1)) {
      html += '<p class="cartao-pe">A situação é a classificação da Defesa Civil, comparada às cotas de cada estação, e pode refletir o maior nível recente, não só o atual. As cotas não são divulgadas pela API.</p>';
    }
  }

  if (estacoes.length) {
    html += `<details><summary>Estações de chuva (${estacoes.length})</summary>
      <table><thead><tr><th>Estação</th>${JANELAS.map((j) => `<th>${j}</th>`).join('')}</tr></thead><tbody>
      ${estacoes
        .map((e) => `<tr><td>${esc(e.nome)}<small>${esc(e.fonte)}</small></td>${JANELAS.map((j) => `<td>${fmtMm(e.acumuladoMm[j] ?? 0)}</td>`).join('')}</tr>`)
        .join('')}
      </tbody></table></details>`;
    const ultima = estacoes.map((e) => e.ultimaLeitura).sort().at(-1);
    html += `<p class="cartao-pe">Leitura mais recente: ${fmtHora(ultima)}</p>`;
  }
  return html + '</div>';
}

let euEstouEm = null;
function selecionar(cod, { voar = true } = {}) {
  selecionado = cod;
  mapa.selecionar(cod);
  const cartao = $('cartao');
  document.body.classList.toggle('cartao-aberto', cod !== null);
  if (cod === null) {
    cartao.hidden = true;
  } else {
    cartao.innerHTML = htmlCartao(cod, cod === euEstouEm);
    cartao.classList.toggle('expandido', cartaoExpandido);
    cartao.scrollTop = 0;
    cartao.hidden = false;
    $('sobre').hidden = true;
    $('sobre-botao').setAttribute('aria-expanded', 'false');
    if (voar) mapa.voarPara(cod);
  }
  gravarEstado();
  desenharNoticias();
}
$('cartao').addEventListener('click', (ev) => {
  if (ev.target.closest('[data-fechar]')) return selecionar(null);
  if (ev.target.closest('[data-expandir]')) {
    cartaoExpandido = !cartaoExpandido;
    $('cartao').classList.toggle('expandido', cartaoExpandido);
    const botao = $('cartao').querySelector('[data-expandir]');
    botao.setAttribute('aria-expanded', String(cartaoExpandido));
    botao.querySelector('span').textContent = cartaoExpandido ? 'Ocultar detalhes' : 'Ver detalhes';
    return;
  }
  const alvo = ev.target.closest('[data-ir]');
  if (alvo) selecionar(Number(alvo.dataset.ir));
});

// ---------- busca ----------
const campo = $('busca');
const lista = $('resultados');
let opcoes = [];
let ativa = -1;

function atualizarOpcoes() {
  const termo = semAcento(campo.value.trim());
  if (!termo) return fecharLista();
  const comeca = [];
  const contem = [];
  for (const m of dados.indice) {
    const nome = semAcento(m.nome);
    if (nome.startsWith(termo)) comeca.push(m);
    else if (nome.includes(termo)) contem.push(m);
  }
  opcoes = [...comeca, ...contem].slice(0, 8);
  ativa = opcoes.length ? 0 : -1;
  lista.innerHTML = opcoes.length
    ? opcoes
        .map((m, i) => {
          const mm = valorDoMunicipio(dados, m.codIbge, janela);
          return `<li role="option" data-cod="${m.codIbge}" aria-selected="${i === ativa}">${esc(m.nome)}<small>${mm === null ? 'sem dado' : `${fmtMm(mm)} mm`}</small></li>`;
        })
        .join('')
    : '<li class="vazio" role="option" aria-disabled="true">Nenhum município encontrado</li>';
  lista.hidden = false;
  campo.setAttribute('aria-expanded', 'true');
}
function fecharLista() {
  lista.hidden = true;
  campo.setAttribute('aria-expanded', 'false');
  opcoes = [];
  ativa = -1;
}
function marcarAtiva(i) {
  ativa = (i + opcoes.length) % opcoes.length;
  [...lista.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === ativa)));
  lista.children[ativa]?.scrollIntoView({ block: 'nearest' });
}
function escolher(cod) {
  fecharLista();
  campo.value = '';
  campo.blur();
  selecionar(cod);
}
campo.addEventListener('input', atualizarOpcoes);
campo.addEventListener('focus', () => campo.value && atualizarOpcoes());
campo.addEventListener('keydown', (ev) => {
  if (ev.key === 'ArrowDown' && opcoes.length) { ev.preventDefault(); marcarAtiva(ativa + 1); }
  else if (ev.key === 'ArrowUp' && opcoes.length) { ev.preventDefault(); marcarAtiva(ativa - 1); }
  else if (ev.key === 'Enter' && opcoes[ativa]) { ev.preventDefault(); escolher(opcoes[ativa].codIbge); }
  else if (ev.key === 'Escape') { fecharLista(); campo.blur(); }
});
lista.addEventListener('mousedown', (ev) => {
  const li = ev.target.closest('[data-cod]');
  if (li) { ev.preventDefault(); escolher(Number(li.dataset.cod)); }
});
campo.addEventListener('blur', () => setTimeout(fecharLista, 120));

// ---------- localização ----------
// `abrirCartao: false` é o modo discreto (recarregar a página já autorizada): só marca onde o usuário está,
// sem mexer na seleção e sem avisos.
function localizar({ abrirCartao = true } = {}) {
  if (!navigator.geolocation) return abrirCartao && mostrarAviso('Seu navegador não oferece localização. Use a busca para escolher o município.', true);
  const botao = $('localizar');
  botao.disabled = true;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      botao.disabled = false;
      // A posição só é usada aqui, no navegador, para achar o município. Nada é enviado nem guardado.
      const municipio = municipioDe(dados.indice, coords.longitude, coords.latitude);
      if (!municipio) return abrirCartao && mostrarAviso('Você parece estar fora do Rio Grande do Sul. Use a busca para escolher um município gaúcho.', true);
      // Sem zoom: a cidade do usuário pisca de leve no mapa.
      euEstouEm = municipio.codIbge;
      mapa.marcarLocal([coords.longitude, coords.latitude]);
      mapa.destacarEu(municipio.codIbge);
      if (!abrirCartao) return;
      selecionar(municipio.codIbge, { voar: false });
      // Reenquadra o estado inteiro (sem aproximar) para o cartão não cobrir a cidade destacada.
      mapa.enquadrar();
    },
    (erro) => {
      botao.disabled = false;
      if (!abrirCartao) return;
      mostrarAviso(
        erro.code === erro.PERMISSION_DENIED
          ? 'Sem permissão para usar a localização. Você ainda pode buscar o município acima.'
          : 'Não consegui obter sua localização agora. Tente a busca por município.',
        true,
      );
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
  );
}
$('localizar').addEventListener('click', () => localizar());

const CHAVE_CONVITE = 'radar-chuva-convite';
const lembrar = (valor) => { try { localStorage.setItem(CHAVE_CONVITE, valor); } catch { /* navegação privada */ } };
const jaRecusou = () => { try { return localStorage.getItem(CHAVE_CONVITE) === 'recusou'; } catch { return false; } };
$('convite-sim').addEventListener('click', () => { $('convite').hidden = true; localizar(); });
$('convite-nao').addEventListener('click', () => { $('convite').hidden = true; lembrar('recusou'); });

async function oferecerLocalizacao({ discreto = false } = {}) {
  if (!navigator.geolocation) return;
  try {
    const { state } = await navigator.permissions.query({ name: 'geolocation' });
    if (state === 'granted') return localizar({ abrirCartao: !discreto }); // já autorizado antes: sem perguntar de novo
    if (state === 'denied') return;
  } catch { /* sem Permissions API: cai no convite */ }
  if (!discreto && !jaRecusou()) setTimeout(() => ($('convite').hidden = false), 1500);
}

// ---------- janela de tempo, relevo e sobre ----------
function marcarJanela() {
  document.querySelectorAll('#janelas button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.janela === janela)));
}
$('janelas').addEventListener('click', (ev) => {
  const botao = ev.target.closest('button[data-janela]');
  if (!botao) return;
  janela = botao.dataset.janela;
  marcarJanela();
  mapa.pintar(janela);
  desenharLegenda();
  if (selecionado !== null) $('cartao').innerHTML = htmlCartao(selecionado, selecionado === euEstouEm);
  gravarEstado();
});
$('relevo').addEventListener('click', () => $('relevo').setAttribute('aria-pressed', String(mapa.alternarRelevo())));
$('sobre-botao').addEventListener('click', () => {
  const abrir = $('sobre').hidden;
  $('sobre').hidden = !abrir;
  $('sobre-botao').setAttribute('aria-expanded', String(abrir));
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || ev.target === campo) return;
  $('sobre').hidden = true;
  $('sobre-botao').setAttribute('aria-expanded', 'false');
  $('lista-atencao').hidden = true;
  $('atencao').setAttribute('aria-expanded', 'false');
  if (noticiasAbertas) {
    noticiasAbertas = false;
    $('noticias-botao').setAttribute('aria-expanded', 'false');
  }
  if (selecionado !== null) selecionar(null);
  else desenharNoticias();
});

// ---------- notícias ----------
// Abaixo do cartão da cidade (no computador) ou pela pílula "Notícias" (no celular). Com uma cidade
// selecionada mostra as que a citam; sem notícia da cidade, ou sem cidade, mostra as mais relevantes do estado.
const telaPequena = matchMedia('(max-width: 759px)');
const NOTICIA_VELHA_MS = 3 * 60 * 60 * 1000;
let noticiasAbertas = false; // só no celular

function haQuanto(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / (24 * 60))} d`;
}

function desenharNoticias() {
  const painel = $('noticias');
  const botao = $('noticias-botao');
  const todas = dados.noticias?.noticias ?? [];
  botao.hidden = todas.length === 0; // o CSS só mostra a pílula no celular
  if (!todas.length) {
    painel.hidden = true;
    return;
  }
  painel.hidden = telaPequena.matches ? !noticiasAbertas : false;
  if (painel.hidden) return;

  const nome = selecionado !== null ? dados.porCodigo.get(selecionado).nome : null;
  const { doMunicipio, lista } = noticiasPara(todas, nome, { agoraMs: Date.now() });
  const titulo = doMunicipio ? `Notícias · <b>${esc(nome)}</b>` : 'Notícias · <b>RS</b>';
  const nota = nome && !doMunicipio ? `<p class="noticias-nota">Nenhuma notícia recente sobre ${esc(nome)} nas fontes consultadas. Destaques do estado:</p>` : '';
  const velha = Date.now() - Date.parse(dados.noticias.geradoEm) > NOTICIA_VELHA_MS;
  painel.innerHTML = `
    <div class="noticias-topo">
      <h2>${titulo}</h2>
      ${telaPequena.matches ? '<button class="icone" type="button" data-fechar-noticias aria-label="Fechar notícias"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>' : ''}
    </div>
    ${nota}
    <ul class="lista-noticias">${lista
      .filter((n) => /^https?:\/\//.test(n.url))
      .map(
        (n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
          <span class="titulo">${esc(n.titulo)}</span><span class="fonte">${esc(n.fonte)} · ${haQuanto(n.publicadoEm)}</span></a></li>`,
      )
      .join('')}</ul>
    <p class="noticias-rodape">${velha ? 'Desatualizado: ' : ''}Fontes: ${esc(dados.noticias.fontes.join(', '))}, coletado às ${fmtHora(dados.noticias.geradoEm)}. Seleção automática por palavras-chave; os links levam aos veículos.</p>`;
}

$('noticias-botao').addEventListener('click', () => {
  noticiasAbertas = !noticiasAbertas;
  $('noticias-botao').setAttribute('aria-expanded', String(noticiasAbertas));
  desenharNoticias();
});
$('noticias').addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-fechar-noticias]')) return;
  noticiasAbertas = false;
  $('noticias-botao').setAttribute('aria-expanded', 'false');
  desenharNoticias();
});
telaPequena.addEventListener('change', desenharNoticias);

// ---------- início ----------
marcarJanela();
desenharLegenda();
desenharStatus();
desenharAtencao();

const inicial = Number(parametros.get('m'));
if (dados.porCodigo.has(inicial)) {
  // Recarregar (F5) ou abrir um link com uma cidade na URL: seleciona a cidade sem aproximar o mapa.
  selecionar(inicial, { voar: false });
  mapa.enquadrar({ animar: false });
  oferecerLocalizacao({ discreto: true }); // se já autorizado, só marca onde o usuário está
} else {
  oferecerLocalizacao();
  desenharNoticias();
}
