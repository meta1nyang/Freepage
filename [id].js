// api/pages/[id].js
// GET  /api/pages/:id  -> 페이지 데이터 조회 (누구나 가능, 공개 뷰어용)
// PUT  /api/pages/:id  -> 페이지 수정 (editToken이 맞아야만 가능)
const { redisGet, redisSet } = require('../../lib/redis');

const MAX_ELEMENTS = 60;
const MAX_BODY_BYTES = 300 * 1024;

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
  if (typeof body.editToken !== 'string' || body.editToken.length < 10) return '수정 권한 토큰이 필요해요.';
  return null;
}

module.exports = async function handler(req, res) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: '잘못된 페이지 주소예요.' });
  }
  const key = `page:${id}`;

  if (req.method === 'GET') {
    try {
      const raw = await redisGet(key);
      if (!raw) return res.status(404).json({ error: '페이지를 찾을 수 없어요.' });
      const pageData = JSON.parse(raw);
      const { editToken, ...publicData } = pageData; // 편집 토큰은 절대 공개 조회에 포함하지 않아요
      return res.status(200).json(publicData);
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({ error: err.message || '서버 오류가 발생했어요.' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const raw = await redisGet(key);
      if (!raw) return res.status(404).json({ error: '페이지를 찾을 수 없어요.' });
      const existing = JSON.parse(raw);

      const body = req.body || {};
      const rawSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
      if (rawSize > MAX_BODY_BYTES) {
        return res.status(413).json({ error: '페이지 데이터가 너무 커요. 이미지는 되도록 URL로 넣어주세요.' });
      }

      if (body.editToken !== existing.editToken) {
        return res.status(403).json({ error: '수정 권한이 없어요. 편집 링크(edit link)가 올바른지 확인해주세요.' });
      }

      const validationError = validatePayload(body);
      if (validationError) return res.status(400).json({ error: validationError });

      const updated = {
        ...existing,
        title: body.title.slice(0, 100),
        background: body.background,
        elements: body.elements,
        customCSS: body.customCSS.slice(0, 20000),
        canvasWidth: Number(body.canvasWidth) || existing.canvasWidth,
        canvasHeight: Number(body.canvasHeight) || existing.canvasHeight,
        updatedAt: new Date().toISOString(),
      };

      await redisSet(key, JSON.stringify(updated));
      return res.status(200).json({ id, editToken: updated.editToken });
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({ error: err.message || '서버 오류가 발생했어요.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'GET 또는 PUT 요청만 지원해요.' });
};
