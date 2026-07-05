// js/render.js
// pageData(배경/요소/커스텀 CSS 등)를 받아서 실제 눈에 보이는 HTML 문서 하나를 문자열로 만들어요.
// 에디터의 "미리보기"와 실제 공개 뷰어(view.js)가 이 함수를 함께 사용하기 때문에
// 편집할 때 본 모습과 실제로 공유되는 페이지가 항상 똑같아요.
//
// 이 파일은 브라우저에서 <script src="js/render.js">로 그냥 불러오는 일반 스크립트라서
// 모듈 문법을 쓰지 않고, 아래 함수들은 전역(window)에 그대로 노출돼요.

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeStyleBlock(css) {
  // <style> 태그 안에 문자열 그대로 "</style"가 들어가면 브라우저가 스타일 블록을
  // 그 지점에서 끝내버려서 이후 내용이 실제 HTML로 취급될 수 있어요. 방지용 처리예요.
  return String(css ?? '').replace(/<\/style/gi, '<\\/style');
}

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeClassName(name) {
  // 사용자가 지정한 CSS 클래스 이름을 안전한 형태로만 허용해요 (Raw CSS에서 선택자로 사용됨).
  if (!name) return '';
  const trimmed = String(name).trim();
  return /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(trimmed) ? trimmed : '';
}

const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

function sanitizeUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  try {
    const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    const testUrl = hasProtocol ? trimmed : `https://${trimmed}`;
    const parsed = new URL(testUrl);
    if (!SAFE_URL_PROTOCOLS.includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeImageSrc(src) {
  if (!src) return null;
  const trimmed = String(src).trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  return sanitizeUrl(trimmed);
}

const FONT_STACKS = {
  default: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif",
  gothic: "'Noto Sans KR', 'Pretendard', sans-serif",
  serif: "'Noto Serif KR', serif",
  handwriting: "'Gaegu', cursive",
  impact: "'Black Han Sans', sans-serif",
  pen: "'Nanum Pen Script', cursive",
};

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@400;600;700&family=Gaegu:wght@400;700&family=Black+Han+Sans&family=Nanum+Pen+Script&family=Space+Grotesk:wght@500;700&display=swap';

function shadowToCss(level) {
  if (level === 'soft') return '0 4px 16px rgba(20,20,20,0.12)';
  if (level === 'strong') return '0 10px 30px rgba(20,20,20,0.28)';
  return 'none';
}

function elementBoxStyle(el) {
  return [
    `left:${safeNum(el.xPct, 0)}%`,
    `top:${safeNum(el.yPct, 0)}%`,
    `width:${safeNum(el.widthPct, 10)}%`,
    `height:${safeNum(el.heightPct, 10)}%`,
    `z-index:${safeNum(el.z, 1)}`,
  ].join(';');
}

function wrapWithLink(el, inner) {
  const href = sanitizeUrl(el.link);
  const boxStyle = elementBoxStyle(el);
  // 커스텀 클래스는 바깥 위치 wrapper(.pf-el)에도 붙여서, Raw CSS에서
  // ".pf-el.내클래스" 든 안쪽 박스의 ".pf-textbox.내클래스" 든 원하는 쪽을 고를 수 있게 해요.
  const customClass = sanitizeClassName(el.cssClass);
  const outerClass = `pf-el${href ? ' pf-link' : ''}${customClass ? ' ' + customClass : ''}`;
  if (href) {
    const target = el.newTab === false ? '' : ' target="_blank" rel="noopener noreferrer"';
    return `<a class="${outerClass}" href="${escapeHtml(href)}"${target} style="${boxStyle}">${inner}</a>`;
  }
  return `<div class="${outerClass}" style="${boxStyle}">${inner}</div>`;
}

function renderTextElement(el) {
  const style = el.style || {};
  const align = ['left', 'center', 'right'].includes(style.align) ? style.align : 'center';
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const fontStack = FONT_STACKS[style.fontFamily] || FONT_STACKS.default;

  const boxStyles = [
    `font-family:${fontStack}`,
    `font-size:${safeNum(style.fontSize, 16)}px`,
    `font-weight:${style.bold ? 700 : 400}`,
    `font-style:${style.italic ? 'italic' : 'normal'}`,
    `color:${isHexColor(style.color) ? style.color : '#1a1a1a'}`,
    `text-align:${align}`,
    `justify-content:${justifyMap[align]}`,
    `background:${style.transparent ? 'transparent' : (isHexColor(style.bgColor) ? style.bgColor : '#ffffff')}`,
    `padding:${safeNum(style.padding, 12)}px`,
    `border-radius:${safeNum(style.radius, 12)}px`,
    `border:${Number(style.borderWidth) > 0 ? `${safeNum(style.borderWidth, 0)}px solid ${isHexColor(style.borderColor) ? style.borderColor : '#000000'}` : 'none'}`,
    `box-shadow:${shadowToCss(style.shadow)}`,
  ].join(';');

  const content = escapeHtml(el.content || '').replace(/\n/g, '<br>');
  const customClass = sanitizeClassName(el.cssClass);
  const inner = `<div class="pf-textbox${customClass ? ' ' + customClass : ''}" style="${boxStyles}">${content}</div>`;
  return wrapWithLink(el, inner);
}

function renderImageElement(el) {
  const style = el.style || {};
  const src = sanitizeImageSrc(el.src);
  if (!src) return '';
  const customClass = sanitizeClassName(el.cssClass);
  const imgStyle = [
    `width:100%`,
    `height:100%`,
    `object-fit:${style.fit === 'contain' ? 'contain' : 'cover'}`,
    `border-radius:${safeNum(style.radius, 0)}px`,
    `box-shadow:${shadowToCss(style.shadow)}`,
    `display:block`,
  ].join(';');
  const inner = `<img class="pf-image${customClass ? ' ' + customClass : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(el.alt || '')}" style="${imgStyle}">`;
  return wrapWithLink(el, inner);
}

function renderElement(el) {
  if (!el || typeof el !== 'object') return '';
  if (el.type === 'text') return renderTextElement(el);
  if (el.type === 'image') return renderImageElement(el);
  return '';
}

function renderBackgroundStyle(background) {
  const bg = background || {};
  if (bg.type === 'image' && sanitizeImageSrc(bg.value)) {
    const fit = bg.fit === 'contain' ? 'contain' : 'cover';
    const fallback = isHexColor(bg.fallbackColor) ? bg.fallbackColor : '#ffffff';
    return `background-image:url('${escapeHtml(sanitizeImageSrc(bg.value))}');background-size:${fit};background-position:center;background-repeat:no-repeat;background-color:${fallback};`;
  }
  const color = isHexColor(bg.value) ? bg.value : '#ffffff';
  return `background-color:${color};`;
}

function buildPageHTML(pageData) {
  const data = pageData || {};
  const width = safeNum(data.canvasWidth, 400);
  const height = safeNum(data.canvasHeight, 900);
  const elementsHtml = (Array.isArray(data.elements) ? data.elements : [])
    .slice()
    .sort((a, b) => safeNum(a.z, 0) - safeNum(b.z, 0))
    .map(renderElement)
    .join('\n');
  const bgStyle = renderBackgroundStyle(data.background);
  const customCss = escapeStyleBlock(data.customCSS);
  const title = escapeHtml(data.title || 'Freepage');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_HREF}" rel="stylesheet">
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  background: #e7e7e7;
  font-family: 'Pretendard', -apple-system, sans-serif;
}
.pf-canvas {
  position: relative;
  width: 100%;
  max-width: ${width}px;
  aspect-ratio: ${width} / ${height};
  ${bgStyle}
  overflow: hidden;
}
.pf-el { position: absolute; }
.pf-link { text-decoration: none; cursor: pointer; }
.pf-textbox {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
  word-break: break-word;
  box-sizing: border-box;
}
</style>
<style>
${customCss}
</style>
</head>
<body>
<div class="pf-canvas">
${elementsHtml}
</div>
</body>
</html>`;
}
