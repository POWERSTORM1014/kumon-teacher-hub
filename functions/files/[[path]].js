// functions/files/[[path]].js — 공개 R2 버킷 3개(캡처 이미지/답안 PDF/레슨노트)를
// 같은 출처(pages.dev)에서 프록시 서빙한다. R2 r2.dev 공개 도메인은 Cloudflare Access로
// 직접 보호할 수 없다(검증 완료: "domain does not belong to zone") — 이 프록시를 거쳐야만
// Access 보호가 실제로 적용된다. 경로 형태: /files/<bucket>/<key...>
//   captures → kumon-page-captures (교재 낱장 캡처 이미지)
//   pdf      → kumon-teacher-materials (교재 원본 PDF)
//   notes    → kumon-lesson-notes (레슨노트 사진/오디오, functions/api의 업로드 라우트가 씀)
// 같은 출처 요청이라 CORS/credentials 설정이 전혀 필요 없다 — 이게 이 설계를 고른 이유.

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }

  const segs = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  if (segs.length < 2) return new Response('not found', { status: 404 });

  const BUCKETS = {
    captures: env.CAPTURES_BUCKET,
    pdf: env.PDF_BUCKET,
    notes: env.LESSON_NOTES
  };
  const bucket = BUCKETS[segs[0]];
  if (!bucket) return new Response('not found', { status: 404 });

  const key = segs.slice(1).join('/');
  const obj = await bucket.get(key);
  if (!obj) return new Response('not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(obj.body, { headers });
}
