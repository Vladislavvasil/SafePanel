// Санкт-Петербург, Дворцовая площадь (координаты проверены 25.10.2026).
// Чтобы сменить город, поменяйте LATITUDE, LONGITUDE и название в index.html.
var LATITUDE = 59.9386;
var LONGITUDE = 30.3141;

var API_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=" + LATITUDE +
  "&longitude=" + LONGITUDE +
  "&current=temperature_2m,wind_speed_10m,precipitation" +
  "&wind_speed_unit=ms" +
  "&timezone=Europe%2FMoscow";

var TIMEOUT_MS = 15000;

// Три показателя: поле в ответе API и элементы на странице.
var METRICS = [
  { field: "temperature_2m", valueId: "temp-value", unitId: "temp-unit", digits: 1 },
  { field: "wind_speed_10m", valueId: "wind-value", unitId: "wind-unit", digits: 1 },
  { field: "precipitation", valueId: "precip-value", unitId: "precip-unit", digits: 1 }
];

// Единицы из API показываем по-русски; неизвестную единицу выводим как есть.
var UNIT_LABELS = { "°C": "°C", "m/s": "м/с", "mm": "мм" };

var refreshBtn = document.getElementById("refresh-btn");
var retryBtn = document.getElementById("retry-btn");
var statusEl = document.getElementById("status-message");

var isLoading = false;
var lastSuccess = null; // время последней успешной загрузки

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " is-" + kind : "");
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value, digits) {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

// "2026-10-25T01:30" — локальное время в часовом поясе запроса (Europe/Moscow).
function formatApiTime(isoString) {
  var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(isoString);
  if (!match) {
    return null;
  }
  return match[3] + "." + match[2] + "." + match[1] + ", " + match[4] + ":" + match[5];
}

function formatLoadedTime(date) {
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }) + " (МСК)";
}

function showMetric(metric, value, unit) {
  var valueEl = document.getElementById(metric.valueId);
  if (isNumber(value)) {
    valueEl.textContent = formatNumber(value, metric.digits);
    valueEl.classList.remove("is-missing");
    setText(metric.unitId, UNIT_LABELS[unit] || unit || "");
  } else {
    // null, пустая строка или отсутствующее поле — это не 0.
    valueEl.textContent = "Нет данных";
    valueEl.classList.add("is-missing");
    setText(metric.unitId, "");
  }
}

// Ошибка: старые числа убираем, чтобы не выдавать их за новые.
function clearMetrics(placeholder) {
  METRICS.forEach(function (metric) {
    var valueEl = document.getElementById(metric.valueId);
    valueEl.textContent = placeholder;
    valueEl.classList.add("is-missing");
    setText(metric.unitId, "");
  });
  setText("data-time", "—");
  setText("grid-point", "—");
}

function setLoading(loading) {
  isLoading = loading;
  refreshBtn.disabled = loading;
  retryBtn.disabled = loading;
  refreshBtn.textContent = loading ? "Загрузка…" : "Обновить";
}

function render(data) {
  var current = data && data.current;
  var units = (data && data.current_units) || {};

  if (!current || typeof current !== "object") {
    clearMetrics("Нет данных");
    setStatus("Нет данных: в ответе API нет блока current.", "error");
    retryBtn.hidden = false;
    return;
  }

  var shownCount = 0;
  METRICS.forEach(function (metric) {
    var value = current[metric.field];
    showMetric(metric, value, units[metric.field]);
    if (isNumber(value)) {
      shownCount++;
    }
  });

  if (isNumber(current.interval)) {
    setText("precip-interval", String(Math.round(current.interval / 60)));
  }

  var dataTime = typeof current.time === "string" ? formatApiTime(current.time) : null;
  setText("data-time", dataTime ? dataTime + " (МСК)" : "Нет данных о времени");

  if (isNumber(data.latitude) && isNumber(data.longitude)) {
    setText("grid-point", formatNumber(data.latitude, 3) + "° с. ш., " + formatNumber(data.longitude, 3) + "° в. д.");
  }

  lastSuccess = new Date();
  setText("loaded-time", formatLoadedTime(lastSuccess));
  setText("top-updated", formatLoadedTime(lastSuccess));

  if (shownCount === METRICS.length && dataTime) {
    setStatus("Данные получены.", "ok");
    retryBtn.hidden = true;
  } else if (shownCount === 0) {
    setStatus("Ответ получен, но нужных показателей в нём нет.", "error");
    retryBtn.hidden = false;
  } else {
    setStatus("Данные получены частично: часть показателей отсутствует.", "error");
    retryBtn.hidden = false;
  }
}

function loadData() {
  if (isLoading) {
    return; // не запускаем несколько запросов одновременно
  }
  setLoading(true);
  setStatus("Загрузка…");

  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, TIMEOUT_MS);

  fetch(API_URL, { signal: controller.signal })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Сервер ответил с ошибкой " + response.status + ".");
      }
      return response.json();
    })
    .then(function (data) {
      render(data);
    })
    .catch(function (error) {
      var message;
      if (error.name === "AbortError") {
        message = "Сервер не ответил за 15 секунд.";
      } else if (error instanceof TypeError) {
        message = "Нет соединения с API (проверьте интернет).";
      } else {
        message = error.message || "Неизвестная ошибка.";
      }
      clearMetrics("—");
      var tail = lastSuccess
        ? " Показанные ранее значения убраны: они могли устареть."
        : "";
      setStatus("Ошибка: " + message + tail, "error");
      retryBtn.hidden = false;
    })
    .finally(function () {
      clearTimeout(timer);
      setLoading(false);
    });
}

refreshBtn.addEventListener("click", loadData);
retryBtn.addEventListener("click", loadData);

loadData();
