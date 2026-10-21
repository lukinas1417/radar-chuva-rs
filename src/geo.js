// Geometria sobre a malha municipal do IBGE. Sem dependências: roda no navegador e no Node.

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

const poligonos = ({ type, coordinates }) => (type === 'Polygon' ? [coordinates] : coordinates);

// [oeste, sul, leste, norte]
function caixaDe(geometria) {
  let [oeste, sul, leste, norte] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poligono of poligonos(geometria)) {
    for (const [x, y] of poligono[0]) {
      if (x < oeste) oeste = x;
      if (x > leste) leste = x;
      if (y < sul) sul = y;
      if (y > norte) norte = y;
    }
  }
  return [oeste, sul, leste, norte];
}

// Lista de municípios com caixa delimitadora, para consultas rápidas.
export function indexarMunicipios(malha) {
  return malha.features.map((f) => {
    const caixa = caixaDe(f.geometry);
    return {
      codIbge: f.properties.codIbge,
      nome: f.properties.nome,
      geometria: f.geometry,
      caixa,
      centro: [(caixa[0] + caixa[2]) / 2, (caixa[1] + caixa[3]) / 2],
    };
  });
}

export function municipioDe(indice, lon, lat) {
  for (const m of indice) {
    const [oeste, sul, leste, norte] = m.caixa;
    if (lon < oeste || lon > leste || lat < sul || lat > norte) continue;
    if (poligonos(m.geometria).some((p) => dentroDoPoligono([lon, lat], p))) return m;
  }
  return null;
}

// Distância aproximada em km entre dois pontos [lon, lat] (haversine).
export function distanciaKm([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
