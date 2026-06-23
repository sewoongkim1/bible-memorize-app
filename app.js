// ============================================================
// 성경 암송 온라인 테스트 — app.js
// ============================================================

// ★ 2단계에서 배포한 Apps Script 웹 앱 URL로 교체하세요
const API_URL = "https://script.google.com/macros/s/AKfycbzO4GDAy0hJBbZ-L3hVuZQI4cqnjiZdy2afUujnxmmAr8NAh1lJURhrfT37PaFanPR4PA/exec";

let verses = []; // API에서 받아온 26개 구절 데이터

// ------------------------------------------------------------
// 데이터 로드
// ------------------------------------------------------------
async function loadVerses() {
  const listEl = document.getElementById("verse-list");
  listEl.innerHTML = "<p>불러오는 중...</p>";

  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    if (data.error) {
      listEl.innerHTML = `<p class="error">오류: ${data.error}</p>`;
      return;
    }

    verses = data.verses;
    renderVerseList(verses);
  } catch (err) {
    listEl.innerHTML = `<p class="error">연결 실패: ${err.message}</p>`;
  }
}

// API의 일자는 ISO UTC 문자열(예: "2026-01-03T15:00:00.000Z")로 오므로
// 한국시간 기준 날짜로 변환해 표시한다.
function formatDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ------------------------------------------------------------
// 진행 상태 저장 (localStorage)
//   key: "memorize-progress"
//   value: { "1": { stage: 2, passed: true }, ... }
//     - stage: 해당 구절에서 통과한 '최고' 단계 (0=미시도, 1~3)
// ------------------------------------------------------------
const PROGRESS_KEY = "memorize-progress";

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {}; // 손상된 데이터는 무시하고 초기화
  }
}

function saveProgress(no, stage) {
  const progress = loadProgress();
  const prev = progress[no]?.stage || 0;
  // 더 높은 단계를 통과했을 때만 갱신 (복습으로 낮은 단계를 다시 해도 후퇴 안 함)
  if (stage > prev) {
    progress[no] = { stage, passed: true };
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      /* 저장 실패(시크릿 모드 등)는 무시 */
    }
  }
}

// 해당 구절에서 통과한 최고 단계 (0~3)
function getPassedStage(no) {
  return loadProgress()[no]?.stage || 0;
}

// 진행 상태 표시용 정보 (목록 카드 배지)
const STATUS_LABEL = {
  0: { cls: "status-none", text: "미시도" },
  1: { cls: "status-s1", text: "1단계 완료" },
  2: { cls: "status-s2", text: "2단계 완료" },
  3: { cls: "status-done", text: "암송 완료 🙌" },
};

// ------------------------------------------------------------
// 화면 1: 구절 목록
// ------------------------------------------------------------
function renderVerseList(verseArr) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <h1>오직 말씀(Sola Scriptura), 오직 은혜(Sola Gratia)</h1>
    <div id="verse-list" class="verse-grid"></div>
  `;

  const listEl = document.getElementById("verse-list");
  listEl.innerHTML = "";

  // 마지막 회차부터(최신 주차 → 1주차 순) 보여준다. 원본 배열은 보존.
  [...verseArr].reverse().forEach((v) => {
    const passed = getPassedStage(v.no);
    const status = STATUS_LABEL[passed];

    const card = document.createElement("div");
    card.className = `verse-card ${status.cls}`;
    card.innerHTML = `
      <div class="verse-no">${String(v.no).padStart(2, "0")}</div>
      <div class="verse-ref">${v.refShort}</div>
      <div class="verse-hint">${v.hintText || ""}</div>
      <div class="verse-status ${status.cls}">${status.text}</div>
    `;
    card.addEventListener("click", () => startTest(v));
    listEl.appendChild(card);
  });
}

// ------------------------------------------------------------
// 화면 2: 테스트 시작
// ------------------------------------------------------------
function startTest(verse) {
  // 이미 통과한 단계가 있으면 그 다음 단계부터 이어서 시작.
  // 3단계까지 끝낸 구절은 1단계부터 복습.
  const passed = getPassedStage(verse.no);
  const startStage = passed >= 3 ? 1 : passed + 1;
  renderTestScreen(verse, startStage);
}

function renderTestScreen(verse, stage) {
  const appEl = document.getElementById("app");
  const tokens = verse.text.trim().split(/\s+/);

  // 단계별 빈칸 비율: 1단계 25%, 2단계 65%, 3단계 100%
  const blankRatio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const blankFlags = pickBlankIndices(tokens, blankRatio);

  const blanks = []; // 정답 단어 모음 (인덱스 추적용)
  const wordsHtml = tokens
    .map((word, i) => {
      if (blankFlags[i]) {
        const blankIndex = blanks.length;
        blanks.push(word);
        // 빈칸은 단어 단위 input 1개 (한글 IME 조합에 안정적).
        // 글자 수에 맞춰 너비를 잡아 길이 힌트를 준다.
        const width = Array.from(word).length + 1;
        return `<input class="word-input" data-blank="${blankIndex}" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${width}em" />`;
      } else {
        return `<span class="word-fixed">${word}</span>`;
      }
    })
    .join(" ");

  // 정답 보기용: 빈칸이었던 단어는 강조해서 보여준다.
  const answerHtml = tokens
    .map((word, i) =>
      blankFlags[i] ? `<strong class="ans-word">${word}</strong>` : word
    )
    .join(" ");

  appEl.innerHTML = `
    <button class="back-btn" id="back-to-list-btn">← 목록</button>
    <div class="test-card">
      <div class="test-stage">${stage}단계</div>
      <div class="test-ref">${verse.refShort}</div>
      <div class="test-sentence">${wordsHtml}</div>
      <button class="answer-btn" id="show-answer-btn">정답 보기</button>
      <div id="answer-panel" class="answer-panel" hidden>
        <div class="answer-title">정답</div>
        <div class="answer-text">${answerHtml}</div>
        <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
      </div>
      <div id="result-area"></div>
    </div>
  `;

  document
    .getElementById("back-to-list-btn")
    .addEventListener("click", () => renderVerseList(verses));

  setupAnswerToggle();
  setupAutoCheck(verse, stage);
}

// 정답 보기 / 돌아가기 토글. 입력하던 내용은 그대로 유지된다(재렌더 없음).
function setupAnswerToggle() {
  const showBtn = document.getElementById("show-answer-btn");
  const backBtn = document.getElementById("back-to-test-btn");
  const panel = document.getElementById("answer-panel");

  showBtn.addEventListener("click", () => {
    panel.hidden = false;
    showBtn.hidden = true;
  });

  backBtn.addEventListener("click", () => {
    panel.hidden = true;
    showBtn.hidden = false;
    // 아직 못 채운 빈칸으로 포커스를 돌려준다.
    const next = document.querySelector(".word-input:not([disabled])");
    if (next) next.focus();
  });
}

// 본문 토큰 중 빈칸으로 만들 인덱스를 고른다.
// 글자 수가 긴 단어(핵심 단어일 가능성이 높음)를 우선으로 선정한다.
function pickBlankIndices(tokens, ratio) {
  const flags = new Array(tokens.length).fill(false);

  const candidates = tokens
    .map((word, i) => ({ i, len: word.length }))
    .sort((a, b) => b.len - a.len); // 긴 단어부터 우선

  const targetCount = Math.max(1, Math.round(tokens.length * ratio));
  candidates.slice(0, targetCount).forEach((c) => {
    flags[c.i] = true;
  });

  return flags;
}

// ------------------------------------------------------------
// 자동 채점: 글자 입력 즉시 맞으면 다음 칸으로, 틀리면 그 자리에서 재입력
// ------------------------------------------------------------
function setupAutoCheck(verse, stage) {
  const inputs = Array.from(document.querySelectorAll(".word-input"));

  // 단어 한 개를 채점한다.
  //   isComposing: 지금 한글 조합이 진행 중인지 여부
  // 한글은 마지막 음절을 쳐도 조합이 '확정'되기 전엔 compositionend가
  // 안 오므로, 조합 중이라도 현재 값이 정답과 같아지면 바로 통과시킨다.
  function evaluate(input, idx, isComposing) {
    if (input.disabled) return;
    const val = input.value.trim();
    const answer = input.dataset.answer;

    if (val === answer) {
      // 정답: 초록 표시 + 잠금 + 다음 빈칸으로 이동
      // (조합 도중 disabled로 글자가 사라지지 않도록 값을 확정해 둔다)
      input.value = answer;
      input.classList.add("correct");
      input.classList.remove("wrong");
      input.disabled = true;

      const next = inputs.slice(idx + 1).find((inp) => !inp.disabled);
      if (next) {
        next.focus();
      } else {
        checkAllComplete(inputs, verse, stage);
      }
    } else if (!isComposing && Array.from(val).length >= Array.from(answer).length) {
      // 조합이 끝났고 글자 수도 다 채웠는데 틀림: 빨강+흔들림 후 비우고 재입력
      input.classList.add("wrong");
      input.classList.remove("correct");
      setTimeout(() => {
        // 한글 IME가 켜져 있으면 value="" 만으로는 조합 버퍼가 남아
        // 칸이 완전히 비워지지 않으므로, blur로 IME 세션을 먼저 끝낸다.
        input.blur();
        input.value = "";
        input.classList.remove("wrong");
        input.focus();
      }, 400);
    }
    // 아직 입력/조합 중이면 아무 표시도 하지 않는다.
  }

  inputs.forEach((input, idx) => {
    let composing = false;

    input.addEventListener("compositionstart", () => {
      composing = true;
    });
    input.addEventListener("compositionend", () => {
      composing = false;
      evaluate(input, idx, false);
    });
    input.addEventListener("input", (e) => {
      // 조합 중이라도 정답이면 통과시키되, 오답 판정은 조합이 끝난 뒤에만.
      evaluate(input, idx, composing || e.isComposing);
    });
  });

  if (inputs[0]) inputs[0].focus();
}

function checkAllComplete(inputs, verse, stage) {
  const allCorrect = inputs.every((inp) => inp.classList.contains("correct"));
  if (!allCorrect) return;

  const accuracy = 100; // 모든 칸을 맞춰야 완료 처리되므로 항상 100
  const passThreshold = stage === 3 ? 90 : 80;
  const passed = accuracy >= passThreshold;

  // 통과한 단계를 진행 상태에 저장
  if (passed) saveProgress(verse.no, stage);

  const resultEl = document.getElementById("result-area");
  resultEl.innerHTML = `
    <div class="result-score">${accuracy}%</div>
    <div class="result-label">${passed ? "통과! 🎉" : "다시 도전해보세요"}</div>
    <div class="result-actions">
      ${
        passed && stage < 3
          ? `<button class="next-btn" id="next-stage-btn">${stage + 1}단계로</button>`
          : passed && stage === 3
          ? `<div class="complete-badge">암송 완료 🙌</div>
             <a class="sermon-link" href="${verse.url}" target="_blank">설교 보러가기 — ${verse.sermonTitle}</a>`
          : `<button class="next-btn" id="retry-btn">다시 시도</button>`
      }
    </div>
  `;

  if (passed && stage < 3) {
    document
      .getElementById("next-stage-btn")
      .addEventListener("click", () => renderTestScreen(verse, stage + 1));
  } else if (!passed) {
    document
      .getElementById("retry-btn")
      .addEventListener("click", () => renderTestScreen(verse, stage));
  }
}

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
loadVerses();