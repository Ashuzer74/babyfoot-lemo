const STORAGE_KEY = "lemo_babyfoot_simplified_v1_backup";
const SUPABASE_TABLE = "babyfoot_state";
const SUPABASE_ROW_ID = "main";
const REFRESH_INTERVAL_MS = 15000;

const supabaseConfig = window.BABYFOOT_CONFIG || {};
let supabaseClient = null;
let supabaseReady = false;
let appStarted = false;
let saveTimer = null;
let isSaving = false;
let lastRemoteUpdatedAt = null;


const defaultState = {
  players: ["Hugo", "Maxime", "Antonella", "Pasquale"],
  standardMode: "1v1",
  standardHistory: [],
  tournamentConfig: {
    mode: "1v1",
    format: "knockout"
  },
  tournament: null,
  tournamentArchive: []
};

let state = cloneDefaultState();

const el = {
  addPlayerForm: document.getElementById("addPlayerForm"),
  playerName: document.getElementById("playerName"),
  playersList: document.getElementById("playersList"),
  clearPlayersBtn: document.getElementById("clearPlayersBtn"),

  randomTeamsBtn: document.getElementById("randomTeamsBtn"),
  saveStandardMatchBtn: document.getElementById("saveStandardMatchBtn"),
  standardMessage: document.getElementById("standardMessage"),
  standardWinnerPreview: document.getElementById("standardWinnerPreview"),
  teamA1: document.getElementById("teamA1"),
  teamA2: document.getElementById("teamA2"),
  teamB1: document.getElementById("teamB1"),
  teamB2: document.getElementById("teamB2"),
  standardScoreA: document.getElementById("standardScoreA"),
  standardScoreB: document.getElementById("standardScoreB"),
  betWinner: document.getElementById("betWinner"),
  betStake: document.getElementById("betStake"),
  clearStandardHistoryBtn: document.getElementById("clearStandardHistoryBtn"),
  standardLeaderboard: document.getElementById("standardLeaderboard"),
  standardHistoryList: document.getElementById("standardHistoryList"),

  generateTournamentBtn: document.getElementById("generateTournamentBtn"),
  clearTournamentBtn: document.getElementById("clearTournamentBtn"),
  tournamentBoard: document.getElementById("tournamentBoard"),
  tournamentMessage: document.getElementById("tournamentMessage"),
  tournamentLeaderboard: document.getElementById("tournamentLeaderboard"),
  tournamentHistoryList: document.getElementById("tournamentHistoryList"),
  clearTournamentArchiveBtn: document.getElementById("clearTournamentArchiveBtn"),
  syncStatus: document.getElementById("syncStatus")
};

const teamSelects = [el.teamA1, el.teamA2, el.teamB1, el.teamB2];

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function normalizeState(rawState) {
  const parsed = rawState && typeof rawState === "object" ? rawState : {};
  return {
    ...cloneDefaultState(),
    ...parsed,
    players: Array.isArray(parsed.players) ? parsed.players : cloneDefaultState().players,
    standardHistory: Array.isArray(parsed.standardHistory) ? parsed.standardHistory : [],
    tournamentArchive: Array.isArray(parsed.tournamentArchive) ? parsed.tournamentArchive : [],
    tournamentConfig: {
      ...cloneDefaultState().tournamentConfig,
      ...(parsed.tournamentConfig || {})
    },
    tournament: parsed.tournament || null
  };
}

function loadLocalBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

  if (!window.supabase || !window.supabase.createClient) {
    setSyncStatus("Erreur : librairie Supabase non chargée.", "error");
    return;
  }

  supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  supabaseReady = true;
}

async function loadState() {
  setupSupabase();

  if (!supabaseReady) {
    return loadLocalBackup();
  }

  setSyncStatus("Connexion à la sauvegarde partagée...", "info");

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("data, updated_at")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error(error);
    setSyncStatus("Erreur Supabase : vérifie la table et les policies RLS.", "error");
    return loadLocalBackup();
  }

  if (!data) {
    const initialState = normalizeState(cloneDefaultState());
    state = initialState;
    await saveStateNow(initialState);
    setSyncStatus("Sauvegarde partagée initialisée.", "success");
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
  if (!supabaseReady || isSaving) return;

  isSaving = true;
  setSyncStatus("Sauvegarde en ligne...", "info");

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert({
      id: SUPABASE_ROW_ID,
      data: stateToSave,
      updated_at: new Date().toISOString()
    })
    .select("updated_at")
    .single();

  isSaving = false;

  if (error) {
    console.error(error);
    setSyncStatus("Erreur de sauvegarde Supabase.", "error");
    return;
  }

  lastRemoteUpdatedAt = data.updated_at;
  setSyncStatus("Sauvegardé en ligne.", "success");
}

async function refreshFromRemote() {
  if (!supabaseReady || isSaving || isUserEditing()) return;

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("data, updated_at")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();

  if (error || !data) return;
  if (!lastRemoteUpdatedAt || data.updated_at === lastRemoteUpdatedAt) return;

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

function render(options = {}) {
  state.players = uniquePlayers(state.players);
  renderModes();
  renderPlayers();
  renderSelects();
  renderStandardPreview();
  renderStandardHistory();
  renderStandardLeaderboard();
  renderTournament();
  renderTournamentHistory();
  renderTournamentLeaderboard();
  if (!options.skipSave) saveState();
}

function renderModes() {
  document.querySelectorAll("[data-standard-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.standardMode === state.standardMode);
  });

  document.querySelectorAll(".standard-double-only").forEach(node => {
    node.classList.toggle("hidden", state.standardMode !== "2v2");
  });

  document.querySelectorAll("[data-tournament-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tournamentMode === state.tournamentConfig.mode);
  });

  document.querySelectorAll("[data-tournament-format]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tournamentFormat === state.tournamentConfig.format);
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
    pill.innerHTML = `<span>${escapeHtml(name)}</span><button type="button" aria-label="Supprimer ${escapeHtml(name)}">×</button>`;

    pill.querySelector("button").addEventListener("click", () => {
      state.players = state.players.filter(player => player.toLowerCase() !== name.toLowerCase());
      render();
    });

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

function selectedStandardTeams() {
  return {
    A: [el.teamA1.value, el.teamA2.value].filter(Boolean),
    B: [el.teamB1.value, el.teamB2.value].filter(Boolean)
  };
}

function validateStandardMatch(teams, scoreA, scoreB) {
  const required = state.standardMode === "2v2" ? 2 : 1;

  if (teams.A.length !== required || teams.B.length !== required) {
    return `Sélectionne ${required} joueur(s) par équipe.`;
  }

  const all = [...teams.A, ...teams.B];
  if (new Set(all).size !== all.length) {
    return "Un joueur ne peut pas être dans deux équipes.";
  }

  if (scoreA === scoreB) {
    return "Le score ne peut pas être égal. Il faut un gagnant.";
  }

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
    bet: {
      winner: el.betWinner.value,
      stake: normalizeName(el.betStake.value)
    },
    createdAt: new Date().toISOString()
  });

  el.standardScoreA.value = 0;
  el.standardScoreB.value = 0;
  el.betWinner.value = "none";
  el.betStake.value = "";
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
  el.standardHistoryList.innerHTML = state.standardHistory.map((item, index) => {
    const date = formatDate(item.createdAt);
    const winnerTeam = formatTeam(item.teams[item.winner]);
    const bet = !item.bet || item.bet.winner === "none"
      ? "Sans pari"
      : `Pari ${item.bet.winner === item.winner ? "gagné" : "perdu"}${item.bet.stake ? ` · ${escapeHtml(item.bet.stake)}` : ""}`;

    return `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(winnerTeam)} vainqueur · ${item.mode.toUpperCase()}</strong>
          <small>${escapeHtml(formatTeam(item.teams.A))} vs ${escapeHtml(formatTeam(item.teams.B))} · ${bet} · ${date}</small>
        </div>
        <span class="score-chip">${item.score.A} - ${item.score.B}</span>
        <button class="history-delete" type="button" data-standard-history-index="${index}" aria-label="Supprimer ce match">×</button>
      </article>`;
  }).join("");

  el.standardHistoryList.querySelectorAll("[data-standard-history-index]").forEach(button => {
    button.addEventListener("click", () => {
      state.standardHistory.splice(Number(button.dataset.standardHistoryIndex), 1);
      render();
    });
  });
}

function renderStandardLeaderboard() {
  const rows = buildLeaderboardRows(state.standardHistory);

  if (!rows.length) {
    el.standardLeaderboard.className = "leaderboard empty-state";
    el.standardLeaderboard.textContent = "Aucun match standard enregistré.";
    return;
  }

  el.standardLeaderboard.className = "leaderboard";
  el.standardLeaderboard.innerHTML = renderLeaderboardRows(rows);
}

function setStandardMessage(message = "") {
  el.standardMessage.textContent = message;
}

function parseScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
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

/* Tournament */

function createTournamentTeams() {
  const players = shuffle([...state.players]);
  const mode = state.tournamentConfig.mode;

  if (mode === "1v1") {
    return players.map((player, index) => ({
      id: randomId(),
      name: `Joueur ${index + 1}`,
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
  const requiredPlayers = state.tournamentConfig.mode === "2v2" ? 4 : 2;

  if (state.players.length < requiredPlayers) {
    setTournamentMessage(`Ajoute au moins ${requiredPlayers} joueurs pour générer ce tournoi.`);
    return;
  }

  const teams = createTournamentTeams();

  if (teams.length < 2) {
    setTournamentMessage("Il faut au moins deux joueurs ou deux équipes.");
    return;
  }

  const tournamentId = randomId();

  state.tournament = {
    id: tournamentId,
    mode: state.tournamentConfig.mode,
    format: state.tournamentConfig.format,
    teams,
    rounds: state.tournamentConfig.format === "knockout" ? [buildKnockoutRound(teams, 1)] : [buildLeagueRound(teams)],
    createdAt: new Date().toISOString()
  };

  autoAdvanceKnockout();
  setTournamentMessage("");
  render();
}

function buildKnockoutRound(teams, roundNumber) {
  const bracketTeams = roundNumber === 1 ? shuffle([...teams]) : [...teams];
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

function buildLeagueRound(teams) {
  const matches = [];

  for (let a = 0; a < teams.length; a += 1) {
    for (let b = a + 1; b < teams.length; b += 1) {
      matches.push({
        id: randomId(),
        teamA: teams[a],
        teamB: teams[b],
        winner: null,
        bye: false
      });
    }
  }

  return {
    name: "Championnat · tous contre tous",
    matches: shuffle(matches)
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
  const formatLabel = tournament.format === "knockout" ? "Élimination directe" : "Championnat";
  const teamsLabel = tournament.mode === "2v2" ? "équipes" : "joueurs";
  const champion = getTournamentChampion(tournament);

  let html = `
    <div class="tournament-summary">
      <span>${formatLabel}</span>
      <span>${tournament.mode.toUpperCase()}</span>
      <span>${tournament.teams.length} ${teamsLabel}</span>
      ${champion ? `<span>Vainqueur tournoi : ${escapeHtml(formatTeam(champion.players))}</span>` : ""}
    </div>
  `;

  tournament.rounds.forEach((round, roundIndex) => {
    html += `
      <section class="round-card">
        <h3>${escapeHtml(round.name)}</h3>
        ${round.matches.map((match, matchIndex) => renderTournamentMatch(match, roundIndex, matchIndex)).join("")}
      </section>
    `;
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
  const winnerText = match.winner ? `<small>Vainqueur : ${escapeHtml(formatTeam(match[match.winner].players))}</small>` : "";
  const winnerClass = match.winner ? "match-winner" : "";
  const byeClass = match.bye ? "bye-row" : "";
  const aSelected = match.winner === "teamA" ? "selected-winner" : "";
  const bSelected = match.winner === "teamB" ? "selected-winner" : "";

  return `
    <article class="tournament-match ${winnerClass} ${byeClass}">
      <div class="tournament-team ${aSelected}">
        <strong>${escapeHtml(labelA)}</strong>
        ${match.teamA ? `<small>${escapeHtml(match.teamA.name)}</small>` : ""}
      </div>

      <span class="tournament-vs">${match.bye ? "BYE" : "VS"}</span>

      <div class="tournament-team ${bSelected}">
        <strong>${escapeHtml(labelB)}</strong>
        ${match.teamB ? `<small>${escapeHtml(match.teamB.name)}</small>` : ""}
        ${winnerText}
      </div>

      <div class="tournament-actions">
        <button type="button" data-tournament-winner="${roundIndex}:${matchIndex}:teamA" ${match.teamA && !match.bye ? "" : "disabled"}>A gagne</button>
        <button type="button" data-tournament-winner="${roundIndex}:${matchIndex}:teamB" ${match.teamB && !match.bye ? "" : "disabled"}>B gagne</button>
      </div>
    </article>
  `;
}

function setTournamentWinner(roundIndex, matchIndex, winnerSide) {
  const tournament = state.tournament;
  if (!tournament) return;

  const match = tournament.rounds?.[roundIndex]?.matches?.[matchIndex];
  if (!match || !match[winnerSide] || match.bye) return;

  match.winner = winnerSide;

  // If an earlier round is modified, remove following rounds and their archive entries.
  if (tournament.format === "knockout" && roundIndex < tournament.rounds.length - 1) {
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

  const row = {
    id: existingIndex >= 0 ? state.tournamentArchive[existingIndex].id : randomId(),
    tournamentId: tournament.id,
    matchId: match.id,
    roundIndex,
    matchIndex,
    format: tournament.format,
    mode: tournament.mode,
    roundName: tournament.rounds[roundIndex].name,
    teamA: match.teamA,
    teamB: match.teamB,
    winner: winnerSide,
    winnerTeam: match[winnerSide],
    loserTeam: match[loserSide],
    createdAt: existingIndex >= 0 ? state.tournamentArchive[existingIndex].createdAt : new Date().toISOString(),
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

    const nextRoundAlreadyExists = tournament.rounds.some((round, index) => {
      if (index !== tournament.rounds.length - 1) return false;
      return false;
    });

    tournament.rounds.push(buildKnockoutRound(winners, tournament.rounds.length + 1));
    lastRound = tournament.rounds[tournament.rounds.length - 1];

    if (lastRound.matches.length === 1 && lastRound.matches[0].bye) break;
  }
}

function getTournamentChampion(tournament) {
  if (!tournament || tournament.format !== "knockout") return null;

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
  el.tournamentHistoryList.innerHTML = state.tournamentArchive.map((item, index) => {
    const date = formatDate(item.updatedAt || item.createdAt);
    return `
      <article class="history-row">
        <div>
          <strong>${escapeHtml(formatTeam(item.winnerTeam.players))} vainqueur · ${escapeHtml(item.roundName)} · ${item.mode.toUpperCase()}</strong>
          <small>${escapeHtml(formatTeam(item.teamA.players))} vs ${escapeHtml(formatTeam(item.teamB.players))} · ${date}</small>
        </div>
        <span class="score-chip">Victoire</span>
        <button class="history-delete" type="button" data-tournament-history-index="${index}" aria-label="Supprimer ce résultat tournoi">×</button>
      </article>`;
  }).join("");

  el.tournamentHistoryList.querySelectorAll("[data-tournament-history-index]").forEach(button => {
    button.addEventListener("click", () => {
      state.tournamentArchive.splice(Number(button.dataset.tournamentHistoryIndex), 1);
      render();
    });
  });
}

function renderTournamentLeaderboard() {
  const rows = buildTournamentLeaderboardRows(state.tournamentArchive);

  if (!rows.length) {
    el.tournamentLeaderboard.className = "leaderboard empty-state";
    el.tournamentLeaderboard.textContent = "Aucune victoire de tournoi enregistrée.";
    return;
  }

  el.tournamentLeaderboard.className = "leaderboard";
  el.tournamentLeaderboard.innerHTML = renderLeaderboardRows(rows);
}

function buildLeaderboardRows(history) {
  const stats = new Map();

  history.forEach(match => {
    ["A", "B"].forEach(side => {
      match.teams[side].forEach(player => {
        if (!stats.has(player)) stats.set(player, { name: player, played: 0, wins: 0, losses: 0 });
        const row = stats.get(player);
        row.played += 1;
        if (match.winner === side) row.wins += 1;
        else row.losses += 1;
      });
    });
  });

  return Array.from(stats.values())
    .sort(sortStatsRows);
}

function buildTournamentLeaderboardRows(archive) {
  const stats = new Map();

  archive.forEach(match => {
    match.winnerTeam.players.forEach(player => {
      if (!stats.has(player)) stats.set(player, { name: player, played: 0, wins: 0, losses: 0 });
      const row = stats.get(player);
      row.played += 1;
      row.wins += 1;
    });

    match.loserTeam.players.forEach(player => {
      if (!stats.has(player)) stats.set(player, { name: player, played: 0, wins: 0, losses: 0 });
      const row = stats.get(player);
      row.played += 1;
      row.losses += 1;
    });
  });

  return Array.from(stats.values())
    .sort(sortStatsRows);
}

function sortStatsRows(a, b) {
  return b.wins - a.wins || winRate(b) - winRate(a) || a.losses - b.losses || a.name.localeCompare(b.name);
}

function renderLeaderboardRows(rows) {
  return rows.map((row, index) => `
    <article class="leader-row">
      <span class="rank">${index + 1}</span>
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <div class="stat-line">${row.wins} victoire(s) · ${row.losses} défaite(s) · ${row.played} match(s)</div>
      </div>
      <span class="win-rate">${Math.round(winRate(row))}%</span>
    </article>
  `).join("");
}

function winRate(row) {
  return row.played ? (row.wins / row.played) * 100 : 0;
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

function setTournamentMessage(message = "") {
  el.tournamentMessage.textContent = message;
}

function shuffle(values) {
  return values
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(item => item.value);
}

function formatTeam(players) {
  return players.join(" + ");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
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

/* Events */

el.addPlayerForm.addEventListener("submit", event => {
  event.preventDefault();

  const name = normalizeName(el.playerName.value);
  if (!name) return;

  if (state.players.some(player => player.toLowerCase() === name.toLowerCase())) {
    setStandardMessage("Ce prénom existe déjà.");
    return;
  }

  state.players.push(name);
  el.playerName.value = "";
  setStandardMessage("");
  render();
});

document.querySelectorAll("[data-standard-mode]").forEach(button => {
  button.addEventListener("click", () => {
    state.standardMode = button.dataset.standardMode;
    teamSelects.forEach(select => select.value = "");
    setStandardMessage("");
    render();
  });
});

document.querySelectorAll("[data-tournament-mode]").forEach(button => {
  button.addEventListener("click", () => {
    state.tournamentConfig.mode = button.dataset.tournamentMode;
    setTournamentMessage("");
    render();
  });
});

document.querySelectorAll("[data-tournament-format]").forEach(button => {
  button.addEventListener("click", () => {
    state.tournamentConfig.format = button.dataset.tournamentFormat;
    setTournamentMessage("");
    render();
  });
});

teamSelects.forEach(select => {
  select.addEventListener("change", () => {
    setStandardMessage("");
    renderStandardPreview();
  });
});

[el.standardScoreA, el.standardScoreB].forEach(input => {
  input.addEventListener("input", renderStandardPreview);
});

el.randomTeamsBtn.addEventListener("click", chooseRandomTeams);
el.saveStandardMatchBtn.addEventListener("click", saveStandardMatch);
el.generateTournamentBtn.addEventListener("click", generateTournament);

el.clearPlayersBtn.addEventListener("click", () => {
  if (confirm("Supprimer tous les joueurs ?")) {
    state.players = [];
    state.tournament = null;
    render();
  }
});

el.clearStandardHistoryBtn.addEventListener("click", () => {
  if (confirm("Vider toute l'archive des matchs standards ?")) {
    state.standardHistory = [];
    render();
  }
});

el.clearTournamentBtn.addEventListener("click", () => {
  if (confirm("Supprimer le tournoi en cours ?")) {
    state.tournament = null;
    render();
  }
});

el.clearTournamentArchiveBtn.addEventListener("click", () => {
  if (confirm("Vider toute l'archive tournoi ?")) {
    state.tournamentArchive = [];
    render();
  }
});

async function initializeApp() {
  state = await loadState();
  appStarted = true;
  render({ skipSave: true });

  if (supabaseReady) {
    window.setInterval(refreshFromRemote, REFRESH_INTERVAL_MS);
  }
}

initializeApp();
