// Comportamentos comuns a todas as páginas: menu, contagem regressiva das festas e tempo ao vivo.

// menu no celular
const btn = document.querySelector('.menu-btn'), menu = document.getElementById('menu');
btn?.addEventListener('click', () => { const a = menu.classList.toggle('aberto'); btn.setAttribute('aria-expanded', a); });
menu?.addEventListener('click', e => { if (e.target.closest('a')) { menu.classList.remove('aberto'); btn?.setAttribute('aria-expanded', false); } });
addEventListener('keydown', e => { if (e.key === 'Escape' && menu?.classList.contains('aberto')) { menu.classList.remove('aberto'); btn.setAttribute('aria-expanded', false); btn.focus(); } });

// contagem regressiva
const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
for (const el of document.querySelectorAll('[data-contagem]')) {
  const ini = new Date(el.dataset.contagem + 'T00:00:00'), fim = new Date((el.dataset.fim || el.dataset.contagem) + 'T23:59:59');
  const n = Math.round((ini - hoje) / 864e5);
  el.textContent = fim < hoje ? '' : n <= 0 ? 'Acontecendo agora' : n === 1 ? 'É amanhã' : `Faltam ${n} dias`;
}

// tempo: direto do Open-Meteo (ao vivo); se falhar, usa a última coleta salva
const WMO = { 0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Sol entre nuvens'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'], 45: ['🌫️', 'Neblina'], 48: ['🌫️', 'Neblina'],
  51: ['🌦️', 'Garoa'], 53: ['🌦️', 'Garoa'], 55: ['🌦️', 'Garoa forte'], 61: ['🌧️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'],
  80: ['🌦️', 'Pancadas de chuva'], 81: ['🌧️', 'Pancadas de chuva'], 82: ['⛈️', 'Pancadas fortes'], 95: ['⛈️', 'Trovoadas'], 96: ['⛈️', 'Trovoadas'], 99: ['⛈️', 'Trovoadas'] };
const wmo = c => WMO[c] || ['🌡️', ''];
const chip = document.querySelector('[data-clima-chip]'), semana = document.querySelector('[data-clima-semana]');
if (chip || semana) {
  const API = 'https://api.open-meteo.com/v1/forecast?latitude=-23.222&longitude=-45.311&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=7';
  const tentar = (u, ms) => fetch(u, { signal: AbortSignal.timeout(ms) }).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
  tentar(API, 6000).catch(() => tentar(new URL('data/clima.json', import.meta.url), 4000)).then(c => {
    const a = c.current, [ic, desc] = wmo(a.weather_code);
    if (chip) chip.textContent = `${ic} ${Math.round(a.temperature_2m)}°`;
    if (semana) {
      const d = c.daily;
      semana.innerHTML = `<div class="tempo-agora"><span class="ic" aria-hidden="true">${ic}</span><div><div class="graus">${Math.round(a.temperature_2m)}°</div><div class="desc">${desc} · umidade ${a.relative_humidity_2m}% · vento ${Math.round(a.wind_speed_10m)} km/h</div></div></div>
        <ol class="tempo-dias">${d.time.map((t, i) => `<li><b>${i === 0 ? 'Hoje' : new Date(t + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</b><span class="ic" title="${wmo(d.weather_code[i])[1]}">${wmo(d.weather_code[i])[0]}</span><b>${Math.round(d.temperature_2m_max[i])}°</b> <span class="min">${Math.round(d.temperature_2m_min[i])}°</span><span class="chuva">${d.precipitation_probability_max[i] ?? 0}% chuva</span></li>`).join('')}</ol>`;
    }
  }).catch(() => { if (semana) semana.innerHTML = '<p class="carregando">Previsão indisponível no momento.</p>'; });
}
