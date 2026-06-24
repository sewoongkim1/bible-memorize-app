// verses.json → reminders.ics (구독용 캘린더) 생성기
// 스케줄을 바꾸려면 아래 상수만 고치고 `node tools/build-ics.js` 다시 실행.
const fs = require("fs");

// ===== 스케줄 설정 (여기만 고치면 됨) =====
const REMIND_HOUR = 7;   // 매일 알림 시각 (현지 시간, 0~23)
const REMIND_MIN = 0;    // 분
const DAYS_PER_WEEK = 7; // 한 주에 며칠 알림 (7=매일, 1=일요일만)
const DURATION_MIN = 15; // 일정 길이(분)
const TOTAL_WEEKS = 52;  // 전체 주차 (구절 미등록 주는 일반 알림으로 채움)
// =========================================

const APP_URL = "https://sewoongkim1.github.io/bible-memorize-app/";
const data = JSON.parse(fs.readFileSync("verses.json", "utf8"));
const verses = (data.verses || []).slice().sort((a, b) => a.no - b.no);
const byNo = {};
verses.forEach((v) => (byNo[v.no] = v));

// 1회차 일요일(KST) 기준일 구하기
function kstParts(iso) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso)); // "2026-01-04"
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
let base;
if (verses[0] && verses[0].date) {
  const p = kstParts(verses[0].date);
  base = Date.UTC(p.y, p.m - 1, p.d);
} else {
  base = Date.UTC(2026, 0, 4); // 폴백: 2026-01-04(일)
}

// 회차 → 그 주 일요일 YYYYMMDD
function ymd(no) {
  const d = new Date(base + (no - 1) * 7 * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function esc(s) {
  return String(s || "")
    .replace(/[\\;,]/g, (m) => "\\" + m)
    .replace(/\r?\n/g, "\\n");
}
const pad = (n) => String(n).padStart(2, "0");
const start = `${pad(REMIND_HOUR)}${pad(REMIND_MIN)}00`;
const endTotal = REMIND_HOUR * 60 + REMIND_MIN + DURATION_MIN;
const end = `${pad(Math.floor(endTotal / 60))}${pad(endTotal % 60)}00`;

const lines = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//고척교회 제자양육부//말씀 암송 리마인드//KO",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:말씀 한 절 암송 리마인드",
  "X-WR-TIMEZONE:Asia/Seoul",
  "REFRESH-INTERVAL;VALUE=DURATION:P1D",
  "X-PUBLISHED-TTL:P1D",
];

let real = 0;
let placeholder = 0;
for (let no = 1; no <= TOTAL_WEEKS; no++) {
  const v = byNo[no];
  const day = ymd(no);
  let summary, desc;
  if (v && v.text) {
    // 구절 등록된 주 → 실제 구절
    real++;
    summary = esc(`📖 ${v.sermonTitle || "오늘의 암송"} (${v.refShort})`);
    desc = esc(
      `${v.text}\n\n— ${v.refFull || v.refShort}\n` +
        `📺 설교 영상: ${APP_URL}go/?no=${no}\n` +
        `📝 암송 테스트: ${APP_URL}`
    );
  } else {
    // 미등록 주 → 일반 알림 (구절 등록되면 다음 갱신 때 자동 교체)
    placeholder++;
    summary = esc(`📖 이번 주 암송 구절을 확인하세요`);
    desc = esc(`이번 주 암송 구절을 확인하고 암송해 보세요.\n\n암송 테스트: ${APP_URL}`);
  }
  lines.push(
    "BEGIN:VEVENT",
    `UID:week-${no}@bible-memorize-app`,
    "DTSTAMP:20260101T000000Z",
    // 부동(floating) 로컬 시간 → 사용자 폰의 현지 시간 기준으로 표시
    `DTSTART:${day}T${start}`,
    `DTEND:${day}T${end}`,
    `RRULE:FREQ=DAILY;COUNT=${DAYS_PER_WEEK}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:오늘의 암송 구절",
    "TRIGGER:-PT0M",
    "END:VALARM",
    "END:VEVENT"
  );
}
lines.push("END:VCALENDAR");

fs.writeFileSync("reminders.ics", lines.join("\r\n") + "\r\n");
console.log(`reminders.ics 생성: 총 ${TOTAL_WEEKS}주 (실제 구절 ${real}주 + 일반 알림 ${placeholder}주)`);
