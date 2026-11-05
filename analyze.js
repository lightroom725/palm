// 손금 사진을 받아 Claude에게 손금 위치와 모양을 분석시키는 서버 함수 (Vercel)
// 필요 환경 변수: ANTHROPIC_API_KEY  (선택: ANTHROPIC_MODEL)

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // base64 해제 후 3MB까지

const LINE_SPEC = `- life (생명선, 엄지와 검지 사이에서 시작해 엄지 뿌리를 감싸며 손목 쪽으로 내려가는 선): type one of "long"=길고 깊음, "short"=짧음, "broken"=중간에 끊김, "wide"=넓게 휘어짐
- head (두뇌선, 생명선 시작점 근처에서 손바닥을 가로지르는 선): type one of "straight"=길고 곧음, "curved"=아래로 휘어짐, "short"=짧음, "separated"=생명선과 떨어져 시작
- heart (감정선, 새끼손가락 아래에서 시작해 검지·중지 쪽으로 뻗는 가장 위쪽의 가로선): type one of "index"=검지까지 길게, "middle"=중지 아래에서 끝남, "short"=곧고 짧음, "forked"=끝이 갈라짐
- fate (운명선, 손목 쪽에서 중지 방향으로 손바닥 가운데를 세로로 올라가는 선): type one of "clear"=뚜렷하고 길게, "middle"=중간부터 시작, "faint"=희미하거나 없음, "broken"=여러 번 끊김`;

function anchorText(anchors) {
  if (!anchors) return "";
  const names = {
    wrist: "center of the wrist", thumb_base: "base of the thumb (near the wrist)", thumb_knuckle: "thumb knuckle",
    index_base: "index finger base knuckle", middle_base: "middle finger base knuckle",
    ring_base: "ring finger base knuckle", pinky_base: "pinky finger base knuckle",
  };
  const rows = Object.keys(names).filter(k => anchors[k]).map(k => `- ${k} (${names[k]}): [${anchors[k][0]}, ${anchors[k][1]}]`).join("\n");
  return `
Hand landmarks detected by a separate hand-tracking model (same coordinate system, trust these):
${rows}
The thumb is on the ${anchors.thumb_side} side of the image.

Use the landmarks to orient yourself:
- heart: the highest major crease on the palm, just below the finger bases. Starts at the pinky-side edge of the palm, a little below pinky_base, and runs across toward the area below index_base / middle_base.
- head: starts at the palm edge between the thumb and the index finger (between index_base and thumb_knuckle, roughly a third of the way down toward the wrist), runs across the middle of the palm toward the pinky side, below the heart line.
- life: starts at (or very near) the same point as the head line, then arcs around the fleshy base of the thumb and runs down toward the wrist on the thumb side. It stays between the thumb mound and the center of the palm.
- fate: runs roughly vertically up the center of the palm, from near the wrist toward middle_base.
Never put a line on the fingers, beyond the wrist, or outside the hand.`;
}

function buildPrompt(hand, anchors) {
  return `You are a careful palm-reading assistant. The attached image shows a ${hand} hand palm (it may be cropped to the palm).
A thin cyan grid is drawn on the image: lines at every 0.1, labeled .1 to .9 along the top edge (x) and the left edge (y). Use the grid to read positions precisely. The grid is not a palm line.

Coordinates: normalized to this image, x from 0 (left edge) to 1 (right edge), y from 0 (top edge) to 1 (bottom edge).
${anchorText(anchors)}

Task: decide if the image clearly shows an open palm. Then find the four major palm lines and trace each one as a polyline that follows the visible dark crease on the skin as precisely as you can. Give 8 to 14 points per line, ordered from where the line starts to where it ends, each point on the crease itself.

Lines and the allowed type keys:
${LINE_SPEC}

If the fate line is not visible, set "present": false, type "faint", and give your best estimate of where it would run (still 2+ points).

Reply with ONLY this JSON, no other text. Write "observations" first: briefly describe, using grid cells, where you see each crease before giving coordinates.
{"observations": "<English, a few sentences>",
 "is_palm": true|false, "reason": "<Korean, only if is_palm is false>",
 "lines": {
   "life":  {"present": true, "type": "<key>", "points": [[x,y],...], "comment": "<1 short Korean sentence describing what you see on this line>"},
   "head":  {...}, "heart": {...}, "fate": {...}
 },
 "summary": "<2 warm Korean sentences: an overall palm-reading impression of this hand, playful and positive>"}`;
}

function cleanAnchors(a) {
  if (!a || typeof a !== "object") return null;
  const keys = ["wrist", "thumb_base", "thumb_knuckle", "index_base", "middle_base", "ring_base", "pinky_base"];
  const out = {};
  for (const k of keys) {
    const p = a[k];
    if (!Array.isArray(p) || p.length !== 2 || !p.every(n => typeof n === "number" && n > -0.5 && n < 1.5)) return null;
    out[k] = [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
  }
  out.thumb_side = a.thumb_side === "left" ? "left" : "right";
  return out;
}

// 아주 간단한 IP별 사용량 제한 (서버 인스턴스마다 따로 셈 — 완벽하지 않음)
const hits = new Map();
const LIMIT_PER_10MIN = Number(process.env.RATE_LIMIT_PER_10MIN || 10);
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > LIMIT_PER_10MIN;
}

function extractJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no json");
  return JSON.parse(text.slice(a, b + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 사용할 수 있어요." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "서버에 API 키가 설정되지 않았어요." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "잠시 후 다시 시도해 주세요." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { image, hand } = body || {};
  const anchors = cleanAnchors(body && body.anchors);
  if (typeof image !== "string" || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200)))
    return res.status(400).json({ error: "사진 데이터가 올바르지 않아요." });
  if (image.length * 0.75 > MAX_IMAGE_BYTES)
    return res.status(413).json({ error: "사진이 너무 커요." });
  const handEn = hand === "left" ? "left" : "right";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: buildPrompt(handEn, anchors) },
          ],
        }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Anthropic API error", r.status, data);
      const status = r.status === 429 ? 429 : 502;
      return res.status(status).json({ error: status === 429 ? "잠시 후 다시 시도해 주세요." : "AI 분석 서버에 문제가 생겼어요." });
    }
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    const result = extractJson(text);
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "분석 결과를 읽지 못했어요. 다시 시도해 주세요." });
  }
}
