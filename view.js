// js/view.js
// /p/:id 로 들어온 방문자에게 실제 페이지를 보여주는 스크립트예요.
(function () {
  'use strict';

  function extractId() {
    const pathMatch = window.location.pathname.match(/\/p\/([^/]+)/);
    if (pathMatch) return decodeURIComponent(pathMatch[1]);
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function escapeText(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showState(titleText, bodyText) {
    const area = document.getElementById('stateArea');
    area.classList.remove('hidden');
    area.innerHTML = `<p class="state-text"><span class="state-title">${escapeText(titleText)}</span>${escapeText(bodyText)}</p>`;
    document.getElementById('pageFrame').classList.add('hidden');
  }

  async function load() {
    const id = extractId();
    if (!id) {
      showState('잘못된 주소예요', '공유 링크를 다시 확인해주세요.');
      return;
    }

    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(id)}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          showState('페이지를 찾을 수 없어요', '삭제되었거나 존재하지 않는 페이지예요.');
        } else {
          showState('문제가 발생했어요', data.error || '잠시 후 다시 시도해주세요.');
        }
        return;
      }

      document.title = data.title || 'Freepage';
      const html = buildPageHTML(data);
      const frame = document.getElementById('pageFrame');
      frame.srcdoc = html;
      frame.classList.remove('hidden');
      document.getElementById('stateArea').classList.add('hidden');
    } catch (err) {
      showState('연결에 문제가 있어요', '인터넷 연결을 확인하고 새로고침 해주세요.');
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
