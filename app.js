// Open‑Meteo 기반 간단한 날씨 앱 (API Key 불필요)

const selectors = {
  content: document.getElementById("content"),
  status: document.getElementById("status"),
  searchInput: document.getElementById("search-input"),
  searchBtn: document.getElementById("search-btn"),
  locBtn: document.getElementById("loc-btn"),
  suggestions: document.getElementById("suggestions"),
  unitC: document.getElementById("unit-c"),
  unitF: document.getElementById("unit-f"),
  location: document.getElementById("location"),
  current: document.getElementById("current"),
  hourlyList: document.getElementById("hourly-list"),
  dailyList: document.getElementById("daily-list"),
};

const appState = {
  unit: "c", // 'c' or 'f'
  selectedPlace: null, // { name, country, admin1, latitude, longitude, timezone }
  lastSearchController: null,
  lastWeatherController: null,
  lastResults: [],
};

const WMO = {
  0: { t: "맑음", e: "☀️" },
  1: { t: "대체로 맑음", e: "🌤️" },
  2: { t: "부분적으로 흐림", e: "⛅" },
  3: { t: "흐림", e: "☁️" },
  45: { t: "안개", e: "🌫️" },
  48: { t: "상고대 안개", e: "🌫️" },
  51: { t: "약한 이슬비", e: "🌦️" },
  53: { t: "보통 이슬비", e: "🌧️" },
  55: { t: "강한 이슬비", e: "🌧️" },
  56: { t: "약한 어는 이슬비", e: "🌧️" },
  57: { t: "강한 어는 이슬비", e: "🌧️" },
  61: { t: "약한 비", e: "🌦️" },
  63: { t: "보통 비", e: "🌧️" },
  65: { t: "강한 비", e: "🌧️" },
  66: { t: "약한 어는 비", e: "🌧️" },
  67: { t: "강한 어는 비", e: "🌧️" },
  71: { t: "약한 눈", e: "🌨️" },
  73: { t: "보통 눈", e: "❄️" },
  75: { t: "강한 눈", e: "❄️" },
  77: { t: "싸락눈", e: "❄️" },
  80: { t: "약한 소나기", e: "🌦️" },
  81: { t: "보통 소나기", e: "🌧️" },
  82: { t: "강한 소나기", e: "⛈️" },
  85: { t: "약한 소낙눈", e: "🌨️" },
  86: { t: "강한 소낙눈", e: "❄️" },
  95: { t: "천둥번개", e: "⛈️" },
  96: { t: "천둥(우박)", e: "⛈️" },
  99: { t: "천둥(강한 우박)", e: "⛈️" },
};

function cToF(celsius){ return (celsius * 9) / 5 + 32 }
function formatTemp(value){
  if(value == null || Number.isNaN(value)) return "-";
  return appState.unit === "c" ? `${Math.round(value)}°` : `${Math.round(cToF(value))}°`;
}

function showStatus(message, type = "info"){
  selectors.status.textContent = message || "";
  selectors.status.classList.toggle("error", type === "error");
}

function clearSuggestions(){
  selectors.suggestions.innerHTML = "";
}

function renderSuggestions(results){
  clearSuggestions();
  if(!results || results.length === 0){
    const wrap = document.createElement("div");
    wrap.className = "dropdown";
    wrap.innerHTML = `<div class="empty">검색 결과가 없습니다</div>`;
    selectors.suggestions.appendChild(wrap);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "dropdown";
  results.forEach((place, idx) => {
    const item = document.createElement("div");
    item.className = "item";
    const right = [];
    if(place.admin1) right.push(place.admin1);
    if(place.country) right.push(place.country);
    item.innerHTML = `<div>${place.name}</div><div class="meta">${right.join(" · ")}</div>`;
    item.setAttribute("role", "option");
    item.tabIndex = 0;
    item.addEventListener("click", () => {
      selectors.searchInput.value = `${place.name}`;
      clearSuggestions();
      selectPlace(place);
    });
    item.addEventListener("keydown", (e) => {
      if(e.key === "Enter") item.click();
    });
    wrap.appendChild(item);
  });
  selectors.suggestions.appendChild(wrap);
}

async function searchPlacesByName(query){
  const trimmed = query.trim();
  if(trimmed.length < 2){ clearSuggestions(); return }

  if(appState.lastSearchController){ appState.lastSearchController.abort() }
  const controller = new AbortController();
  appState.lastSearchController = controller;
  try{
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", trimmed);
    url.searchParams.set("count", "8");
    url.searchParams.set("language", navigator.language || "ko");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { signal: controller.signal });
    if(!res.ok) throw new Error("지오코딩 실패");
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      id: r.id,
      name: r.name,
      country: r.country,
      admin1: r.admin1,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }));
    appState.lastResults = results;
    renderSuggestions(results);
  }catch(err){
    if(err.name === "AbortError") return;
    console.error(err);
  }
}

function selectPlace(place){
  appState.selectedPlace = place;
  showStatus(`${place.name} 날씨를 불러오는 중…`);
  loadWeatherFor(place);
}

async function loadWeatherFor(place){
  if(appState.lastWeatherController){ appState.lastWeatherController.abort() }
  const controller = new AbortController();
  appState.lastWeatherController = controller;
  selectors.content.hidden = true;

  try{
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    url.searchParams.set("current_weather", "true");
    url.searchParams.set("hourly", [
      "temperature_2m",
      "weathercode"
    ].join(","));
    url.searchParams.set("daily", [
      "weathercode",
      "temperature_2m_max",
      "temperature_2m_min"
    ].join(","));
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString(), { signal: controller.signal });
    if(!res.ok) throw new Error("날씨 API 호출 실패");
    const data = await res.json();

    renderAll(place, data);
    selectors.content.hidden = false;
    showStatus("");
  }catch(err){
    if(err.name === "AbortError") return;
    console.error(err);
    showStatus("데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.", "error");
  }
}

function renderAll(place, data){
  renderLocation(place);
  renderCurrent(data.current_weather, place.timezone);
  renderHourly(data.hourly, place.timezone);
  renderDaily(data.daily, place.timezone);
}

function renderLocation(place){
  const parts = [place.name];
  const meta = [];
  if(place.admin1) meta.push(place.admin1);
  if(place.country) meta.push(place.country);

  selectors.location.innerHTML = `
    <h2>${parts.join(" ")}</h2>
    <div class="meta">${meta.join(" · ")}</div>
    <div class="meta">${place.latitude.toFixed(2)}, ${place.longitude.toFixed(2)}</div>
  `;
}

function renderCurrent(currentWeather, timezone){
  if(!currentWeather){
    selectors.current.innerHTML = "<div>현재 날씨 정보를 사용할 수 없습니다.</div>";
    return;
  }
  const code = currentWeather.weathercode;
  const info = WMO[code] || { t: "날씨 정보", e: "ℹ️" };
  const temp = formatTemp(currentWeather.temperature);
  const wind = Math.round(currentWeather.windspeed);
  const at = formatZonedTime(currentWeather.time, timezone, { hour: "2-digit", minute: "2-digit" });

  selectors.current.innerHTML = `
    <div>
      <div class="temp">${temp}</div>
      <div class="desc">${info.e} ${info.t}</div>
      <div class="more">바람 ${wind} m/s · ${at}</div>
    </div>
    <div class="icon" aria-hidden="true">${info.e}</div>
  `;
}

function renderHourly(hourly, timezone){
  const list = selectors.hourlyList;
  list.innerHTML = "";
  if(!hourly || !hourly.time){ return }
  // 다음 24시간
  const nowIndex = nearestTimeIndex(hourly.time, new Date());
  const endIndex = Math.min(nowIndex + 24, hourly.time.length);
  for(let i = nowIndex; i < endIndex; i++){
    const timeIso = hourly.time[i];
    const t = hourly.temperature_2m?.[i];
    const code = hourly.weathercode?.[i];
    const info = WMO[code] || { t: "-", e: "·" };
    const localHour = formatZonedTime(timeIso, timezone, { hour: "2-digit" });
    const el = document.createElement("div");
    el.className = "hour";
    el.innerHTML = `
      <div class="h">${localHour}</div>
      <div class="i">${info.e}</div>
      <div class="t">${formatTemp(t)}</div>
      <div class="w">${info.t}</div>
    `;
    list.appendChild(el);
  }
}

function renderDaily(daily, timezone){
  const list = selectors.dailyList;
  list.innerHTML = "";
  if(!daily || !daily.time){ return }
  const days = daily.time.length;
  for(let i = 0; i < days; i++){
    const code = daily.weathercode?.[i];
    const info = WMO[code] || { t: "-", e: "·" };
    const hi = daily.temperature_2m_max?.[i];
    const lo = daily.temperature_2m_min?.[i];
    const dow = formatZonedTime(daily.time[i], timezone, { weekday: "short", month: "numeric", day: "numeric" });
    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <div class="d">${dow}</div>
      <div class="i">${info.e} ${info.t}</div>
      <div><span class="hi">${formatTemp(hi)}</span> / <span class="lo">${formatTemp(lo)}</span></div>
    `;
    list.appendChild(el);
  }
}

function nearestTimeIndex(timeArray, date){
  const target = date.getTime();
  let idx = 0;
  let best = Number.POSITIVE_INFINITY;
  for(let i = 0; i < timeArray.length; i++){
    const t = Date.parse(timeArray[i]);
    const d = Math.abs(t - target);
    if(d < best){ best = d; idx = i }
  }
  return idx;
}

function formatZonedTime(iso, timezone, options){
  try{
    const opts = { timeZone: timezone, ...options };
    const dtf = new Intl.DateTimeFormat(undefined, opts);
    return dtf.format(new Date(iso));
  }catch{
    return new Date(iso).toLocaleString();
  }
}

function onUnitToggle(unit){
  if(appState.unit === unit) return;
  appState.unit = unit;
  selectors.unitC.classList.toggle("active", unit === "c");
  selectors.unitF.classList.toggle("active", unit === "f");
  selectors.unitC.setAttribute("aria-pressed", String(unit === "c"));
  selectors.unitF.setAttribute("aria-pressed", String(unit === "f"));
  // 다시 렌더링
  if(appState.selectedPlace){
    // 최종 데이터 변환 없이, 기존 DOM 값들을 다시 그리기 위해 다시 요청하지 않고 최근 데이터를 캐시하지 않았으므로 새로 로드
    loadWeatherFor(appState.selectedPlace);
  }
}

// 이벤트 바인딩
selectors.searchInput.addEventListener("input", (e) => {
  const q = e.target.value || "";
  searchPlacesByName(q);
});
selectors.searchBtn.addEventListener("click", () => {
  const q = selectors.searchInput.value.trim();
  if(!q){ showStatus("검색어를 입력하세요."); return }
  if(appState.lastResults.length > 0){
    // 가장 첫 결과 선택
    selectPlace(appState.lastResults[0]);
  }else{
    // 결과를 먼저 가져옴
    searchPlacesByName(q).then(() => {
      if(appState.lastResults.length > 0) selectPlace(appState.lastResults[0]);
    });
  }
});
selectors.locBtn.addEventListener("click", async () => {
  try{
    showStatus("내 위치를 확인하는 중…");
    const pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    const place = {
      name: "현재 위치",
      country: "",
      admin1: "",
      latitude,
      longitude,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    selectPlace(place);
  }catch(err){
    console.error(err);
    showStatus("위치 권한을 허용해야 합니다.", "error");
  }
});

selectors.unitC.addEventListener("click", () => onUnitToggle("c"));
selectors.unitF.addEventListener("click", () => onUnitToggle("f"));

function getCurrentPosition(options){
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation){ reject(new Error("Geolocation 미지원")); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// 초기 상태: 서울로 로드
(function bootstrap(){
  const initial = { name: "서울", country: "KR", admin1: "Seoul", latitude: 37.5665, longitude: 126.9780, timezone: "Asia/Seoul" };
  selectPlace(initial);
})();
