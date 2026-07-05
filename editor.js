// js/editor.js
// Freepage 에디터의 전체 동작을 담당하는 스크립트예요.
// 섹션 순서: 상태값 -> 유틸 -> 캔버스 길이 -> 요소 CRUD -> 렌더링 -> 드래그/리사이즈
//           -> 속성 패널 -> 모달 -> 저장/공유 -> 초기화
(function () {
  'use strict';

  const CANVAS_WIDTH = 400;
  const MIN_CANVAS_HEIGHT = 900;
  const GROW_STEP = 300;
  const STORAGE_KEY = 'freepage_my_pages';
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

  const state = {
    id: null,
    editToken: null,
    title: '',
    background: { type: 'color', value: '#ffffff' },
    elements: [],
    customCSS: '',
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: MIN_CANVAS_HEIGHT,
  };

  let selectedId = null;
  let nextZ = 1;
  let dragInfo = null;
  let isDirty = false;
  let imageModalCallback = null;

  // ---------------- 유틸 ----------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `el_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function pxToPct(px, total) { return (px / total) * 100; }

  function markDirty() {
    isDirty = true;
    const el = $('#saveStatus');
    if (el) el.textContent = '저장되지 않은 변경사항이 있어요';
  }
  function markClean() {
    isDirty = false;
    const el = $('#saveStatus');
    if (el) el.textContent = '';
  }
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // 캔버스를 다시 그리되(모양 반영), 필요할 때만 속성 패널까지 통째로 다시 그려요.
  // (텍스트/숫자를 계속 타이핑하는 입력창까지 매번 다시 그리면 포커스가 날아가버려서
  //  타이핑 중에는 rebuildPanel=false를 쓰고, 버튼/토글처럼 다시 그려도 안전한 경우만 true를 써요.)
  function afterFieldChange(rebuildPanel) {
    renderCanvas();
    if (rebuildPanel) renderProperties();
    markDirty();
  }

  // ---------------- 캔버스 길이 ----------------
  function growCanvas() {
    const oldHeight = state.canvasHeight;
    const newHeight = oldHeight + GROW_STEP;
    const ratio = oldHeight / newHeight;
    state.elements.forEach((el) => {
      el.yPct *= ratio;
      el.heightPct *= ratio;
    });
    state.canvasHeight = newHeight;
    renderCanvas();
    updateCanvasSizeLabel();
    markDirty();
  }

  function updateCanvasSizeLabel() {
    const label = $('#canvasSizeLabel');
    if (label) label.textContent = `${state.canvasWidth} × ${Math.round(state.canvasHeight)} px`;
  }

  // ---------------- 요소 생성 ----------------
  function defaultTextStyle() {
    return {
      fontFamily: 'default', fontSize: 18, bold: false, italic: false,
      color: '#1a1a1a', align: 'center', transparent: false, bgColor: '#ffffff',
      padding: 16, radius: 14, borderWidth: 0, borderColor: '#000000', shadow: 'soft',
    };
  }
  function defaultImageStyle() {
    return { fit: 'cover', radius: 16, shadow: 'soft' };
  }

  function addTextElement() {
    const w = 70, h = 10;
    const el = {
      id: uid(), type: 'text', cssClass: '',
      xPct: (100 - w) / 2,
      yPct: clamp(pxToPct(60 + state.elements.length * 26, state.canvasHeight), 0, 100 - h),
      widthPct: w, heightPct: h, z: nextZ++,
      content: '텍스트를 입력하세요', link: '', newTab: true,
      style: defaultTextStyle(),
    };
    state.elements.push(el);
    renderCanvas();
    selectElement(el.id);
    markDirty();
  }

  function addImageElement(src) {
    const w = 60, h = 22;
    const el = {
      id: uid(), type: 'image', cssClass: '',
      xPct: (100 - w) / 2,
      yPct: clamp(pxToPct(60 + state.elements.length * 26, state.canvasHeight), 0, 100 - h),
      widthPct: w, heightPct: h, z: nextZ++,
      src, alt: '', link: '', newTab: true,
      style: defaultImageStyle(),
    };
    state.elements.push(el);
    renderCanvas();
    selectElement(el.id);
    markDirty();
  }

  function getElement(id) { return state.elements.find((e) => e.id === id); }

  function deleteElement(id) {
    state.elements = state.elements.filter((e) => e.id !== id);
    if (selectedId === id) selectedId = null;
    renderCanvas();
    renderProperties();
    markDirty();
  }

  function duplicateElement(id) {
    const el = getElement(id);
    if (!el) return;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uid();
    copy.xPct = clamp(copy.xPct + 4, 0, 100 - copy.widthPct);
    copy.yPct = clamp(copy.yPct + 3, 0, 100 - copy.heightPct);
    copy.z = nextZ++;
    state.elements.push(copy);
    renderCanvas();
    selectElement(copy.id);
    markDirty();
  }

  function bringToFront(id) {
    const el = getElement(id);
    if (!el) return;
    el.z = nextZ++;
    afterFieldChange(false);
  }

  // ---------------- 렌더링 (에디터 캔버스) ----------------
  const FONT_PREVIEW = {
    default: "'Pretendard', -apple-system, sans-serif",
    gothic: "'Noto Sans KR', sans-serif",
    serif: "'Noto Serif KR', serif",
    handwriting: "'Gaegu', cursive",
    impact: "'Black Han Sans', sans-serif",
    pen: "'Nanum Pen Script', cursive",
  };
  const SHADOW_CSS = {
    none: 'none',
    soft: '0 4px 16px rgba(20,20,20,0.12)',
    strong: '0 10px 30px rgba(20,20,20,0.28)',
  };

  function renderCanvas() {
    const canvas = $('#pageCanvas');
    if (!canvas) return;
    canvas.style.width = `${state.canvasWidth}px`;
    canvas.style.height = `${state.canvasHeight}px`;
    applyBackgroundToDOM(canvas);

    $all('.editor-el', canvas).forEach((n) => n.remove());

    const hint = $('#canvasEmptyHint');
    if (hint) hint.style.display = state.elements.length === 0 ? 'flex' : 'none';

    state.elements
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((el) => canvas.appendChild(buildElementNode(el)));

    updateCanvasSizeLabel();
  }

  function applyBackgroundToDOM(canvas) {
    const bg = state.background;
    if (bg.type === 'image' && bg.value) {
      canvas.style.backgroundImage = `url("${bg.value}")`;
      canvas.style.backgroundSize = bg.fit === 'contain' ? 'contain' : 'cover';
      canvas.style.backgroundPosition = 'center';
      canvas.style.backgroundRepeat = 'no-repeat';
      canvas.style.backgroundColor = bg.fallbackColor || '#ffffff';
    } else {
      canvas.style.backgroundImage = 'none';
      canvas.style.backgroundColor = bg.value || '#ffffff';
    }
  }

  function buildElementNode(el) {
    const node = document.createElement('div');
    node.className = 'editor-el' + (el.id === selectedId ? ' selected' : '');
    node.dataset.id = el.id;
    node.style.left = `${el.xPct}%`;
    node.style.top = `${el.yPct}%`;
    node.style.width = `${el.widthPct}%`;
    node.style.height = `${el.heightPct}%`;
    node.style.zIndex = el.z;

    const box = document.createElement('div');
    box.className = 'editor-el-box';

    if (el.type === 'text') {
      const s = el.style;
      box.style.fontFamily = FONT_PREVIEW[s.fontFamily] || FONT_PREVIEW.default;
      box.style.fontSize = `${s.fontSize}px`;
      box.style.fontWeight = s.bold ? '700' : '400';
      box.style.fontStyle = s.italic ? 'italic' : 'normal';
      box.style.color = s.color;
      box.style.textAlign = s.align;
      box.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[s.align] || 'center';
      box.style.background = s.transparent ? 'transparent' : s.bgColor;
      box.style.padding = `${s.padding}px`;
      box.style.borderRadius = `${s.radius}px`;
      box.style.border = s.borderWidth > 0 ? `${s.borderWidth}px solid ${s.borderColor}` : 'none';
      box.style.boxShadow = SHADOW_CSS[s.shadow] || 'none';
      box.textContent = el.content;
    } else if (el.type === 'image') {
      const s = el.style;
      const img = document.createElement('img');
      img.src = el.src;
      img.alt = el.alt || '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = s.fit;
      img.style.borderRadius = `${s.radius}px`;
      img.style.boxShadow = SHADOW_CSS[s.shadow] || 'none';
      img.draggable = false;
      box.appendChild(img);
    }
    node.appendChild(box);

    ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
      const handle = document.createElement('div');
      handle.className = `resize-handle handle-${corner}`;
      handle.dataset.corner = corner;
      node.appendChild(handle);
    });

    node.addEventListener('mousedown', (e) => onElementDown(e, el.id));
    node.addEventListener('touchstart', (e) => onElementDown(e, el.id), { passive: false });

    return node;
  }

  // ---------------- 선택 ----------------
  function selectElement(id) {
    selectedId = id;
    $all('.editor-el').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
    renderProperties();
  }

  // ---------------- 드래그 & 리사이즈 ----------------
  function getPoint(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onElementDown(e, id) {
    e.stopPropagation();
    selectElement(id);
    const el = getElement(id);
    if (!el) return;

    const corner = e.target && e.target.dataset ? e.target.dataset.corner : null;
    const rect = $('#pageCanvas').getBoundingClientRect();
    const start = getPoint(e);

    dragInfo = {
      id,
      mode: corner ? 'resize' : 'move',
      corner,
      startX: start.x,
      startY: start.y,
      startEl: { xPct: el.xPct, yPct: el.yPct, widthPct: el.widthPct, heightPct: el.heightPct },
      rectWidth: rect.width,
      rectHeight: rect.height,
    };

    if (e.type === 'touchstart') e.preventDefault();
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragInfo) return;
    if (e.type === 'touchmove') e.preventDefault();
    const el = getElement(dragInfo.id);
    if (!el) return;

    const point = getPoint(e);
    const dxPct = pxToPct(point.x - dragInfo.startX, dragInfo.rectWidth);
    const dyPct = pxToPct(point.y - dragInfo.startY, dragInfo.rectHeight);

    if (dragInfo.mode === 'move') {
      el.xPct = clamp(dragInfo.startEl.xPct + dxPct, 0, 100 - el.widthPct);
      el.yPct = clamp(dragInfo.startEl.yPct + dyPct, 0, 100 - el.heightPct);
      checkSnap(el);
    } else {
      applyResize(el, dragInfo, dxPct, dyPct);
    }

    // 드래그 중에는 전체를 새로 그리지 않고 움직이는 요소만 직접 갱신해서 부드럽게 만들어요.
    const node = document.querySelector(`.editor-el[data-id="${dragInfo.id}"]`);
    if (node) {
      node.style.left = `${el.xPct}%`;
      node.style.top = `${el.yPct}%`;
      node.style.width = `${el.widthPct}%`;
      node.style.height = `${el.heightPct}%`;
    }
    updateXYWHFieldsLive(el);
  }

  function applyResize(el, info, dxPct, dyPct) {
    const MIN = 6;
    let { xPct, yPct, widthPct, heightPct } = info.startEl;

    if (info.corner.includes('e')) widthPct = clamp(widthPct + dxPct, MIN, 100 - xPct);
    if (info.corner.includes('s')) heightPct = clamp(heightPct + dyPct, MIN, 100 - yPct);
    if (info.corner.includes('w')) {
      const newWidth = clamp(widthPct - dxPct, MIN, xPct + widthPct);
      xPct = xPct + (widthPct - newWidth);
      widthPct = newWidth;
    }
    if (info.corner.includes('n')) {
      const newHeight = clamp(heightPct - dyPct, MIN, yPct + heightPct);
      yPct = yPct + (heightPct - newHeight);
      heightPct = newHeight;
    }

    el.xPct = xPct; el.yPct = yPct; el.widthPct = widthPct; el.heightPct = heightPct;
  }

  function checkSnap(el) {
    const centerX = el.xPct + el.widthPct / 2;
    const snapLine = $('#snapLineV');
    if (Math.abs(centerX - 50) < 1.5) {
      el.xPct = 50 - el.widthPct / 2;
      if (snapLine) snapLine.classList.add('visible');
    } else if (snapLine) {
      snapLine.classList.remove('visible');
    }
  }

  function updateXYWHFieldsLive(el) {
    if (el.id !== selectedId) return;
    const inputs = $all('.xywh-grid input');
    if (inputs.length === 4) {
      inputs[0].value = round1(el.xPct);
      inputs[1].value = round1(el.yPct);
      inputs[2].value = round1(el.widthPct);
      inputs[3].value = round1(el.heightPct);
    }
  }

  function onDragEnd() {
    dragInfo = null;
    renderCanvas();
    markDirty();
    const snapLine = $('#snapLineV');
    if (snapLine) snapLine.classList.remove('visible');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
  }

  // ---------------- 속성 패널 ----------------
  function renderProperties() {
    const panel = $('#propertiesPanel');
    const empty = $('#propertiesEmpty');
    if (!panel) return;
    $all('.prop-form', panel).forEach((n) => n.remove());

    const el = getElement(selectedId);
    if (!el) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    const form = document.createElement('div');
    form.className = 'prop-form';
    form.appendChild(el.type === 'text' ? buildTextPropForm(el) : buildImagePropForm(el));
    form.appendChild(buildCommonPropForm(el));
    panel.appendChild(form);
  }

  function row(labelText, inputEl) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function numberField(label, value, min, max, onChange, opts) {
    opts = opts || {};
    const input = document.createElement('input');
    input.type = 'number';
    input.className = opts.small ? 'mono small-num' : 'mono';
    input.value = value;
    input.min = min; input.max = max;
    input.addEventListener('input', () => {
      const n = clamp(parseFloat(input.value) || 0, min, max);
      onChange(n);
      afterFieldChange(!!opts.rebuild);
    });
    return row(label, input);
  }

  function colorField(label, value, onChange) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value;
    input.addEventListener('input', () => {
      onChange(input.value);
      afterFieldChange(false);
    });
    return row(label, input);
  }

  function segmentField(label, options, currentValue, onChange) {
    const seg = document.createElement('div');
    seg.className = 'seg-control';
    options.forEach(([val, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn' + (currentValue === val ? ' active' : '');
      b.textContent = text;
      b.addEventListener('click', () => {
        onChange(val);
        afterFieldChange(true);
      });
      seg.appendChild(b);
    });
    return label ? row(label, seg) : seg;
  }

  function toggleRow(label, value, onChange, rebuild) {
    rebuild = rebuild === undefined ? true : rebuild;
    const wrap = document.createElement('label');
    wrap.className = 'field field-inline';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => {
      onChange(input.checked);
      afterFieldChange(rebuild);
    });
    const span = document.createElement('span');
    span.className = 'field-label';
    span.textContent = label;
    wrap.append(input, span);
    return wrap;
  }

  function buildTextPropForm(el) {
    const wrap = document.createElement('div');
    const h1 = document.createElement('h3');
    h1.className = 'panel-title';
    h1.textContent = '텍스트 스타일';
    wrap.appendChild(h1);

    const content = document.createElement('textarea');
    content.className = 'prop-textarea';
    content.value = el.content;
    content.addEventListener('input', () => { el.content = content.value; afterFieldChange(false); });
    wrap.appendChild(row('내용', content));

    const fontSelect = document.createElement('select');
    [['default', '기본'], ['gothic', '고딕'], ['serif', '명조'], ['handwriting', '귀여운 손글씨'], ['impact', '임팩트'], ['pen', '손글씨 펜']]
      .forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = label;
        if (el.style.fontFamily === val) opt.selected = true;
        fontSelect.appendChild(opt);
      });
    fontSelect.addEventListener('change', () => { el.style.fontFamily = fontSelect.value; afterFieldChange(false); });
    wrap.appendChild(row('글꼴', fontSelect));

    wrap.appendChild(numberField('글자 크기 (px)', el.style.fontSize, 8, 96, (v) => { el.style.fontSize = v; }));

    const boldRow = document.createElement('div');
    boldRow.className = 'btn-row';
    boldRow.appendChild(segmentField(null, [['on', '굵게']], el.style.bold ? 'on' : 'off', () => { el.style.bold = !el.style.bold; }));
    boldRow.appendChild(segmentField(null, [['on', '기울임']], el.style.italic ? 'on' : 'off', () => { el.style.italic = !el.style.italic; }));
    wrap.appendChild(boldRow);

    wrap.appendChild(segmentField('정렬', [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], el.style.align, (v) => { el.style.align = v; }));
    wrap.appendChild(colorField('글자 색', el.style.color, (v) => { el.style.color = v; }));

    wrap.appendChild(document.createElement('hr'));
    const h2 = document.createElement('h3');
    h2.className = 'panel-title';
    h2.textContent = '박스 디자인';
    wrap.appendChild(h2);

    wrap.appendChild(toggleRow('배경 투명하게', el.style.transparent, (v) => { el.style.transparent = v; }));
    if (!el.style.transparent) {
      wrap.appendChild(colorField('배경 색', el.style.bgColor, (v) => { el.style.bgColor = v; }));
    }
    wrap.appendChild(numberField('안쪽 여백 (padding)', el.style.padding, 0, 80, (v) => { el.style.padding = v; }));
    wrap.appendChild(numberField('모서리 둥글기', el.style.radius, 0, 100, (v) => { el.style.radius = v; }));
    wrap.appendChild(numberField('테두리 두께', el.style.borderWidth, 0, 20, (v) => { el.style.borderWidth = v; }, { rebuild: true }));
    if (el.style.borderWidth > 0) {
      wrap.appendChild(colorField('테두리 색', el.style.borderColor, (v) => { el.style.borderColor = v; }));
    }
    wrap.appendChild(segmentField('그림자', [['none', '없음'], ['soft', '은은하게'], ['strong', '진하게']], el.style.shadow, (v) => { el.style.shadow = v; }));

    wrap.appendChild(document.createElement('hr'));
    wrap.appendChild(linkFields(el));
    return wrap;
  }

  function buildImagePropForm(el) {
    const wrap = document.createElement('div');
    const h1 = document.createElement('h3');
    h1.className = 'panel-title';
    h1.textContent = '이미지 스타일';
    wrap.appendChild(h1);

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'btn btn-ghost btn-full';
    replaceBtn.type = 'button';
    replaceBtn.textContent = '이미지 바꾸기';
    replaceBtn.addEventListener('click', () => openImageModal((src) => {
      el.src = src; afterFieldChange(false);
    }));
    wrap.appendChild(replaceBtn);

    wrap.appendChild(segmentField('채우기 방식', [['cover', '꽉 채우기'], ['contain', '전체 보이기']], el.style.fit, (v) => { el.style.fit = v; }));
    wrap.appendChild(numberField('모서리 둥글기', el.style.radius, 0, 200, (v) => { el.style.radius = v; }));
    wrap.appendChild(segmentField('그림자', [['none', '없음'], ['soft', '은은하게'], ['strong', '진하게']], el.style.shadow, (v) => { el.style.shadow = v; }));

    wrap.appendChild(document.createElement('hr'));
    wrap.appendChild(linkFields(el));
    return wrap;
  }

  function linkFields(el) {
    const wrap = document.createElement('div');
    const h = document.createElement('h3');
    h.className = 'panel-title';
    h.textContent = '링크 연결';
    wrap.appendChild(h);

    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.placeholder = 'https://...';
    linkInput.value = el.link || '';
    linkInput.addEventListener('input', () => { el.link = linkInput.value; markDirty(); });
    wrap.appendChild(row('링크 URL (선택)', linkInput));

    wrap.appendChild(toggleRow('새 탭에서 열기', el.newTab !== false, (v) => { el.newTab = v; }, false));
    return wrap;
  }

  function buildCommonPropForm(el) {
    const wrap = document.createElement('div');
    wrap.appendChild(document.createElement('hr'));

    const grid = document.createElement('div');
    grid.className = 'xywh-grid mono';
    grid.appendChild(numberField('X %', round1(el.xPct), 0, 100, (v) => { el.xPct = clamp(v, 0, 100 - el.widthPct); }, { small: true }));
    grid.appendChild(numberField('Y %', round1(el.yPct), 0, 100, (v) => { el.yPct = clamp(v, 0, 100 - el.heightPct); }, { small: true }));
    grid.appendChild(numberField('W %', round1(el.widthPct), 1, 100, (v) => { el.widthPct = v; }, { small: true }));
    grid.appendChild(numberField('H %', round1(el.heightPct), 1, 100, (v) => { el.heightPct = v; }, { small: true }));
    wrap.appendChild(grid);

    const classInput = document.createElement('input');
    classInput.type = 'text';
    classInput.placeholder = '예: my-title';
    classInput.value = el.cssClass || '';
    classInput.addEventListener('input', () => { el.cssClass = classInput.value.trim(); markDirty(); });
    wrap.appendChild(row('CSS 클래스 (Raw CSS에서 사용)', classInput));

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn btn-ghost'; dupBtn.type = 'button'; dupBtn.textContent = '복제';
    dupBtn.addEventListener('click', () => duplicateElement(el.id));

    const frontBtn = document.createElement('button');
    frontBtn.className = 'btn btn-ghost'; frontBtn.type = 'button'; frontBtn.textContent = '맨 앞으로';
    frontBtn.addEventListener('click', () => bringToFront(el.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger'; delBtn.type = 'button'; delBtn.textContent = '삭제';
    delBtn.addEventListener('click', () => deleteElement(el.id));

    btnRow.append(dupBtn, frontBtn, delBtn);
    wrap.appendChild(btnRow);
    return wrap;
  }

  // ---------------- 모달 ----------------
  function showModal(id) { $('#modalBackdrop').classList.remove('hidden'); $(`#${id}`).classList.remove('hidden'); }
  function hideModal(id) { $('#modalBackdrop').classList.add('hidden'); $(`#${id}`).classList.add('hidden'); }

  function openImageModal(callback) {
    imageModalCallback = callback;
    $('#imageUrlInput').value = '';
    $('#imageFileInput').value = '';
    showModal('imageModal');
  }

  function fileToDataUrl(file, maxWidth, quality) {
    maxWidth = maxWidth || 1000;
    quality = quality || 0.85;
    if (file.size > MAX_UPLOAD_BYTES) {
      return Promise.reject(new Error('파일이 너무 커요. 8MB 이하 이미지를 사용해주세요.'));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const isPng = file.type === 'image/png';
          resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function setBgTypeUI(type) {
    $all('#bgTypeSeg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bgType === type));
    $('#bgColorFields').classList.toggle('hidden', type !== 'color');
    $('#bgImageFields').classList.toggle('hidden', type !== 'image');
  }

  // ---------------- 저장 / 불러오기 ----------------
  function serializeState() {
    return {
      title: state.title,
      background: state.background,
      elements: state.elements,
      customCSS: state.customCSS,
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
    };
  }

  function getMyPages() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  function saveMyPage(id, editToken, title) {
    const pages = getMyPages().filter((p) => p.id !== id);
    pages.unshift({ id, editToken, title: title || '제목 없는 페이지', savedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages.slice(0, 30)));
    renderMyPagesList();
  }

  function renderMyPagesList() {
    const list = $('#myPagesList');
    if (!list) return;
    const pages = getMyPages();
    if (pages.length === 0) {
      list.innerHTML = '<p class="empty-hint">아직 공유한 페이지가 없어요.</p>';
      return;
    }
    list.innerHTML = '';
    pages.forEach((p) => {
      const item = document.createElement('a');
      item.className = 'my-page-item';
      item.href = `/edit/${p.id}?key=${encodeURIComponent(p.editToken)}`;
      item.textContent = p.title;
      list.appendChild(item);
    });
  }

  async function publish() {
    const btn = $('#btnPublish');
    btn.disabled = true;
    btn.textContent = '저장 중...';
    try {
      const payload = serializeState();
      let res;
      if (state.id && state.editToken) {
        res = await fetch(`/api/pages/${state.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, editToken: state.editToken }),
        });
      } else {
        res = await fetch('/api/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장에 실패했어요.');

      state.id = data.id;
      state.editToken = data.editToken;
      markClean();
      saveMyPage(state.id, state.editToken, state.title);
      showPublishModal();
    } catch (err) {
      alert(err.message || '저장 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      btn.disabled = false;
      btn.textContent = '공유하기';
    }
  }

  function showPublishModal() {
    const origin = window.location.origin;
    $('#shareLinkInput').value = `${origin}/p/${state.id}`;
    $('#editLinkInput').value = `${origin}/edit/${state.id}?key=${state.editToken}`;
    showModal('publishModal');
  }

  async function loadForEditing(id, key) {
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '페이지를 불러오지 못했어요.');

      state.id = id;
      state.editToken = key;
      state.title = data.title || '';
      state.background = data.background || { type: 'color', value: '#ffffff' };
      state.elements = Array.isArray(data.elements) ? data.elements : [];
      state.customCSS = data.customCSS || '';
      state.canvasWidth = data.canvasWidth || CANVAS_WIDTH;
      state.canvasHeight = data.canvasHeight || MIN_CANVAS_HEIGHT;
      nextZ = state.elements.reduce((max, e) => Math.max(max, e.z || 0), 0) + 1;

      $('#titleInput').value = state.title;
      renderCanvas();
      markClean();
    } catch (err) {
      alert(err.message || '페이지를 불러오지 못했어요. 편집 링크를 다시 확인해주세요.');
    }
  }

  function openPreview() {
    const html = buildPageHTML(serializeState());
    $('#previewFrame').srcdoc = html;
    $('#previewModal').classList.remove('hidden');
  }

  function copyInput(inputSel, btnSel) {
    const input = $(inputSel);
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = $(btnSel);
      const original = btn.textContent;
      btn.textContent = '복사됨!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => { document.execCommand('copy'); });
  }

  // ---------------- 초기화 ----------------
  function init() {
    renderCanvas();
    renderProperties();
    renderMyPagesList();

    $('#titleInput').addEventListener('input', (e) => { state.title = e.target.value; markDirty(); });
    $('#btnAddText').addEventListener('click', addTextElement);
    $('#btnAddImage').addEventListener('click', () => openImageModal((src) => addImageElement(src)));
    $('#btnGrowCanvas').addEventListener('click', growCanvas);

    $('#pageCanvas').addEventListener('mousedown', (e) => {
      if (e.target.id === 'pageCanvas' || e.target.id === 'canvasEmptyHint') selectElement(null);
    });

    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        deleteElement(selectedId);
      }
    });

    // 이미지 모달
    $('#imageModalCancel').addEventListener('click', () => hideModal('imageModal'));
    $('#imageModalConfirm').addEventListener('click', async () => {
      const url = $('#imageUrlInput').value.trim();
      const file = $('#imageFileInput').files[0];
      try {
        let src = null;
        if (file) src = await fileToDataUrl(file);
        else if (url) src = url;
        if (!src) return alert('이미지 URL을 입력하거나 파일을 선택해주세요.');
        hideModal('imageModal');
        if (imageModalCallback) imageModalCallback(src);
      } catch (err) {
        alert(err.message || '이미지를 처리하지 못했어요.');
      }
    });

    // 배경 모달
    $('#btnBackground').addEventListener('click', () => {
      $('#bgColorInput').value = state.background.type === 'color' ? state.background.value : '#ffffff';
      $('#bgImageUrlInput').value = state.background.type === 'image' ? (state.background.value || '') : '';
      setBgTypeUI(state.background.type);
      showModal('backgroundModal');
    });
    $all('#bgTypeSeg .seg-btn').forEach((b) => b.addEventListener('click', () => setBgTypeUI(b.dataset.bgType)));
    $('#bgModalCancel').addEventListener('click', () => hideModal('backgroundModal'));
    $('#bgModalConfirm').addEventListener('click', async () => {
      const type = $('#bgTypeSeg .seg-btn.active').dataset.bgType;
      if (type === 'color') {
        state.background = { type: 'color', value: $('#bgColorInput').value };
      } else {
        const url = $('#bgImageUrlInput').value.trim();
        const file = $('#bgImageFileInput').files[0];
        let src = null;
        try {
          if (file) src = await fileToDataUrl(file, 1400, 0.8);
          else if (url) src = url;
        } catch (err) {
          return alert(err.message || '이미지를 처리하지 못했어요.');
        }
        if (!src) return alert('배경 이미지 URL을 입력하거나 파일을 선택해주세요.');
        state.background = { type: 'image', value: src, fit: $('#bgFitSelect').value, fallbackColor: '#ffffff' };
      }
      hideModal('backgroundModal');
      renderCanvas();
      markDirty();
    });

    // Raw CSS 모달
    $('#btnRawCss').addEventListener('click', () => {
      $('#cssTextarea').value = state.customCSS;
      showModal('cssModal');
    });
    $('#cssModalCancel').addEventListener('click', () => hideModal('cssModal'));
    $('#cssModalConfirm').addEventListener('click', () => {
      state.customCSS = $('#cssTextarea').value;
      hideModal('cssModal');
      markDirty();
    });

    // 미리보기
    $('#btnPreview').addEventListener('click', openPreview);
    $('#previewClose').addEventListener('click', () => $('#previewModal').classList.add('hidden'));

    // 공유하기
    $('#btnPublish').addEventListener('click', publish);
    $('#publishModalClose').addEventListener('click', () => hideModal('publishModal'));
    $('#copyShareBtn').addEventListener('click', () => copyInput('#shareLinkInput', '#copyShareBtn'));
    $('#copyEditBtn').addEventListener('click', () => copyInput('#editLinkInput', '#copyEditBtn'));

    $('#modalBackdrop').addEventListener('click', () => {
      $all('.modal').forEach((m) => m.classList.add('hidden'));
      $('#modalBackdrop').classList.add('hidden');
    });

    // 편집 링크로 들어온 경우 기존 페이지 불러오기
    const pathMatch = window.location.pathname.match(/\/edit\/([^/]+)/);
    const params = new URLSearchParams(window.location.search);
    const editId = pathMatch ? decodeURIComponent(pathMatch[1]) : params.get('id');
    const editKey = params.get('key');
    if (editId && editKey) loadForEditing(editId, editKey);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
