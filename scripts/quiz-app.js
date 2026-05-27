(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const quizId = params.get("id");
  const letters = ["A", "B", "C", "D", "E", "F"];
  const defaultTimePerQuestion = 20;
  const sscSecondsPerQuestion = 36;
  const storagePrefix = "ssc-quiz";
  const levels = ["easy", "moderate", "pro"];
  const levelLabels = { easy: "Easy", moderate: "Moderate", pro: "Pro" };
  const modes = {
    rapid: "rapid",
    practice: "practice",
    pro: "practice-pro",
    mistakes: "mistake-practice",
    reattempt: "reattempt"
  };

  const el = id => document.getElementById(id);
  const views = {
    loading: el("loading-view"),
    empty: el("empty-view"),
    start: el("start-view"),
    mode: el("mode-view"),
    quiz: el("quiz-view"),
    result: el("result-view"),
    review: el("review-view")
  };

  const state = {
    quiz: null,
    quizFile: "",
    questions: [],
    leaderboard: [],
    activeQ: [],
    currentIdx: 0,
    userAnswers: [],
    markedForReview: [],
    questionVisited: [],
    questionTimes: [],
    mode: modes.rapid,
    userName: "",
    rapidSeconds: defaultTimePerQuestion,
    timeLeft: defaultTimePerQuestion,
    totalRemaining: 0,
    totalSeconds: 0,
    clockId: null,
    questionStartedAt: 0,
    saveTick: 0,
    saveToLeaderboard: true,
    config: {},
    lastAttempt: null,
    reviewReturnView: "start",
    currentReviewAttempt: null,
    reviewFilter: "all",
    reviewParentAttempt: null,
    reviewSessionType: "",
    reviewSessionResult: null,
    revealedAnswers: [],
    currentView: "loading",
    historyReady: false,
    handlingPop: false,
    dialogResolver: null,
    draft: null,
    pro: {
      count: 1,
      level: "",
      timerMinutes: 1,
      recommendedMinutes: 1,
      timerTouched: false
    }
  };

  function showView(name, options = {}) {
    const { push = true } = options;
    Object.values(views).forEach(view => { view.hidden = true; });
    views[name].hidden = false;
    state.currentView = name;
    el("header").hidden = name !== "quiz";
    if (name !== "quiz") {
      closePalette();
      stopClock();
    }
    if (push && state.historyReady && !state.handlingPop) pushAppHistory(name);
  }

  function pushAppHistory(name) {
    const url = new URL(window.location.href);
    url.hash = name;
    if (history.state?.appView === name && window.location.hash === `#${name}`) return;
    history.pushState({ appView: name }, "", url);
  }

  function setEmptyState(title, message, emoji = "") {
    document.title = `${title} | SSC Mock Portal`;
    el("empty-title").textContent = title;
    el("empty-message").textContent = message;
    el("empty-emoji").textContent = emoji;
    showView("empty");
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function parseQuizText(text) {
    try {
      return JSON.parse(text);
    } catch (jsonError) {
      try {
        return Function(`"use strict"; return (${text});`)();
      } catch {
        throw jsonError;
      }
    }
  }

  function normalizeLevel(value) {
    const level = normalizeText(value).toLowerCase();
    if (!level) return "";
    if (["easy", "basic", "e"].includes(level)) return "easy";
    if (["moderate", "medium", "normal", "m"].includes(level)) return "moderate";
    if (["pro", "hard", "advanced", "difficult", "h"].includes(level)) return "pro";
    return "";
  }

  function normalizeQuestion(item, index) {
    const opts = Array.isArray(item.opts) ? item.opts : Array.isArray(item.options) ? item.options : [];
    const cleanOptions = opts.map(option => normalizeText(option)).filter(Boolean);
    const questionText = normalizeText(item.q || item.question || item.prompt);
    let answerText = normalizeText(item.ansText || item.answer || item.correctAnswer);
    let answerIndex = -1;

    if (item.ans !== undefined && item.ans !== null && item.ans !== "") {
      const rawAnswer = normalizeText(item.ans);
      const letterIndex = letters.indexOf(rawAnswer.toUpperCase());
      if (letterIndex >= 0) answerIndex = letterIndex;
      if (Number.isInteger(Number(rawAnswer))) answerIndex = Number(rawAnswer);
    }

    if (!answerText && answerIndex >= 0) answerText = cleanOptions[answerIndex] || "";
    if (answerText) {
      const lowerAnswer = answerText.toLowerCase();
      const foundIndex = cleanOptions.findIndex(option => option.toLowerCase() === lowerAnswer);
      if (foundIndex >= 0) answerIndex = foundIndex;
    }

    if (!questionText || cleanOptions.length < 2 || answerIndex < 0 || answerIndex >= cleanOptions.length) {
      return null;
    }

    return {
      originalIndex: index,
      originalNo: index + 1,
      q: questionText,
      tag: normalizeText(item.tag || item.source || ""),
      level: normalizeLevel(item.level || item.difficulty),
      opts: cleanOptions,
      originalOpts: cleanOptions,
      ans: answerIndex,
      ansText: cleanOptions[answerIndex],
      why: normalizeText(item.why || item.explanation || item.solution || ""),
      image: normalizeText(item.image || item.diagram || item.img || ""),
      imageAlt: normalizeText(item.imageAlt || item.alt || item.diagramAlt || "")
    };
  }

  async function resolveQuizFile() {
    try {
      const response = await fetch("data/quiz-manifest.json", { cache: "no-store" });
      if (response.ok) {
        const manifest = await response.json();
        const entry = (manifest.quizzes || []).find(item => item.id === quizId);
        if (entry && entry.file) return entry.file;
      }
    } catch {
      // Direct file fallback keeps local testing simple.
    }
    return `data/quizzes/${quizId}.json`;
  }

  async function loadQuiz() {
    if (!quizId) {
      setEmptyState("Quiz not selected", "Open a quiz from the homepage.");
      return;
    }

    try {
      state.quizFile = await resolveQuizFile();
      const response = await fetch(state.quizFile, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${state.quizFile}`);
      state.quiz = parseQuizText(await response.text());
    } catch (error) {
      console.error(error);
      setEmptyState("Quiz not found", "The quiz JSON file could not be loaded. Use GitHub Pages or a local server.", "");
      return;
    }

    state.quiz.id = state.quiz.id || quizId;
    state.quiz.title = state.quiz.title || quizId;
    state.quiz.subject = state.quiz.subject || "General";
    state.questions = Array.isArray(state.quiz.questions) ? state.quiz.questions.map(normalizeQuestion).filter(Boolean) : [];
    const visibleCount = state.questions.length || Number(state.quiz.questionCount || 0);

    document.title = `${state.quiz.title} | SSC Mock Portal`;
    el("quiz-emoji").textContent = state.quiz.emoji || "";
    el("quiz-title").textContent = state.quiz.title;
    el("quiz-meta").textContent = `${visibleCount} Quality Qs | ${state.quiz.subject}`;
    el("total-q-num").textContent = state.questions.length;

    loadLeaderboard();

    if (!state.questions.length) {
      setEmptyState(state.quiz.title, `Question list is empty. Paste questions inside ${state.quizFile} under "questions".`, state.quiz.emoji || "");
      return;
    }

    setupPracticePro();
    loadDraft();
    renderResumeCard();
    history.replaceState({ appView: "start" }, "", window.location.pathname + window.location.search + "#start");
    state.historyReady = true;
    showView("start", { push: false });
  }

  function leaderboardKey() {
    return `${storagePrefix}:${state.quiz.id || quizId}:leaderboard`;
  }

  function draftKey() {
    return `${storagePrefix}:${state.quiz.id || quizId}:draft`;
  }

  function loadLeaderboard() {
    try {
      const data = localStorage.getItem(leaderboardKey());
      state.leaderboard = data ? JSON.parse(data) : [];
      if (!Array.isArray(state.leaderboard)) state.leaderboard = [];
    } catch {
      state.leaderboard = [];
    }
    renderLeaderboard();
  }

  function saveLeaderboard() {
    try {
      localStorage.setItem(leaderboardKey(), JSON.stringify(state.leaderboard.slice(0, 15)));
    } catch {
      // Full or blocked local storage should not break the current attempt.
    }
  }

  function loadDraft() {
    state.draft = null;
    try {
      const data = localStorage.getItem(draftKey());
      const draft = data ? JSON.parse(data) : null;
      if (!draft || draft.quizId !== (state.quiz.id || quizId) || !Array.isArray(draft.activeQ) || !draft.activeQ.length) return;
      state.draft = draft;
    } catch {
      state.draft = null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey());
    } catch {
      // Ignore storage failures.
    }
    state.draft = null;
    renderResumeCard();
  }

  function getQuestionTimesSnapshot() {
    const times = state.questionTimes.map(value => Math.max(0, Math.floor(Number(value || 0))));
    if (isPerQuestionTimingMode() && state.questionStartedAt && state.currentIdx >= 0) {
      times[state.currentIdx] = Math.max(0, Math.floor(Number(times[state.currentIdx] || 0) + (Date.now() - state.questionStartedAt) / 1000));
    }
    return times;
  }

  function saveDraft() {
    if (!isMainMode() || views.quiz.hidden || !state.activeQ.length) return;
    const payload = {
      quizId: state.quiz.id || quizId,
      userName: state.userName,
      mode: state.mode,
      config: state.config,
      activeQ: state.activeQ,
      currentIdx: state.currentIdx,
      userAnswers: state.userAnswers,
      markedForReview: state.markedForReview,
      questionVisited: state.questionVisited,
      questionTimes: getQuestionTimesSnapshot(),
      rapidSeconds: state.rapidSeconds,
      timeLeft: state.timeLeft,
      totalRemaining: state.totalRemaining,
      totalSeconds: state.totalSeconds,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(draftKey(), JSON.stringify(payload));
      state.draft = payload;
    } catch {
      // Draft autosave is a recovery helper, not required for scoring.
    }
  }

  function renderResumeCard() {
    const card = el("resume-card");
    if (!card) return;
    if (!state.draft) {
      card.hidden = true;
      return;
    }

    const total = state.draft.activeQ.length;
    const answered = (state.draft.userAnswers || []).filter(answer => answer !== null && answer !== undefined && answer !== -1).length;
    const savedDate = state.draft.savedAt ? new Date(state.draft.savedAt) : null;
    const savedLabel = savedDate && !Number.isNaN(savedDate.getTime())
      ? savedDate.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "recently";
    el("resume-meta").textContent = `${modeDisplayName(state.draft.mode)} | ${answered}/${total} answered | Last on Q${Number(state.draft.currentIdx || 0) + 1} | Saved ${savedLabel}`;
    card.hidden = false;
  }

  function resumeDraft() {
    if (!state.draft) return;
    state.userName = normalizeText(state.draft.userName || el("username").value || "Player");
    el("username").value = state.userName;
    state.mode = state.draft.mode || modes.practice;
    state.config = state.draft.config || {};
    state.activeQ = state.draft.activeQ || [];
    state.currentIdx = clamp(Number(state.draft.currentIdx || 0), 0, Math.max(0, state.activeQ.length - 1));
    state.userAnswers = fitArray(state.draft.userAnswers, state.activeQ.length, null);
    state.markedForReview = fitArray(state.draft.markedForReview, state.activeQ.length, false).map(Boolean);
    state.questionVisited = fitArray(state.draft.questionVisited, state.activeQ.length, false).map(Boolean);
    state.questionTimes = fitArray(state.draft.questionTimes, state.activeQ.length, 0).map(value => Math.max(0, Math.floor(Number(value || 0))));
    state.rapidSeconds = Number(state.draft.rapidSeconds || defaultTimePerQuestion);
    state.timeLeft = Number(state.draft.timeLeft || state.rapidSeconds);
    state.totalRemaining = Number(state.draft.totalRemaining || 0);
    state.totalSeconds = Number(state.draft.totalSeconds || state.totalRemaining || 0);
    state.saveToLeaderboard = true;
    state.reviewParentAttempt = null;
    state.reviewSessionType = "";
    beginQuizView(false);
  }

  async function discardDraft() {
    if (!state.draft) return;
    if (!await appConfirm({
      title: "Discard saved test?",
      message: "Your saved progress for this quiz will be removed.",
      confirmText: "Discard"
    })) return;
    clearDraft();
  }

  function fitArray(value, length, fallback) {
    const array = Array.isArray(value) ? value.slice(0, length) : [];
    while (array.length < length) array.push(fallback);
    return array;
  }

  function rankedAttempts() {
    const sorted = [...state.leaderboard].sort((a, b) => Number(b.score) - Number(a.score) || Date.parse(b.at) - Date.parse(a.at));
    let currentRank = 1;
    return sorted.map((attempt, index) => {
      if (index > 0 && Number(attempt.score) < Number(sorted[index - 1].score)) currentRank += 1;
      return { ...attempt, rank: currentRank };
    });
  }

  function modeIcon(value) {
    if (value === modes.rapid) return "&#128293;";
    if (value === modes.pro) return '<span class="mode-pro-icon" title="Practice Pro">&#x2726;</span>';
    return "&#128218;";
  }

  function modeDisplayName(value) {
    if (value === modes.rapid) return "Rapid Fire";
    if (value === modes.pro) return "Practice Pro";
    if (value === modes.mistakes) return "Mistake Practice";
    if (value === modes.reattempt) return "Reattempt";
    return "Practice";
  }

  function accuracyPercent(correct, wrong) {
    const attempted = Number(correct || 0) + Number(wrong || 0);
    if (!attempted) return 0;
    return Math.round((Number(correct || 0) / attempted) * 100);
  }

  function renderLeaderboard() {
    const list = el("leaderboard-list");
    list.textContent = "";

    if (!state.leaderboard.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "No attempts yet.";
      list.append(empty);
      return;
    }

    rankedAttempts().slice(0, 10).forEach(attempt => {
      const row = document.createElement("button");
      row.className = "attempt-row";
      row.type = "button";
      row.dataset.attemptId = attempt.id;

      const rank = document.createElement("span");
      rank.className = `rank-badge ${attempt.rank === 1 ? "gold" : attempt.rank === 2 ? "silver" : attempt.rank === 3 ? "bronze" : "plain"}`;
      rank.textContent = attempt.rank;

      const text = document.createElement("span");
      const name = document.createElement("span");
      name.className = "attempt-name";
      name.textContent = attempt.name || "Player";
      const meta = document.createElement("span");
      meta.className = "attempt-meta";
      meta.innerHTML = `
        <span>${modeIcon(attempt.mode)}</span>
        <span class="attempt-metric correct">${Number(attempt.correct || 0)}</span>
        <span class="attempt-metric wrong">${Number(attempt.wrong || 0)}</span>
        <span class="attempt-metric skipped">${Number(attempt.skip || 0)}</span>
      `;
      text.append(name, meta);

      const scoreBox = document.createElement("span");
      scoreBox.className = "attempt-scorebox";
      const score = document.createElement("span");
      score.className = "attempt-score";
      score.textContent = formatScore(attempt.score);
      const accuracy = document.createElement("span");
      accuracy.className = "attempt-accuracy";
      accuracy.textContent = `${attempt.accuracy ?? accuracyPercent(attempt.correct, attempt.wrong)}%`;
      scoreBox.append(score, accuracy);
      row.append(rank, text, scoreBox);
      row.addEventListener("click", () => {
        const selected = state.leaderboard.find(item => item.id === row.dataset.attemptId);
        if (selected) renderReview(selected, "start");
      });
      list.append(row);
    });
  }

  async function clearLeaderboard() {
    if (!state.leaderboard.length) return;
    if (!await appConfirm({
      title: "Clear leaderboard?",
      message: "This will remove saved attempts for this quiz on this device.",
      confirmText: "Clear"
    })) return;
    state.leaderboard = [];
    saveLeaderboard();
    renderLeaderboard();
  }

  async function goToModeSelection() {
    state.userName = normalizeText(el("username").value);
    if (!state.userName) {
      await appAlert({
        title: "Enter your name",
        message: "Add a name before choosing a test mode."
      });
      return;
    }
    el("timer-panel").classList.remove("open");
    el("pro-panel").classList.remove("open");
    showView("mode");
  }

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cloneQuestion(question) {
    return {
      ...question,
      opts: Array.isArray(question.opts) ? [...question.opts] : [],
      originalOpts: Array.isArray(question.originalOpts) ? [...question.originalOpts] : Array.isArray(question.opts) ? [...question.opts] : []
    };
  }

  function prepareQuestion(question, keepOrder = false) {
    const base = cloneQuestion(question);
    const options = keepOrder ? [...base.opts] : shuffle(base.opts);
    const ansText = base.ansText || base.opts[base.ans] || "";
    return {
      ...base,
      opts: options,
      originalOpts: base.originalOpts && base.originalOpts.length ? base.originalOpts : [...base.opts],
      ans: options.findIndex(option => option === ansText),
      ansText
    };
  }

  function hasLevelData() {
    return state.questions.some(question => question.level);
  }

  function levelCounts() {
    return levels.reduce((counts, level) => {
      counts[level] = state.questions.filter(question => question.level === level).length;
      return counts;
    }, {});
  }

  function practiceProPool() {
    if (!hasLevelData() || !state.pro.level) return state.questions;
    return state.questions.filter(question => question.level === state.pro.level);
  }

  function recommendedMinutes(count) {
    return Math.max(1, Math.round((Number(count || 1) * sscSecondsPerQuestion) / 60));
  }

  function setupPracticePro() {
    const counts = levelCounts();
    const availableLevel = levels.find(level => counts[level] > 0);
    state.pro.level = hasLevelData() ? (counts.moderate ? "moderate" : availableLevel || "") : "";
    state.pro.count = practiceProPool().length || state.questions.length || 1;
    state.pro.recommendedMinutes = recommendedMinutes(state.pro.count);
    state.pro.timerMinutes = state.pro.recommendedMinutes;
    state.pro.timerTouched = false;
    renderPracticeProSetup();
  }

  function renderPracticeProSetup() {
    const counts = levelCounts();
    const hasLevels = hasLevelData();
    const pool = practiceProPool();
    const maxCount = Math.max(1, pool.length || state.questions.length);
    state.pro.count = clamp(Number(state.pro.count || 1), 1, maxCount);
    state.pro.recommendedMinutes = recommendedMinutes(state.pro.count);
    if (!state.pro.timerTouched) state.pro.timerMinutes = state.pro.recommendedMinutes;
    state.pro.timerMinutes = clamp(Number(state.pro.timerMinutes || 1), 1, 999);

    el("pro-total-value").textContent = maxCount;
    el("pro-count-value").textContent = state.pro.count;
    const slider = el("pro-count-slider");
    slider.max = String(maxCount);
    slider.value = String(state.pro.count);
    el("pro-timer-value").textContent = state.pro.timerMinutes;
    el("pro-recommended-note").classList.toggle("visible", state.pro.timerMinutes === state.pro.recommendedMinutes);
    el("pro-level-note").textContent = hasLevels ? "Choose level" : "No level data";

    document.querySelectorAll("#pro-level-grid .level-chip").forEach(button => {
      const level = button.dataset.level;
      const enabled = hasLevels && counts[level] > 0;
      button.disabled = !enabled;
      button.classList.toggle("active", enabled && state.pro.level === level);
      button.textContent = `${levelLabels[level]}${enabled ? ` (${counts[level]})` : ""}`;
    });
  }

  function setProCount(value) {
    const maxCount = Math.max(1, practiceProPool().length || state.questions.length);
    const oldRecommended = state.pro.recommendedMinutes;
    state.pro.count = clamp(Number(value || 1), 1, maxCount);
    state.pro.recommendedMinutes = recommendedMinutes(state.pro.count);
    if (!state.pro.timerTouched || state.pro.timerMinutes === oldRecommended) {
      state.pro.timerMinutes = state.pro.recommendedMinutes;
      state.pro.timerTouched = false;
    }
    renderPracticeProSetup();
  }

  function changeProTimer(delta) {
    state.pro.timerTouched = true;
    state.pro.timerMinutes = clamp(state.pro.timerMinutes + delta, 1, 999);
    renderPracticeProSetup();
  }

  function setProLevel(level) {
    if (!hasLevelData()) return;
    const counts = levelCounts();
    if (!counts[level]) return;
    const oldRecommended = state.pro.recommendedMinutes;
    state.pro.level = level;
    state.pro.count = counts[level];
    state.pro.recommendedMinutes = recommendedMinutes(state.pro.count);
    if (!state.pro.timerTouched || state.pro.timerMinutes === oldRecommended) {
      state.pro.timerMinutes = state.pro.recommendedMinutes;
      state.pro.timerTouched = false;
    }
    renderPracticeProSetup();
  }

  function selectQuestionSet(mode, config = {}) {
    if (mode === modes.pro) {
      const pool = config.level ? state.questions.filter(question => question.level === config.level) : state.questions;
      return shuffle(pool).slice(0, Math.min(config.count || pool.length, pool.length)).map(question => prepareQuestion(question));
    }
    return shuffle(state.questions).map(question => prepareQuestion(question));
  }

  function createAttempt(mode, config = {}) {
    const source = Array.isArray(config.sourceQuestions) && config.sourceQuestions.length
      ? config.sourceQuestions.map(question => prepareQuestion(question, true))
      : selectQuestionSet(mode, config);

    if (!source.length) {
      appAlert({
        title: "No questions available",
        message: "This setup does not have any questions yet."
      });
      return;
    }

    state.mode = mode;
    state.config = { ...config };
    delete state.config.sourceQuestions;
    delete state.config.reviewParentAttempt;
    state.activeQ = source;
    state.currentIdx = 0;
    state.userAnswers = Array(source.length).fill(null);
    state.markedForReview = Array(source.length).fill(false);
    state.questionVisited = Array(source.length).fill(false);
    state.questionTimes = Array(source.length).fill(0);
    state.revealedAnswers = Array(source.length).fill(false);
    state.timeLeft = Number(config.rapidSeconds || state.rapidSeconds || defaultTimePerQuestion);
    state.rapidSeconds = Number(config.rapidSeconds || state.rapidSeconds || defaultTimePerQuestion);
    state.totalSeconds = mode === modes.pro ? Math.max(60, Number(config.timerMinutes || 1) * 60) : 0;
    state.totalRemaining = state.totalSeconds;
    state.saveToLeaderboard = config.saveToLeaderboard !== false;
    state.reviewParentAttempt = config.reviewParentAttempt || null;
    state.reviewSessionType = config.reviewType || "";
    beginQuizView(true);
  }

  async function confirmAndCreateAttempt(mode, config = {}) {
    const summary = startSummary(mode, config);
    const shouldStart = await appConfirm({
      title: "Ready to start?",
      message: summary,
      confirmText: "Start Test",
      cancelText: "Review Setup"
    });
    if (!shouldStart) return;
    createAttempt(mode, config);
  }

  function startSummary(mode, config = {}) {
    if (mode === modes.rapid) {
      return `Rapid Fire will start with ${config.rapidSeconds || state.rapidSeconds}s per question. Answers, skips, and score will be saved to this quiz leaderboard.`;
    }
    if (mode === modes.pro) {
      const levelText = config.level ? `${levelLabels[config.level] || config.level} level` : "all levels";
      return `Practice Pro will start with ${config.count} questions, ${levelText}, and a ${config.timerMinutes} minute countdown. This attempt will be saved to the leaderboard.`;
    }
    return `Practice Mode will start with all ${state.questions.length} questions. You can move freely, mark questions for review, and submit when ready.`;
  }

  function beginQuizView(resetRapidTimer) {
    el("user-display").textContent = state.userName || "Player";
    el("mode-display").textContent = modeTopLabel();
    el("palette-toggle").classList.toggle("visible", isPracticeLike());
    el("nav-buttons").hidden = !isPracticeLike();
    el("question-indicator").hidden = !isPracticeLike();
    el("mark-row").hidden = true;
    el("timer-panel").classList.remove("open");
    el("pro-panel").classList.remove("open");
    el("palette-section").textContent = `SECTION: ${state.quiz.subject || "Quiz"}`;
    if (resetRapidTimer && state.mode === modes.rapid) state.timeLeft = state.rapidSeconds;

    showView("quiz");
    state.questionStartedAt = Date.now();
    renderQuestion();
    startClock();
    saveDraft();
  }

  function modeTopLabel() {
    if (state.mode === modes.rapid) return `Rapid Fire ${state.rapidSeconds}s`;
    return modeDisplayName(state.mode);
  }

  function isMainMode() {
    return [modes.rapid, modes.practice, modes.pro].includes(state.mode);
  }

  function isPracticeLike() {
    return [modes.practice, modes.pro, modes.mistakes, modes.reattempt].includes(state.mode);
  }

  function isPerQuestionTimingMode() {
    return [modes.practice, modes.pro, modes.reattempt].includes(state.mode);
  }

  function stopClock() {
    if (state.clockId) clearInterval(state.clockId);
    state.clockId = null;
  }

  function startClock() {
    stopClock();
    updateTimerBadge();
    updateQuestionTimeBadge();
    state.clockId = setInterval(tickClock, 1000);
  }

  function tickClock() {
    if (views.quiz.hidden) return;

    if (state.mode === modes.rapid && unanswered(state.userAnswers[state.currentIdx])) {
      state.timeLeft = Math.max(0, state.timeLeft - 1);
      updateTimerBadge();
      if (state.timeLeft <= 0) {
        goNextRapid();
        return;
      }
    }

    if (state.mode === modes.pro && state.totalRemaining > 0) {
      state.totalRemaining = Math.max(0, state.totalRemaining - 1);
      updateTimerBadge();
      if (state.totalRemaining <= 0) {
        finishAttempt();
        return;
      }
    }

    updateQuestionTimeBadge();
    state.saveTick += 1;
    if (state.saveTick % 5 === 0) saveDraft();
  }

  function updateTimerBadge() {
    const badge = el("timer-badge");
    if (state.mode === modes.rapid) {
      badge.hidden = false;
      el("timer").textContent = `${state.timeLeft}s`;
      return;
    }
    if (state.mode === modes.pro) {
      badge.hidden = false;
      el("timer").textContent = formatClock(state.totalRemaining);
      return;
    }
    badge.hidden = true;
  }

  function currentQuestionSeconds() {
    const stored = Number(state.questionTimes[state.currentIdx] || 0);
    if (!isPerQuestionTimingMode() || !state.questionStartedAt) return stored;
    return Math.max(0, Math.floor(stored + (Date.now() - state.questionStartedAt) / 1000));
  }

  function updateQuestionTimeBadge() {
    const badge = el("qtime-badge");
    if (!isPerQuestionTimingMode() || views.quiz.hidden) {
      badge.className = "qtime-badge";
      return;
    }
    const seconds = currentQuestionSeconds();
    badge.textContent = `${seconds}s`;
    badge.className = `qtime-badge visible ${seconds <= 25 ? "fast" : seconds <= 45 ? "medium" : "slow"}`;
  }

  function recordQuestionTime() {
    if (!isPerQuestionTimingMode() || !state.questionStartedAt || state.currentIdx < 0) return;
    const elapsed = Math.floor((Date.now() - state.questionStartedAt) / 1000);
    if (elapsed > 0) {
      state.questionTimes[state.currentIdx] = Math.max(0, Math.floor(Number(state.questionTimes[state.currentIdx] || 0) + elapsed));
    }
    state.questionStartedAt = Date.now();
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function renderQuestion() {
    const question = state.activeQ[state.currentIdx];
    if (!question) return;

    state.questionVisited[state.currentIdx] = true;
    const selected = state.userAnswers[state.currentIdx];
    const progress = ((state.currentIdx + 1) / state.activeQ.length) * 100;
    const lastQuestion = state.currentIdx === state.activeQ.length - 1;

    el("progress-bar").style.width = `${progress}%`;
    el("question-number").textContent = `Question ${state.currentIdx + 1} of ${state.activeQ.length}`;
    el("question-text").textContent = question.q;
    el("pyq-tag").textContent = question.tag || state.quiz.subject;
    el("current-q-num").textContent = state.currentIdx + 1;
    el("total-q-num").textContent = state.activeQ.length;
    el("prev-btn").disabled = state.currentIdx === 0;
    el("next-btn").textContent = lastQuestion ? "Submit" : "Next";
    el("next-btn").classList.toggle("success", lastQuestion);
    el("next-btn").classList.toggle("primary", !lastQuestion);
    el("mark-review-btn").classList.toggle("active", Boolean(state.markedForReview[state.currentIdx]));
    el("mark-review-btn").textContent = state.markedForReview[state.currentIdx] ? "Marked for Review" : "Mark for Review";
    el("mark-nav-btn").classList.toggle("active", Boolean(state.markedForReview[state.currentIdx]));
    el("mark-nav-btn").textContent = state.markedForReview[state.currentIdx] ? "Marked" : "Mark Review";

    const media = el("question-media");
    media.textContent = "";
    if (question.image) {
      const img = document.createElement("img");
      img.src = question.image;
      img.alt = question.imageAlt || "Question diagram";
      media.append(img);
    }

    const container = el("options-container");
    container.textContent = "";
    question.opts.forEach((option, index) => {
      const button = document.createElement("button");
      button.className = "option-button";
      button.type = "button";

      if (isPracticeLike() && selected === index) button.classList.add("selected");
      if (state.mode === modes.mistakes && state.revealedAnswers[state.currentIdx]) {
        button.disabled = true;
        button.classList.add("locked");
        const previous = question.previousAnswer;
        if (index === question.ans) button.classList.add("correct");
        if (index === selected && selected !== question.ans) button.classList.add("wrong");
        if (!unanswered(previous) && index === previous && index !== selected && index !== question.ans) button.classList.add("previous");
      }
      if (state.mode === modes.rapid && !unanswered(selected)) {
        button.disabled = true;
        if (index === question.ans) button.classList.add("correct");
        if (index === selected && selected !== question.ans) button.classList.add("wrong");
      }

      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.textContent = letters[index] || String(index + 1);
      const text = document.createElement("span");
      text.textContent = option;
      button.append(letter, text);
      if (state.mode === modes.mistakes && state.revealedAnswers[state.currentIdx]) {
        const note = mistakeOptionNote(question, index, selected);
        if (note) {
          const noteEl = document.createElement("span");
          noteEl.className = "option-note";
          noteEl.textContent = note;
          button.append(noteEl);
        }
      }
      button.addEventListener("click", () => chooseAnswer(index));
      container.append(button);
    });

    const oldResult = document.querySelector(".inline-result");
    if (oldResult) oldResult.remove();
    if (state.mode === modes.mistakes) renderInlineMistakeScore();

    const rapidRow = el("rapid-row");
    rapidRow.hidden = state.mode !== modes.rapid;
    rapidRow.classList.toggle("visible", state.mode === modes.rapid);
    el("rapid-skip-btn").disabled = state.mode !== modes.rapid || !unanswered(selected);

    updateTimerBadge();
    updateQuestionTimeBadge();
    renderPalette();
  }

  function chooseAnswer(index) {
    const selected = state.userAnswers[state.currentIdx];
    if (state.mode === modes.mistakes) {
      if (state.revealedAnswers[state.currentIdx]) return;
      state.userAnswers[state.currentIdx] = index;
      state.questionVisited[state.currentIdx] = true;
      state.revealedAnswers[state.currentIdx] = true;
      renderQuestion();
      return;
    }

    if (state.mode === modes.rapid) {
      if (!unanswered(selected)) return;
      state.userAnswers[state.currentIdx] = index;
      state.questionVisited[state.currentIdx] = true;
      renderQuestion();
      saveDraft();
      window.setTimeout(goNextRapid, 650);
      return;
    }

    if (!isPracticeLike()) return;
    state.userAnswers[state.currentIdx] = selected === index ? null : index;
    state.questionVisited[state.currentIdx] = true;
    renderQuestion();
    saveDraft();
  }

  function mistakeOptionNote(question, index, selected) {
    const previous = question.previousAnswer;
    const oldWrong = !unanswered(previous) && previous !== question.ans;
    if (oldWrong && index === previous) return "First attempt";
    return "";
  }

  function renderInlineMistakeScore() {
    const panel = document.createElement("div");
    panel.className = "inline-result";
    const answered = state.userAnswers.filter(answer => !unanswered(answer)).length;
    const correct = state.activeQ.reduce((sum, question, index) => sum + (state.userAnswers[index] === question.ans ? 1 : 0), 0);
    const wrong = answered - correct;
    panel.textContent = `Mistake Practice: ${correct} correct, ${wrong} wrong, ${state.activeQ.length - answered} left`;
    el("quiz-view").querySelector(".quiz-panel").append(panel);
  }

  function unanswered(answer) {
    return answer === null || answer === undefined || answer === -1;
  }

  function goNextRapid() {
    if (state.mode !== modes.rapid) return;
    state.questionVisited[state.currentIdx] = true;
    saveDraft();
    if (state.currentIdx >= state.activeQ.length - 1) {
      finishAttempt();
      return;
    }
    enterQuestion(state.currentIdx + 1, true);
  }

  function skipRapidQuestion() {
    if (state.mode !== modes.rapid) return;
    state.userAnswers[state.currentIdx] = null;
    state.questionVisited[state.currentIdx] = true;
    goNextRapid();
  }

  function enterQuestion(index, resetRapidTimer = false) {
    recordQuestionTime();
    state.currentIdx = clamp(index, 0, state.activeQ.length - 1);
    state.questionStartedAt = Date.now();
    if (state.mode === modes.rapid && resetRapidTimer) state.timeLeft = state.rapidSeconds;
    renderQuestion();
    saveDraft();
  }

  function prevQuestion() {
    if (state.currentIdx > 0) enterQuestion(state.currentIdx - 1);
  }

  function nextQuestion() {
    if (!isPracticeLike()) return;
    if (state.currentIdx >= state.activeQ.length - 1) {
      submitPractice();
      return;
    }
    enterQuestion(state.currentIdx + 1);
  }

  async function submitPractice() {
    const skipped = state.userAnswers.filter(unanswered).length;
    if (skipped && !await appConfirm({
      title: "Submit test?",
      message: `${skipped} questions are still unanswered. Submit anyway?`,
      confirmText: "Submit"
    })) return;
    finishAttempt();
  }

  function toggleMarkForReview() {
    if (!isPracticeLike()) return;
    state.markedForReview[state.currentIdx] = !state.markedForReview[state.currentIdx];
    renderQuestion();
    saveDraft();
  }

  function paletteStatus(index) {
    const answered = !unanswered(state.userAnswers[index]);
    const marked = Boolean(state.markedForReview[index]);
    const visited = Boolean(state.questionVisited[index]);
    if (answered && marked) return "marked-answered";
    if (marked) return "marked";
    if (answered) return "answered";
    if (visited) return "not-answered";
    return "not-visited";
  }

  function renderPalette() {
    if (!isPracticeLike() || !state.activeQ.length) return;
    const counts = { answered: 0, marked: 0, "marked-answered": 0, "not-answered": 0, "not-visited": 0 };
    const grid = el("palette-grid");
    grid.textContent = "";

    state.activeQ.forEach((_, index) => {
      const status = paletteStatus(index);
      counts[status] += 1;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `palette-q ${status}${index === state.currentIdx ? " current" : ""}`;
      button.textContent = index + 1;
      button.addEventListener("click", () => {
        enterQuestion(index);
        closePalette();
      });
      grid.append(button);
    });

    el("legend-answered").textContent = counts.answered;
    el("legend-marked").textContent = counts.marked;
    el("legend-marked-answered").textContent = counts["marked-answered"];
    el("legend-not-answered").textContent = counts["not-answered"];
    el("legend-not-visited").textContent = counts["not-visited"];
  }

  function openPalette() {
    if (!isPracticeLike()) return;
    renderPalette();
    const backdrop = el("palette-backdrop");
    const palette = el("question-palette");
    backdrop.hidden = false;
    palette.hidden = false;
    backdrop.classList.add("open");
    palette.classList.add("open");
    palette.setAttribute("aria-hidden", "false");
  }

  function closePalette() {
    const backdrop = el("palette-backdrop");
    const palette = el("question-palette");
    if (backdrop) {
      backdrop.classList.remove("open");
      backdrop.hidden = true;
    }
    if (palette) {
      palette.classList.remove("open");
      palette.setAttribute("aria-hidden", "true");
      palette.hidden = true;
    }
  }

  function finishAttempt() {
    recordQuestionTime();
    stopClock();
    closePalette();

    let correct = 0;
    let wrong = 0;
    let skip = 0;
    const finalTimes = getQuestionTimesSnapshot();

    state.activeQ.forEach((question, index) => {
      const answer = state.userAnswers[index];
      if (unanswered(answer)) skip += 1;
      else if (answer === question.ans) correct += 1;
      else wrong += 1;
    });

    const score = Number((correct - wrong * 0.25).toFixed(2));
    const accuracy = accuracyPercent(correct, wrong);
    const attempt = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: state.userName || "Player",
      mode: state.mode,
      score,
      accuracy,
      correct,
      wrong,
      skip,
      total: state.activeQ.length,
      at: new Date().toISOString(),
      rapidSeconds: state.mode === modes.rapid ? state.rapidSeconds : null,
      practicePro: state.mode === modes.pro ? {
        count: state.config.count,
        level: state.config.level || "",
        timerMinutes: state.config.timerMinutes
      } : null,
      answers: [...state.userAnswers],
      marked: [...state.markedForReview],
      questionTimes: finalTimes,
      questions: state.activeQ,
      items: state.activeQ.map((question, index) => ({
        question,
        answer: state.userAnswers[index],
        marked: state.markedForReview[index],
        visited: state.questionVisited[index],
        timeSpent: finalTimes[index] || 0,
        quizOrder: index + 1
      }))
    };

    if (state.saveToLeaderboard) {
      state.lastAttempt = attempt;
      state.leaderboard.unshift(attempt);
      saveLeaderboard();
      clearDraft();
      renderLeaderboard();
      renderResult(attempt);
      showView("result");
      return;
    }

    if (!state.config.suppressReviewResult) {
      state.reviewSessionResult = {
        type: state.reviewSessionType,
        attempt,
        parentId: state.reviewParentAttempt?.id || ""
      };
    }
    renderReview(state.reviewParentAttempt || attempt, state.reviewReturnView, "all");
  }

  function formatScore(value) {
    const number = Number(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(2);
  }

  function renderResult(attempt) {
    el("result-name").textContent = `${attempt.name}, ${attempt.correct}/${attempt.total} correct`;
    el("final-score").textContent = formatScore(attempt.score);
    el("correct-count").textContent = attempt.correct;
    el("wrong-count").textContent = attempt.wrong;
    el("skip-count").textContent = attempt.skip;
    el("accuracy-count").textContent = `${attempt.accuracy ?? accuracyPercent(attempt.correct, attempt.wrong)}%`;
  }

  function getAttemptItems(attempt) {
    if (!attempt) return [];
    if (Array.isArray(attempt.items)) {
      return attempt.items.map((item, index) => ({
        question: item.question,
        answer: item.answer,
        marked: Boolean(item.marked),
        visited: item.visited !== false,
        timeSpent: Number(item.timeSpent ?? attempt.questionTimes?.[index] ?? 0),
        quizOrder: item.quizOrder || index + 1
      })).filter(item => item.question);
    }
    return (attempt.questions || []).map((question, index) => ({
      question,
      answer: Array.isArray(attempt.answers) ? attempt.answers[index] : null,
      marked: Array.isArray(attempt.marked) ? Boolean(attempt.marked[index]) : false,
      visited: true,
      timeSpent: Number(attempt.questionTimes?.[index] || 0),
      quizOrder: index + 1
    }));
  }

  function itemStatus(item) {
    if (unanswered(item.answer)) return "skipped";
    return item.answer === item.question.ans ? "correct" : "wrong";
  }

  function sortedReviewItems(attempt) {
    return getAttemptItems(attempt).sort((a, b) => {
      const aIndex = Number.isInteger(a.question.originalIndex) ? a.question.originalIndex : a.quizOrder;
      const bIndex = Number.isInteger(b.question.originalIndex) ? b.question.originalIndex : b.quizOrder;
      return aIndex - bIndex;
    });
  }

  function renderReview(attempt, returnView, filter = "all") {
    state.currentReviewAttempt = attempt;
    state.reviewReturnView = returnView;
    state.reviewFilter = filter;

    const items = sortedReviewItems(attempt);
    const counts = items.reduce((total, item) => {
      total[itemStatus(item)] += 1;
      return total;
    }, { correct: 0, wrong: 0, skipped: 0 });
    const visibleItems = filter === "all" ? items : items.filter(item => itemStatus(item) === filter);
    const accuracy = attempt.accuracy ?? accuracyPercent(counts.correct, counts.wrong);

    el("review-player-name").textContent = attempt.name || "Player";
    el("review-stats").textContent = `Score ${formatScore(attempt.score)} | Accuracy ${accuracy}% | Showing ${visibleItems.length}/${items.length}`;
    el("filter-all-count").textContent = items.length;
    el("filter-correct-count").textContent = counts.correct;
    el("filter-wrong-count").textContent = counts.wrong;
    el("filter-skipped-count").textContent = counts.skipped;

    document.querySelectorAll(".filter-button").forEach(button => {
      button.classList.toggle("active", button.dataset.filter === filter);
    });

    const container = el("review-container");
    container.textContent = "";
    const fragment = document.createDocumentFragment();

    if (filter === "all") {
      fragment.append(createAnalysisDashboard(attempt, items, counts, accuracy));
    }

    if (filter !== "all" && !visibleItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = `No ${filter} questions.`;
      fragment.append(empty);
    } else if (filter !== "all") {
      visibleItems.forEach(item => fragment.append(createReviewCard(item)));
    }

    container.append(fragment);
    showView("review");
  }

  function createAnalysisDashboard(attempt, items, counts, accuracy) {
    const total = items.length || 1;
    const attempted = counts.correct + counts.wrong;
    const correctPct = (counts.correct / total) * 100;
    const wrongPct = (counts.wrong / total) * 100;
    const weaknessCount = counts.wrong + counts.skipped;
    const times = items.map(item => Number(item.timeSpent || 0)).filter(Boolean);
    const averageTime = times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : 0;

    const card = document.createElement("article");
    card.className = "analysis-card";

    const head = document.createElement("div");
    head.className = "analysis-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "analysis-title";
    title.textContent = "Performance Analysis";
    const subtitle = document.createElement("p");
    subtitle.className = "analysis-subtitle";
    subtitle.textContent = `${modeDisplayName(attempt.mode)} | ${attempted}/${items.length} attempted`;
    titleWrap.append(title, subtitle);
    const donut = document.createElement("div");
    donut.className = "donut";
    donut.style.setProperty("--correct", `${correctPct}%`);
    donut.style.setProperty("--wrong", `${wrongPct}%`);
    const donutInner = document.createElement("div");
    donutInner.className = "donut-inner";
    donutInner.textContent = `${accuracy}%`;
    donut.append(donutInner);
    head.append(titleWrap, donut);
    card.append(head);

    const metrics = document.createElement("div");
    metrics.className = "analysis-metrics";
    [
      ["Score", formatScore(attempt.score)],
      ["Accuracy", `${accuracy}%`],
      ["Correct", counts.correct],
      ["Wrong", counts.wrong],
      ["Skipped", counts.skipped],
      ["Avg Time", averageTime ? `${averageTime}s` : "Not tracked"]
    ].forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "metric-tile";
      const metricLabel = document.createElement("span");
      metricLabel.className = "metric-label";
      metricLabel.textContent = label;
      const metricValue = document.createElement("span");
      metricValue.className = "metric-value";
      metricValue.textContent = value;
      tile.append(metricLabel, metricValue);
      metrics.append(tile);
    });
    card.append(metrics);

    if (state.reviewSessionResult && state.reviewSessionResult.parentId === attempt.id) {
      const follow = document.createElement("div");
      follow.className = "followup-box";
      const result = state.reviewSessionResult.attempt;
      const isReattemptResult = state.reviewSessionResult.type === "reattempt";
      const toggle = document.createElement("button");
      toggle.className = "followup-toggle";
      toggle.type = "button";
      toggle.textContent = isReattemptResult ? "See reattempt score \u2193" : "See practice mistakes score \u2193";
      const panel = document.createElement("div");
      panel.className = "followup-panel";
      panel.append(createCompactAnalysis(result, isReattemptResult ? "Reattempt Score Analysis" : "Practice Mistakes Analysis"));
      if (isReattemptResult) {
        const resultWeakness = getAttemptItems(result).filter(item => ["wrong", "skipped"].includes(itemStatus(item)));
        if (resultWeakness.length) {
          const textAction = document.createElement("button");
          textAction.className = "text-action";
          textAction.type = "button";
          textAction.textContent = "practice reattempt mistakes";
          textAction.addEventListener("click", () => startReviewPractice("quiet-mistakes", result));
          panel.append(textAction);
        }
      }
      toggle.addEventListener("click", () => {
        const open = panel.classList.toggle("open");
        if (isReattemptResult) {
          toggle.textContent = open ? "Hide reattempt score \u2191" : "See reattempt score \u2193";
        } else {
          toggle.textContent = open ? "Hide practice mistakes score \u2191" : "See practice mistakes score \u2193";
        }
      });
      follow.append(toggle, panel);
      card.append(follow);
    }

    const actions = document.createElement("div");
    actions.className = "analysis-actions";
    const mistakeButton = document.createElement("button");
    mistakeButton.className = "secondary-button mistake-action";
    mistakeButton.type = "button";
    mistakeButton.textContent = "Practice Mistakes";
    mistakeButton.disabled = weaknessCount === 0;
    mistakeButton.addEventListener("click", () => startReviewPractice("mistakes"));
    const reattemptButton = document.createElement("button");
    reattemptButton.className = "primary-button";
    reattemptButton.type = "button";
    reattemptButton.textContent = "Reattempt This Set";
    reattemptButton.addEventListener("click", () => startReviewPractice("reattempt"));
    actions.append(mistakeButton, reattemptButton);
    card.append(actions);

    const pdfButton = document.createElement("button");
    pdfButton.className = "pdf-download-button";
    pdfButton.type = "button";
    pdfButton.textContent = "Download all the most important questions of this topic & PYQs";
    pdfButton.addEventListener("click", downloadFullQuizPdf);
    card.append(pdfButton);

    return card;
  }

  function createCompactAnalysis(attempt, titleText) {
    const items = getAttemptItems(attempt);
    const counts = items.reduce((total, item) => {
      total[itemStatus(item)] += 1;
      return total;
    }, { correct: 0, wrong: 0, skipped: 0 });
    const total = items.length || 1;
    const accuracy = attempt.accuracy ?? accuracyPercent(counts.correct, counts.wrong);
    const correctPct = (counts.correct / total) * 100;
    const wrongPct = (counts.wrong / total) * 100;
    const times = items.map(item => Number(item.timeSpent || 0)).filter(Boolean);
    const averageTime = times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : 0;

    const card = document.createElement("article");
    card.className = "analysis-card compact";
    const head = document.createElement("div");
    head.className = "analysis-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "analysis-title";
    title.textContent = titleText;
    const subtitle = document.createElement("p");
    subtitle.className = "analysis-subtitle";
    subtitle.textContent = `${counts.correct + counts.wrong}/${items.length} attempted`;
    titleWrap.append(title, subtitle);
    const donut = document.createElement("div");
    donut.className = "donut";
    donut.style.setProperty("--correct", `${correctPct}%`);
    donut.style.setProperty("--wrong", `${wrongPct}%`);
    const donutInner = document.createElement("div");
    donutInner.className = "donut-inner";
    donutInner.textContent = `${accuracy}%`;
    donut.append(donutInner);
    head.append(titleWrap, donut);
    card.append(head);

    const metrics = document.createElement("div");
    metrics.className = "analysis-metrics";
    [
      ["Score", formatScore(attempt.score)],
      ["Accuracy", `${accuracy}%`],
      ["Correct", counts.correct],
      ["Wrong", counts.wrong],
      ["Skipped", counts.skipped],
      ["Avg Time", averageTime ? `${averageTime}s` : "Not tracked"]
    ].forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "metric-tile";
      const metricLabel = document.createElement("span");
      metricLabel.className = "metric-label";
      metricLabel.textContent = label;
      const metricValue = document.createElement("span");
      metricValue.className = "metric-value";
      metricValue.textContent = value;
      tile.append(metricLabel, metricValue);
      metrics.append(tile);
    });
    card.append(metrics);
    return card;
  }

  function downloadFullQuizPdf() {
    if (!state.questions.length) {
      appAlert({
        title: "PDF unavailable",
        message: "This quiz does not have question data loaded yet."
      });
      return;
    }

    const bytes = buildQuizPdf();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSafeName(state.quiz.title || "quiz")}-question-paper.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildQuizPdf() {
    const layout = {
      width: 595.28,
      height: 841.89,
      margin: 30,
      top: 50,
      bottom: 42,
      columnGap: 12,
      questionColumns: 3,
      questionGap: 5
    };
    layout.columnWidth = (layout.width - layout.margin * 2 - layout.columnGap * (layout.questionColumns - 1)) / layout.questionColumns;
    const paperCode = makePdfPaperCode();
    const paperQuestions = buildPdfPaperQuestions();
    const pages = [];
    const newPage = () => {
      const page = { ops: [] };
      pages.push(page);
      return page;
    };

    drawPdfCover(newPage(), layout, paperCode);
    drawPdfQuestions(pages, newPage, layout, paperQuestions);
    drawPdfAnswerKey(pages, newPage, layout, paperQuestions, paperCode);
    pages.forEach((page, index) => drawPdfFooter(page, layout, index + 1));
    return finalizePdf(pages, layout);
  }

  function buildPdfPaperQuestions() {
    return state.questions.map(question => {
      const shuffledOptions = shuffle(question.opts.map((text, index) => ({ text, index })));
      const pdfAns = shuffledOptions.findIndex(option => option.index === question.ans);
      const safeAnswerIndex = pdfAns >= 0 ? pdfAns : question.ans;
      return {
        ...question,
        pdfOpts: shuffledOptions.map(option => option.text),
        pdfAns: safeAnswerIndex,
        pdfAnsText: shuffledOptions[safeAnswerIndex]?.text || question.ansText
      };
    });
  }

  function makePdfPaperCode() {
    return `LS-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function drawPdfCover(page, layout, paperCode) {
    drawCenteredPdfText(page, "Quizzes by Lakshay Suthar", layout.width / 2, 560, 28, "F2", "0.11 0.30 0.70");
    drawCenteredPdfText(page, cleanPdfText(state.quiz.title || "Quiz"), layout.width / 2, 485, 24, "F2", "0.06 0.09 0.16");
    drawCenteredPdfText(page, cleanPdfText(state.quiz.subject || "General"), layout.width / 2, 450, 16, "F1", "0.25 0.31 0.40");
    drawCenteredPdfText(page, `${state.questions.length} questions`, layout.width / 2, 420, 11, "F1", "0.39 0.45 0.55");
    drawCenteredPdfText(page, `Paper Code: ${paperCode}`, layout.width / 2, 398, 10, "F2", "0.11 0.30 0.70");
    page.ops.push("0.82 0.86 0.91 RG 1 w 112 392 m 483 392 l S");
    drawCenteredPdfText(page, `Downloaded on ${downloadDateLabel()}`, layout.width / 2, 62, 10, "F3", "0.39 0.45 0.55");
  }

  function drawPdfQuestions(pages, newPage, layout, paperQuestions) {
    let page = newPage();
    drawPdfSectionTitle(page, layout, "Question Paper");
    let column = 0;
    let y = pdfBodyStartY(layout);

    paperQuestions.forEach((question, index) => {
      const block = buildQuestionPdfBlock(question, index + 1, layout.columnWidth);
      if (y - block.height < layout.bottom) {
        column += 1;
        if (column >= layout.questionColumns) {
          page = newPage();
          drawPdfSectionTitle(page, layout, "Question Paper");
          column = 0;
        }
        y = pdfBodyStartY(layout);
      }

      const x = layout.margin + column * (layout.columnWidth + layout.columnGap);
      y = drawQuestionPdfBlock(page, block, x, y, layout.columnWidth) - layout.questionGap;
    });
  }

  function drawPdfAnswerKey(pages, newPage, layout, paperQuestions, paperCode) {
    let page = newPage();
    drawPdfSectionTitle(page, layout, `Answer Key | ${paperCode}`);
    const columns = 4;
    const gap = 12;
    const columnWidth = (layout.width - layout.margin * 2 - gap * (columns - 1)) / columns;
    let column = 0;
    let y = pdfBodyStartY(layout);

    paperQuestions.forEach((question, index) => {
      const answerIndex = Number.isInteger(question.pdfAns) ? question.pdfAns : question.ans;
      const answerText = question.pdfAnsText || question.ansText;
      const line = `${index + 1}. ${letters[answerIndex] || answerIndex + 1} - ${answerText}`;
      const lines = wrapPdfText(line, columnWidth, 7.4);
      const height = Math.max(1, lines.length) * 8.4 + 3;
      if (y - height < layout.bottom) {
        column += 1;
        if (column >= columns) {
          page = newPage();
          drawPdfSectionTitle(page, layout, `Answer Key | ${paperCode}`);
          column = 0;
        }
        y = pdfBodyStartY(layout);
      }

      const x = layout.margin + column * (columnWidth + gap);
      lines.forEach(lineText => {
        drawPdfText(page, lineText, x, y, 7.4, "F1", "0.06 0.09 0.16");
        y -= 8.4;
      });
      y -= 3;
    });
  }

  function drawPdfSectionTitle(page, layout, title) {
    drawCenteredPdfText(page, title, layout.width / 2, layout.height - 30, 12.5, "F2", "0.11 0.30 0.70");
    page.ops.push(`0.82 0.86 0.91 RG 0.75 w ${layout.margin} 793 m ${(layout.width - layout.margin).toFixed(2)} 793 l S`);
  }

  function buildQuestionPdfBlock(question, number, columnWidth) {
    const parts = [];
    wrapPdfText(`${number}. ${question.q}`, columnWidth, 9.5).forEach(text => {
      parts.push({ text, size: 9.5, font: "F2", leading: 10.8 });
    });
    if (question.image) {
      parts.push({ text: "[Diagram/image available in app]", size: 7.6, font: "F3", leading: 8.9, color: "0.39 0.45 0.55" });
    }

    const optionLines = buildPdfOptionLines(question, columnWidth);
    optionLines.forEach(line => parts.push(line));
    const height = parts.reduce((sum, part) => sum + part.leading, 0) + 4;
    return { parts, height };
  }

  function buildPdfOptionLines(question, columnWidth) {
    const options = question.pdfOpts || question.opts;
    const optionTexts = options.map((option, index) => `${letters[index] || index + 1}. ${option}`);
    const lines = [];
    const halfWidth = (columnWidth - 10) / 2;

    for (let index = 0; index < optionTexts.length; index += 1) {
      const current = optionTexts[index];
      const next = optionTexts[index + 1];
      if (next && pdfTextWidth(current, 8.4) <= halfWidth && pdfTextWidth(next, 8.4) <= halfWidth) {
        lines.push({ pair: [current, next], size: 8.4, font: "F1", leading: 9.6 });
        index += 1;
      } else {
        wrapPdfText(current, columnWidth, 8.4).forEach(text => {
          lines.push({ text, size: 8.4, font: "F1", leading: 9.6 });
        });
      }
    }

    return lines;
  }

  function drawQuestionPdfBlock(page, block, x, y, columnWidth) {
    block.parts.forEach(part => {
      if (part.pair) {
        drawPdfText(page, part.pair[0], x, y, part.size, part.font, part.color || "0.06 0.09 0.16");
        drawPdfText(page, part.pair[1], x + (columnWidth + 10) / 2, y, part.size, part.font, part.color || "0.06 0.09 0.16");
      } else {
        drawPdfText(page, part.text, x, y, part.size, part.font, part.color || "0.06 0.09 0.16");
      }
      y -= part.leading;
    });
    return y;
  }

  function drawPdfFooter(page, layout, pageNumber) {
    page.ops.push("0.88 0.91 0.95 RG 0.5 w 246 25 m 349 25 l S");
    drawCenteredPdfText(page, `Page ${pageNumber}`, layout.width / 2, 16, 8.2, "F2", "0.39 0.45 0.55");
  }

  function pdfBodyStartY(layout) {
    return layout.height - layout.top - 17;
  }

  function drawCenteredPdfText(page, text, centerX, y, size, font, color) {
    const cleaned = cleanPdfText(text);
    drawPdfText(page, cleaned, centerX - pdfTextWidth(cleaned, size) / 2, y, size, font, color);
  }

  function drawPdfText(page, text, x, y, size, font = "F1", color = "0 0 0") {
    const cleaned = cleanPdfText(text);
    page.ops.push(`${color} rg BT /${font} ${size.toFixed(2)} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfString(cleaned)}) Tj ET`);
  }

  function wrapPdfText(text, maxWidth, size) {
    const words = cleanPdfText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach(word => {
      const trial = line ? `${line} ${word}` : word;
      if (pdfTextWidth(trial, size) <= maxWidth) {
        line = trial;
        return;
      }
      if (line) lines.push(line);
      if (pdfTextWidth(word, size) <= maxWidth) {
        line = word;
      } else {
        const chunks = breakPdfWord(word, maxWidth, size);
        lines.push(...chunks.slice(0, -1));
        line = chunks[chunks.length - 1] || "";
      }
    });

    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function breakPdfWord(word, maxWidth, size) {
    const chunks = [];
    let chunk = "";
    for (const char of word) {
      const trial = `${chunk}${char}`;
      if (pdfTextWidth(trial, size) <= maxWidth || !chunk) {
        chunk = trial;
      } else {
        chunks.push(chunk);
        chunk = char;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  function pdfTextWidth(text, size) {
    return cleanPdfText(text).split("").reduce((sum, char) => {
      if (char === " ") return sum + size * 0.25;
      if ("il.,'|!".includes(char)) return sum + size * 0.22;
      if ("mwMW@#%&".includes(char)) return sum + size * 0.78;
      if (/[A-Z0-9]/.test(char)) return sum + size * 0.54;
      return sum + size * 0.46;
    }, 0);
  }

  function finalizePdf(pages, layout) {
    const objects = [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>",
      "",
      "<< /Type /Catalog /Pages 4 0 R >>"
    ];
    const addObject = content => {
      objects.push(content);
      return objects.length;
    };
    const pageIds = [];

    pages.forEach(page => {
      const stream = page.ops.join("\n");
      const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 ${layout.width.toFixed(2)} ${layout.height.toFixed(2)}] /Resources << /Font << /F1 1 0 R /F2 2 0 R /F3 3 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    });

    objects[3] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n% SSC Quiz PDF\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets[index + 1] = pdf.length;
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 5 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return asciiBytes(pdf);
  }

  function escapePdfString(text) {
    return cleanPdfText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function cleanPdfText(text) {
    return String(text ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u20B9/g, "Rs")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
    return bytes;
  }

  function fileSafeName(value) {
    return cleanPdfText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "quiz";
  }

  function downloadDateLabel() {
    return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }

  function createReviewCard(item) {
    const question = item.question;
    const status = itemStatus(item);
    const originalOptions = question.originalOpts && question.originalOpts.length ? question.originalOpts : question.opts;
    const selectedText = unanswered(item.answer) ? "" : question.opts[item.answer];
    const originalNo = question.originalNo || (Number.isInteger(question.originalIndex) ? question.originalIndex + 1 : item.quizOrder);

    const card = document.createElement("article");
    card.className = `review-card status-${status}${item.marked ? " marked" : ""}`;

    const head = document.createElement("div");
    head.className = "review-card-head";
    const number = document.createElement("span");
    number.className = "review-number";
    number.textContent = `Q${originalNo}`;
    const pill = document.createElement("span");
    pill.className = `status-pill ${status}`;
    pill.textContent = status === "correct" ? "CORRECT +1" : status === "wrong" ? "WRONG -0.25" : "SKIPPED";
    head.append(number, pill);
    if (item.marked) {
      const marked = document.createElement("span");
      marked.className = "status-pill marked";
      marked.textContent = "MARKED";
      head.append(marked);
    }
    if (item.timeSpent) {
      const time = document.createElement("span");
      time.className = `status-pill ${item.timeSpent <= 25 ? "correct" : item.timeSpent <= 45 ? "marked" : "wrong"}`;
      time.textContent = `${item.timeSpent}s`;
      head.append(time);
    }
    card.append(head);

    if (question.tag) {
      const tag = document.createElement("span");
      tag.className = "review-tag";
      tag.textContent = question.tag;
      card.append(tag);
    }

    const title = document.createElement("h3");
    title.className = "review-question";
    title.textContent = question.q;
    card.append(title);

    if (question.image) {
      const media = document.createElement("div");
      media.className = "review-media";
      const img = document.createElement("img");
      img.src = question.image;
      img.alt = question.imageAlt || "Question diagram";
      media.append(img);
      card.append(media);
    }

    originalOptions.forEach((option, optionIndex) => {
      const row = document.createElement("div");
      row.className = "review-option neutral";
      const isCorrect = option === question.ansText;
      const isSelectedWrong = selectedText === option && status === "wrong";
      if (isCorrect) row.className = "review-option correct";
      if (isSelectedWrong) row.className = "review-option wrong";
      const optionLabel = document.createElement("span");
      optionLabel.className = "option-label";
      optionLabel.textContent = `${letters[optionIndex] || optionIndex + 1}.`;
      const optionText = document.createElement("span");
      optionText.className = "option-text";
      optionText.textContent = option;
      row.append(optionLabel, optionText);
      card.append(row);
    });

    if (question.why) {
      const why = document.createElement("div");
      why.className = "review-why";
      const icon = document.createElement("span");
      icon.className = "why-icon";
      icon.innerHTML = "&#128161;";
      const text = document.createElement("span");
      text.textContent = question.why;
      why.append(icon, text);
      card.append(why);
    }

    return card;
  }

  function startReviewPractice(type, sourceAttempt = null) {
    const parent = sourceAttempt || state.currentReviewAttempt;
    if (!parent) return;
    const sourceItems = ["mistakes", "quiet-mistakes"].includes(type)
      ? getAttemptItems(parent).filter(item => ["wrong", "skipped"].includes(itemStatus(item)))
      : getAttemptItems(parent);
    if (!sourceItems.length) return;
    state.userName = parent.name || state.userName || "Player";
    const sourceQuestions = sourceItems.map(item => ({
      ...cloneQuestion(item.question),
      previousAnswer: item.answer
    }));
    createAttempt(type === "reattempt" ? modes.reattempt : modes.mistakes, {
      sourceQuestions,
      saveToLeaderboard: false,
      reviewParentAttempt: state.currentReviewAttempt || parent,
      reviewType: type,
      suppressReviewResult: type === "quiet-mistakes"
    });
  }

  function backToLeaderboardHome() {
    el("username").value = "";
    state.userName = "";
    showView("start");
  }

  function appConfirm({ title = "Confirm", message = "", confirmText = "Continue", cancelText = "Cancel" } = {}) {
    return new Promise(resolve => {
      openDialog({ title, message, confirmText, cancelText, single: false, resolve });
    });
  }

  function appAlert({ title = "Notice", message = "", confirmText = "OK" } = {}) {
    return new Promise(resolve => {
      openDialog({ title, message, confirmText, cancelText: "", single: true, resolve: () => resolve(true) });
    });
  }

  function openDialog({ title, message, confirmText, cancelText, single, resolve }) {
    const dialog = el("app-dialog");
    state.dialogResolver = resolve;
    el("dialog-title").textContent = title;
    el("dialog-message").textContent = message;
    el("dialog-confirm").textContent = confirmText;
    el("dialog-cancel").textContent = cancelText;
    el("dialog-cancel").hidden = Boolean(single);
    el("dialog-actions").classList.toggle("single", Boolean(single));
    dialog.hidden = false;
    dialog.classList.add("open");
    dialog.setAttribute("aria-hidden", "false");
    el("dialog-confirm").focus();
  }

  function closeDialog(value) {
    const dialog = el("app-dialog");
    dialog.classList.remove("open");
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    const resolver = state.dialogResolver;
    state.dialogResolver = null;
    if (resolver) resolver(Boolean(value));
  }

  async function handleBrowserBack() {
    if (!state.historyReady) return;
    state.handlingPop = true;

    if (state.currentView === "quiz") {
      const leave = await appConfirm({
        title: "Leave this test?",
        message: isMainMode() ? "Your progress is saved. You can resume this test from the quiz page." : "This practice session result will not be saved.",
        confirmText: "Leave test"
      });
      if (leave) {
        if (isMainMode()) saveDraft();
        showView(state.reviewParentAttempt ? "review" : "start", { push: false });
      } else {
        pushAppHistory("quiz");
      }
      state.handlingPop = false;
      return;
    }

    if (state.currentView === "review") {
      showView(state.reviewReturnView || "start", { push: false });
      state.handlingPop = false;
      return;
    }

    if (state.currentView === "mode" || state.currentView === "result") {
      showView("start", { push: false });
      state.handlingPop = false;
      return;
    }

    state.handlingPop = false;
  }

  function attachEvents() {
    el("continue-btn").addEventListener("click", goToModeSelection);
    el("username").addEventListener("keydown", event => {
      if (event.key === "Enter") goToModeSelection();
    });
    el("resume-btn").addEventListener("click", resumeDraft);
    el("discard-resume-btn").addEventListener("click", discardDraft);

    el("rapid-card").addEventListener("click", () => {
      el("pro-panel").classList.remove("open");
      el("timer-panel").classList.toggle("open");
    });
    el("timer-panel").addEventListener("click", event => {
      const button = event.target.closest(".timer-choice");
      if (!button) return;
      state.rapidSeconds = Number(button.dataset.seconds) || defaultTimePerQuestion;
      confirmAndCreateAttempt(modes.rapid, { rapidSeconds: state.rapidSeconds });
    });
    el("practice-card").addEventListener("click", () => confirmAndCreateAttempt(modes.practice));
    el("practice-pro-card").addEventListener("click", () => {
      el("timer-panel").classList.remove("open");
      el("pro-panel").classList.toggle("open");
      renderPracticeProSetup();
    });
    el("pro-count-slider").addEventListener("input", event => setProCount(event.target.value));
    el("pro-timer-minus").addEventListener("click", () => changeProTimer(-1));
    el("pro-timer-plus").addEventListener("click", () => changeProTimer(1));
    el("pro-level-grid").addEventListener("click", event => {
      const button = event.target.closest(".level-chip");
      if (!button || button.disabled) return;
      setProLevel(button.dataset.level || "");
    });
    el("pro-start-btn").addEventListener("click", () => {
      confirmAndCreateAttempt(modes.pro, {
        count: state.pro.count,
        level: hasLevelData() ? state.pro.level : "",
        timerMinutes: state.pro.timerMinutes
      });
    });

    el("back-to-start").addEventListener("click", () => showView("start"));
    el("prev-btn").addEventListener("click", prevQuestion);
    el("next-btn").addEventListener("click", nextQuestion);
    el("rapid-skip-btn").addEventListener("click", skipRapidQuestion);
    el("mark-review-btn").addEventListener("click", toggleMarkForReview);
    el("mark-nav-btn").addEventListener("click", toggleMarkForReview);
    el("palette-toggle").addEventListener("click", openPalette);
    el("palette-close").addEventListener("click", closePalette);
    el("palette-backdrop").addEventListener("click", closePalette);
    el("palette-submit").addEventListener("click", submitPractice);
    el("clear-history").addEventListener("click", clearLeaderboard);
    el("review-result").addEventListener("click", () => {
      if (state.lastAttempt) renderReview(state.lastAttempt, "result");
    });
    el("back-leaderboard").addEventListener("click", backToLeaderboardHome);
    el("retake-quiz").addEventListener("click", () => {
      el("timer-panel").classList.remove("open");
      el("pro-panel").classList.remove("open");
      showView("mode");
    });
    el("close-review").addEventListener("click", () => showView(state.reviewReturnView));
    el("review-filters").addEventListener("click", event => {
      const button = event.target.closest(".filter-button");
      if (!button || !state.currentReviewAttempt) return;
      renderReview(state.currentReviewAttempt, state.reviewReturnView, button.dataset.filter || "all");
    });
    el("dialog-confirm").addEventListener("click", () => closeDialog(true));
    el("dialog-cancel").addEventListener("click", () => closeDialog(false));
    window.addEventListener("popstate", () => {
      handleBrowserBack();
    });
  }

  attachEvents();
  loadQuiz();
})();
