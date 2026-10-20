
const state = {
  rows: [],
  main: "",
  compare: "",
  division: "",
  compareDivision: "",
  divisionMembers: new Map(),
  visibleMetrics: ["Wins", "PF", "Eff"],
  page: 1,
  pageSize: 25,
  chart: null
};

const $ = id => document.getElementById(id);

function str(value) {
  return value == null ? "" : String(value).trim();
}

function num(value) {
  if (value == null || str(value) === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function safe(value) {
  return str(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function year(row) {
  return Number(row.Season);
}

function idOf(row) {
  return str(row.ID);
}

function nameOf(row) {
  return str(row.Franchise) ||
    str(row.MFL_fname) ||
    `Franchise ${idOf(row)}`;
}

function metricValue(row, metric) {
  if (metric === "Wins") return num(row.Wins);
  if (metric === "PF") return num(row.PF);
  return num(row.Eff);
}

function franchises() {
  const currentSeason = new Map();
  const fallback = new Map();

  for (const row of state.rows) {
    const id = idOf(row);
    if (!id) continue;

    if (!fallback.has(id)) {
      fallback.set(id, nameOf(row));
    }

    if (year(row) === 2025 && !currentSeason.has(id)) {
      currentSeason.set(id, nameOf(row));
    }
  }

  for (const [id, name] of fallback) {
    if (!currentSeason.has(id)) {
      currentSeason.set(id, name);
    }
  }

  return [...currentSeason.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]) ||
    a[0].localeCompare(b[0])
  );
}

function divisionGroups() {
  const groups = new Map();

  // Шесть обычных дивизионов: состав по сезону 2025.
  for (const row of state.rows) {
    if (year(row) !== 2025) continue;

    const division = str(row.Division);
    const id = idOf(row);

    if (!division || division === "LEG VI" || !id) continue;

    if (!groups.has(division)) groups.set(division, new Set());
    groups.get(division).add(id);
  }

  // Исторический состав LEG VI ? фиксированные ID 0071–0084.
  groups.set("LEG VI", new Set(
    Array.from({ length: 14 }, (_, i) =>
      String(71 + i).padStart(4, "0")
    )
  ));

  return [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
}

function renderMainFranchiseOptions() {
  const select = $("main-franchise");
  const list = franchises();
  const members = state.division
    ? state.divisionMembers.get(state.division)
    : null;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.division
    ? "Выберите франшизу"
    : "Все франшизы";

  select.replaceChildren(placeholder);

  for (const [id, name] of list) {
    if (members && !members.has(id)) continue;

    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${name} · ${id}`;
    select.append(option);
  }

  if (state.main && members && !members.has(state.main)) {
    state.main = "";
  }

  select.value = state.main;
}
function renderCompareFranchiseOptions() {
  const compareSelect = $("compare-franchise");
  const placeholder = compareSelect.options[0].cloneNode(true);

  const allowed = state.compareDivision
    ? (state.divisionMembers.get(state.compareDivision) || new Set())
    : null;

  compareSelect.replaceChildren(placeholder);

  for (const [id, name] of franchises()) {
    if (allowed && !allowed.has(id)) continue;

    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${name} · ${id}`;
    compareSelect.append(option);
  }

  if (state.compare && allowed && !allowed.has(state.compare)) {
    state.compare = "";
  }

  compareSelect.value = state.compare;
}

function setupControls() {
  state.divisionMembers = new Map(divisionGroups());

  const divisionSelect = $("division-select");
  for (const [division] of state.divisionMembers) {
    const option = document.createElement("option");
    option.value = division;
    option.textContent = division;
    divisionSelect.append(option);
  }

  updateDivisionCarousel("", false);
  renderMainFranchiseOptions();

  const compareDivisionSelect = $("compare-division-select");
  for (const [division] of state.divisionMembers) {
    const option = document.createElement("option");
    option.value = division;
    option.textContent = division;
    compareDivisionSelect.append(option);
  }

  renderCompareFranchiseOptions();
}function filteredRows() {
  return state.rows.filter(row => {
    if (state.main && idOf(row) !== state.main) {
      return false;
    }

    return true;
  }).sort((a, b) =>
    year(a) - year(b) ||
    idOf(a).localeCompare(idOf(b))
  );
}

function fmt(value) {
  const n = num(value);

  return n === null
    ? "—"
    : n.toLocaleString("ru-RU", {
        maximumFractionDigits: 2
      });
}

function renderTable() {
  const rows = filteredRows();
  const pages = Math.max(
    1,
    Math.ceil(rows.length / state.pageSize)
  );

  state.page = Math.max(1, Math.min(state.page, pages));

  const start = (state.page - 1) * state.pageSize;
  const visible = rows.slice(start, start + state.pageSize);

  $("table-title").textContent = "История франшизы";
  $("table-count").textContent = `${rows.length} записей`;
  $("page-label").textContent =
    `Страница ${state.page} из ${pages}`;

  $("prev-page").disabled = state.page <= 1;
  $("next-page").disabled = state.page >= pages;

  if (!visible.length) {
    $("standings-body").innerHTML =
      '<tr><td colspan="9">По заданным условиям ничего не найдено.</td></tr>';
    return;
  }

  $("standings-body").innerHTML = visible.map(row => {
    const selected =
      state.main && idOf(row) === state.main
        ? "selected-row"
        : "";

    const record = str(row.WLT) ||
      `${str(row.Wins) || "—"}-${str(row.Losses) || "—"}-${str(row.Ties) || "0"}`;

    return `<tr class="${selected}">
      <td>${safe(row.Season)}</td>
      <td>${safe(nameOf(row))}</td>
      <td>${safe(row.OwnerName || "—")}</td>
      <td>${safe(row.Division || "—")}</td>
      <td>${safe(record)}</td>
      <td>${fmt(row.PF)}</td>
      <td>${fmt(row.PP)}</td>
      <td>${fmt(row.Eff)}</td>
      <td>${safe(idOf(row))}</td>
    </tr>`;
  }).join("");
}

function rgba(hex, alpha) {
  const h = hex.replace("#", "");

  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

function renderChart() {
  if (typeof Chart === "undefined") {
    $("status").textContent =
      "?? ??????? ????????? ???????????? ??????";
    return;
  }

  const years = [...new Set(
    state.rows.map(year).filter(Number.isFinite)
  )].sort((a, b) => a - b);

  const metrics = [
    {
      key: "Wins",
      label: "W-L",
      axis: "yWins",
      title: "Победы",
      dash: [],
      pointStyle: "circle"
    },
    {
      key: "PF",
      label: "PF",
      axis: "yPF",
      title: "Очки",
      dash: [7, 4],
      pointStyle: "rect"
    },
    {
      key: "Eff",
      label: "EFF",
      axis: "yEff",
      title: "Эффективность",
      dash: [2, 3],
      pointStyle: "triangle"
    }
  ];

  const visible = new Set(state.visibleMetrics);
  const activeMetrics = metrics.filter(metric => visible.has(metric.key));

  const colors = [
    "#e2b45b",
    "#58b9d2",
    "#e16c5b",
    "#91c58a",
    "#b49ae8",
    "#e78bc0",
    "#d7d9de",
    "#d89b62"
  ];

  const datasets = [];

  franchises().forEach(([id, name], index) => {
    const main = id === state.main;
    const compare = id === state.compare;

    const color = main
      ? "#f0c66e"
      : compare
        ? "#5bc6df"
        : colors[index % colors.length];

    const alpha = main
      ? 1
      : compare
        ? 0.75
        : (state.main || state.compare)
          ? 0.08
          : 0.48;

    const records = new Map(
      state.rows
        .filter(row => idOf(row) === id)
        .map(row => [year(row), row])
    );

    activeMetrics.forEach(metric => {
      const values = years.map(y => {
        const row = records.get(y);
        return row ? metricValue(row, metric.key) : null;
      });

      if (!values.some(value => value !== null)) return;

      datasets.push({
        label: `${name} ? ${id} ? ${metric.label}`,
        data: values,
        yAxisID: metric.axis,
        borderColor: rgba(color, alpha),
        backgroundColor: rgba(color, alpha),
        borderDash: metric.dash,
        pointStyle: metric.pointStyle,
        borderWidth: main || compare ? 3 : 1.1,
        pointRadius: main || compare ? 3.6 : 1,
        pointHoverRadius: 5,
        spanGaps: false,
        tension: 0.2
      });
    });
  });

  if (state.chart) state.chart.destroy();

  state.chart = new Chart($("history-chart"), {
    type: "line",
    data: {
      labels: years,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: item =>
              `${item.dataset.label}: ${item.formattedValue || "нет данных"}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: "#282e35" },
          ticks: { color: "#929ba5" },
          title: {
            display: true,
            text: "Сезон",
            color: "#929ba5"
          }
        },
        yWins: {
          type: "linear",
          display: visible.has("Wins"),
          position: "left",
          beginAtZero: true,
          grid: { color: "#282e35" },
          ticks: { color: "#929ba5" },
          title: {
            display: true,
            text: "Победы",
            color: "#f0c66e"
          }
        },
        yPF: {
          type: "linear",
          display: visible.has("PF"),
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: "#929ba5" },
          title: {
            display: true,
            text: "Очки",
            color: "#58b9d2"
          }
        },
        yEff: {
          type: "linear",
          display: visible.has("Eff"),
          position: "right",
          offset: true,
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: "#929ba5" },
          title: {
            display: true,
            text: "Эффективность",
            color: "#b49ae8"
          }
        }
      }
    }
  });
}

function updateDivisionCarousel(selectedDivision, animate = true) {
  const rail = document.querySelector(".division-rail-left");
  const select = $("division-select");

  if (!rail || !select) return;

  const items = [...rail.querySelectorAll(".division-emblem")];

  // Индекс эмблемы берём из имени файла: division00 = 0, division01 = 1 и т.д.
  const indexed = items.map((element, position) => {
    if (!element.dataset.emblemIndex) {
      const src = element.querySelector("img")?.getAttribute("src") || "";
      const match = src.match(/division(\d+)_logo\./);
      element.dataset.emblemIndex = match
        ? String(Number(match[1]))
        : String(position);
    }

    return {
      element,
      index: Number(element.dataset.emblemIndex)
    };
  });

  const oldTop = new Map(
    indexed.map(item => [
      item.index,
      item.element.getBoundingClientRect().top
    ])
  );

  // Карусель зависит только от названия выбранного дивизиона.
  const emblemIndexByDivision = {
    "GREAT": 0,
    "NEXT GEN": 1,
    "3rd & LONG": 2,
    "FOUR SEASONS": 3,
    "RUSSELL'5": 4,
    "LEG VI": 5,
    "FRONT SEVEN": 6
  };

  const selectedIndex = Object.prototype.hasOwnProperty.call(
    emblemIndexByDivision,
    selectedDivision
  )
    ? emblemIndexByDivision[selectedDivision]
    : -1;

  let ordered;

  if (selectedIndex < 0) {
    ordered = [...indexed].sort((a, b) => a.index - b.index);
  } else {
    // Выбранная эмблема занимает второй слот.
    ordered = Array.from({ length: 7 }, (_, offset) => {
      const index = (selectedIndex - 1 + offset + 7) % 7;
      return indexed.find(item => item.index === index);
    }).filter(Boolean);
  }

  for (const item of ordered) {
    rail.appendChild(item.element);
  }

  if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const item of ordered) {
      item.element.style.transform = "";
      item.element.style.transition = "";
    }
    return;
  }

  // FLIP-анимация: сохраняем визуальные позиции и плавно переставляем эмблемы.
  for (const item of ordered) {
    const previousTop = oldTop.get(item.index);
    const newTop = item.element.getBoundingClientRect().top;

    if (previousTop === undefined) continue;

    const delta = previousTop - newTop;
    if (!delta) continue;

    item.element.style.transition = "none";
    item.element.style.transform = `translateY(${delta}px)`;
  }

  rail.getBoundingClientRect();

  requestAnimationFrame(() => {
    for (const item of ordered) {
      const element = item.element;
      if (!element.style.transform) continue;

      element.style.transition = "transform 420ms ease";
      element.style.transform = "translateY(0)";

      element.addEventListener("transitionend", function cleanup(event) {
        if (event.propertyName !== "transform") return;
        element.style.transition = "";
        element.style.transform = "";
        element.removeEventListener("transitionend", cleanup);
      });
    }
  });
}
function refresh() {
  renderTable();
  renderChart();
}

$("division-select").addEventListener("change", event => {
  state.division = event.target.value;
  updateDivisionCarousel(event.target.value);
  state.page = 1;

  renderMainFranchiseOptions();

  if (state.main && state.main === state.compare) {
    state.compare = "";
    $("compare-franchise").value = "";
  }

  refresh();
});
$("main-franchise").addEventListener("change", event => {
  state.main = event.target.value;

  if (state.main && state.main === state.compare) {
    state.compare = "";
    $("compare-franchise").value = "";
  }

  state.page = 1;
  refresh();
});

$("compare-division-select").addEventListener("change", event => {
  state.compareDivision = event.target.value;
  renderCompareFranchiseOptions();
  refresh();
});
$("compare-franchise").addEventListener("change", event => {
  state.compare = event.target.value;

  if (state.compare && state.compare === state.main) {
    state.main = "";
    $("main-franchise").value = "";
  }

  refresh();
});



document.querySelectorAll(".metric").forEach(button => {
  button.addEventListener("click", () => {
    const allMetrics = ["Wins", "PF", "Eff"];
    const selected = new Set(state.visibleMetrics);

    if (button.dataset.metric === "all") {
      state.visibleMetrics = allMetrics;
    } else {
      const metric = button.dataset.metric;

      if (selected.has(metric)) {
        selected.delete(metric);
      } else {
        selected.add(metric);
      }

      state.visibleMetrics = allMetrics.filter(key => selected.has(key));
    }

    document.querySelectorAll(".metric").forEach(item => {
      const active = item.dataset.metric === "all"
        ? state.visibleMetrics.length === allMetrics.length
        : state.visibleMetrics.includes(item.dataset.metric);

      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });

    renderChart();
  });
});

$("prev-page").addEventListener("click", () => {
  state.page--;
  renderTable();
});

$("next-page").addEventListener("click", () => {
  state.page++;
  renderTable();
});

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    $("statistics-panel").hidden =
      button.dataset.tab !== "statistics";

    $("current-panel").hidden =
      button.dataset.tab !== "current";

    $("champions-panel").hidden =
      button.dataset.tab !== "champions";

    $("history-panel").hidden =
      button.dataset.tab !== "history";

    $("payments-panel").hidden =
      button.dataset.tab !== "payments";

    $("support-panel").hidden =
      button.dataset.tab !== "support";

    if (button.dataset.tab === "history" && state.chart) {
      state.chart.resize();
    }
  });
});

// Данные текущего сезона из отдельного JSON. Исторический архив не используется.
const currentSeasonState = {
  data: null,
  chart: null,
  main: "",
  compare: "",
  division: "",
  compareDivision: ""
};

function currentFranchiseName(franchise) {
  return str(franchise.name) || `Франшиза ${str(franchise.id)}`;
}

function currentFranchiseOptions(division = currentSeasonState.division) {
  const data = currentSeasonState.data;
  if (!data) return [];

  return data.franchises
    .filter(franchise =>
      !division ||
      str(franchise.divisionId) === str(division)
    )
    .slice()
    .sort((a, b) =>
      currentFranchiseName(a).localeCompare(currentFranchiseName(b), "ru")
    );
}

function fillCurrentFranchiseSelects() {
  const data = currentSeasonState.data;
  if (!data) return;

  const divisionSelect = $("current-division-select");
  const compareDivisionSelect = $("current-compare-division-select");
  const mainSelect = $("current-main-franchise");
  const compareSelect = $("current-compare-franchise");

  divisionSelect.replaceChildren(new Option("Все дивизионы", ""));
  compareDivisionSelect.replaceChildren(new Option("Все дивизионы", ""));

  for (const division of data.divisions) {
    divisionSelect.append(new Option(division.name, division.id));
    compareDivisionSelect.append(new Option(division.name, division.id));
  }

  divisionSelect.value = currentSeasonState.division;
  compareDivisionSelect.value = currentSeasonState.compareDivision;

  const mainOptions = currentFranchiseOptions(currentSeasonState.division);
  const compareOptions = currentFranchiseOptions(currentSeasonState.compareDivision);

  const mainIds = new Set(mainOptions.map(franchise => str(franchise.id)));
  const compareIds = new Set(compareOptions.map(franchise => str(franchise.id)));

  if (!mainIds.has(currentSeasonState.main)) {
    currentSeasonState.main = "";
  }
  if (!compareIds.has(currentSeasonState.compare)) {
    currentSeasonState.compare = "";
  }

  mainSelect.replaceChildren(new Option("Выберите франшизу", ""));
  compareSelect.replaceChildren(new Option("Без сравнения", ""));

  for (const franchise of mainOptions) {
    const label = `${currentFranchiseName(franchise)} · ${franchise.id}`;
    mainSelect.append(new Option(label, franchise.id));
  }

  for (const franchise of compareOptions) {
    const label = `${currentFranchiseName(franchise)} · ${franchise.id}`;
    compareSelect.append(new Option(label, franchise.id));
  }

  mainSelect.value = currentSeasonState.main;
  compareSelect.value = currentSeasonState.compare;
}

function currentRecordText(franchise) {
  const record = franchise.record || {};
  return `${num(record.wins) ?? 0}-${num(record.losses) ?? 0}-${num(record.ties) ?? 0}`;
}

function renderCurrentFranchiseEmblem(franchise) {
  const image = $("current-franchise-emblem");
  if (!image) return;

  const sources = [...new Set(
    [franchise?.logo, franchise?.icon]
      .map(value => String(value || "").trim())
      .filter(Boolean)
  )];

  image.onerror = null;
  image.hidden = true;
  image.removeAttribute("src");

  if (!sources.length) return;

  let sourceIndex = 0;
  image.alt = `Team logo: ${currentFranchiseName(franchise)}`;

  image.onerror = () => {
    sourceIndex += 1;

    if (sourceIndex < sources.length) {
      image.src = sources[sourceIndex];
    } else {
      image.hidden = true;
      image.removeAttribute("src");
    }
  };

  image.hidden = false;
  image.src = sources[sourceIndex];
}
function renderCurrentSummary(franchise) {
  renderCurrentFranchiseEmblem(franchise);
  const summary = $("current-franchise-summary");

  if (!franchise) {
    $("current-roster-title").textContent = "Состав франшизы";
    $("current-roster-count").textContent = "— игроков";
    summary.innerHTML = '<p class="current-roster-placeholder">Выбери основную франшизу, чтобы посмотреть результаты и состав.</p>';
    return;
  }

  $("current-roster-title").textContent = currentFranchiseName(franchise);

  const roster = franchise.roster || {};
  const groups = [
    roster.ROSTER || [],
    roster.INJURED_RESERVE || [],
    roster.TAXI_SQUAD || []
  ];
  const total = groups.reduce((sum, group) => sum + group.length, 0);

  $("current-roster-count").textContent = `${total} игроков`;
  summary.innerHTML = `
    <div class="current-summary-stat">
      <span>W-L-T</span><strong>${safe(currentRecordText(franchise))}</strong>
    </div>
    <div class="current-summary-stat">
      <span>PF</span><strong>${safe((num(franchise.pf) ?? 0).toFixed(2))}</strong>
    </div>
    <div class="current-summary-stat">
      <span>Матчи</span><strong>${safe(franchise.gamesPlayed ?? 0)}</strong>
    </div>
    <div class="current-summary-stat">
      <span>Дивизион</span><strong>${safe((currentSeasonState.data.divisions.find(item => str(item.id) === str(franchise.divisionId)) || {}).name || franchise.divisionId)}</strong>
    </div>`;

  const rosterTargets = [
    ["ROSTER", "current-roster-roster", "current-roster-count-roster"],
    ["INJURED_RESERVE", "current-roster-ir", "current-roster-count-ir"],
    ["TAXI_SQUAD", "current-roster-taxi", "current-roster-count-taxi"]
  ];

  for (const [key, listId, countId] of rosterTargets) {
    const players = roster[key] || [];
    $(countId).textContent = String(players.length);

    if (!players.length) {
      $(listId).innerHTML = '<p class="current-roster-placeholder">Нет игроков в этой группе.</p>';
      continue;
    }

    $(listId).innerHTML = `
      <div class="current-player-table-head">
        <span>Player</span><span>YTD Pts</span><span>Bye</span>
      </div>` + players.map(player => `
      <div class="current-player-row">
        <div class="current-player-main">
          <strong class="current-player-name">${safe(player.name || "Игрок")}</strong>
          <span class="current-player-meta">${safe(player.position || "—")} · ${safe(player.team || "—")}</span>
        </div>
        <span class="current-player-points">${player.ytdPoints == null ? "—" : safe(Number(player.ytdPoints).toFixed(2))}</span>
        <span class="current-player-bye">${player.byeWeek == null ? "—" : safe(player.byeWeek)}</span>
      </div>`).join("");
  }
}
function renderCurrentChart() {
  const data = currentSeasonState.data;
  const canvas = $("current-chart");
  const empty = $("current-chart-empty");

  if (!data || typeof Chart === "undefined") {
    if (currentSeasonState.chart) {
      currentSeasonState.chart.destroy();
      currentSeasonState.chart = null;
    }
    canvas.hidden = true;
    empty.hidden = false;

    if (typeof Chart === "undefined" && data) {
      $("current-data-status").textContent = "\u0043hart.js unavailable";
    }
    return;
  }

  const franchises = data.franchises.filter(franchise => {
    const id = str(franchise.id);
    const inMainDivision =
      !currentSeasonState.division ||
      str(franchise.divisionId) === currentSeasonState.division;
    const inCompareDivision =
      Boolean(currentSeasonState.compareDivision) &&
      str(franchise.divisionId) === currentSeasonState.compareDivision;

    return inMainDivision ||
      inCompareDivision ||
      id === currentSeasonState.main ||
      id === currentSeasonState.compare;
  });

  const main = franchises.find(
    item => str(item.id) === currentSeasonState.main
  );
  const compare = franchises.find(
    item => str(item.id) === currentSeasonState.compare
  );

  const maxWeeks = Number(data.weeks) || 14;
  let lastCompleteWeek = 0;

  for (let week = 1; week <= maxWeeks; week++) {
    const complete = data.franchises.length > 0 &&
      data.franchises.every(franchise => {
        const item = (franchise.weekly || []).find(
          entry => Number(entry.week) === week
        );
        return item && num(item.pf) !== null;
      });

    if (!complete) break;
    lastCompleteWeek = week;
  }

  const weeks = Array.from(
    { length: lastCompleteWeek },
    (_, index) => index + 1
  );

  const datasets = [];

  for (const franchise of franchises) {
    const id = str(franchise.id);
    const isMain = Boolean(main && str(main.id) === id);
    const isCompare = Boolean(compare && str(compare.id) === id);
    const highlighted = isMain || isCompare;

    const color = isMain
      ? "#f0c66e"
      : isCompare
        ? "#5bc6df"
        : "rgba(160, 174, 192, 0.24)";

    const weekly = new Map(
      (franchise.weekly || []).map(item => [Number(item.week), item])
    );

    let wins = 0;

    const cumulativeWins = weeks.map(week => {
      const result = weekly.get(week);
      if (!result) return null;
      if (result.result === "W") wins++;
      return wins;
    });

    const pointsFor = weeks.map(week => {
      const result = weekly.get(week);
      return result && num(result.pf) !== null ? num(result.pf) : null;
    });

    const name = currentFranchiseName(franchise);

    datasets.push({
      label: `${name} \u00b7 W`,
      data: cumulativeWins,
      yAxisID: "yWins",
      borderColor: color,
      backgroundColor: color,
      borderDash: [6, 4],
      pointRadius: highlighted ? 2.5 : 0,
      pointHoverRadius: 5,
      borderWidth: highlighted ? 2.5 : 1,
      spanGaps: false,
      tension: 0.2,
      customMeta: { name, metric: "wins", weekly, highlighted }
    });

    datasets.push({
      label: `${name} \u00b7 PF`,
      data: pointsFor,
      yAxisID: "yPF",
      borderColor: color,
      backgroundColor: color,
      pointRadius: highlighted ? 2.5 : 0,
      pointHoverRadius: 5,
      borderWidth: highlighted ? 2.5 : 1,
      spanGaps: false,
      tension: 0.2,
      customMeta: { name, metric: "pf", weekly, highlighted }
    });
  }

  if (currentSeasonState.chart) {
    currentSeasonState.chart.destroy();
    currentSeasonState.chart = null;
  }

  canvas.hidden = false;
  empty.hidden = true;

  currentSeasonState.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: weeks.map(week => `\u041d\u0435\u0434. ${week}`),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            filter(item, chartData) {
              return Boolean(
                chartData.datasets[item.datasetIndex]?.customMeta?.highlighted
              );
            }
          }
        },
        tooltip: {
          enabled: true,
          callbacks: {
            label(context) {
              const meta = context.dataset.customMeta;
              if (!meta) return context.dataset.label;

              const value = context.parsed.y;
              if (value === null || value === undefined) {
                return `${meta.name}: \u2014`;
              }

              return meta.metric === "wins"
                ? `${meta.name} \u00b7 W: ${value}`
                : `${meta.name} \u00b7 PF: ${value}`;
            },
            afterBody(items) {
              const seen = new Set();
              const lines = [];

              for (const item of items) {
                const meta = item.dataset.customMeta;
                if (!meta || seen.has(meta.name)) continue;
                seen.add(meta.name);

                const week = weeks[item.dataIndex];
                const match = meta.weekly.get(week);

                if (!match) {
                  lines.push(`${meta.name}: \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0437\u0430 \u043c\u0430\u0442\u0447`);
                  continue;
                }

                const resultLabels = {
                  W: "\u041f\u043e\u0431\u0435\u0434\u0430",
                  L: "\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435",
                  T: "\u041d\u0438\u0447\u044c\u044f"
                };

                const result = resultLabels[match.result] || match.result || "\u2014";
                lines.push(`${meta.name}: ${result}`);
              }

              return lines;
            }
          }
        }
      },
      scales: {
        yWins: {
          type: "linear",
          position: "left",
          min: 0,
          max: 14,
          title: {
            display: true,
            text: "\u041f\u043e\u0431\u0435\u0434\u044b (\u043d\u0430\u043a\u043e\u043f\u0438\u0442\u0435\u043b\u044c\u043d\u043e)"
          },
          ticks: { precision: 0, stepSize: 1 }
        },
        yPF: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          title: {
            display: true,
            text: "\u041e\u0447\u043a\u0438 \u0437\u0430 \u043d\u0435\u0434\u0435\u043b\u044e (PF)"
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function refreshCurrentSeason() {
  const data = currentSeasonState.data;
  if (!data) return;

  const main = data.franchises.find(item => str(item.id) === currentSeasonState.main);
  renderCurrentSummary(main);
  renderCurrentChart();
}

async function loadCurrentSeason() {
  try {
    const response = await fetch("data/current_2026.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data.franchises) || !Array.isArray(data.divisions)) {
      throw new Error("Неожиданный формат current_2026.json");
    }

    currentSeasonState.data = data;
    fillCurrentFranchiseSelects();

    $("current-division-select").addEventListener("change", event => {
      currentSeasonState.division = event.target.value;
      currentSeasonState.main = "";
      fillCurrentFranchiseSelects();
      refreshCurrentSeason();
    });

    $("current-compare-division-select").addEventListener("change", event => {
      currentSeasonState.compareDivision = event.target.value;
      currentSeasonState.compare = "";
      fillCurrentFranchiseSelects();
      refreshCurrentSeason();
    });

    $("current-main-franchise").addEventListener("change", event => {
      currentSeasonState.main = event.target.value;
      if (currentSeasonState.main && currentSeasonState.main === currentSeasonState.compare) {
        currentSeasonState.compare = "";
      }
      fillCurrentFranchiseSelects();
      refreshCurrentSeason();
    });

    $("current-compare-franchise").addEventListener("change", event => {
      currentSeasonState.compare = event.target.value;
      if (currentSeasonState.compare && currentSeasonState.compare === currentSeasonState.main) {
        currentSeasonState.main = "";
      }
      fillCurrentFranchiseSelects();
      refreshCurrentSeason();
    });

    $("current-data-status").textContent =
      `Сезон ${data.season} · обновлено ${data.updatedAt || "дата неизвестна"}`;
    refreshCurrentSeason();
  } catch (error) {
    $("current-data-status").textContent = "Не удалось загрузить данные сезона";
    $("current-chart-empty").hidden = false;
    $("current-chart-empty").querySelector("p").textContent =
      `Проверь файл data/current_2026.json и локальный веб-сервер. ${error.message}`;
  }
}
async function init() {
  try {
    const response = await fetch("data/historical_standings.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length !== 812) {
      throw new Error(
        `Ожидалось 812 записей, получено: ${data.length}`
      );
    }

    state.rows = data;
    setupControls();
    refresh();
    await loadCurrentSeason();

    $("status").textContent = "Архив загружен · 812 записей";
  } catch (error) {
    $("status").textContent = "Ошибка загрузки архива";

    $("standings-body").innerHTML =
      `<tr><td colspan="9">Не удалось загрузить JSON. Запусти сайт через локальный веб-сервер. ${safe(error.message)}</td></tr>`;
  }
}

init();
