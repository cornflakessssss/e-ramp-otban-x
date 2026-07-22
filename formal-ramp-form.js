(() => {
  'use strict';

  const CATEGORY_LABELS = {
    '': '—',
    G: 'G — General Remark',
    '1': '1 — Minor',
    '2': '2 — Significant',
    '3': '3 — Major'
  };

  const ACTIONS = [
    ['3c', 'Aircraft grounded by DGCA inspector'],
    ['3b', 'Corrective actions before flight'],
    ['3a', 'Restrictions on the aircraft'],
    ['2', 'Information to the operator and authority'],
    ['1', 'Information to the PIC'],
    ['0', 'No remarks']
  ];

  const style = document.createElement('style');
  style.textContent = `
    .formal-category-note{margin:14px 0;padding:14px 16px;border:1px solid #bed0ea;border-radius:12px;background:#f6f9fe;font-size:13px;line-height:1.55}
    .formal-category-note h4{margin:0 0 8px;color:#092b62}.formal-category-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .formal-category-chip{padding:9px;border:1px solid #d6e0ed;border-radius:9px;background:#fff}.formal-category-chip b{display:block;color:#0b3b85}
    .item-category{min-width:160px}.formal-hidden{display:none!important}
    .formal-record{margin-top:18px;border:1px solid #b9cbe3;border-radius:14px;overflow:hidden;background:#fff}
    .formal-record>h3{margin:0;padding:13px 15px;background:#eaf2ff;color:#092b62}
    .formal-body{padding:15px}.formal-subsection{margin:0 0 18px}.formal-subsection h4{margin:0 0 9px;color:#203653}
    .action-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}.action-option{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #d6dfeb;border-radius:9px;background:#fafcff;font-size:13px}
    .action-option input{width:auto;margin:0}.formal-table-wrap{overflow:auto;border:1px solid #d8e1ec;border-radius:10px}.formal-table-wrap table{margin:0}
    .signature-grid{display:grid;grid-template-columns:1fr 1.45fr;gap:10px;align-items:stretch;margin-bottom:10px}.signature-name{display:grid;grid-template-columns:1fr;gap:8px}
    .signature-box{position:relative;border:1px dashed #8ea5c1;border-radius:10px;background:#fff;min-height:112px;overflow:hidden}.signature-box canvas{display:block;width:100%;height:110px;touch-action:none;cursor:crosshair}
    .signature-clear{position:absolute;right:7px;top:7px;border:0;border-radius:7px;padding:5px 8px;background:#eef3fa;color:#25466f;font-size:11px;font-weight:700;cursor:pointer}
    .crew-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.acknowledgement{margin-top:12px;padding:11px;border-left:4px solid #5e789b;background:#f5f7fa;color:#48586d;font-size:11px;line-height:1.55}
    .formal-empty{text-align:center;color:#68758a;padding:14px}.required-mark{color:#b42318;font-weight:700}
    @media(max-width:800px){.formal-category-grid,.action-list,.crew-grid{grid-template-columns:1fr}.signature-grid{grid-template-columns:1fr}.item-category{min-width:145px}}
  `;
  document.head.appendChild(style);

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function categoryOptions() {
    return Object.entries(CATEGORY_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  }

  function selectedActions() {
    return [...document.querySelectorAll('input[name="formalAction"]:checked')]
      .map(input => ({ code: input.value, label: input.dataset.label }));
  }

  function actionText() {
    const actions = selectedActions();
    return actions.length ? actions.map(x => `(${x.code}) ${x.label}`).join('; ') : '(0) No remarks';
  }

  function setupActionLogic() {
    const boxes = [...document.querySelectorAll('input[name="formalAction"]')];
    boxes.forEach(box => box.addEventListener('change', () => {
      if (!box.checked) return;
      if (box.value === '0') boxes.filter(x => x !== box).forEach(x => { x.checked = false; });
      else {
        const noRemarks = boxes.find(x => x.value === '0');
        if (noRemarks) noRemarks.checked = false;
      }
      const hiddenAction = document.getElementById('action');
      if (hiddenAction) {
        const text = actionText();
        const known = [...hiddenAction.options].find(o => text.includes(o.text));
        hiddenAction.value = known ? known.value : 'No remarks';
      }
    }));
  }

  function setupCanvas(canvas) {
    const context = canvas.getContext('2d');
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#172033';
    let drawing = false;

    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
      };
    };

    canvas.addEventListener('pointerdown', event => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      if (!drawing) return;
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
      canvas.dataset.signed = 'true';
      event.preventDefault();
    });
    const stop = event => {
      drawing = false;
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', event => { if (drawing) stop(event); });
  }

  function clearCanvas(canvas) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.signed = 'false';
  }

  function canvasBlob(canvas) {
    return new Promise(resolve => {
      if (canvas.dataset.signed !== 'true') return resolve(null);
      canvas.toBlob(resolve, 'image/png');
    });
  }

  function addCategoryColumns() {
    document.querySelectorAll('#checklists .section table').forEach(table => {
      const heading = table.querySelector('thead tr');
      if (heading && !heading.querySelector('.formal-category-heading')) {
        const th = document.createElement('th');
        th.className = 'formal-category-heading';
        th.textContent = 'Category (SI)';
        heading.appendChild(th);
      }
    });

    document.querySelectorAll('#checklists tr.itemrow').forEach(row => {
      if (row.querySelector('.item-category')) return;
      const td = document.createElement('td');
      td.innerHTML = `<select class="item-category" aria-label="SI category for ${escapeHtml(row.dataset.code)}">${categoryOptions()}</select>`;
      row.appendChild(td);
      const result = row.querySelector('.result');
      const remark = row.querySelector('.remark');
      const categorySelect = td.querySelector('.item-category');

      const sync = () => {
        const cat = categorySelect.value;
        if (['1','2','3'].includes(cat) && result.value !== 'Tidak Sesuai') {
          result.value = 'Tidak Sesuai';
          result.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (cat === 'G' && result.value === 'Tidak Sesuai') {
          result.value = 'Sesuai';
          result.dispatchEvent(new Event('change', { bubbles: true }));
        }
        remark.required = result.value === 'Tidak Sesuai' || cat === 'G';
        refreshFindingsSummary();
      };

      categorySelect.addEventListener('change', sync);
      result.addEventListener('change', () => {
        if (result.value === 'Tidak Sesuai' && categorySelect.value === 'G') categorySelect.value = '';
        remark.required = result.value === 'Tidak Sesuai' || categorySelect.value === 'G';
        refreshFindingsSummary();
      });
      remark.addEventListener('input', refreshFindingsSummary);
    });

    document.querySelectorAll('.si-guide-cell').forEach(cell => { cell.colSpan = 4; });
  }

  function categoryInformation() {
    const box = document.createElement('div');
    box.className = 'formal-category-note';
    box.innerHTML = `
      <h4>SI 8900-6.2 Finding Categories</h4>
      <div class="formal-category-grid">
        <div class="formal-category-chip"><b>G — General Remark</b>Safety-relevant issue that does not constitute a finding.</div>
        <div class="formal-category-chip"><b>1 — Minor</b>Minor influence on safety.</div>
        <div class="formal-category-chip"><b>2 — Significant</b>May have a significant influence on safety.</div>
        <div class="formal-category-chip"><b>3 — Major</b>May have a major influence on safety.</div>
      </div>`;
    const checklists = document.getElementById('checklists');
    checklists.parentNode.insertBefore(box, checklists);
  }

  function inspectorRow(index) {
    return `
      <div class="signature-grid inspector-signature-row" data-index="${index}">
        <div class="signature-name">
          <div><label>Inspector ${index + 1} name</label><input class="formal-inspector-name" placeholder="Inspector's full name"></div>
          <div><label>NIP / ID (optional)</label><input class="formal-inspector-id" inputmode="numeric" placeholder="NIP or inspector ID"></div>
        </div>
        <div><label>Signature</label><div class="signature-box"><canvas class="formal-signature" width="700" height="170"></canvas><button type="button" class="signature-clear">Clear</button></div></div>
      </div>`;
  }

  function formalSection() {
    const section = document.createElement('div');
    section.className = 'formal-record';
    section.innerHTML = `
      <h3>19–24. Ramp Inspection Record</h3>
      <div class="formal-body">
        <div class="formal-subsection">
          <h4>19) Action Taken</h4>
          <div class="action-list">
            ${ACTIONS.map(([code,label]) => `<label class="action-option"><input type="checkbox" name="formalAction" value="${code}" data-label="${escapeHtml(label)}" ${code === '0' ? 'checked' : ''}><b>(${code})</b> ${escapeHtml(label)}</label>`).join('')}
          </div>
        </div>
        <div class="formal-subsection">
          <h4>20) Item &nbsp;&nbsp; 21) Cat &nbsp;&nbsp; 22) Remark(s)</h4>
          <div class="formal-table-wrap"><table><thead><tr><th>Item</th><th>Cat</th><th>Remark(s)</th></tr></thead><tbody id="formalFindingRows"><tr><td colspan="3" class="formal-empty">No findings or general remarks entered.</td></tr></tbody></table></div>
        </div>
        <div class="formal-subsection">
          <h4>23) Inspector(s) name and signature</h4>
          <div id="formalInspectors">${inspectorRow(0)}${inspectorRow(1)}${inspectorRow(2)}</div>
        </div>
        <div class="formal-subsection">
          <h4>24) Crew comments (if any)</h4>
          <textarea id="formalCrewComments" rows="3" placeholder="Crew comments"></textarea>
          <div class="crew-grid" style="margin-top:10px">
            <div><label>Crew / operator representative name</label><input id="formalCrewName" placeholder="Name"></div>
            <div><label>Function / position</label><input id="formalCrewFunction" placeholder="PIC, crew member, operator representative, etc."></div>
          </div>
          <div style="margin-top:10px"><label>Crew / operator representative signature</label><div class="signature-box"><canvas id="formalCrewSignature" width="700" height="170"></canvas><button type="button" class="signature-clear">Clear</button></div></div>
          <div class="acknowledgement">
            <b>Acknowledgement:</b> Signature by any member of the crew or other representative of the inspected operator does not imply acceptance of the listed findings. It only confirms that the aircraft was inspected on the date and at the place stated in this record.<br><br>
            This report represents what was found on this occasion and must not be construed as a determination that the aircraft is fit for the intended flight.
          </div>
        </div>
      </div>`;
    return section;
  }

  function refreshFindingsSummary() {
    const body = document.getElementById('formalFindingRows');
    if (!body) return;
    const entries = [...document.querySelectorAll('#checklists tr.itemrow')].map(row => {
      const result = row.querySelector('.result')?.value;
      const remark = row.querySelector('.remark')?.value.trim() || '';
      const category = row.querySelector('.item-category')?.value || '';
      const include = result === 'Tidak Sesuai' || category || remark;
      return include ? { code: row.dataset.code, category, remark } : null;
    }).filter(Boolean);
    body.innerHTML = entries.length
      ? entries.map(entry => `<tr><td><b>${escapeHtml(entry.code)}</b></td><td>${escapeHtml(entry.category || '—')}</td><td>${escapeHtml(entry.remark || '—')}</td></tr>`).join('')
      : '<tr><td colspan="3" class="formal-empty">No findings or general remarks entered.</td></tr>';
  }

  function prefillInspector() {
    const first = document.querySelector('.formal-inspector-name');
    const firstId = document.querySelector('.formal-inspector-id');
    if (first && !first.value && typeof profile !== 'undefined' && profile) first.value = profile.full_name || '';
    if (firstId && !firstId.value && typeof profile !== 'undefined' && profile) firstId.value = profile.nip || '';
  }

  function installFormalForm() {
    const root = document.getElementById('checklists');
    if (!root || root.dataset.formalInstalled === 'true') return;
    root.dataset.formalInstalled = 'true';

    addCategoryColumns();
    categoryInformation();

    const oldCategory = document.getElementById('category');
    const oldAction = document.getElementById('action');
    [oldCategory, oldAction].forEach(element => element?.closest('.field')?.classList.add('formal-hidden'));

    const actions = document.querySelector('#inspect .actions');
    actions.parentNode.insertBefore(formalSection(), actions);

    document.querySelectorAll('.formal-signature, #formalCrewSignature').forEach(setupCanvas);
    document.querySelectorAll('.signature-clear').forEach(button => button.addEventListener('click', () => {
      const canvas = button.closest('.signature-box').querySelector('canvas');
      clearCanvas(canvas);
    }));
    setupActionLogic();
    prefillInspector();
    const prefillTimer = window.setInterval(() => {
      prefillInspector();
      if (typeof profile !== 'undefined' && profile) window.clearInterval(prefillTimer);
    }, 400);

    refreshFindingsSummary();
    installSaveOverride();
  }

  function formalMetadata(signaturePaths = []) {
    const inspectors = [...document.querySelectorAll('.inspector-signature-row')].map((row, index) => ({
      name: row.querySelector('.formal-inspector-name').value.trim(),
      id: row.querySelector('.formal-inspector-id').value.trim(),
      signature_path: signaturePaths.find(x => x.kind === 'inspector' && x.index === index)?.path || null
    })).filter(x => x.name || x.id || x.signature_path);
    return {
      format: 'ERAMP_FORM_01',
      si_reference: 'SI 8900-6.2 Appendix 5',
      general_notes: document.getElementById('generalRemarks')?.value.trim() || '',
      action_taken: selectedActions(),
      findings: [...document.querySelectorAll('#checklists tr.itemrow')].map(row => ({
        item: row.dataset.code,
        category: row.querySelector('.item-category')?.value || null,
        remark: row.querySelector('.remark')?.value.trim() || null
      })).filter(x => x.category || x.remark),
      inspectors,
      crew_comments: document.getElementById('formalCrewComments')?.value.trim() || '',
      crew_representative: {
        name: document.getElementById('formalCrewName')?.value.trim() || '',
        function: document.getElementById('formalCrewFunction')?.value.trim() || '',
        signature_path: signaturePaths.find(x => x.kind === 'crew')?.path || null
      }
    };
  }

  async function uploadSignatures(inspectionId) {
    const uploads = [];
    const canvases = [...document.querySelectorAll('.inspector-signature-row .formal-signature')];
    for (let index = 0; index < canvases.length; index += 1) {
      const blob = await canvasBlob(canvases[index]);
      if (!blob) continue;
      const path = `${inspectionId}/${session.user.id}/signatures/inspector-${index + 1}-${Date.now()}.png`;
      const response = await db.storage.from('inspection-photos').upload(path, blob, { contentType: 'image/png', upsert: false });
      if (response.error) throw response.error;
      uploads.push({ kind: 'inspector', index, path });
    }
    const crewCanvas = document.getElementById('formalCrewSignature');
    const crewBlob = await canvasBlob(crewCanvas);
    if (crewBlob) {
      const path = `${inspectionId}/${session.user.id}/signatures/crew-${Date.now()}.png`;
      const response = await db.storage.from('inspection-photos').upload(path, crewBlob, { contentType: 'image/png', upsert: false });
      if (response.error) throw response.error;
      uploads.push({ kind: 'crew', path });
    }
    return uploads;
  }

  function validateFormal(rows, targetStatus) {
    const nonCompliant = rows.filter(row => row.querySelector('.result').value === 'Tidak Sesuai');
    const invalidFinding = nonCompliant.find(row => !['1','2','3'].includes(row.querySelector('.item-category').value));
    if (invalidFinding) {
      alert(`${invalidFinding.dataset.code}: select Category 1, 2, or 3 for a finding.`);
      invalidFinding.querySelector('.item-category').focus();
      return false;
    }
    const generalWithoutRemark = rows.find(row => row.querySelector('.item-category').value === 'G' && !row.querySelector('.remark').value.trim());
    if (generalWithoutRemark) {
      alert(`${generalWithoutRemark.dataset.code}: enter a remark for Category G.`);
      generalWithoutRemark.querySelector('.remark').focus();
      return false;
    }
    const actions = selectedActions();
    if (targetStatus === 'submitted' && nonCompliant.length && (!actions.length || actions.every(x => x.code === '0'))) {
      alert('Select an Action Taken other than (0) No remarks because findings are present.');
      return false;
    }
    return true;
  }

  function installSaveOverride() {
    window.saveInspection = async function saveInspectionEnhanced(targetStatus) {
      if (!session) { go('login'); return; }
      const rows = [...document.querySelectorAll('.itemrow')];
      const non = rows.filter(row => row.querySelector('.result').value === 'Tidak Sesuai');
      if (!date.value || !operator.value.trim() || !reg.value.trim()) {
        alert('Complete the date, operator, and aircraft registration.');
        return;
      }
      if (non.some(row => !row.querySelector('.remark').value.trim())) {
        alert('Every non-compliant item must include a finding description.');
        return;
      }
      if (!validateFormal(rows, targetStatus)) return;
      const file = photo.files[0];
      if (file && file.size > 6291456) {
        alert('The maximum photo size is 6 MB.');
        return;
      }

      busy(true, targetStatus === 'draft' ? 'Saving draft...' : 'Submitting inspection...');
      try {
        const id = crypto.randomUUID();
        const routeParts = route.value.split(/[–—-]/);
        const inspectorNames = [...document.querySelectorAll('.formal-inspector-name')].map(x => x.value.trim()).filter(Boolean);
        const inspection = {
          id,
          created_by: session.user.id,
          inspection_date: date.value,
          start_time: time.value || null,
          place: place.value.trim(),
          operator: operator.value.trim(),
          aoc_no: aoc.value.trim() || null,
          registration: reg.value.trim().toUpperCase(),
          aircraft_type: type.value.trim() || null,
          flight_in: flight.value.trim() || null,
          route_from: (routeParts[0] || '').trim() || null,
          route_to: (routeParts[1] || '').trim() || null,
          action_taken: actionText(),
          general_remarks: JSON.stringify(formalMetadata()),
          status: 'draft',
          inspector_name: inspectorNames.join('; ') || profile?.full_name || session.user.email,
          inspector_nip: profile?.nip || null
        };

        let response = await db.from('inspections').insert(inspection);
        if (response.error) throw response.error;

        const actionTaken = actionText();
        const resultRows = rows.map(row => {
          const resultValue = row.querySelector('.result').value;
          const itemCategory = row.querySelector('.item-category')?.value || null;
          const remark = row.querySelector('.remark').value.trim();
          return {
            id: crypto.randomUUID(),
            inspection_id: id,
            section_code: row.dataset.section,
            section_name: row.dataset.sectionName,
            item_code: row.dataset.code,
            item_number: Number(row.dataset.number),
            item_name: row.dataset.name,
            status: mapStatus(resultValue),
            finding: (resultValue === 'Tidak Sesuai' || itemCategory === 'G') ? (remark || null) : null,
            category: itemCategory,
            corrective_action: resultValue === 'Tidak Sesuai' ? actionTaken : null
          };
        });
        response = await db.from('inspection_results').insert(resultRows);
        if (response.error) throw response.error;

        if (file && non.length) {
          const first = resultRows.find(x => x.status === 'non_compliant');
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `${id}/${session.user.id}/${first.id}/${Date.now()}-${safe}`;
          response = await db.storage.from('inspection-photos').upload(path, file, { contentType: file.type, upsert: false });
          if (response.error) throw response.error;
          response = await db.from('finding_photos').insert({
            inspection_id: id,
            result_id: first.id,
            uploaded_by: session.user.id,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size
          });
          if (response.error) throw response.error;
        }

        const signaturePaths = await uploadSignatures(id);
        response = await db.from('inspections').update({
          status: targetStatus,
          submitted_at: targetStatus === 'submitted' ? new Date().toISOString() : null,
          action_taken: actionTaken,
          general_remarks: JSON.stringify(formalMetadata(signaturePaths)),
          inspector_name: inspectorNames.join('; ') || profile?.full_name || session.user.email
        }).eq('id', id);
        if (response.error) throw response.error;

        alert(targetStatus === 'draft' ? 'Draft saved to the server.' : 'Inspection submitted to the server.');
        resetForm();
        await loadData();
        go('history');
      } catch (error) {
        alert(`Unable to save: ${error.message}`);
      } finally {
        busy(false);
      }
    };

    const originalReset = window.resetForm;
    window.resetForm = function resetFormEnhanced() {
      if (typeof originalReset === 'function') originalReset();
      document.querySelectorAll('.item-category').forEach(x => { x.value = ''; });
      document.querySelectorAll('input[name="formalAction"]').forEach(x => { x.checked = x.value === '0'; });
      document.querySelectorAll('.formal-inspector-name,.formal-inspector-id').forEach(x => { x.value = ''; });
      document.getElementById('formalCrewComments').value = '';
      document.getElementById('formalCrewName').value = '';
      document.getElementById('formalCrewFunction').value = '';
      document.querySelectorAll('.formal-signature,#formalCrewSignature').forEach(clearCanvas);
      prefillInspector();
      refreshFindingsSummary();
    };

    window.loadData = async function loadDataEnhanced() {
      if (!session) return;
      const [inspectionResponse, findingResponse] = await Promise.all([
        db.from('inspections').select('*').order('inspection_date', { ascending: false }).order('created_at', { ascending: false }),
        db.from('inspection_results').select('*,inspection:inspections!inner(inspection_date,operator,registration,status)').or('status.eq.non_compliant,category.eq.G').order('created_at', { ascending: false })
      ]);
      if (inspectionResponse.error) throw inspectionResponse.error;
      if (findingResponse.error) throw findingResponse.error;
      inspections = inspectionResponse.data || [];
      findings = findingResponse.data || [];
      render();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(installFormalForm, 40), { once: true });
  } else {
    window.setTimeout(installFormalForm, 40);
  }
})();