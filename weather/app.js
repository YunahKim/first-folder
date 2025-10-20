const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const state = {
  aborter: null,
  lastQuery: '',
  location: null,
  units: 'metric',
};

const WEATHER_CODES = new Map([
  [[0], '맑음'],
  [[1,2,3], '대체로 맑음'],
  [[45,48], '안개'],
  [[51,53,55], '이슬비'],
  [[61,63,65], '비'],
  [[66,67], '어는 비'],
  [[71,73,75], '눈'],
  [[77], '진눈깨비'],
  [[80,81,82], '소나기'],
  [[85,86], '소낙눈'],
  [[95], '천둥번개'],
  [[96,99], '우박'],
].flatMap(([codes, label]) => codes.map(code => [code, label])));

function codeToEmoji(code){
  if ([0].includes(code)) return '☀️';
  if ([1,2,3].includes(code)) return '⛅';
  if ([45,48].includes(code)) return '🌫️';
  if ([61,63,65,80,81,82].includes(code)) return '🌧️';
  if ([66,67].includes(code)) return '🌧️❄️';
  if ([71,73,75,85,86].includes(code)) return '❄️';
  if ([95,96,99].includes(code)) return '⛈️';
  if ([51,53,55].includes(code)) return '🌦️';
  return '🌡️';
}

function setStatus(msg){
  const el = $('#status');
  el.textContent = msg || '';
}

function setTheme(theme){
  if (theme === 'light'){
    document.documentElement.setAttribute('data-theme','light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('theme', theme);
}

function restoreTheme(){
  const saved = localStorage.getItem('theme');
  if (saved) setTheme(saved);
}

function debounce(fn, ms){
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function geocode(query, signal){
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'ko');
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('지오코딩 실패');
  return await res.json();
}

async function fetchWeather(lat, lon, signal){
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('날씨 요청 실패');
  return await res.json();
}

function formatPlace(r){
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return parts.join(', ');
}

function showSuggestions(list){
  const ul = $('#suggestions');
  ul.innerHTML = '';
  for (const r of list){
    const li = document.createElement('li');
    li.role = 'option';
    li.textContent = formatPlace(r);
    li.addEventListener('click', () => {
      pickLocation({ name: formatPlace(r), lat: r.latitude, lon: r.longitude });
      ul.innerHTML = '';
    });
    ul.appendChild(li);
  }
}

function clearPanels(){
  $('#current').hidden = true;
  $('#forecast').hidden = true;
}

function renderCurrent(data, placeName){
  const c = data.current;
  $('#locationName').textContent = placeName;
  $('#currentDesc').textContent = WEATHER_CODES.get(c.weather_code) || '—';
  $('#currentTemp').textContent = Math.round(c.temperature_2m);
  $('#apparent').textContent = `${Math.round(c.apparent_temperature)} °C`;
  $('#humidity').textContent = `${Math.round(c.relative_humidity_2m)} %`;
  $('#wind').textContent = `${Math.round(c.wind_speed_10m)} m/s`;
  $('#precip').textContent = `${(c.precipitation ?? 0).toFixed(1)} mm`;
  $('#current').hidden = false;
}

function renderForecast(data){
  const g = $('#forecastGrid');
  g.innerHTML = '';
  const days = data.daily.time.length;
  for (let i=0;i<days;i++){
    const dateStr = new Date(data.daily.time[i]).toLocaleDateString('ko-KR', { weekday:'short', month:'numeric', day:'numeric' });
    const code = data.daily.weather_code[i];
    const hi = Math.round(data.daily.temperature_2m_max[i]);
    const lo = Math.round(data.daily.temperature_2m_min[i]);
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <div class="date">${dateStr}</div>
      <div class="icon">${codeToEmoji(code)}</div>
      <div class="temp">${hi}° / ${lo}°</div>
    `;
    g.appendChild(card);
  }
  $('#forecast').hidden = false;
}

function cancelOngoing(){
  if (state.aborter){ state.aborter.abort(); }
  state.aborter = new AbortController();
  return state.aborter.signal;
}

async function pickLocation(loc){
  try{
    state.location = loc;
    setStatus('날씨 불러오는 중…');
    clearPanels();
    const signal = cancelOngoing();
    const data = await fetchWeather(loc.lat, loc.lon, signal);
    renderCurrent(data, loc.name);
    renderForecast(data);
    setStatus('');
  }catch(err){
    if (err.name === 'AbortError') return;
    console.error(err);
    setStatus('데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  }
}

const onInput = debounce(async (e) => {
  const q = e.target.value.trim();
  if (q === state.lastQuery) return;
  state.lastQuery = q;
  if (!q){ $('#suggestions').innerHTML=''; return; }
  try{
    setStatus('도시 검색 중…');
    const signal = cancelOngoing();
    const data = await geocode(q, signal);
    showSuggestions(data.results || []);
    setStatus('');
  }catch(err){
    if (err.name === 'AbortError') return;
    console.error(err);
    setStatus('검색에 실패했습니다.');
  }
}, 300);

function initTheme(){
  restoreTheme();
  $('#themeToggle').addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    setTheme(isLight ? 'dark' : 'light');
  });
}

function initGeo(){
  $('#geoBtn').addEventListener('click', () => {
    if (!('geolocation' in navigator)){
      setStatus('이 브라우저에서는 위치 정보를 사용할 수 없습니다.');
      return;
    }
    setStatus('내 위치 확인 중…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      await pickLocation({ name: '내 위치', lat: latitude, lon: longitude });
    }, (err) => {
      console.error(err);
      setStatus('위치를 가져올 수 없습니다. 권한을 확인하세요.');
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
}

function initSearch(){
  const input = $('#city');
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      const first = $('#suggestions li');
      if (first) first.click();
    }
  });
}

function init(){
  initTheme();
  initGeo();
  initSearch();
  // 기본 도시: 서울
  pickLocation({ name: 'Seoul, KR', lat: 37.5665, lon: 126.9780 });
}

document.addEventListener('DOMContentLoaded', init);
