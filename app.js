// ============================================================
// 성경 암송 온라인 테스트 — app.js
// ============================================================

// 데이터는 사이트에 저장된 정적 파일(verses.json)에서 읽는다.
// 이 파일은 GitHub Actions가 주 1회 시트에서 자동 갱신한다.
// (verses.json을 못 읽을 때만 아래 시트 API로 폴백)
const DATA_URL = "verses.json";
const API_URL = "https://script.google.com/macros/s/AKfycbzO4GDAy0hJBbZ-L3hVuZQI4cqnjiZdy2afUujnxmmAr8NAh1lJURhrfT37PaFanPR4PA/exec";

let verses = []; // 화면에 쓰는 구절 데이터

// ------------------------------------------------------------
// 데이터 로드
// ------------------------------------------------------------
async function loadVerses() {
  const listEl = document.getElementById("verse-list");
  listEl.innerHTML = "<p>불러오는 중...</p>";

  // 1순위: 사이트에 저장된 verses.json, 실패 시 2순위: 시트 API
  for (const url of [DATA_URL, API_URL]) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.verses || !data.verses.length) throw new Error("데이터 없음");

      verses = data.verses;
      renderVerseList(verses);
      return;
    } catch (err) {
      // verses.json 실패면 조용히 API로 폴백, 둘 다 실패면 오류 표시
      if (url === API_URL) {
        listEl.innerHTML = `<p class="error">연결 실패: ${err.message}</p>`;
      }
    }
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
    <span class="page-title">오직 성경(Sola Scriptura), 오직 은혜(Sola Gratia)</span>
    <a class="remind-cta" href="reminders.html">🔔 매일 암송 구절 알림 받기</a>
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
      <button class="card-listen" aria-label="${v.refShort} 듣기" title="듣기">🔊</button>
    `;
    card.addEventListener("click", () => startTest(v));
    // 듣기 버튼: 카드 클릭(테스트 시작)으로 번지지 않게 막고 본문을 읽어준다.
    // 빠르게 N번 클릭하면 N번 반복해서 읽어준다(2번 클릭 → 2번 듣기).
    const listenBtn = card.querySelector(".card-listen");
    let clickCount = 0;
    let clickTimer = null;
    listenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clickCount++;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        speakText(`${v.refFull}. ${v.text}`, null, clickCount);
        clickCount = 0;
      }, 350); // 350ms 안에 연속 클릭한 횟수만큼 반복
    });
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

  // 단계 위에 해당 구절의 설교 영상 링크를 배치
  const sermonBanner = verse.url
    ? `<a class="sermon-banner" href="${verse.url}" target="_blank" rel="noopener">
         <span class="sermon-banner-icon">▶</span>
         <span class="sermon-banner-text">
           <span class="sermon-banner-title">${verse.sermonTitle || "설교 영상 보기"}</span>
         </span>
       </a>`
    : "";

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage">${stage}단계</div>
            <div class="test-ref">${verse.refShort}</div>
          </div>
          <button class="back-btn" id="back-to-list-btn">← 목록</button>
        </div>
        <div class="test-sentence">${wordsHtml}</div>
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">정답 보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송 시작</button>
        </div>
        <div id="result-area"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>

        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>

        ${sermonBanner}
      </div>
    </div>
  `;

  document
    .getElementById("back-to-list-btn")
    .addEventListener("click", () => { stopSpeaking(); renderVerseList(verses); });

  // 정답 듣기(TTS): 출처 + 본문을 음성으로 읽어준다. (토글: 재생 중 누르면 정지)
  const listenAnsBtn = document.getElementById("listen-answer-btn");
  if (listenAnsBtn) {
    listenAnsBtn.addEventListener("click", () => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        stopSpeaking();
        listenAnsBtn.textContent = "🔊 듣기";
        return;
      }
      listenAnsBtn.textContent = "⏹ 정지";
      speakText(`${verse.refFull}. ${verse.text}`, () => {
        listenAnsBtn.textContent = "🔊 듣기";
      });
    });
  }

  setupAnswerToggle();
  setupAutoCheck(verse, stage);
  setupVoice(verse);
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

// ------------------------------------------------------------
// 음성 암송: 마이크로 구절을 말하면 본문과 비교해 정확도(%)를 매긴다.
// 통과 기준: 단어 일치율 90% 이상 → 암송 완료(3단계)로 저장
// ------------------------------------------------------------
const VOICE_PASS = 90;

// 채점용: 한글/영문/숫자만 남기고 단어 배열로
function normalizeWords(s) {
  return String(s || "")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// 말한 내용과 정답 단어를 LCS(최장 공통 부분수열)로 맞춰
// 맞은 단어 표시 + 정확도(%) 계산. (반복 단어가 있어도 정확히 정렬)
function scoreSpoken(answerText, spokenText) {
  const ans = normalizeWords(answerText);
  const said = normalizeWords(spokenText);
  const n = ans.length;
  const m = said.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        ans[i - 1] === said[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // 역추적: 정답 단어 중 LCS에 포함된(=맞은) 단어 표시
  const marks = new Array(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (ans[i - 1] === said[j - 1]) { marks[i - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const accuracy = n ? Math.round((dp[n][m] / n) * 100) : 0;
  return { accuracy, marks, ansWords: ans };
}

function setupVoice(verse) {
  const toggleBtn = document.getElementById("voice-toggle");
  const panel = document.getElementById("voice-panel");
  const statusEl = document.getElementById("voice-status");
  const liveEl = document.getElementById("voice-live");
  const resultEl = document.getElementById("voice-result");

  const ua = navigator.userAgent || "";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // 카카오톡 내장 브라우저: 마이크·음성인식 차단 → 외부 브라우저 안내
  if (/KAKAOTALK/i.test(ua)) {
    toggleBtn.addEventListener("click", () => {
      resultEl.innerHTML =
        `<div class="voice-msg">카카오톡 브라우저에서는 음성 암송이 동작하지 않습니다.<br>아래 버튼으로 크롬·사파리에서 열어 사용해 주세요.</div>
         <a class="voice-btn" id="voice-ext" style="margin-top:10px;" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">🔗 외부 브라우저로 열기</a>`;
    });
    return;
  }

  if (!SR) {
    toggleBtn.addEventListener("click", () => {
      resultEl.innerHTML =
        `<div class="voice-msg">이 브라우저는 음성인식을 지원하지 않습니다.<br>크롬(안드로이드·PC)·사파리에서 이용하거나 타이핑으로 암송해 주세요.</div>`;
    });
    return;
  }

  let rec = null;
  let finalText = "";
  let stopped = false; // 사용자가 '암송 종료'를 눌렀는지
  let running = false;

  // 토글 버튼 상태 전환 (시작 ↔ 종료)
  function setRunning(on) {
    running = on;
    panel.hidden = !on;
    if (on) {
      toggleBtn.textContent = "■ 암송 종료";
      toggleBtn.classList.remove("voice-btn");
      toggleBtn.classList.add("voice-stop");
    } else {
      toggleBtn.textContent = "🎤 암송 시작";
      toggleBtn.classList.remove("voice-stop");
      toggleBtn.classList.add("voice-btn");
    }
  }

  function evaluateAndShow() {
    const { accuracy, marks, ansWords } = scoreSpoken(verse.text, finalText);
    const wordsHtml = ansWords
      .map((w, i) => `<span class="${marks[i] ? "v-ok" : "v-no"}">${w}</span>`)
      .join(" ");
    const passed = accuracy >= VOICE_PASS;
    if (passed) saveProgress(verse.no, 3); // 전체 암송 성공 → 완료 저장

    resultEl.innerHTML = `
      <div class="voice-summary"><span class="voice-pct ${passed ? "pass" : "fail"}">${accuracy}%</span> ${passed ? "음성 암송 통과! 🎉" : `조금 더! (통과 ${VOICE_PASS}%)`}</div>
      <div class="voice-words">${wordsHtml}</div>
      <div class="voice-heard">들린 내용: ${finalText ? finalText : "(인식 안 됨)"}</div>
    `;
  }

  // 인식 세션 하나 생성. 종료를 안 눌렀으면 자동으로 다시 시작해 계속 듣는다.
  function newSession() {
    const r = new SR();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = true;

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      liveEl.textContent = (finalText + interim).trim();
    };
    r.onerror = (e) => {
      // 권한/마이크 문제는 중단, 침묵(no-speech) 등은 자동 재시작 대상
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        stopped = true;
        statusEl.textContent = "마이크 권한이 필요합니다. 브라우저에서 마이크를 허용해 주세요.";
      }
    };
    r.onend = () => {
      if (!stopped) {
        // 종료를 안 눌렀으면 계속 듣기 (브라우저가 침묵 등으로 끊어도 재시작)
        try { rec = newSession(); rec.start(); return; } catch (e) {}
      }
      setRunning(false);
      evaluateAndShow();
    };
    return r;
  }

  toggleBtn.addEventListener("click", () => {
    if (!running) {
      // 시작
      finalText = "";
      stopped = false;
      resultEl.innerHTML = "";
      liveEl.textContent = "";
      statusEl.innerHTML = "🎙️ 듣고 있어요… 다 외우면 <b>‘암송 종료’</b>를 누르세요";
      setRunning(true);
      try {
        rec = newSession();
        rec.start();
      } catch (err) {
        setRunning(false);
        statusEl.textContent = "음성인식을 시작할 수 없습니다.";
      }
    } else {
      // 종료
      stopped = true;
      if (rec) rec.stop();
    }
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
    ${
      passed && stage < 3
        ? `<button class="next-btn" id="next-stage-btn">${stage + 1}단계로</button>`
        : passed && stage === 3
        ? `<div class="complete-badge">암송 완료 🙌</div>`
        : `<button class="next-btn" id="retry-btn">다시 시도</button>`
    }
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
// 음성 합성(TTS) — 구절을 한국어로 읽어준다(설치·권한 불필요)
// ------------------------------------------------------------
const SPEAK_RATE = 0.7; // 읽기 속도(낮을수록 느림)

// text 를 times 번 연속해서 읽어준다. (빠르게 N번 클릭하면 N번 반복)
function speakText(text, onEnd, times = 1) {
  if (!("speechSynthesis" in window)) {
    alert("이 브라우저는 읽어주기(음성 합성)를 지원하지 않습니다.\n크롬·사파리에서 이용해 주세요.");
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel(); // 중복 재생 방지
  const n = Math.max(1, times);
  for (let i = 0; i < n; i++) {
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = "ko-KR";
    ut.rate = SPEAK_RATE;
    ut.pitch = 1;
    if (onEnd && i === n - 1) {
      ut.onend = onEnd;
      ut.onerror = onEnd;
    }
    window.speechSynthesis.speak(ut); // speak 는 큐에 쌓이므로 순서대로 N번 재생
  }
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
loadVerses();