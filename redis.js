// lib/redis.js
// Upstash Redis의 REST API를 직접 호출하는 아주 작은 헬퍼입니다.
// 별도 패키지(@upstash/redis 등) 없이 순수 fetch만 사용해서,
// "Vercel 마켓플레이스에서 Upstash를 연결하기만 하면 바로 동작"하도록 만들었어요.
//
// Vercel에서 Upstash(Redis) 스토리지를 연결하면 아래 두 환경변수가 자동으로 채워집니다.
// (구버전 Vercel KV 연동을 쓰는 경우 KV_REST_API_* 이름으로 들어올 수도 있어서 둘 다 확인해요.)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function assertConfigured() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    const err = new Error(
      'Redis가 아직 연결되지 않았어요. Vercel 프로젝트 설정 > Storage에서 Upstash(Redis)를 연결한 뒤 다시 배포해주세요. (README.md의 "데이터 저장소 연결하기" 참고)'
    );
    err.statusCode = 500;
    throw err;
  }
}

async function redisSet(key, valueString) {
  assertConfigured();
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: valueString,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Redis SET 요청이 실패했어요 (${res.status}): ${text}`);
  }
  return res.json();
}

async function redisGet(key) {
  assertConfigured();
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Redis GET 요청이 실패했어요 (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.result ?? null; // 문자열 또는 null
}

async function redisExists(key) {
  const value = await redisGet(key);
  return value !== null && value !== undefined;
}

module.exports = { redisSet, redisGet, redisExists };
