(() => {
'use strict';
const SI_GUIDANCE=window.SI_GUIDANCE||{};
const style = document.createElement('style');
style.textContent = `
.si-learning-note{margin:0 0 14px;padding:14px 16px;border:1px solid #b8cff2;border-left:5px solid #1764dc;border-radius:12px;background:#f4f8ff;color:#21324d;font-size:13px;line-height:1.55}
.si-learning-note strong{color:#092b62}
.si-guide-btn{display:inline-flex;align-items:center;gap:6px;margin-top:7px;padding:6px 9px;border:1px solid #a9bee0;border-radius:8px;background:#eef5ff;color:#0b3b85;font-size:12px;font-weight:700;cursor:pointer}
.si-guide-btn:hover{background:#dfeeff}
.si-guide-btn[aria-expanded="true"]{background:#1764dc;color:#fff;border-color:#1764dc}
.si-guide-row{display:none;background:#f8fbff}
.si-guide-row.open{display:table-row}
.si-guide-cell{padding:0!important;border-top:0!important}
.si-guide-panel{margin:0 10px 12px;padding:14px;border:1px solid #c7d7ed;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(25,63,112,.08);font-size:13px;line-height:1.55}
.si-guide-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.si-guide-title{font-weight:800;color:#092b62;font-size:14px}
.si-source-badge{white-space:nowrap;padding:4px 7px;border-radius:999px;background:#e8f0ff;color:#174eaa;font-size:10px;font-weight:800}
.si-guide-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px}
.si-guide-block{padding:11px;border-radius:10px;background:#f7f9fc;border:1px solid #e0e7f0}
.si-guide-block b{display:block;color:#263a59;margin-bottom:4px}
.si-severity{margin:0;padding-left:18px}
.si-severity li{margin:4px 0}
.si-minor b{color:#7a6600}.si-significant b{color:#b55b00}.si-major b{color:#b42318}
.si-disclaimer{margin-top:10px;padding-top:9px;border-top:1px dashed #ccd7e5;color:#68758a;font-size:11px}
@media(max-width:700px){.si-guide-grid{grid-template-columns:1fr}.si-guide-head{display:block}.si-source-badge{display:inline-block;margin-top:6px}}
`;
document.head.appendChild(style);

function esc(value='') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function severityHtml(severity={}) {
  const order = [['Minor','si-minor'],['Significant','si-significant'],['Major','si-major']];
  const items = order.filter(([key]) => severity[key]).map(([key,cls]) =>
    `<li class="${cls}"><b>${key}</b> ${esc(severity[key])}</li>`
  ).join('');
  return items ? `<ul class="si-severity">${items}</ul>` : '<span>No severity example is included in this learning summary.</span>';
}

function installGuidance() {
  const root = document.getElementById('checklists');
  if (!root || root.dataset.siGuidanceInstalled === 'true') return;
  const rows = [...root.querySelectorAll('tr.itemrow[data-code]')];
  if (!rows.length) return;

  root.dataset.siGuidanceInstalled = 'true';

  const note = document.createElement('div');
  note.className = 'si-learning-note';
  note.innerHTML = `<strong>SI 8900-6.2 learning guidance:</strong> select “View SI guidance” under an item to see the inspection method, principal references and examples of seriousness. This learning summary does not replace the complete SI, CASR, ICAO Annexes, approved manufacturer data or official reporting in IMSIS.`;
  root.parentNode.insertBefore(note, root);

  rows.forEach(row => {
    const code = row.dataset.code;
    const item = SI_GUIDANCE[code];
    if (!item) return;

    const itemCell = row.querySelector('td');
    if (!itemCell) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'si-guide-btn';
    button.setAttribute('aria-expanded','false');
    button.innerHTML = '📘 View SI guidance';
    itemCell.appendChild(document.createElement('br'));
    itemCell.appendChild(button);

    const detailRow = document.createElement('tr');
    detailRow.className = 'si-guide-row';
    detailRow.dataset.guideFor = code;
    const detailCell = document.createElement('td');
    detailCell.colSpan = 3;
    detailCell.className = 'si-guide-cell';
    detailCell.innerHTML = `
      <div class="si-guide-panel">
        <div class="si-guide-head">
          <div class="si-guide-title">${esc(code)} - ${esc(item.title)}</div>
          <span class="si-source-badge">SI 8900-6.2 • Appendix 2</span>
        </div>
        <div class="si-guide-grid">
          <div class="si-guide-block"><b>Inspection method</b>${esc(item.instruction)}</div>
          <div class="si-guide-block"><b>Principal reference</b>${esc(item.reference)}</div>
          <div class="si-guide-block" style="grid-column:1/-1"><b>Examples of seriousness</b>${severityHtml(item.severity)}</div>
        </div>
        <div class="si-disclaimer">Use the currently applicable regulations, approved data, MEL/CDL/AMM/SRM and the judgement of an authorised inspector. Official ramp-inspection records remain subject to the organisation's procedures and IMSIS.</div>
      </div>`;
    detailRow.appendChild(detailCell);
    row.insertAdjacentElement('afterend', detailRow);

    const toggle = open => {
      const shouldOpen = open ?? !detailRow.classList.contains('open');
      detailRow.classList.toggle('open', shouldOpen);
      button.setAttribute('aria-expanded', String(shouldOpen));
      button.innerHTML = shouldOpen ? '📕 Close SI guidance' : '📘 View SI guidance';
    };
    button.addEventListener('click', () => toggle());

    const result = row.querySelector('.result');
    if (result) result.addEventListener('change', () => { if (result.value === 'Tidak Sesuai') toggle(true); });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(installGuidance, 0));
} else {
  setTimeout(installGuidance, 0);
}
})();