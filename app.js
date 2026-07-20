const STORAGE_KEY = "lemo_babyfoot_v2_supabase_backup";
const LEGACY_STORAGE_KEY = "lemo_babyfoot_simplified_v1_backup";
const SUPABASE_TABLE = "babyfoot_state";
const SUPABASE_ROW_ID = "main";
const REFRESH_INTERVAL_MS = 15000;
const BASE_ELO = 1000;
const ELO_K_FACTOR = 32;
const MIN_ELO_MATCHES = 5;
const ADMIN_SESSION_KEY = "lemo_babyfoot_admin_unlocked";

const supabaseConfig = window.BABYFOOT_CONFIG || {};
let supabaseReady = false;
let appStarted = false;
let saveTimer = null;
let isSaving = false;
let lastRemoteUpdatedAt = null;
let selectedArchiveMonth = currentMonthKey();
let selectedStatsMonth = currentMonthKey();
let adminUnlocked = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
let archiveUiMessage = "";

const defaultState = {
  players: ["Hugo", "Maxime", "Romain", "Angel"],
  activePage: "matches",
  standardMode: "1v1",
  standardHistory: [],
  competitionSelection: {
    tournament: ["Hugo", "Maxime", "Romain", "Angel"],
    championship: ["Hugo", "Maxime", "Romain", "Angel"]
  },
  tournamentConfig: {
    mode: "1v1",
    format: "knockout"
  },
  tournament: null,
  tournamentArchive: [],
  championshipConfig: {
    mode: "1v1"
  },
  championship: null,
  championshipArchive: []
};

let state = cloneDefaultState();

const el = {
  syncStatus: document.getElementById("syncStatus"),
  pageMatches: document.getElementById("pageMatches"),
  pageCompetitions: document.getElementById("pageCompetitions"),
  pageStats: document.getElementById("pageStats"),

  addPlayerForm: document.getElementById("addPlayerForm"),
  playerName: document.getElementById("playerName"),
  playersList: document.getElementById("playersList"),
  tournamentPlayerSelection: document.getElementById("tournamentPlayerSelection"),
  championshipPlayerSelection: document.getElementById("championshipPlayerSelection"),

  randomTeamsBtn: document.getElementById("randomTeamsBtn"),
  saveStandardMatchBtn: document.getElementById("saveStandardMatchBtn"),
  standardMessage: document.getElementById("standardMessage"),
  standardWinnerPreview: document.getElementById("standardWinnerPreview"),
  standardMatchDate: document.getElementById("standardMatchDate"),
  teamA1: document.getElementById("teamA1"),
  teamA2: document.getElementById("teamA2"),
  teamB1: document.getElementById("teamB1"),
  teamB2: document.getElementById("teamB2"),
  standardScoreA: document.getElementById("standardScoreA"),
  standardScoreB: document.getElementById("standardScoreB"),
  standardHistoryList: document.getElementById("standardHistoryList"),
  archiveMonthFilter: document.getElementById("archiveMonthFilter"),
  adminModeBtn: document.getElementById("adminModeBtn"),
  archiveFreezeNote: document.getElementById("archiveFreezeNote"),
  competitionAdminModeBtn: document.getElementById("competitionAdminModeBtn"),
  competitionArchiveNote: document.getElementById("competitionArchiveNote"),

  generateTournamentBtn: document.getElementById("generateTournamentBtn"),
  clearTournamentBtn: document.getElementById("clearTournamentBtn"),
  tournamentBoard: document.getElementById("tournamentBoard"),
  tournamentMessage: document.getElementById("tournamentMessage"),
  tournamentHistoryList: document.getElementById("tournamentHistoryList"),

  generateChampionshipBtn: document.getElementById("generateChampionshipBtn"),
  clearChampionshipBtn: document.getElementById("clearChampionshipBtn"),
  championshipBoard: document.getElementById("championshipBoard"),
  championshipMessage: document.getElementById("championshipMessage"),
  championshipHistoryList: document.getElementById("championshipHistoryList"),

  statsMonthTabs: document.getElementById("statsMonthTabs"),
  statsSeasonStatus: document.getElementById("statsSeasonStatus"),
  seasonChampion: document.getElementById("seasonChampion"),
  eloQualificationNote: document.getElementById("eloQualificationNote"),
  eloRanking: document.getElementById("eloRanking"),
  winRateRanking: document.getElementById("winRateRanking"),
  goalsForRanking: document.getElementById("goalsForRanking"),
  goalsAgainstRanking: document.getElementById("goalsAgainstRanking"),
  extraStats: document.getElementById("extraStats")
};

const teamSelects = [el.teamA1, el.teamA2, el.teamB1, el.teamB2];

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function normalizeState(rawState) {
  const parsed = rawState && typeof rawState === "object" ? rawState : {};
  const base = cloneDefaultState();
  const players = uniquePlayers(Array.isArray(parsed.players) ? parsed.players : base.players);
  const canonicalPlayers = new Map(players.map(name => [name.toLowerCase(), name]));
  const normalizeSelection = (values, fallbackToAll) => {
    if (!Array.isArray(values)) return fallbackToAll ? [...players] : [];
    return uniquePlayers(values)
      .map(name => canonicalPlayers.get(name.toLowerCase()))
      .filter(Boolean);
  };
  const hasCompetitionSelection = parsed.competitionSelection && typeof parsed.competitionSelection === "object";

  return {
    ...base,
    ...parsed,
    players,
    activePage: ["matches", "competitions", "stats"].includes(parsed.activePage) ? parsed.activePage : "matches",
    standardMode: ["1v1", "1v2", "2v2"].includes(parsed.standardMode) ? parsed.standardMode : "1v1",
    standardHistory: Array.isArray(parsed.standardHistory) ? parsed.standardHistory.map(normalizeStandardMatch).filter(Boolean) : [],
    competitionSelection: {
      tournament: normalizeSelection(parsed.competitionSelection?.tournament, !hasCompetitionSelection),
      championship: normalizeSelection(parsed.competitionSelection?.championship, !hasCompetitionSelection)
    },
    tournamentConfig: {
      ...base.tournamentConfig,
      ...(parsed.tournamentConfig || {}),
      format: "knockout"
    },
    tournament: parsed.tournament || null,
    tournamentArchive: Array.isArray(parsed.tournamentArchive) ? parsed.tournamentArchive.map(normalizeTournamentArchive).filter(Boolean) : [],
    championshipConfig: {
      ...base.championshipConfig,
      ...(parsed.championshipConfig || {})
    },
    championship: parsed.championship || null,
    championshipArchive: Array.isArray(parsed.championshipArchive) ? parsed.championshipArchive.map(normalizeChampionshipArchive).filter(Boolean) : []
  };
}

function normalizeStandardMatch(match) {
  if (!match || !match.teams || !match.score) return null;
  const scoreA = parseScore(match.score.A);
  const scoreB = parseScore(match.score.B);
  if (scoreA === scoreB) return null;
  const winner = scoreA > scoreB ? "A" : "B";
  return {
    id: match.id || randomId(),
    mode: ["1v1", "1v2", "2v2"].includes(match.mode) ? match.mode : "1v1",
    teams: {
      A: Array.isArray(match.teams.A) ? match.teams.A : [],
      B: Array.isArray(match.teams.B) ? match.teams.B : []
    },
    score: { A: scoreA, B: scoreB },
    winner,
    playedAt: match.playedAt || dateOnly(match.createdAt) || todayInputValue(),
    createdAt: match.createdAt || new Date().toISOString()
  };
}

function normalizeTournamentArchive(item) {
  if (!item || !item.teamA || !item.teamB || !item.winnerTeam || !item.loserTeam) return null;
  const winner = item.winner === "teamA" ? "A" : item.winner === "teamB" ? "B" : item.winner;
  return {
    ...item,
    id: item.id || randomId(),
    mode: item.mode === "2v2" ? "2v2" : "1v1",
    format: "knockout",
    winner: winner === "B" ? "B" : "A",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
}

function normalizeChampionshipArchive(item) {
  if (!item || !item.teamA || !item.teamB || !item.score) return null;
  const scoreA = parseScore(item.score.A);
  const scoreB = parseScore(item.score.B);
  if (scoreA === scoreB) return null;
  const winner = scoreA > scoreB ? "A" : "B";
  return {
    ...item,
    id: item.id || randomId(),
    mode: item.mode === "2v2" ? "2v2" : "1v1",
    score: { A: scoreA, B: scoreB },
    winner,
    winnerTeam: winner === "A" ? item.teamA : item.teamB,
    loserTeam: winner === "A" ? item.teamB : item.teamA,
    playedAt: item.playedAt || todayInputValue(),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
}

function loadLocalBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return cloneDefaultState();
  }
}

function saveLocalBackup() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Sauvegarde locale impossible", error);
  }
}

function isSupabaseConfigured() {
  return Boolean(
    supabaseConfig.url &&
    (supabaseConfig.publishableKey || supabaseConfig.anonKey) &&
    !supabaseConfig.url.includes("TON-PROJET") &&
    !(supabaseConfig.publishableKey || supabaseConfig.anonKey).includes("TA-CLE")
  );
}

function setupSupabase() {
  if (!isSupabaseConfigured()) {
    setSyncStatus("Mode local : config.js n'est pas encore configuré.", "warning");
    return;
  }

  try {
    const configuredUrl = new URL(String(supabaseConfig.url).trim());
    if (configuredUrl.protocol !== "https:" || !configuredUrl.hostname.endsWith(".supabase.co")) {
      throw new Error("URL Supabase invalide");
    }
  } catch {
    setSyncStatus("Erreur : l’URL Supabase de config.js est invalide.", "error");
    return;
  }

  if (String((supabaseConfig.publishableKey || supabaseConfig.anonKey) || "").startsWith("sb_secret_")) {
    setSyncStatus("Erreur : la clé Supabase utilisée est une clé secrète. Utilise la Publishable key.", "error");
    return;
  }

  if (typeof window.fetch !== "function") {
    setSyncStatus("Erreur : ce navigateur ne prend pas en charge la connexion Supabase.", "error");
    return;
  }

  supabaseReady = true;
}

function getSupabaseBaseUrl() {
  return String(supabaseConfig.url || "")
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");
}

function getSupabaseErrorMessage(error) {
  if (!error) return "Erreur inconnue.";
  if (error.name === "AbortError") {
    return "Le serveur Supabase ne répond pas dans le délai prévu.";
  }
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message || "")) {
    return "Serveur Supabase inaccessible. Vérifie que le projet est actif et que le réseau autorise supabase.co.";
  }
  return error.message || error.details || error.hint || JSON.stringify(error);
}

function wait(delayMs) {
  return new Promise(resolve => window.setTimeout(resolve, delayMs));
}

async function supabaseRequest(path, options = {}, maxAttempts = 3) {
  const baseUrl = getSupabaseBaseUrl();
  const key = String((supabaseConfig.publishableKey || supabaseConfig.anonKey) || "").trim();
  const url = `${baseUrl}${path}`;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await window.fetch(url, {
        method: options.method || "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          apikey: key,
          // Les nouvelles clés sb_publishable_ ne sont pas des JWT.
          // Authorization est conservé uniquement pour les anciennes clés anon JWT.
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        },
        body: options.body
      });

      window.clearTimeout(timeoutId);

      const responseText = await response.text();
      let payload = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = responseText;
        }
      }

      if (!response.ok) {
        const details = payload?.message || payload?.details || payload?.hint || response.statusText || "Erreur Supabase";
        const requestError = new Error(`HTTP ${response.status} : ${details}`);
        requestError.status = response.status;
        throw requestError;
      }

      return payload;
    } catch (error) {
      window.clearTimeout(timeoutId);
      lastError = error;
      const retryableStatus = Number(error?.status || 0);
      const retryable =
        error?.name === "AbortError" ||
        error instanceof TypeError ||
        retryableStatus === 408 ||
        retryableStatus === 425 ||
        retryableStatus === 429 ||
        retryableStatus >= 500;

      if (!retryable || attempt === maxAttempts) break;
      await wait(attempt * 800);
    }
  }

  throw lastError || new Error("Connexion Supabase impossible.");
}

async function readRemoteState() {
  const query = `/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?select=data,updated_at&id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&limit=1`;
  const rows = await supabaseRequest(query);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function loadState() {
  setupSupabase();

  if (!supabaseReady) return loadLocalBackup();

  setSyncStatus("Connexion à la sauvegarde partagée...", "info");

  try {
    const data = await readRemoteState();

    if (!data) {
      const initialState = normalizeState(cloneDefaultState());
      state = initialState;
      const saved = await saveStateNow(initialState);
      if (saved) setSyncStatus("Sauvegarde partagée initialisée.", "success");
      return initialState;
    }

    lastRemoteUpdatedAt = data.updated_at;
    setSyncStatus("Synchronisé avec la sauvegarde partagée.", "success");
    return normalizeState(data.data);
  } catch (error) {
    console.error("Erreur Supabase au chargement", error);
    const localState = loadLocalBackup();
    setSyncStatus(`Erreur Supabase : ${getSupabaseErrorMessage(error)} Données locales affichées.`, "error");
    return localState;
  }
}

function saveState() {
  saveLocalBackup();
  if (!appStarted || !supabaseReady) return;

  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStateNow(state);
  }, 350);
}

async function saveStateNow(stateToSave = state) {
  if (!supabaseReady || isSaving) return false;

  isSaving = true;
  setSyncStatus("Sauvegarde en ligne...", "info");

  try {
    const query = `/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?on_conflict=id&select=updated_at`;
    const rows = await supabaseRequest(query, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        id: SUPABASE_ROW_ID,
        data: stateToSave,
        updated_at: new Date().toISOString()
      })
    });

    const data = Array.isArray(rows) ? rows[0] : null;
    lastRemoteUpdatedAt = data?.updated_at || new Date().toISOString();
    setSyncStatus("Sauvegardé en ligne.", "success");
    return true;
  } catch (error) {
    console.error("Erreur Supabase à la sauvegarde", error);
    setSyncStatus(`Erreur de sauvegarde Supabase : ${getSupabaseErrorMessage(error)} Sauvegarde locale conservée.`, "error");
    return false;
  } finally {
    isSaving = false;
  }
}

async function refreshFromRemote() {
  if (!supabaseReady || isSaving || isUserEditing()) return;

  try {
    const data = await readRemoteState();
    if (!data || !data.updated_at || data.updated_at === lastRemoteUpdatedAt) return;

    state = normalizeState(data.data);
    saveLocalBackup();
    lastRemoteUpdatedAt = data.updated_at;
    render({ skipSave: true });
    setSyncStatus("Données mises à jour depuis la sauvegarde partagée.", "success");
  } catch (error) {
    console.warn("Erreur Supabase pendant le rafraîchissement", error);
  }
}

function isUserEditing() {
  const tag = document.activeElement?.tagName?.toLowerCase();
  return ["input", "select", "textarea"].includes(tag);
}

function setSyncStatus(message, type = "info") {
  if (!el.syncStatus) return;
  el.syncStatus.textContent = message;
  el.syncStatus.className = `sync-status ${type}`;
}

function render(options = {}) {
  state.players = uniquePlayers(state.players);
  normalizeCompetitionSelectionsInPlace();
  autoAdvanceKnockout();
  renderPages();
  renderModes();
  renderPlayers();
  renderCompetitionSelections();
  renderSelects();
  configureCurrentMonthDateInput();
  renderStandardPreview();
  renderArchiveControls();
  renderStandardHistory();
  renderTournament();
  renderTournamentHistory();
  renderChampionship();
  renderChampionshipHistory();
  renderStatsSeasonTabs();
  renderStats();
  if (!options.skipSave) saveState();
}

function renderPages() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === state.activePage);
  });
  el.pageMatches?.classList.toggle("active", state.activePage === "matches");
  el.pageCompetitions?.classList.toggle("active", state.activePage === "competitions");
  el.pageStats?.classList.toggle("active", state.activePage === "stats");
}

function renderModes() {
  document.querySelectorAll("[data-standard-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.standardMode === state.standardMode);
  });
  const sizes = getStandardTeamSizes(state.standardMode);
  el.teamA2?.classList.toggle("hidden", sizes.A < 2);
  el.teamB2?.classList.toggle("hidden", sizes.B < 2);
  document.querySelectorAll("[data-tournament-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.tournamentMode === state.tournamentConfig.mode);
  });
  document.querySelectorAll("[data-championship-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.championshipMode === state.championshipConfig.mode);
  });
}

function renderPlayers() {
  renderPlayerPills(el.playersList, "Ajoute au moins deux joueurs.");
}

function renderPlayerPills(container, emptyMessage) {
  if (!container) return;
  container.innerHTML = "";

  if (!state.players.length) {
    container.textContent = emptyMessage;
    container.classList.add("empty-state");
    return;
  }

  container.classList.remove("empty-state");
  state.players.forEach(name => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    pill.textContent = name;
    container.appendChild(pill);
  });
}


function normalizeCompetitionSelectionsInPlace() {
  if (!state.competitionSelection || typeof state.competitionSelection !== "object") {
    state.competitionSelection = { tournament: [...state.players], championship: [...state.players] };
  }
  ["tournament", "championship"].forEach(type => {
    const selected = Array.isArray(state.competitionSelection[type]) ? state.competitionSelection[type] : [];
    const selectedKeys = new Set(selected.map(name => normalizeName(name).toLowerCase()));
    state.competitionSelection[type] = state.players.filter(name => selectedKeys.has(name.toLowerCase()));
  });
}

function renderCompetitionSelections() {
  renderCompetitionSelectionList(el.tournamentPlayerSelection, "tournament");
  renderCompetitionSelectionList(el.championshipPlayerSelection, "championship");
}

function renderCompetitionSelectionList(container, type) {
  if (!container) return;
  if (!state.players.length) {
    container.className = "player-check-list empty-state";
    container.textContent = "Ajoute d’abord les joueurs dans l’onglet Matchs.";
    return;
  }

  const selected = new Set(state.competitionSelection[type] || []);
  container.className = "player-check-list";
  container.innerHTML = state.players.map(name => `
    <label class="player-check">
      <input type="checkbox" value="${escapeHtml(name)}" data-competition-player="${type}" ${selected.has(name) ? "checked" : ""} />
      <span>${escapeHtml(name)}</span>
    </label>`).join("");

  container.querySelectorAll("[data-competition-player]").forEach(input => {
    input.addEventListener("change", () => {
      const values = new Set(state.competitionSelection[type] || []);
      if (input.checked) values.add(input.value);
      else values.delete(input.value);
      state.competitionSelection[type] = state.players.filter(name => values.has(name));
      saveState();
    });
  });
}

function setCompetitionSelection(type, selectAll) {
  if (!["tournament", "championship"].includes(type)) return;
  state.competitionSelection[type] = selectAll ? [...state.players] : [];
  render();
}

function getSelectedCompetitionPlayers(type) {
  const selected = new Set(state.competitionSelection?.[type] || []);
  return state.players.filter(name => selected.has(name));
}

function renderSelects() {
  const values = teamSelects.map(select => select.value);

  teamSelects.forEach((select, index) => {
    const selected = state.players.includes(values[index]) ? values[index] : "";
    select.innerHTML = `<option value="">Choisir</option>` + state.players
      .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("");
    select.value = selected;
  });
}

function selectedStandardTeams() {
  return {
    A: [el.teamA1.value, el.teamA2.value].filter(Boolean),
    B: [el.teamB1.value, el.teamB2.value].filter(Boolean)
  };
}

function getStandardTeamSizes(mode = state.standardMode) {
  if (mode === "1v2") return { A: 1, B: 2 };
  if (mode === "2v2") return { A: 2, B: 2 };
  return { A: 1, B: 1 };
}

function renderStandardPreview() {
  const scoreA = parseScore(el.standardScoreA.value);
  const scoreB = parseScore(el.standardScoreB.value);
  el.standardWinnerPreview.classList.add("hidden");
  el.standardWinnerPreview.textContent = "";

  if (scoreA === scoreB) return;

  const teams = selectedStandardTeams();
  const sizes = getStandardTeamSizes();
  if (teams.A.length !== sizes.A || teams.B.length !== sizes.B) return;

  const winnerSide = scoreA > scoreB ? "A" : "B";
  el.standardWinnerPreview.classList.remove("hidden");
  el.standardWinnerPreview.textContent = `Gagnant prévu : Équipe ${winnerSide} · ${formatTeam(teams[winnerSide])}`;
}

function validateStandardMatch(teams, scoreA, scoreB) {
  const sizes = getStandardTeamSizes();

  if (teams.A.length !== sizes.A || teams.B.length !== sizes.B) {
    return `Sélectionne ${sizes.A} joueur(s) dans l’équipe A et ${sizes.B} dans l’équipe B.`;
  }

  const allPlayers = [...teams.A, ...teams.B];
  if (new Set(allPlayers.map(name => name.toLowerCase())).size !== allPlayers.length) {
    return "Un joueur ne peut pas être dans deux équipes.";
  }

  if (scoreA === scoreB) return "Le score ne peut pas être égal. Il faut un gagnant.";
  const matchDate = el.standardMatchDate.value || todayInputValue();
  if (monthKeyFromValue(matchDate) !== currentMonthKey()) return "Les mois précédents sont figés. Enregistre le match dans le mois en cours.";
  if (matchDate > todayInputValue()) return "La date du match ne peut pas être dans le futur.";
  return "";
}

function saveStandardMatch() {
  const teams = selectedStandardTeams();
  const scoreA = parseScore(el.standardScoreA.value);
  const scoreB = parseScore(el.standardScoreB.value);
  const error = validateStandardMatch(teams, scoreA, scoreB);
  if (error) {
    setStandardMessage(error);
    return;
  }

  const winner = scoreA > scoreB ? "A" : "B";
  state.standardHistory.unshift({
    id: randomId(),
    mode: state.standardMode,
    teams,
    score: { A: scoreA, B: scoreB },
    winner,
    playedAt: el.standardMatchDate.value || todayInputValue(),
    createdAt: new Date().toISOString()
  });

  el.standardScoreA.value = 0;
  el.standardScoreB.value = 0;
  setStandardMessage("");
  render();
}

function renderArchiveControls() {
  if (el.archiveMonthFilter) {
    const months = getStandardArchiveMonthKeys();
    if (!months.includes(selectedArchiveMonth)) selectedArchiveMonth = months[0] || currentMonthKey();
    el.archiveMonthFilter.innerHTML = months
      .map(month => `<option value="${month}">${escapeHtml(formatMonthLabel(month))}</option>`)
      .join("");
    el.archiveMonthFilter.value = selectedArchiveMonth;
  }

  const adminLabel = adminUnlocked ? "Quitter le mode admin" : "Activer le mode admin";
  if (el.adminModeBtn) el.adminModeBtn.textContent = adminLabel;
  if (el.competitionAdminModeBtn) el.competitionAdminModeBtn.textContent = adminLabel;

  const frozen = isFrozenMonth(selectedArchiveMonth);
  const standardMessage = frozen
    ? "Mois figé : les résultats sont consultables mais ne peuvent plus être modifiés ou supprimés."
    : adminUnlocked
      ? "Mode admin actif : les matchs du mois en cours peuvent être supprimés."
      : "Mois en cours : active le mode admin pour supprimer un résultat erroné.";
  const competitionMessage = adminUnlocked
    ? "Mode admin actif : tu peux supprimer les résultats de tournoi et de championnat du mois en cours. Les saisons précédentes restent figées."
    : "Active le mode admin pour supprimer un résultat de tournoi ou de championnat du mois en cours.";

  if (el.archiveFreezeNote) el.archiveFreezeNote.textContent = archiveUiMessage || standardMessage;
  if (el.competitionArchiveNote) el.competitionArchiveNote.textContent = archiveUiMessage || competitionMessage;
  archiveUiMessage = "";
}

function renderStandardHistory() {
  const rows = state.standardHistory
    .filter(item => monthKeyFromValue(item.playedAt || item.createdAt) === selectedArchiveMonth)
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a));

  if (!rows.length) {
    el.standardHistoryList.className = "history-list empty-state";
    el.standardHistoryList.textContent = `Aucun résultat enregistré en ${formatMonthLabel(selectedArchiveMonth)}.`;
    return;
  }

  const canDelete = adminUnlocked && !isFrozenMonth(selectedArchiveMonth);
  el.standardHistoryList.className = "history-list";
  el.standardHistoryList.innerHTML = rows.map(item => {
    const winnerTeam = formatTeam(item.teams[item.winner]);
    return `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(winnerTeam)} vainqueur · ${item.mode.toUpperCase()}</strong>
          <small>${escapeHtml(formatTeam(item.teams.A))} vs ${escapeHtml(formatTeam(item.teams.B))} · ${formatScore(item.score)} · ${formatDateOnly(item.playedAt)}</small>
        </div>
        <div class="history-actions">
          <span class="score-chip">${item.score.A} - ${item.score.B}</span>
          ${canDelete ? `<button type="button" class="delete-match-button" data-delete-standard-match="${item.id}">Supprimer</button>` : ""}
        </div>
      </article>`;
  }).join("");

  el.standardHistoryList.querySelectorAll("[data-delete-standard-match]").forEach(button => {
    button.addEventListener("click", () => deleteStandardMatch(button.dataset.deleteStandardMatch));
  });
}

function toggleAdminMode() {
  if (adminUnlocked) {
    adminUnlocked = false;
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    archiveUiMessage = "Mode admin désactivé.";
    render();
    return;
  }

  const enteredPin = window.prompt("Code administrateur :");
  if (enteredPin === null) return;
  const expectedPin = String(supabaseConfig.adminPin || "7391");
  if (String(enteredPin).trim() !== expectedPin) {
    archiveUiMessage = "Code administrateur incorrect.";
    renderArchiveControls();
    return;
  }

  adminUnlocked = true;
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  archiveUiMessage = "Mode admin activé.";
  render();
}

function deleteStandardMatch(matchId) {
  if (!adminUnlocked) return;
  const match = state.standardHistory.find(item => item.id === matchId);
  if (!match || isFrozenMonth(monthKeyFromValue(match.playedAt || match.createdAt))) {
    archiveUiMessage = "Ce mois est figé : suppression impossible.";
    render();
    return;
  }
  if (!window.confirm("Supprimer définitivement ce match de l’historique et des statistiques ?")) return;
  state.standardHistory = state.standardHistory.filter(item => item.id !== matchId);
  archiveUiMessage = "Match supprimé.";
  render();
}

function setStandardMessage(message = "") {
  el.standardMessage.textContent = message;
}

function chooseRandomTeams() {
  const sizes = getStandardTeamSizes();
  const required = sizes.A + sizes.B;
  if (state.players.length < required) {
    setStandardMessage(`Ajoute au moins ${required} joueurs pour générer les équipes.`);
    return;
  }

  const shuffled = shuffle([...state.players]);
  el.teamA1.value = shuffled[0] || "";
  el.teamA2.value = sizes.A === 2 ? (shuffled[1] || "") : "";
  el.teamB1.value = shuffled[sizes.A] || "";
  el.teamB2.value = sizes.B === 2 ? (shuffled[sizes.A + 1] || "") : "";
  setStandardMessage("");
  renderStandardPreview();
}

function createCompetitionTeams(mode, selectedPlayers) {
  const players = shuffle([...(selectedPlayers || [])]);
  if (mode === "1v1") {
    return players.map((player, index) => ({
      id: safeId(`p-${player}-${index}`),
      name: player,
      players: [player]
    }));
  }

  const teams = [];
  for (let index = 0; index + 1 < players.length; index += 2) {
    teams.push({
      id: randomId(),
      name: `Équipe ${teams.length + 1}`,
      players: [players[index], players[index + 1]]
    });
  }
  return teams;
}

function generateTournament() {
  const mode = state.tournamentConfig.mode;
  const selectedPlayers = getSelectedCompetitionPlayers("tournament");
  const requiredPlayers = mode === "2v2" ? 4 : 2;
  if (selectedPlayers.length < requiredPlayers) {
    setTournamentMessage(`Sélectionne au moins ${requiredPlayers} joueurs pour générer ce tournoi.`);
    return;
  }

  const teams = createCompetitionTeams(mode, selectedPlayers);
  if (teams.length < 2) {
    setTournamentMessage("Il faut au moins deux joueurs ou deux équipes.");
    return;
  }

  state.tournament = {
    id: randomId(),
    mode,
    format: "knockout",
    teams,
    rounds: [buildKnockoutRound(teams, 1, true)],
    createdAt: new Date().toISOString()
  };

  autoAdvanceKnockout();
  const ignored = mode === "2v2" && selectedPlayers.length % 2 !== 0 ? " Un joueur sélectionné a été laissé de côté car le nombre est impair." : "";
  setTournamentMessage(ignored.trim());
  render();
}

function clearCurrentTournament() {
  state.tournament = null;
  setTournamentMessage("Tournoi en cours annulé. L’historique enregistré est conservé.");
  render();
}

function buildKnockoutRound(teams, roundNumber, shouldShuffle = false) {
  const bracketTeams = shouldShuffle ? shuffle([...teams]) : [...teams];
  const matches = [];

  if (roundNumber === 1) {
    const power = nextPowerOfTwo(bracketTeams.length);
    const byeCount = power - bracketTeams.length;
    for (let index = 0; index < byeCount; index += 1) {
      const teamA = bracketTeams.shift() || null;
      matches.push({ id: randomId(), teamA, teamB: null, winner: teamA ? "teamA" : null, bye: Boolean(teamA) });
    }
  }

  for (let index = 0; index < bracketTeams.length; index += 2) {
    const teamA = bracketTeams[index] || null;
    const teamB = bracketTeams[index + 1] || null;
    const bye = Boolean(teamA && !teamB);
    matches.push({
      id: randomId(),
      teamA,
      teamB,
      winner: bye ? "teamA" : null,
      bye
    });
  }

  return {
    name: getRoundName(matches.length, roundNumber),
    matches
  };
}

function renderTournament() {
  const tournament = state.tournament;
  if (el.clearTournamentBtn) el.clearTournamentBtn.disabled = !tournament;
  if (!tournament) {
    el.tournamentBoard.className = "tournament-board empty-state";
    el.tournamentBoard.textContent = "Aucun tournoi généré pour le moment.";
    return;
  }

  el.tournamentBoard.className = "tournament-board";
  const teamsLabel = tournament.mode === "2v2" ? "équipes" : "joueurs";
  const champion = getTournamentChampion(tournament);

  let html = `
    <div class="tournament-summary">
      <span>Élimination directe</span>
      <span>${tournament.mode.toUpperCase()}</span>
      <span>${tournament.teams.length} ${teamsLabel}</span>
      ${champion ? `<span>Vainqueur : ${escapeHtml(formatTeam(champion.players))}</span>` : ""}
    </div>`;

  tournament.rounds.forEach((round, roundIndex) => {
    html += `
      <section class="round-card">
        <h3>${escapeHtml(round.name)}</h3>
        ${round.matches.map((match, matchIndex) => renderTournamentMatch(match, roundIndex, matchIndex)).join("")}
      </section>`;
  });

  el.tournamentBoard.innerHTML = html;
  el.tournamentBoard.querySelectorAll("[data-tournament-winner]").forEach(button => {
    button.addEventListener("click", () => {
      const [roundIndex, matchIndex, side] = button.dataset.tournamentWinner.split(":");
      setTournamentWinner(Number(roundIndex), Number(matchIndex), side);
    });
  });
  el.tournamentBoard.querySelectorAll("[data-delete-tournament-result]").forEach(button => {
    button.addEventListener("click", () => deleteTournamentMatch(button.dataset.deleteTournamentResult));
  });
}

function renderTournamentMatch(match, roundIndex, matchIndex) {
  const labelA = match.teamA ? formatTeam(match.teamA.players) : "À définir";
  const labelB = match.teamB ? formatTeam(match.teamB.players) : "À définir";
  const winnerTeam = match.winner && match[match.winner] ? formatTeam(match[match.winner].players) : "";
  const aSelected = match.winner === "teamA" ? "selected-winner" : "";
  const bSelected = match.winner === "teamB" ? "selected-winner" : "";
  const archiveItem = state.tournamentArchive.find(item => item.tournamentId === state.tournament?.id && item.matchId === match.id);
  const canDelete = Boolean(archiveItem && adminUnlocked && !isFrozenMonth(monthKeyFromValue(archiveItem.updatedAt || archiveItem.createdAt)));

  return `
    <article class="tournament-match ${match.winner ? "match-winner" : ""} ${match.bye ? "bye-row" : ""}">
      <div class="tournament-team ${aSelected}">
        <strong>${escapeHtml(labelA)}</strong>
        ${match.teamA ? `<small>${escapeHtml(match.teamA.name)}</small>` : ""}
      </div>
      <span class="tournament-vs">${match.bye ? "BYE" : "VS"}</span>
      <div class="tournament-team ${bSelected}">
        <strong>${escapeHtml(labelB)}</strong>
        ${match.teamB ? `<small>${escapeHtml(match.teamB.name)}</small>` : ""}
        ${winnerTeam ? `<small>Vainqueur : ${escapeHtml(winnerTeam)}</small>` : ""}
      </div>
      <div class="tournament-actions">
        <button type="button" data-tournament-winner="${roundIndex}:${matchIndex}:teamA" ${match.teamA && !match.bye ? "" : "disabled"}>A gagne</button>
        <button type="button" data-tournament-winner="${roundIndex}:${matchIndex}:teamB" ${match.teamB && !match.bye ? "" : "disabled"}>B gagne</button>
        ${canDelete ? `<button type="button" class="delete-match-button competition-delete-button" data-delete-tournament-result="${archiveItem.id}">Supprimer le résultat</button>` : ""}
      </div>
    </article>`;
}

function setTournamentWinner(roundIndex, matchIndex, winnerSide) {
  const tournament = state.tournament;
  if (!tournament) return;

  const match = tournament.rounds?.[roundIndex]?.matches?.[matchIndex];
  if (!match || !match[winnerSide] || match.bye) return;
  const winnerChanged = match.winner && match.winner !== winnerSide;
  match.winner = winnerSide;

  if (winnerChanged) {
    state.tournamentArchive = state.tournamentArchive.filter(item => {
      return item.tournamentId !== tournament.id || item.roundIndex <= roundIndex;
    });
  }

  upsertTournamentArchive(tournament, match, roundIndex, matchIndex);
  autoAdvanceKnockout();
  render();
}

function upsertTournamentArchive(tournament, match, roundIndex, matchIndex) {
  if (!match.teamA || !match.teamB || !match.winner || match.bye) return;

  const winnerSide = match.winner;
  const loserSide = winnerSide === "teamA" ? "teamB" : "teamA";
  const existingIndex = state.tournamentArchive.findIndex(item => item.matchId === match.id && item.tournamentId === tournament.id);
  const existing = existingIndex >= 0 ? state.tournamentArchive[existingIndex] : null;

  const row = {
    id: existing?.id || randomId(),
    source: "tournament",
    tournamentId: tournament.id,
    matchId: match.id,
    roundIndex,
    matchIndex,
    format: "knockout",
    mode: tournament.mode,
    roundName: tournament.rounds[roundIndex].name,
    teamA: match.teamA,
    teamB: match.teamB,
    winner: winnerSide === "teamA" ? "A" : "B",
    winnerTeam: match[winnerSide],
    loserTeam: match[loserSide],
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) state.tournamentArchive[existingIndex] = row;
  else state.tournamentArchive.unshift(row);
}

function autoAdvanceKnockout() {
  const tournament = state.tournament;
  if (!tournament || tournament.format !== "knockout" || !Array.isArray(tournament.rounds) || !tournament.rounds.length) return;

  let firstRound = tournament.rounds[0];
  if (firstRound.matches?.some(match => !match.teamA && !match.teamB)) {
    const orderedTeams = firstRound.matches.flatMap(match => [match.teamA, match.teamB]).filter(Boolean);
    firstRound = buildKnockoutRound(orderedTeams.length ? orderedTeams : tournament.teams, 1, false);
  }

  const rebuiltRounds = [firstRound];
  let previousRound = firstRound;
  let roundNumber = 2;

  while (previousRound.matches.length > 1) {
    const oldRound = tournament.rounds[roundNumber - 1];
    const matches = [];
    for (let index = 0; index < previousRound.matches.length; index += 2) {
      const sourceA = previousRound.matches[index];
      const sourceB = previousRound.matches[index + 1];
      const teamA = sourceA?.winner ? sourceA[sourceA.winner] : null;
      const teamB = sourceB?.winner ? sourceB[sourceB.winner] : null;
      const oldMatch = oldRound?.matches?.[matches.length];
      const sameTeams = sameCompetitionTeam(oldMatch?.teamA, teamA) && sameCompetitionTeam(oldMatch?.teamB, teamB);
      let winner = sameTeams ? oldMatch?.winner || null : null;
      if (winner && !((winner === "teamA" && teamA) || (winner === "teamB" && teamB))) winner = null;

      matches.push({
        id: sameTeams && oldMatch?.id ? oldMatch.id : randomId(),
        teamA,
        teamB,
        winner,
        bye: false
      });
    }

    const nextRound = { name: getRoundName(matches.length, roundNumber), matches };
    rebuiltRounds.push(nextRound);
    previousRound = nextRound;
    roundNumber += 1;
  }

  tournament.rounds = rebuiltRounds;
}

function sameCompetitionTeam(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.id && right.id && left.id === right.id) return true;
  return samePlayers(left.players, right.players);
}

function getTournamentChampion(tournament) {
  if (!tournament) return null;
  const lastRound = tournament.rounds[tournament.rounds.length - 1];
  if (!lastRound || lastRound.matches.length !== 1) return null;
  const finalMatch = lastRound.matches[0];
  return finalMatch.winner ? finalMatch[finalMatch.winner] : null;
}

function renderTournamentHistory() {
  const rows = state.tournamentArchive.slice().sort((a, b) => eventTimestamp({ createdAt: b.updatedAt || b.createdAt }) - eventTimestamp({ createdAt: a.updatedAt || a.createdAt }));
  if (!rows.length) {
    el.tournamentHistoryList.className = "history-list empty-state";
    el.tournamentHistoryList.textContent = "Aucun résultat de tournoi enregistré.";
    return;
  }

  el.tournamentHistoryList.className = "history-list";
  el.tournamentHistoryList.innerHTML = rows.map(item => {
    const canDelete = adminUnlocked && !isFrozenMonth(monthKeyFromValue(item.updatedAt || item.createdAt));
    return `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(formatTeam(item.winnerTeam.players))} vainqueur · ${escapeHtml(item.roundName || "Tournoi")} · ${item.mode.toUpperCase()}</strong>
          <small>${escapeHtml(formatTeam(item.teamA.players))} vs ${escapeHtml(formatTeam(item.teamB.players))} · ${formatDateTime(item.updatedAt || item.createdAt)}</small>
        </div>
        <div class="history-actions">
          <span class="score-chip">Victoire</span>
          ${canDelete ? `<button type="button" class="delete-match-button" data-delete-tournament-result="${item.id}">Supprimer</button>` : ""}
        </div>
      </article>`;
  }).join("");

  el.tournamentHistoryList.querySelectorAll("[data-delete-tournament-result]").forEach(button => {
    button.addEventListener("click", () => deleteTournamentMatch(button.dataset.deleteTournamentResult));
  });
}

function deleteTournamentMatch(archiveId) {
  if (!adminUnlocked) return;
  const item = state.tournamentArchive.find(row => row.id === archiveId);
  if (!item || isFrozenMonth(monthKeyFromValue(item.updatedAt || item.createdAt))) {
    archiveUiMessage = "Ce résultat appartient à une saison figée : suppression impossible.";
    render();
    return;
  }
  if (!window.confirm("Supprimer ce résultat de tournoi ? Les tours suivants dépendants seront également réinitialisés.")) return;

  state.tournamentArchive = state.tournamentArchive.filter(row => {
    if (row.id === archiveId) return false;
    return row.tournamentId !== item.tournamentId || Number(row.roundIndex) <= Number(item.roundIndex);
  });

  if (state.tournament?.id === item.tournamentId) {
    const sourceMatch = state.tournament.rounds?.[item.roundIndex]?.matches?.[item.matchIndex];
    if (sourceMatch && sourceMatch.id === item.matchId && !sourceMatch.bye) sourceMatch.winner = null;
    for (let roundIndex = Number(item.roundIndex) + 1; roundIndex < state.tournament.rounds.length; roundIndex += 1) {
      state.tournament.rounds[roundIndex].matches.forEach(match => {
        if (!match.bye) match.winner = null;
      });
    }
    autoAdvanceKnockout();
  }

  archiveUiMessage = "Résultat de tournoi supprimé.";
  setTournamentMessage("Résultat supprimé. Les matchs suivants concernés ont été remis à définir.");
  render();
}

function generateChampionship() {
  const mode = state.championshipConfig.mode;
  const selectedPlayers = getSelectedCompetitionPlayers("championship");
  const requiredPlayers = mode === "2v2" ? 4 : 2;
  if (selectedPlayers.length < requiredPlayers) {
    setChampionshipMessage(`Sélectionne au moins ${requiredPlayers} joueurs pour générer ce championnat.`);
    return;
  }

  const teams = createCompetitionTeams(mode, selectedPlayers);
  if (teams.length < 2) {
    setChampionshipMessage("Il faut au moins deux joueurs ou deux équipes.");
    return;
  }

  const matches = [];
  for (let a = 0; a < teams.length; a += 1) {
    for (let b = a + 1; b < teams.length; b += 1) {
      matches.push({
        id: randomId(),
        teamA: teams[a],
        teamB: teams[b],
        score: { A: null, B: null },
        winner: null,
        playedAt: todayInputValue(),
        status: "pending"
      });
    }
  }

  state.championship = {
    id: randomId(),
    mode,
    teams,
    matches: shuffle(matches),
    createdAt: new Date().toISOString()
  };

  const ignored = mode === "2v2" && selectedPlayers.length % 2 !== 0 ? " Un joueur sélectionné a été laissé de côté car le nombre est impair." : "";
  setChampionshipMessage(ignored.trim());
  render();
}

function clearCurrentChampionship() {
  state.championship = null;
  setChampionshipMessage("Championnat en cours annulé. L’historique enregistré est conservé.");
  render();
}

function renderChampionship() {
  const championship = state.championship;
  if (el.clearChampionshipBtn) el.clearChampionshipBtn.disabled = !championship;
  if (!championship) {
    el.championshipBoard.className = "championship-board empty-state";
    el.championshipBoard.textContent = "Aucun championnat généré pour le moment.";
    return;
  }

  el.championshipBoard.className = "championship-board";
  const playedCount = championship.matches.filter(match => match.status === "played").length;
  const totalCount = championship.matches.length;
  const standings = buildChampionshipStandings(championship);

  let html = `
    <div class="championship-summary">
      <span>${championship.mode.toUpperCase()}</span>
      <span>${championship.teams.length} participant(s)</span>
      <span>${playedCount}/${totalCount} match(s) joués</span>
    </div>
    <section class="championship-card">
      <h3>Classement du championnat en cours</h3>
      ${renderChampionshipStandingRows(standings)}
    </section>
    <section class="championship-card">
      <h3>Matchs à jouer / compléter</h3>
      ${championship.matches.map(renderChampionshipMatch).join("")}
    </section>`;

  el.championshipBoard.innerHTML = html;
  el.championshipBoard.querySelectorAll("[data-champ-save]").forEach(button => {
    button.addEventListener("click", () => saveChampionshipMatch(button.dataset.champSave));
  });
  el.championshipBoard.querySelectorAll("[data-delete-championship-result]").forEach(button => {
    button.addEventListener("click", () => deleteChampionshipMatch(button.dataset.deleteChampionshipResult));
  });
}

function renderChampionshipStandingRows(rows) {
  if (!rows.length) return `<div class="empty-state">Aucun classement disponible.</div>`;
  return rows.map((row, index) => `
    <article class="standing-row">
      <span class="rank">${index + 1}</span>
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <small>${row.played} MJ · ${row.wins} V · ${row.losses} D · Diff ${formatSigned(row.goalDiff)}</small>
      </div>
      <span class="metric-chip">${row.points} pts</span>
    </article>`).join("");
}

function renderChampionshipMatch(match) {
  const scoreA = match.score?.A ?? "";
  const scoreB = match.score?.B ?? "";
  const frozen = match.status === "played" && isFrozenMonth(monthKeyFromValue(match.playedAt));
  const playedClass = match.status === "played" ? "played" : "";
  const frozenClass = frozen ? "frozen-match" : "";
  const winner = match.winner ? ` · Gagnant : ${escapeHtml(formatTeam(match.winner === "A" ? match.teamA.players : match.teamB.players))}` : "";
  const disabled = frozen ? "disabled" : "";
  const dateValue = match.playedAt || todayInputValue();
  const archiveItem = state.championshipArchive.find(item => item.championshipId === state.championship?.id && item.matchId === match.id);
  const canDelete = Boolean(archiveItem && adminUnlocked && !frozen);

  return `
    <article class="championship-match ${playedClass} ${frozenClass}">
      <div class="match-title">
        <strong>${escapeHtml(formatTeam(match.teamA.players))} vs ${escapeHtml(formatTeam(match.teamB.players))}</strong>
        <small>${frozen ? "Joué · mois figé" : match.status === "played" ? "Joué" : "À jouer"}${winner}</small>
      </div>
      <label>
        Date
        <input type="date" min="${firstDayOfCurrentMonth()}" max="${todayInputValue()}" value="${escapeHtml(dateValue)}" data-champ-date="${match.id}" ${disabled} />
      </label>
      <label>
        Score A
        <input type="number" min="0" step="1" value="${escapeHtml(scoreA)}" inputmode="numeric" data-champ-score-a="${match.id}" ${disabled} />
      </label>
      <span class="vs-text">-</span>
      <label>
        Score B
        <input type="number" min="0" step="1" value="${escapeHtml(scoreB)}" inputmode="numeric" data-champ-score-b="${match.id}" ${disabled} />
      </label>
      <div class="competition-match-actions">
        <button class="save-mini-button" type="button" data-champ-save="${match.id}" ${disabled}>${frozen ? "Figé" : "Enregistrer"}</button>
        ${canDelete ? `<button class="delete-match-button" type="button" data-delete-championship-result="${archiveItem.id}">Supprimer</button>` : ""}
      </div>
    </article>`;
}

function saveChampionshipMatch(matchId) {
  const championship = state.championship;
  if (!championship) return;

  const match = championship.matches.find(item => item.id === matchId);
  if (!match) return;

  const dateInput = el.championshipBoard.querySelector(`[data-champ-date="${cssEscape(matchId)}"]`);
  const scoreAInput = el.championshipBoard.querySelector(`[data-champ-score-a="${cssEscape(matchId)}"]`);
  const scoreBInput = el.championshipBoard.querySelector(`[data-champ-score-b="${cssEscape(matchId)}"]`);
  const scoreA = parseScore(scoreAInput?.value);
  const scoreB = parseScore(scoreBInput?.value);
  const playedAt = dateInput?.value || todayInputValue();

  if (match.status === "played" && isFrozenMonth(monthKeyFromValue(match.playedAt))) {
    setChampionshipMessage("Ce résultat appartient à un mois figé et ne peut plus être modifié.");
    return;
  }
  if (monthKeyFromValue(playedAt) !== currentMonthKey()) {
    setChampionshipMessage("Les mois précédents sont figés. Utilise une date du mois en cours.");
    return;
  }
  if (playedAt > todayInputValue()) {
    setChampionshipMessage("La date du match ne peut pas être dans le futur.");
    return;
  }
  if (scoreA === scoreB) {
    setChampionshipMessage("Le score ne peut pas être égal. Il faut un gagnant.");
    return;
  }

  match.score = { A: scoreA, B: scoreB };
  match.winner = scoreA > scoreB ? "A" : "B";
  match.playedAt = playedAt;
  match.status = "played";

  upsertChampionshipArchive(championship, match);
  setChampionshipMessage("");
  render();
}

function upsertChampionshipArchive(championship, match) {
  const existingIndex = state.championshipArchive.findIndex(item => item.matchId === match.id && item.championshipId === championship.id);
  const existing = existingIndex >= 0 ? state.championshipArchive[existingIndex] : null;
  const winnerTeam = match.winner === "A" ? match.teamA : match.teamB;
  const loserTeam = match.winner === "A" ? match.teamB : match.teamA;

  const row = {
    id: existing?.id || randomId(),
    source: "championship",
    championshipId: championship.id,
    matchId: match.id,
    mode: championship.mode,
    teamA: match.teamA,
    teamB: match.teamB,
    score: { A: parseScore(match.score.A), B: parseScore(match.score.B) },
    winner: match.winner,
    winnerTeam,
    loserTeam,
    playedAt: match.playedAt || todayInputValue(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) state.championshipArchive[existingIndex] = row;
  else state.championshipArchive.unshift(row);
}

function buildChampionshipStandings(championship) {
  const rows = new Map();
  championship.teams.forEach(team => {
    rows.set(team.id, {
      id: team.id,
      name: formatTeam(team.players),
      played: 0,
      wins: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0
    });
  });

  championship.matches.filter(match => match.status === "played").forEach(match => {
    const rowA = rows.get(match.teamA.id);
    const rowB = rows.get(match.teamB.id);
    if (!rowA || !rowB) return;
    const scoreA = parseScore(match.score.A);
    const scoreB = parseScore(match.score.B);

    rowA.played += 1;
    rowB.played += 1;
    rowA.goalsFor += scoreA;
    rowA.goalsAgainst += scoreB;
    rowB.goalsFor += scoreB;
    rowB.goalsAgainst += scoreA;

    if (scoreA > scoreB) {
      rowA.wins += 1;
      rowA.points += 3;
      rowB.losses += 1;
    } else {
      rowB.wins += 1;
      rowB.points += 3;
      rowA.losses += 1;
    }
  });

  return Array.from(rows.values())
    .map(row => ({ ...row, goalDiff: row.goalsFor - row.goalsAgainst }))
    .sort(sortPointRows);
}

function renderChampionshipHistory() {
  const rows = state.championshipArchive.slice().sort((a, b) => eventTimestamp(b) - eventTimestamp(a));
  if (!rows.length) {
    el.championshipHistoryList.className = "history-list empty-state";
    el.championshipHistoryList.textContent = "Aucun résultat de championnat enregistré.";
    return;
  }

  el.championshipHistoryList.className = "history-list";
  el.championshipHistoryList.innerHTML = rows.map(item => {
    const canDelete = adminUnlocked && !isFrozenMonth(monthKeyFromValue(item.playedAt || item.createdAt));
    return `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(formatTeam(item.winnerTeam.players))} vainqueur · Championnat · ${item.mode.toUpperCase()}</strong>
          <small>${escapeHtml(formatTeam(item.teamA.players))} vs ${escapeHtml(formatTeam(item.teamB.players))} · ${formatScore(item.score)} · ${formatDateOnly(item.playedAt)}</small>
        </div>
        <div class="history-actions">
          <span class="score-chip">${item.score.A} - ${item.score.B}</span>
          ${canDelete ? `<button type="button" class="delete-match-button" data-delete-championship-result="${item.id}">Supprimer</button>` : ""}
        </div>
      </article>`;
  }).join("");

  el.championshipHistoryList.querySelectorAll("[data-delete-championship-result]").forEach(button => {
    button.addEventListener("click", () => deleteChampionshipMatch(button.dataset.deleteChampionshipResult));
  });
}

function deleteChampionshipMatch(archiveId) {
  if (!adminUnlocked) return;
  const item = state.championshipArchive.find(row => row.id === archiveId);
  if (!item || isFrozenMonth(monthKeyFromValue(item.playedAt || item.createdAt))) {
    archiveUiMessage = "Ce résultat appartient à une saison figée : suppression impossible.";
    render();
    return;
  }
  if (!window.confirm("Supprimer ce résultat de championnat de l’historique et des statistiques ?")) return;

  state.championshipArchive = state.championshipArchive.filter(row => row.id !== archiveId);
  if (state.championship?.id === item.championshipId) {
    const match = state.championship.matches.find(row => row.id === item.matchId);
    if (match) {
      match.score = null;
      match.winner = null;
      match.playedAt = null;
      match.status = "pending";
    }
  }

  archiveUiMessage = "Résultat de championnat supprimé.";
  setChampionshipMessage("Résultat supprimé. Le match peut être rejoué et enregistré à nouveau.");
  render();
}

function setTournamentMessage(message = "") {
  el.tournamentMessage.textContent = message;
}

function setChampionshipMessage(message = "") {
  el.championshipMessage.textContent = message;
}

function renderStatsSeasonTabs() {
  if (!el.statsMonthTabs) return;
  const months = getAvailableMonthKeys(true);
  if (!months.includes(selectedStatsMonth)) selectedStatsMonth = months[0] || currentMonthKey();

  el.statsMonthTabs.innerHTML = months.map(month => `
    <button type="button" class="month-tab ${month === selectedStatsMonth ? "active" : ""}" data-stats-month="${month}">
      ${escapeHtml(formatMonthLabel(month))}
    </button>`).join("");

  el.statsMonthTabs.querySelectorAll("[data-stats-month]").forEach(button => {
    button.addEventListener("click", () => {
      selectedStatsMonth = button.dataset.statsMonth;
      renderStatsSeasonTabs();
      renderStats();
    });
  });

  if (el.statsSeasonStatus) {
    el.statsSeasonStatus.textContent = isFrozenMonth(selectedStatsMonth) ? "Saison terminée · figée" : "Saison en cours";
    el.statsSeasonStatus.className = `season-status ${isFrozenMonth(selectedStatsMonth) ? "closed" : "current"}`;
  }
}

function renderStats() {
  const events = getAllMatchEvents(selectedStatsMonth);
  const rows = buildPlayerStats(selectedStatsMonth);
  const activeRows = rows.filter(row => row.played > 0);
  const scoredRows = rows.filter(row => row.scoredMatches > 0);
  const eligibleEloRows = getEligibleEloRows(selectedStatsMonth);
  const closedSeason = isFrozenMonth(selectedStatsMonth);
  const cumulativeAwards = buildCumulativeSeasonAwards();
  const seasonPlaces = new Map(eligibleEloRows.slice(0, 3).map((row, index) => [normalizeName(row.name), index + 1]));

  renderSeasonPodium(eligibleEloRows, closedSeason, cumulativeAwards);

  const waitingCount = activeRows.filter(row => row.played < MIN_ELO_MATCHES).length;
  if (el.eloQualificationNote) {
    el.eloQualificationNote.textContent = eligibleEloRows.length
      ? `${eligibleEloRows.length} joueur(s) classé(s). ${waitingCount ? `${waitingCount} joueur(s) n’ont pas encore atteint 5 matchs.` : "Tous les joueurs actifs sont classés."}`
      : activeRows.length
        ? `Aucun joueur n’a encore atteint les ${MIN_ELO_MATCHES} matchs requis pour être classé.`
        : "Aucun match enregistré pour cette saison.";
  }

  renderRanking(el.eloRanking, eligibleEloRows, row => ({
    titleHtml: renderPlayerNameWithAwards(row.name, cumulativeAwards),
    detail: `${row.played} match(s) · ${row.wins} victoire(s) · dernier mouvement ${formatSignedDecimal(row.lastEloDelta || 0)}`,
    value: Math.round(row.elo)
  }), { podium: true });

  renderRanking(el.winRateRanking, activeRows.slice().sort((a, b) => winRate(b) - winRate(a) || b.played - a.played || b.points - a.points || a.name.localeCompare(b.name)), row => ({
    titleHtml: renderPlayerNameWithAwards(row.name, cumulativeAwards),
    detail: `${row.wins}/${row.played} victoire(s)`,
    value: `${Math.round(winRate(row))}%`
  }));

  renderRanking(el.goalsForRanking, scoredRows.slice().sort((a, b) => avgGoalsFor(b) - avgGoalsFor(a) || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name)), row => ({
    titleHtml: renderPlayerNameWithAwards(row.name, cumulativeAwards),
    detail: `${row.goalsFor} but(s) marqué(s) · ${row.scoredMatches} match(s) scoré(s)`,
    value: `${formatDecimal(avgGoalsFor(row))}/m`
  }));

  renderRanking(el.goalsAgainstRanking, scoredRows.slice().sort((a, b) => avgGoalsAgainst(a) - avgGoalsAgainst(b) || a.goalsAgainst - b.goalsAgainst || a.name.localeCompare(b.name)), row => ({
    titleHtml: renderPlayerNameWithAwards(row.name, cumulativeAwards),
    detail: `${row.goalsAgainst} but(s) pris · ${row.scoredMatches} match(s) scoré(s)`,
    value: `${formatDecimal(avgGoalsAgainst(row))}/m`
  }));

  renderExtraStats(rows, events, eligibleEloRows);
}

function getEligibleEloRows(monthKey) {
  return buildPlayerStats(monthKey)
    .filter(row => row.played >= MIN_ELO_MATCHES)
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins || winRate(b) - winRate(a) || a.name.localeCompare(b.name));
}

function buildCumulativeSeasonAwards() {
  const awards = new Map();
  const ensure = name => {
    const key = normalizeName(name);
    if (!awards.has(key)) awards.set(key, { gold: 0, silver: 0, bronze: 0 });
    return awards.get(key);
  };

  getAvailableMonthKeys(false)
    .filter(month => isFrozenMonth(month))
    .forEach(month => {
      getEligibleEloRows(month).slice(0, 3).forEach((row, index) => {
        const type = ["gold", "silver", "bronze"][index];
        ensure(row.name)[type] += 1;
      });
    });

  return awards;
}

function renderAwardStar(type, className = "award-star", label = "") {
  const safeType = ["gold", "silver", "bronze"].includes(type) ? type : "bronze";
  const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<span class="${className} award-${safeType}"${aria}><svg viewBox="0 0 24 24" focusable="false"><path d="M12 1.8l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.56 5.82 20.81 7 13.93 2 9.06l6.91-1L12 1.8z"></path></svg></span>`;
}

function renderSeasonPodium(eligibleRows, closedSeason, cumulativeAwards) {
  if (!el.seasonChampion) return;
  const podium = eligibleRows.slice(0, 3);
  if (!podium.length) {
    el.seasonChampion.className = "season-champion empty-state";
    el.seasonChampion.textContent = `Aucun podium pour ${formatMonthLabel(selectedStatsMonth)} : aucun joueur n’a atteint ${MIN_ELO_MATCHES} matchs.`;
    return;
  }

  const statusLabel = closedSeason ? "Podium final" : "Podium provisoire";
  el.seasonChampion.className = `season-champion season-podium ${closedSeason ? "champion-awarded" : "leader-provisional"}`;
  el.seasonChampion.innerHTML = `
    <div class="season-podium-header">
      <div>
        <small>${escapeHtml(statusLabel)}</small>
        <strong>${escapeHtml(formatMonthLabel(selectedStatsMonth))}</strong>
      </div>
      <small>${closedSeason ? "Les étoiles ont été ajoutées au palmarès des joueurs." : "Les étoiles seront ajoutées au palmarès à la fin du mois."}</small>
    </div>
    <div class="season-podium-list">
      ${podium.map((row, index) => {
        const place = index + 1;
        const type = awardTypeForPlace(place);
        return `
          <article class="podium-place podium-${type}">
            ${renderAwardStar(type, `award-star ${closedSeason ? "" : "provisional"}`, `${place}${place === 1 ? "er" : "e"} du classement ${closedSeason ? "final" : "provisoire"}`)}
            <div>
              <small>${place}${place === 1 ? "er" : "e"} place</small>
              <strong>${renderPlayerNameWithAwards(row.name, cumulativeAwards)}</strong>
              <small>${Math.round(row.elo)} Elo · ${row.wins} victoire(s) en ${row.played} match(s)</small>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

function awardTypeForPlace(place) {
  return place === 1 ? "gold" : place === 2 ? "silver" : "bronze";
}

function renderPlayerNameWithAwards(name, cumulativeAwards) {
  const totals = cumulativeAwards.get(normalizeName(name)) || {
    gold: 0,
    silver: 0,
    bronze: 0
  };

  return `
    <span class="player-name-with-awards">
      <span class="player-award-name">${escapeHtml(name)}</span>
      ${renderAwardTotals(totals)}
    </span>
  `;
}

function renderAwardTotals(totals) {
  const awards = [
    { type: "gold", count: totals.gold, label: "d’or" },
    { type: "silver", count: totals.silver, label: "d’argent" },
    { type: "bronze", count: totals.bronze, label: "de bronze" }
  ].filter(award => award.count > 0);

  if (!awards.length) return "";

  return `
    <span class="award-totals" aria-label="Récompenses cumulées">
      ${awards.map(award => `
        <span
          class="award-inline award-${award.type}"
          title="${award.count} étoile(s) ${award.label}"
          aria-label="${award.count} étoile(s) ${award.label}"
        >
          <span class="award-number">${award.count}</span>
          ${renderAwardStar(award.type, "award-inline-star")}
        </span>
      `).join("")}
    </span>
  `;
}

function renderRanking(container, rows, mapRow, options = {}) {
  if (!container) return;
  if (!rows.length) {
    container.className = "leaderboard empty-state";
    container.textContent = container.id === "eloRanking"
      ? `Aucun joueur classé : ${MIN_ELO_MATCHES} matchs sont nécessaires.`
      : container.id.includes("goals") ? "Aucun score enregistré." : "Aucun match enregistré.";
    return;
  }

  container.className = "leaderboard";
  container.innerHTML = rows.map((row, index) => {
    const mapped = mapRow(row, index);
    const placeClass = options.podium && index < 3 ? `season-${awardTypeForPlace(index + 1)}` : "";
    return `
      <article class="leader-row ${placeClass}">
        <span class="rank">${index + 1}</span>
        <div>
          <strong>${mapped.titleHtml || escapeHtml(mapped.title)}</strong>
          <div class="stat-line">${escapeHtml(mapped.detail)}</div>
        </div>
        <span class="metric-chip">${escapeHtml(mapped.value)}</span>
      </article>`;
  }).join("");
}

function renderExtraStats(rows, events, eligibleEloRows) {
  const activeRows = rows.filter(row => row.played > 0);
  const scoredRows = rows.filter(row => row.scoredMatches > 0);

  if (!activeRows.length) {
    el.extraStats.className = "summary-grid empty-state";
    el.extraStats.textContent = "Aucune statistique disponible pour cette saison.";
    return;
  }

  const mostPlayed = activeRows.slice().sort((a, b) => b.played - a.played || a.name.localeCompare(b.name))[0];
  const bestDiff = scoredRows.slice().sort((a, b) => b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))[0];
  const bestAttack = scoredRows.slice().sort((a, b) => b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))[0];
  const bestDefense = scoredRows.slice().sort((a, b) => avgGoalsAgainst(a) - avgGoalsAgainst(b) || a.name.localeCompare(b.name))[0];
  const leaderElo = eligibleEloRows[0];
  const totalGoals = events.reduce((sum, event) => event.score ? sum + event.score.A + event.score.B : sum, 0);

  const cards = [
    { label: "Plus actif", value: mostPlayed?.name || "-", detail: `${mostPlayed?.played || 0} match(s)` },
    { label: "Meilleure différence", value: bestDiff?.name || "-", detail: bestDiff ? `Diff ${formatSigned(bestDiff.goalDiff)}` : "Aucun score" },
    { label: "Meilleure attaque totale", value: bestAttack?.name || "-", detail: bestAttack ? `${bestAttack.goalsFor} but(s)` : "Aucun score" },
    { label: "Meilleure défense", value: bestDefense?.name || "-", detail: bestDefense ? `${formatDecimal(avgGoalsAgainst(bestDefense))} but pris/match` : "Aucun score" },
    { label: "Leader Elo qualifié", value: leaderElo?.name || "-", detail: leaderElo ? `${Math.round(leaderElo.elo)} Elo` : `Minimum ${MIN_ELO_MATCHES} matchs` },
    { label: "Volume mensuel", value: `${events.length} match(s)`, detail: `${totalGoals} but(s) enregistré(s)` }
  ];

  el.extraStats.className = "summary-grid";
  el.extraStats.innerHTML = cards.map(card => `
    <article class="summary-item">
      <div>
        <small>${escapeHtml(card.label)}</small>
        <strong>${escapeHtml(card.value)}</strong>
        <small>${escapeHtml(card.detail)}</small>
      </div>
    </article>`).join("");
}

function buildPlayerStats(monthKey = selectedStatsMonth) {
  const stats = new Map();
  const ensure = name => {
    const clean = normalizeName(name);
    if (!clean) return null;
    if (!stats.has(clean)) {
      stats.set(clean, {
        name: clean,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        scoredMatches: 0,
        elo: BASE_ELO,
        lastEloDelta: 0
      });
    }
    return stats.get(clean);
  };

  state.players.forEach(ensure);
  const events = getAllMatchEvents(monthKey).sort((a, b) => eventTimestamp(a) - eventTimestamp(b));

  events.forEach(event => {
    const teamA = event.teams.A;
    const teamB = event.teams.B;
    [...teamA, ...teamB].forEach(ensure);

    const winnerSide = event.winner;
    teamA.forEach(player => applyTeamResult(ensure(player), event, "A", winnerSide));
    teamB.forEach(player => applyTeamResult(ensure(player), event, "B", winnerSide));
    applyElo(stats, event, winnerSide);
  });

  return Array.from(stats.values()).map(row => ({
    ...row,
    goalDiff: row.goalsFor - row.goalsAgainst
  }));
}

function applyTeamResult(row, event, side, winnerSide) {
  if (!row) return;
  const otherSide = side === "A" ? "B" : "A";
  row.played += 1;
  if (side === winnerSide) {
    row.wins += 1;
    row.points += 3;
  } else {
    row.losses += 1;
  }

  if (event.score) {
    row.goalsFor += parseScore(event.score[side]);
    row.goalsAgainst += parseScore(event.score[otherSide]);
    row.scoredMatches += 1;
  }
}

function applyElo(stats, event, winnerSide) {
  const teamA = event.teams.A.map(player => stats.get(normalizeName(player))).filter(Boolean);
  const teamB = event.teams.B.map(player => stats.get(normalizeName(player))).filter(Boolean);
  if (!teamA.length || !teamB.length) return;

  const ratingA = average(teamA.map(row => row.elo));
  const ratingB = average(teamB.map(row => row.elo));
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const resultA = winnerSide === "A" ? 1 : 0;
  const teamDeltaA = ELO_K_FACTOR * (resultA - expectedA);
  const playerDeltaA = teamDeltaA / teamA.length;
  const playerDeltaB = -teamDeltaA / teamB.length;

  teamA.forEach(row => {
    row.elo += playerDeltaA;
    row.lastEloDelta = playerDeltaA;
  });
  teamB.forEach(row => {
    row.elo += playerDeltaB;
    row.lastEloDelta = playerDeltaB;
  });
}

function getAllMatchEvents(monthKey = null) {
  const events = [];

  state.standardHistory.forEach(match => {
    if (!match?.teams?.A?.length || !match?.teams?.B?.length || !match.score) return;
    events.push({
      id: match.id,
      source: "standard",
      mode: match.mode,
      teams: match.teams,
      score: match.score,
      winner: match.winner,
      playedAt: match.playedAt,
      createdAt: match.createdAt
    });
  });

  state.championshipArchive.forEach(match => {
    if (!match?.teamA?.players?.length || !match?.teamB?.players?.length || !match.score) return;
    events.push({
      id: match.id,
      source: "championship",
      mode: match.mode,
      teams: { A: match.teamA.players, B: match.teamB.players },
      score: match.score,
      winner: match.winner,
      playedAt: match.playedAt,
      createdAt: match.createdAt
    });
  });

  state.tournamentArchive.forEach(match => {
    if (!match?.teamA?.players?.length || !match?.teamB?.players?.length || !match.winnerTeam?.players?.length) return;
    events.push({
      id: match.id,
      source: "tournament",
      mode: match.mode,
      teams: { A: match.teamA.players, B: match.teamB.players },
      score: null,
      winner: match.winner || (samePlayers(match.winnerTeam.players, match.teamA.players) ? "A" : "B"),
      playedAt: dateOnly(match.updatedAt || match.createdAt),
      createdAt: match.updatedAt || match.createdAt
    });
  });

  return events
    .filter(event => event.winner === "A" || event.winner === "B")
    .filter(event => !monthKey || monthKeyFromValue(event.playedAt || event.createdAt) === monthKey);
}

function sortPointRows(a, b) {
  return b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || b.wins - a.wins || a.name.localeCompare(b.name);
}

function winRate(row) {
  return row.played ? (row.wins / row.played) * 100 : 0;
}

function avgGoalsFor(row) {
  return row.scoredMatches ? row.goalsFor / row.scoredMatches : 0;
}

function avgGoalsAgainst(row) {
  return row.scoredMatches ? row.goalsAgainst / row.scoredMatches : 0;
}

function average(values) {
  if (!values.length) return BASE_ELO;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function uniquePlayers(players) {
  const map = new Map();
  players.forEach(player => {
    const normalized = normalizeName(player);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values());
}

function parseScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function shuffle(values) {
  return values
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(item => item.value);
}

function formatTeam(players) {
  return (players || []).join(" + ");
}

function formatScore(score) {
  return `${parseScore(score.A)} - ${parseScore(score.B)}`;
}

function formatDateOnly(value) {
  if (!value) return "Date inconnue";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "short" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatSigned(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? `+${number}` : String(number);
}

function formatSignedDecimal(value) {
  const number = Number(value) || 0;
  const formatted = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(number);
  return number > 0 ? `+${formatted}` : formatted;
}

function formatDecimal(value) {
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(value || 0);
}

function todayInputValue() {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}


function currentMonthKey() {
  return todayInputValue().slice(0, 7);
}

function firstDayOfCurrentMonth() {
  return `${currentMonthKey()}-01`;
}

function monthKeyFromValue(value) {
  const normalized = dateOnly(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized.slice(0, 7) : "";
}

function isFrozenMonth(monthKey) {
  return Boolean(monthKey && monthKey < currentMonthKey());
}

function getStandardArchiveMonthKeys() {
  const months = new Set([currentMonthKey()]);
  state.standardHistory.forEach(match => {
    const month = monthKeyFromValue(match.playedAt || match.createdAt);
    if (month) months.add(month);
  });
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

function getAvailableMonthKeys(includeCurrent = true) {
  const months = new Set();
  if (includeCurrent) months.add(currentMonthKey());
  getAllMatchEvents().forEach(event => {
    const month = monthKeyFromValue(event.playedAt || event.createdAt);
    if (month) months.add(month);
  });
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

function formatMonthLabel(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return "Mois inconnu";
  const [year, month] = monthKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function configureCurrentMonthDateInput() {
  if (!el.standardMatchDate) return;
  el.standardMatchDate.min = firstDayOfCurrentMonth();
  el.standardMatchDate.max = todayInputValue();
  if (monthKeyFromValue(el.standardMatchDate.value) !== currentMonthKey() || el.standardMatchDate.value > todayInputValue()) {
    el.standardMatchDate.value = todayInputValue();
  }
}

function dateOnly(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function eventTimestamp(event) {
  const raw = event.playedAt ? `${event.playedAt}T12:00:00` : event.createdAt;
  const date = new Date(raw || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getRoundName(matchCount, roundNumber) {
  if (matchCount === 1) return "Finale";
  if (matchCount === 2) return "Demi-finales";
  if (matchCount === 4) return "Quarts de finale";
  return `Tour ${roundNumber}`;
}

function nextPowerOfTwo(number) {
  let power = 1;
  while (power < number) power *= 2;
  return power;
}

function samePlayers(a, b) {
  const left = [...(a || [])].sort().join("|");
  const right = [...(b || [])].sort().join("|");
  return left === right;
}

function cssEscape(value) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
  return String(value).replace(/"/g, "\\\"");
}

function safeId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || randomId();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function randomId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

el.addPlayerForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = normalizeName(el.playerName.value);
  if (!name) return;

  if (state.players.some(player => player.toLowerCase() === name.toLowerCase())) {
    el.playerName.value = "";
    return;
  }

  state.players.push(name);
  state.competitionSelection.tournament.push(name);
  state.competitionSelection.championship.push(name);
  el.playerName.value = "";
  render();
});

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    state.activePage = button.dataset.page;
    render();
  });
});

document.querySelectorAll("[data-standard-mode]").forEach(button => {
  button.addEventListener("click", () => {
    state.standardMode = button.dataset.standardMode;
    el.teamA2.value = "";
    el.teamB2.value = "";
    render();
  });
});

document.querySelectorAll("[data-tournament-mode]").forEach(button => {
  button.addEventListener("click", () => {
    state.tournamentConfig.mode = button.dataset.tournamentMode;
    render();
  });
});

document.querySelectorAll("[data-championship-mode]").forEach(button => {
  button.addEventListener("click", () => {
    state.championshipConfig.mode = button.dataset.championshipMode;
    render();
  });
});


el.archiveMonthFilter?.addEventListener("change", () => {
  selectedArchiveMonth = el.archiveMonthFilter.value || currentMonthKey();
  archiveUiMessage = "";
  renderArchiveControls();
  renderStandardHistory();
});

el.adminModeBtn?.addEventListener("click", toggleAdminMode);
el.competitionAdminModeBtn?.addEventListener("click", toggleAdminMode);

document.querySelectorAll("[data-selection-action]").forEach(button => {
  button.addEventListener("click", () => {
    setCompetitionSelection(button.dataset.selectionType, button.dataset.selectionAction === "all");
  });
});

teamSelects.forEach(select => select.addEventListener("change", renderStandardPreview));
[el.standardScoreA, el.standardScoreB].forEach(input => input.addEventListener("input", renderStandardPreview));
el.randomTeamsBtn.addEventListener("click", chooseRandomTeams);
el.saveStandardMatchBtn.addEventListener("click", saveStandardMatch);
el.generateTournamentBtn.addEventListener("click", generateTournament);
el.clearTournamentBtn?.addEventListener("click", clearCurrentTournament);
el.generateChampionshipBtn.addEventListener("click", generateChampionship);
el.clearChampionshipBtn?.addEventListener("click", clearCurrentChampionship);

async function initializeApp() {
  el.standardMatchDate.value = todayInputValue();
  state = await loadState();
  appStarted = true;
  render({ skipSave: true });
  if (supabaseReady) window.setInterval(refreshFromRemote, REFRESH_INTERVAL_MS);
}

initializeApp();
