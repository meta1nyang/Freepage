// api/pages.js
// POST /api/pages
// 새 페이지를 만들어 저장하고, 짧은 공유 ID와 비공개 편집 토큰을 발급합니다.
const crypto = require('crypto');
const { redisSet, redisExists } = require('../lib/redis');

const MAX_ELEMENTS = 60;
const MAX_BODY_BYTES = 300 * 1024; // 페이지 하나당 최대 300KB (이미지는 되도록 URL로!)
const DEFAULT_CANVAS_WIDTH = 400;
const DEFAULT_CANVAS_HEIGHT = 900;

function generateId(byteLength) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function generateEditToken() {
  return crypto.randomBytes(24).toString('base64url');
}

async function findAvailableId() {
  // 아주 낮은 확률의 충돌에도 대비해 몇 번 재시도하고, 그래도 안 되면 길이를 늘려요.
  for (let i = 0; i < 6; i++) {
    const id = generateId(i < 4 ? 5 : 6);
    const exists = await redisExists(`page:${id}`);
    if (!exists) return id;
  }
  throw new Error('페이지 ID를 생성하지 못했어요. 다시 시도해주세요.');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validatePayload(body) {
  if (!isPlainObject(body)) return '요청 형식이 올바르지 않아요.';
  if (!Array.isArray(body.elements)) return 'elements는 배열이어야 해요.';
  if (body.elements.length > MAX_ELEMENTS) return `요소는 최대 ${MAX_ELEMENTS}개까지 추가할 수 있어요.`;
  if (typeof body.title !== 'string') return 'title은 문자열이어야 해요.';
  if (!isPlainObject(body.background)) return 'background 정보가 필요해요.';
  if (typeof body.customCSS !== 'string') return 'customCSS는 문자열이어야 해요.';
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원해요.' });
  }

  try {
    const body = req.body || {};
    const rawSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (rawSize > MAX_BODY_BYTES) {
      return res.status(413).json({ error: '페이지 데이터가 너무 커요. 이미지는 되도록 URL로 넣어주세요.' });
    }

    const validationError = validatePayload(body);
    if (validationError) return res.status(400).json({ error: validationError });

    const id = await findAvailableId();
    const editToken = generateEditToken();
    const now = new Date().toISOString();

    const pageData = {
      id,
      editToken,
      title: body.title.slice(0, 100),
      background: body.background,
      elements: body.elements,
      customCSS: body.customCSS.slice(0, 20000),
      canvasWidth: Number(body.canvasWidth) || DEFAULT_CANVAS_WIDTH,
      canvasHeight: Number(body.canvasHeight) || DEFAULT_CANVAS_HEIGHT,
      createdAt: now,
      updatedAt: now,
    };

    await redisSet(`page:${id}`, JSON.stringify(pageData));

    return res.status(200).json({ id, editToken });
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || '서버 오류가 발생했어요.' });
  }
};
