const STORAGE_KEY = "lemo_babyfoot_v2_supabase_backup";
const LEGACY_STORAGE_KEY = "lemo_babyfoot_simplified_v1_backup";
const SUPABASE_TABLE = "babyfoot_state";
const SUPABASE_ROW_ID = "main";
const REFRESH_INTERVAL_MS = 15000;
const BASE_ELO = 1000;
const ELO_K_FACTOR = 32;

const supabaseConfig = window.BABYFOOT_CONFIG || {};
let supabaseClient = null;
let supabaseReady = false;
let appStarted = false;
let saveTimer = null;
let isSaving = false;
let lastRemoteUpdatedAt = null;

const defaultState = {
  players: ["Hugo", "Maxime", "Antonella", "Pasquale"],
  activePage: "matches",
  standardMode: "1v1",
  standardHistory: [],
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
  pageStats: document.getElementById("pageStats"),

  addPlayerForm: document.getElementById("addPlayerForm"),
  playerName: document.getElementById("playerName"),
  playersList: document.getElementById("playersList"),

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

  generateTournamentBtn: document.getElementById("generateTournamentBtn"),
  tournamentBoard: document.getElementById("tournamentBoard"),
  tournamentMessage: document.getElementById("tournamentMessage"),
  tournamentHistoryList: document.getElementById("tournamentHistoryList"),

  generateChampionshipBtn: document.getElementById("generateChampionshipBtn"),
  championshipBoard: document.getElementById("championshipBoard"),
  championshipMessage: document.getElementById("championshipMessage"),
  championshipHistoryList: document.getElementById("championshipHistoryList"),

  pointsRanking: document.getElementById("pointsRanking"),
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

  return {
    ...base,
    ...parsed,
    players: uniquePlayers(Array.isArray(parsed.players) ? parsed.players : base.players),
    activePage: ["matches", "stats"].includes(parsed.activePage) ? parsed.activePage : "matches",
    standardMode: ["1v1", "2v2"].includes(parsed.standardMode) ? parsed.standardMode : "1v1",
    standardHistory: Array.isArray(parsed.standardHistory) ? parsed.standardHistory.map(normalizeStandardMatch).filter(Boolean) : [],
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
    mode: match.mode === "2v2" ? "2v2" : "1v1",
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
    supabaseConfig.anonKey &&
    !supabaseConfig.url.includes("TON-PROJET") &&
    !supabaseConfig.anonKey.includes("TA-CLE")
  );
}

function setupSupabase() {
  if (!isSupabaseConfigured()) {
    setSyncStatus("Mode local : config.js n'est pas encore configuré.", "warning");
    return;
  }

  if (String(supabaseConfig.anonKey || "").startsWith("sb_secret_")) {
    setSyncStatus("Erreur : la clé Supabase utilisée est une clé secrète. Utilise la Publishable key.", "error");
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    setSyncStatus("Erreur : librairie Supabase non chargée.", "error");
    return;
  }

  const cleanUrl = String(supabaseConfig.url)
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");

  supabaseClient = window.supabase.createClient(cleanUrl, String(supabaseConfig.anonKey).trim());
  supabaseReady = true;
}

function getSupabaseErrorMessage(error) {
  if (!error) return "Erreur inconnue.";
  return error.message || error.details || error.hint || JSON.stringify(error);
}

async function loadState() {
  setupSupabase();

  if (!supabaseReady) return loadLocalBackup();

  setSyncStatus("Connexion à la sauvegarde partagée...", "info");

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("data, updated_at")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("Erreur Supabase au chargement", error);
    setSyncStatus(`Erreur Supabase : ${getSupabaseErrorMessage(error)}`, "error");
    return loadLocalBackup();
  }

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

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert({
      id: SUPABASE_ROW_ID,
      data: stateToSave,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" })
    .select("updated_at")
    .single();

  isSaving = false;

  if (error) {
    console.error("Erreur Supabase à la sauvegarde", error);
    setSyncStatus(`Erreur de sauvegarde Supabase : ${getSupabaseErrorMessage(error)}`, "error");
    return false;
  }

  lastRemoteUpdatedAt = data.updated_at;
  setSyncStatus("Sauvegardé en ligne.", "success");
  return true;
}

async function refreshFromRemote() {
  if (!supabaseReady || isSaving || isUserEditing()) return;

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("data, updated_at")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();

  if (error) {
    console.warn("Erreur Supabase pendant le rafraîchissement", error);
    return;
  }
  if (!data || !data.updated_at || data.updated_at === lastRemoteUpdatedAt) return;

  state = normalizeState(data.data);
  lastRemoteUpdatedAt = data.updated_at;
  render({ skipSave: true });
  setSyncStatus("Données mises à jour depuis la sauvegarde partagée.", "success");
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
  renderPages();
  renderModes();
  renderPlayers();
  renderSelects();
  renderStandardPreview();
  renderStandardHistory();
  renderTournament();
  renderTournamentHistory();
  renderChampionship();
  renderChampionshipHistory();
  renderStats();
  if (!options.skipSave) saveState();
}

function renderPages() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === state.activePage);
  });
  el.pageMatches.classList.toggle("active", state.activePage === "matches");
  el.pageStats.classList.toggle("active", state.activePage === "stats");
}

function renderModes() {
  document.querySelectorAll("[data-standard-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.standardMode === state.standardMode);
  });
  document.querySelectorAll(".standard-double-only").forEach(node => {
    node.classList.toggle("hidden", state.standardMode !== "2v2");
  });
  document.querySelectorAll("[data-tournament-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.tournamentMode === state.tournamentConfig.mode);
  });
  document.querySelectorAll("[data-championship-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.championshipMode === state.championshipConfig.mode);
  });
}

function renderPlayers() {
  el.playersList.innerHTML = "";

  if (!state.players.length) {
    el.playersList.textContent = "Ajoute au moins deux joueurs.";
    el.playersList.classList.add("empty-state");
    return;
  }

  el.playersList.classList.remove("empty-state");
  state.players.forEach(name => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    pill.textContent = name;
    el.playersList.appendChild(pill);
  });
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

function renderStandardPreview() {
  const scoreA = parseScore(el.standardScoreA.value);
  const scoreB = parseScore(el.standardScoreB.value);
  el.standardWinnerPreview.classList.add("hidden");
  el.standardWinnerPreview.textContent = "";

  if (scoreA === scoreB) return;

  const teams = selectedStandardTeams();
  const required = state.standardMode === "2v2" ? 2 : 1;
  if (teams.A.length !== required || teams.B.length !== required) return;

  const winnerSide = scoreA > scoreB ? "A" : "B";
  el.standardWinnerPreview.classList.remove("hidden");
  el.standardWinnerPreview.textContent = `Gagnant prévu : Équipe ${winnerSide} · ${formatTeam(teams[winnerSide])}`;
}

function validateStandardMatch(teams, scoreA, scoreB) {
  const required = state.standardMode === "2v2" ? 2 : 1;

  if (teams.A.length !== required || teams.B.length !== required) {
    return `Sélectionne ${required} joueur(s) par équipe.`;
  }

  const allPlayers = [...teams.A, ...teams.B];
  if (new Set(allPlayers.map(name => name.toLowerCase())).size !== allPlayers.length) {
    return "Un joueur ne peut pas être dans deux équipes.";
  }

  if (scoreA === scoreB) return "Le score ne peut pas être égal. Il faut un gagnant.";
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

function renderStandardHistory() {
  if (!state.standardHistory.length) {
    el.standardHistoryList.className = "history-list empty-state";
    el.standardHistoryList.textContent = "Aucun résultat enregistré.";
    return;
  }

  el.standardHistoryList.className = "history-list";
  el.standardHistoryList.innerHTML = state.standardHistory.map(item => {
    const winnerTeam = formatTeam(item.teams[item.winner]);
    return `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(winnerTeam)} vainqueur · ${item.mode.toUpperCase()}</strong>
          <small>${escapeHtml(formatTeam(item.teams.A))} vs ${escapeHtml(formatTeam(item.teams.B))} · ${formatScore(item.score)} · ${formatDateOnly(item.playedAt)}</small>
        </div>
        <span class="score-chip">${item.score.A} - ${item.score.B}</span>
      </article>`;
  }).join("");
}

function setStandardMessage(message = "") {
  el.standardMessage.textContent = message;
}

function chooseRandomTeams() {
  const required = state.standardMode === "2v2" ? 4 : 2;
  if (state.players.length < required) {
    setStandardMessage(`Ajoute au moins ${required} joueurs pour générer les équipes.`);
    return;
  }

  const shuffled = shuffle([...state.players]);
  el.teamA1.value = shuffled[0] || "";
  el.teamB1.value = shuffled[1] || "";
  el.teamA2.value = state.standardMode === "2v2" ? (shuffled[2] || "") : "";
  el.teamB2.value = state.standardMode === "2v2" ? (shuffled[3] || "") : "";
  setStandardMessage("");
  renderStandardPreview();
}

function createCompetitionTeams(mode) {
  const players = shuffle([...state.players]);
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
  const requiredPlayers = mode === "2v2" ? 4 : 2;
  if (state.players.length < requiredPlayers) {
    setTournamentMessage(`Ajoute au moins ${requiredPlayers} joueurs pour générer ce tournoi.`);
    return;
  }

  const teams = createCompetitionTeams(mode);
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
  const ignored = mode === "2v2" && state.players.length % 2 !== 0 ? " Un joueur impair a été laissé de côté." : "";
  setTournamentMessage(ignored.trim());
  render();
}

function buildKnockoutRound(teams, roundNumber, shouldShuffle = false) {
  const bracketTeams = shouldShuffle ? shuffle([...teams]) : [...teams];
  const power = nextPowerOfTwo(bracketTeams.length);
  while (bracketTeams.length < power) bracketTeams.push(null);

  const matches = [];
  for (let index = 0; index < bracketTeams.length; index += 2) {
    const teamA = bracketTeams[index];
    const teamB = bracketTeams[index + 1];
    const match = {
      id: randomId(),
      teamA,
      teamB,
      winner: null,
      bye: Boolean(teamA && !teamB)
    };
    if (match.bye) match.winner = "teamA";
    matches.push(match);
  }

  return {
    name: getRoundName(matches.length, roundNumber),
    matches
  };
}

function renderTournament() {
  const tournament = state.tournament;
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
}

function renderTournamentMatch(match, roundIndex, matchIndex) {
  const labelA = match.teamA ? formatTeam(match.teamA.players) : "À définir";
  const labelB = match.teamB ? formatTeam(match.teamB.players) : "À définir";
  const winnerTeam = match.winner && match[match.winner] ? formatTeam(match[match.winner].players) : "";
  const aSelected = match.winner === "teamA" ? "selected-winner" : "";
  const bSelected = match.winner === "teamB" ? "selected-winner" : "";

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
      </div>
    </article>`;
}

function setTournamentWinner(roundIndex, matchIndex, winnerSide) {
  const tournament = state.tournament;
  if (!tournament) return;

  const match = tournament.rounds?.[roundIndex]?.matches?.[matchIndex];
  if (!match || !match[winnerSide] || match.bye) return;
  match.winner = winnerSide;

  if (roundIndex < tournament.rounds.length - 1) {
    tournament.rounds = tournament.rounds.slice(0, roundIndex + 1);
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
  if (!tournament || tournament.format !== "knockout") return;

  let lastRound = tournament.rounds[tournament.rounds.length - 1];
  while (lastRound.matches.length > 1 && lastRound.matches.every(match => match.winner)) {
    const winners = lastRound.matches.map(match => match[match.winner]).filter(Boolean);
    if (winners.length <= 1) break;
    tournament.rounds.push(buildKnockoutRound(winners, tournament.rounds.length + 1, false));
    lastRound = tournament.rounds[tournament.rounds.length - 1];
  }
}

function getTournamentChampion(tournament) {
  if (!tournament) return null;
  const lastRound = tournament.rounds[tournament.rounds.length - 1];
  if (!lastRound || lastRound.matches.length !== 1) return null;
  const finalMatch = lastRound.matches[0];
  return finalMatch.winner ? finalMatch[finalMatch.winner] : null;
}

function renderTournamentHistory() {
  if (!state.tournamentArchive.length) {
    el.tournamentHistoryList.className = "history-list empty-state";
    el.tournamentHistoryList.textContent = "Aucun résultat de tournoi enregistré.";
    return;
  }

  el.tournamentHistoryList.className = "history-list";
  el.tournamentHistoryList.innerHTML = state.tournamentArchive.map(item => `
    <article class="history-row">
      <div>
        <strong>${escapeHtml(formatTeam(item.winnerTeam.players))} vainqueur · ${escapeHtml(item.roundName || "Tournoi")} · ${item.mode.toUpperCase()}</strong>
        <small>${escapeHtml(formatTeam(item.teamA.players))} vs ${escapeHtml(formatTeam(item.teamB.players))} · ${formatDateTime(item.updatedAt || item.createdAt)}</small>
      </div>
      <span class="score-chip">Victoire</span>
    </article>`).join("");
}

function generateChampionship() {
  const mode = state.championshipConfig.mode;
  const requiredPlayers = mode === "2v2" ? 4 : 2;
  if (state.players.length < requiredPlayers) {
    setChampionshipMessage(`Ajoute au moins ${requiredPlayers} joueurs pour générer ce championnat.`);
    return;
  }

  const teams = createCompetitionTeams(mode);
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

  const ignored = mode === "2v2" && state.players.length % 2 !== 0 ? " Un joueur impair a été laissé de côté." : "";
  setChampionshipMessage(ignored.trim());
  render();
}

function renderChampionship() {
  const championship = state.championship;
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
  const playedClass = match.status === "played" ? "played" : "";
  const winner = match.winner ? ` · Gagnant : ${escapeHtml(formatTeam(match.winner === "A" ? match.teamA.players : match.teamB.players))}` : "";

  return `
    <article class="championship-match ${playedClass}">
      <div class="match-title">
        <strong>${escapeHtml(formatTeam(match.teamA.players))} vs ${escapeHtml(formatTeam(match.teamB.players))}</strong>
        <small>${match.status === "played" ? "Joué" : "À jouer"}${winner}</small>
      </div>
      <label>
        Date
        <input type="date" value="${escapeHtml(match.playedAt || todayInputValue())}" data-champ-date="${match.id}" />
      </label>
      <label>
        Score A
        <input type="number" min="0" step="1" value="${escapeHtml(scoreA)}" inputmode="numeric" data-champ-score-a="${match.id}" />
      </label>
      <span class="vs-text">-</span>
      <label>
        Score B
        <input type="number" min="0" step="1" value="${escapeHtml(scoreB)}" inputmode="numeric" data-champ-score-b="${match.id}" />
      </label>
      <button class="save-mini-button" type="button" data-champ-save="${match.id}">Enregistrer</button>
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

  if (scoreA === scoreB) {
    setChampionshipMessage("Le score ne peut pas être égal. Il faut un gagnant.");
    return;
  }

  match.score = { A: scoreA, B: scoreB };
  match.winner = scoreA > scoreB ? "A" : "B";
  match.playedAt = dateInput?.value || todayInputValue();
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
  if (!state.championshipArchive.length) {
    el.championshipHistoryList.className = "history-list empty-state";
    el.championshipHistoryList.textContent = "Aucun résultat de championnat enregistré.";
    return;
  }

  el.championshipHistoryList.className = "history-list";
  el.championshipHistoryList.innerHTML = state.championshipArchive.map(item => `
    <article class="history-row">
      <div>
        <strong>${escapeHtml(formatTeam(item.winnerTeam.players))} vainqueur · Championnat · ${item.mode.toUpperCase()}</strong>
        <small>${escapeHtml(formatTeam(item.teamA.players))} vs ${escapeHtml(formatTeam(item.teamB.players))} · ${formatScore(item.score)} · ${formatDateOnly(item.playedAt)}</small>
      </div>
      <span class="score-chip">${item.score.A} - ${item.score.B}</span>
    </article>`).join("");
}

function setTournamentMessage(message = "") {
  el.tournamentMessage.textContent = message;
}

function setChampionshipMessage(message = "") {
  el.championshipMessage.textContent = message;
}

function renderStats() {
  const rows = buildPlayerStats();
  const activeRows = rows.filter(row => row.played > 0);
  const scoredRows = rows.filter(row => row.scoredMatches > 0);

  renderRanking(el.pointsRanking, activeRows.slice().sort(sortPointRows), row => ({
    title: row.name,
    detail: `${row.wins} V · ${row.losses} D · ${row.played} match(s) · Diff ${formatSigned(row.goalDiff)}`,
    value: `${row.points} pts`
  }));

  renderRanking(el.eloRanking, activeRows.slice().sort((a, b) => b.elo - a.elo || b.points - a.points || a.name.localeCompare(b.name)), row => ({
    title: row.name,
    detail: `${row.played} match(s) · dernier mouvement ${formatSigned(row.lastEloDelta || 0)}`,
    value: Math.round(row.elo)
  }));

  renderRanking(el.winRateRanking, activeRows.slice().sort((a, b) => winRate(b) - winRate(a) || b.played - a.played || b.points - a.points || a.name.localeCompare(b.name)), row => ({
    title: row.name,
    detail: `${row.wins}/${row.played} victoire(s)` ,
    value: `${Math.round(winRate(row))}%`
  }));

  renderRanking(el.goalsForRanking, scoredRows.slice().sort((a, b) => avgGoalsFor(b) - avgGoalsFor(a) || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name)), row => ({
    title: row.name,
    detail: `${row.goalsFor} but(s) marqué(s) · ${row.scoredMatches} match(s) scoré(s)`,
    value: `${formatDecimal(avgGoalsFor(row))}/m`
  }));

  renderRanking(el.goalsAgainstRanking, scoredRows.slice().sort((a, b) => avgGoalsAgainst(a) - avgGoalsAgainst(b) || a.goalsAgainst - b.goalsAgainst || a.name.localeCompare(b.name)), row => ({
    title: row.name,
    detail: `${row.goalsAgainst} but(s) pris · ${row.scoredMatches} match(s) scoré(s)`,
    value: `${formatDecimal(avgGoalsAgainst(row))}/m`
  }));

  renderExtraStats(rows);
}

function renderRanking(container, rows, mapRow) {
  if (!rows.length) {
    container.className = "leaderboard empty-state";
    container.textContent = container.id.includes("goals") ? "Aucun score enregistré." : "Aucun match enregistré.";
    return;
  }

  container.className = "leaderboard";
  container.innerHTML = rows.map((row, index) => {
    const mapped = mapRow(row);
    return `
      <article class="leader-row">
        <span class="rank">${index + 1}</span>
        <div>
          <strong>${escapeHtml(mapped.title)}</strong>
          <div class="stat-line">${escapeHtml(mapped.detail)}</div>
        </div>
        <span class="metric-chip">${escapeHtml(mapped.value)}</span>
      </article>`;
  }).join("");
}

function renderExtraStats(rows) {
  const activeRows = rows.filter(row => row.played > 0);
  const scoredRows = rows.filter(row => row.scoredMatches > 0);
  const events = getAllMatchEvents();

  if (!activeRows.length) {
    el.extraStats.className = "summary-grid empty-state";
    el.extraStats.textContent = "Aucune statistique disponible.";
    return;
  }

  const mostPlayed = activeRows.slice().sort((a, b) => b.played - a.played || a.name.localeCompare(b.name))[0];
  const bestDiff = scoredRows.slice().sort((a, b) => b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))[0];
  const bestAttack = scoredRows.slice().sort((a, b) => b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))[0];
  const bestDefense = scoredRows.slice().sort((a, b) => avgGoalsAgainst(a) - avgGoalsAgainst(b) || a.name.localeCompare(b.name))[0];
  const leaderElo = activeRows.slice().sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))[0];
  const totalGoals = events.reduce((sum, event) => event.score ? sum + event.score.A + event.score.B : sum, 0);

  const cards = [
    { label: "Plus actif", value: mostPlayed?.name || "-", detail: `${mostPlayed?.played || 0} match(s)` },
    { label: "Meilleure différence", value: bestDiff?.name || "-", detail: bestDiff ? `Diff ${formatSigned(bestDiff.goalDiff)}` : "Aucun score" },
    { label: "Meilleure attaque totale", value: bestAttack?.name || "-", detail: bestAttack ? `${bestAttack.goalsFor} but(s)` : "Aucun score" },
    { label: "Meilleure défense", value: bestDefense?.name || "-", detail: bestDefense ? `${formatDecimal(avgGoalsAgainst(bestDefense))} but pris/match` : "Aucun score" },
    { label: "Leader Elo", value: leaderElo?.name || "-", detail: leaderElo ? `${Math.round(leaderElo.elo)} Elo` : "Aucun match" },
    { label: "Volume", value: `${events.length} match(s)`, detail: `${totalGoals} but(s) enregistré(s)` }
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

function buildPlayerStats() {
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
  const events = getAllMatchEvents().sort((a, b) => eventTimestamp(a) - eventTimestamp(b));

  events.forEach(event => {
    const teamA = event.teams.A;
    const teamB = event.teams.B;
    [...teamA, ...teamB].forEach(ensure);

    const winnerSide = event.winner;
    const loserSide = winnerSide === "A" ? "B" : "A";

    teamA.forEach(player => applyTeamResult(ensure(player), event, "A", winnerSide));
    teamB.forEach(player => applyTeamResult(ensure(player), event, "B", winnerSide));

    applyElo(stats, event, winnerSide, loserSide);
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
  const teamA = event.teams.A.map(player => stats.get(player)).filter(Boolean);
  const teamB = event.teams.B.map(player => stats.get(player)).filter(Boolean);
  if (!teamA.length || !teamB.length) return;

  const ratingA = average(teamA.map(row => row.elo));
  const ratingB = average(teamB.map(row => row.elo));
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const scoreA = winnerSide === "A" ? 1 : 0;
  const margin = event.score ? Math.max(1, Math.abs(parseScore(event.score.A) - parseScore(event.score.B))) : 1;
  const marginFactor = event.score ? Math.min(1.35, 1 + (margin - 1) * 0.035) : 1;
  const deltaA = Math.round(ELO_K_FACTOR * marginFactor * (scoreA - expectedA));
  const deltaB = -deltaA;

  teamA.forEach(row => {
    row.elo += deltaA;
    row.lastEloDelta = deltaA;
  });
  teamB.forEach(row => {
    row.elo += deltaB;
    row.lastEloDelta = deltaB;
  });
}

function getAllMatchEvents() {
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

  return events.filter(event => event.winner === "A" || event.winner === "B");
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

function formatDecimal(value) {
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(value || 0);
}

function todayInputValue() {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
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

teamSelects.forEach(select => select.addEventListener("change", renderStandardPreview));
[el.standardScoreA, el.standardScoreB].forEach(input => input.addEventListener("input", renderStandardPreview));
el.randomTeamsBtn.addEventListener("click", chooseRandomTeams);
el.saveStandardMatchBtn.addEventListener("click", saveStandardMatch);
el.generateTournamentBtn.addEventListener("click", generateTournament);
el.generateChampionshipBtn.addEventListener("click", generateChampionship);

async function initializeApp() {
  el.standardMatchDate.value = todayInputValue();
  state = await loadState();
  appStarted = true;
  render({ skipSave: true });
  if (supabaseReady) window.setInterval(refreshFromRemote, REFRESH_INTERVAL_MS);
}

initializeApp();
