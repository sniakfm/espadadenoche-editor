// Espada de noche 데이터 편집기 - Ability Editor Core Controller
const API_BASE = 'http://127.0.0.1:5005/api';

// Global Application State
let appState = {
  currentFilePath: '',
  abilities: {},             // Key -> AbilityItem object map
  selectedId: null,          // Currently active ability ID string
  filterRace: 'ALL',
  filterType: 'ALL',
  filterCategory: 'ALL',
  searchQuery: '',
  draggedTagIndex: null,      // Dragged tag item index
  activeSubSection: 'basic',  // 'basic', 'tags', 'stats'
  editingFieldKey: null,      // Currently editing field key in popup modal
  validationIssues: []
};

// Sub-section keys list for Tab navigation
const SUB_SECTIONS = ['basic', 'tags', 'stats'];

// Editor Presets (Loaded from EditorData/editor_preset.json)
let editorPresets = {
  Races: [
    { value: "none", label: "none (공통 / 없음)" },
    { value: "human", label: "human (인간)" },
    { value: "zombie", label: "zombie (좀비)" }
  ],
  AbilityTypes: [
    { value: "none", label: "none (없음)" },
    { value: "passive", label: "🛡️ passive (패시브)" },
    { value: "active", label: "⚡ active (액티브)" },
    { value: "both", label: "🔄 both (패시브+액티브)" },
    { value: "toggle", label: "🔘 toggle (토글)" }
  ],
  Tags: [
    "free_action",
    "cooldown_when_end",
    "cooldown_when_use",
    "cast_channel",
    "action_channel",
    "cast_predelay",
    "perform_action",
    "action_toggle"
  ],
  DynamicParams: [
    { value: "Cooldown", label: "Cooldown (쿨타임)" },
    { value: "Duration", label: "Duration (지속시간)" },
    { value: "Duration_Cast", label: "Duration_Cast (시전시간)" },
    { value: "Range", label: "Range (사거리)" },
    { value: "Damage", label: "Damage (데미지)" },
    { value: "Speed", label: "Speed (속도)" },
    { value: "Projectile_Speed", label: "Projectile_Speed (투사체속도)" },
    { value: "Filter", label: "Filter (적용대상)" }
  ]
};

// Robust Lenient JSON Parser (Removes BOM, Comments, and Trailing Commas)
function parseRobustJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') return {};
  let cleaned = jsonString.replace(/^\uFEFF/, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');
  }
  return JSON.parse(cleaned);
}

function loadAbilityJsonText(text, filePath) {
  let parsed = parseRobustJson(text);
  if (Array.isArray(parsed)) {
    const obj = {};
    parsed.forEach((item, idx) => {
      const id = item.Id !== undefined ? String(item.Id) : String(idx);
      item.Id = item.Id !== undefined ? item.Id : parseInt(id, 10) || idx;
      obj[id] = item;
    });
    parsed = obj;
  }
  appState.abilities = parsed || {};
  if (filePath) appState.currentFilePath = filePath;

  const fnElem = document.getElementById('currentFileName');
  if (fnElem) {
    fnElem.textContent = appState.currentFilePath ? getBaseName(appState.currentFilePath) : '어빌리티 DB';
  }

  const keys = Object.keys(appState.abilities);
  if (keys.length > 0) {
    selectAbility(keys[0]);
  } else {
    appState.selectedId = null;
    renderAbilityList();
    renderFormEditor();
  }

  renderTableEditor();
  renderGallery();
  renderRawJsonView();
}

// Load Abilities from base_config.json DBPath or Clean Initial State
async function loadDefaultAbilities() {
  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;

  if (typeof invokeFn === 'function') {
    try {
      const cfg = await invokeFn('get_base_config');
      const abilityPath = cfg && cfg.DBPath ? cfg.DBPath.AbilityEdit : null;

      if (abilityPath) {
        const text = await invokeFn('read_file_text', { path: abilityPath });
        if (text) {
          loadAbilityJsonText(text, abilityPath);
          console.log('[어빌리티 DB 복원 성공]', abilityPath);
          return;
        }
      }
    } catch (err) {
      console.warn('Could not load Ability DB from base_config:', err);
    }
  }

  // Clean Initial State (No path in config or file empty)
  appState.currentFilePath = '';
  appState.abilities = {};
  appState.selectedId = null;
  const fnElem = document.getElementById('currentFileName');
  if (fnElem) fnElem.textContent = '어빌리티 DB (비어있음)';

  renderAbilityList();
  renderFormEditor();
  renderTableEditor();
  renderGallery();
  renderRawJsonView();
}

async function loadEditorPresets() {
  try {
    const res = await fetch(`${API_BASE}/presets`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        editorPresets = { ...editorPresets, ...data };
      }
    }
  } catch (err) {
    // Preset fallback
  }

  applyPresetsToUI();
}

function applyPresetsToUI() {
  const filterRace = document.getElementById('filterRace');
  if (filterRace && editorPresets.Races) {
    const curVal = filterRace.value || 'ALL';
    filterRace.innerHTML = '<option value="ALL">전체 종족</option>' +
      editorPresets.Races.map(r => `<option value="${r.value || r}">${r.label || r.value || r}</option>`).join('');
    filterRace.value = curVal;
  }

  const filterType = document.getElementById('filterType');
  if (filterType && editorPresets.AbilityTypes) {
    const curVal = filterType.value || 'ALL';
    filterType.innerHTML = '<option value="ALL">전체 타입</option>' +
      editorPresets.AbilityTypes.map(t => `<option value="${t.value || t}">${t.label || t.value || t}</option>`).join('');
    filterType.value = curVal;
  }

  const inputRace = document.getElementById('inputFieldRace');
  if (inputRace && editorPresets.Races) {
    const curVal = inputRace.value || 'none';
    inputRace.innerHTML = editorPresets.Races.map(r => `<option value="${r.value || r}">${r.label || r.value || r}</option>`).join('');
    inputRace.value = curVal;
  }

  const inputType = document.getElementById('inputFieldAbilityType');
  if (inputType && editorPresets.AbilityTypes) {
    const curVal = inputType.value || 'passive';
    inputType.innerHTML = editorPresets.AbilityTypes.map(t => `<option value="${t.value || t}">${t.label || t.value || t}</option>`).join('');
    inputType.value = curVal;
  }

  const presetTagSelect = document.getElementById('presetTagSelect');
  if (presetTagSelect && editorPresets.Tags) {
    presetTagSelect.innerHTML = '<option value="">+ 자주 쓰는 태그</option>' +
      editorPresets.Tags.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  const quickParamSelect = document.getElementById('quickParamSelect');
  if (quickParamSelect && editorPresets.DynamicParams) {
    quickParamSelect.innerHTML = '<option value="">+ 빠른 속성...</option>' +
      editorPresets.DynamicParams.map(p => `<option value="${p.value || p}">${p.label || p.value || p}</option>`).join('');
  }
}

function focusFirstField() {
  const idInput = document.getElementById('inputFieldId');
  if (idInput) {
    idInput.focus();
    if (idInput.select) idInput.select();
  }
}

function setupInlineFormListeners() {
  const fields = [
    { id: 'inputFieldId', prop: 'Id', isInt: true },
    { id: 'inputFieldAbilityName', prop: 'AbilityName' },
    { id: 'inputFieldStringName', prop: 'StringName' },
    { id: 'inputFieldRace', prop: 'Race' },
    { id: 'inputFieldAbilityType', prop: 'AbilityType' },
    { id: 'inputFieldCatMain', prop: 'Categories_Main' },
    { id: 'inputFieldCatSub', prop: 'Categories_Sub' },
    { id: 'inputFieldImgRes', prop: 'ImgRes' },
    { id: 'inputFieldDesc', prop: 'Desc' }
  ];

  fields.forEach(({ id, prop, isInt }) => {
    const elem = document.getElementById(id);
    if (!elem) return;

    const handleUpdate = () => {
      const item = getSelectedAbility();
      if (!item) return;

      let val = elem.value;
      if (isInt) {
        const newId = parseInt(val, 10);
        if (newId && newId !== item.Id) {
          const oldKey = appState.selectedId;
          delete appState.abilities[oldKey];
          item.Id = newId;
          appState.abilities[newId.toString()] = item;
          appState.selectedId = newId.toString();
          const headId = document.getElementById('currentSkillHeaderId');
          if (headId) headId.textContent = `#${newId}`;
          renderAbilityList();
        }
      } else {
        item[prop] = val;
        if (prop === 'StringName' || prop === 'AbilityName') {
          const headTitle = document.getElementById('currentSkillHeaderTitle');
          if (headTitle) headTitle.textContent = item.StringName || item.AbilityName || '어빌리티 편집';
          renderAbilityList();
        }
      }

      updateCardPreview(item);
    };

    elem.addEventListener('input', handleUpdate);
    elem.addEventListener('change', handleUpdate);
  });
}

function openSystemMenu() {
  const sysModal = document.getElementById('systemMenuModal');
  if (sysModal) {
    sysModal.style.display = 'flex';
  }
}

function closeSystemMenu() {
  const sysModal = document.getElementById('systemMenuModal');
  if (sysModal) {
    sysModal.style.display = 'none';
  }
  window.focus();
  if (document.body) document.body.focus();
}

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'CLOSE_ESC_MENU') {
    closeSystemMenu();
  }
});

function setupEventListeners() {
  // Global Shortcut: Ctrl+S to save, ESC for pause menu
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
      return;
    }

    if (e.key === 'Escape') {
      const sysModal = document.getElementById('systemMenuModal');
      if (sysModal && sysModal.style.display === 'flex') {
        closeSystemMenu();
        return;
      }
      openSystemMenu();
    }
  });

  // Top Nav Tab Switching
  document.querySelectorAll('.view-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      document.querySelectorAll('.view-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const activePane = document.getElementById(`tab-${tabName}`);
      if (activePane) activePane.classList.add('active');

      if (tabName === 'table') renderTableEditor();
      if (tabName === 'preview') renderGallery();
      if (tabName === 'json') renderRawJsonView();
    });
  });

  // Sidebar Sub-Section Tab Buttons
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionKey = btn.getAttribute('data-section');
      switchSubSection(sectionKey);
    });
  });

  // Sidebar Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.searchQuery = e.target.value.toLowerCase();
      renderAbilityList();
    });
  }

  const btnClearSearch = document.getElementById('btnClearSearch');
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      appState.searchQuery = '';
      renderAbilityList();
    });
  }

  // Sidebar Filters
  const filterRace = document.getElementById('filterRace');
  if (filterRace) {
    filterRace.addEventListener('change', (e) => {
      appState.filterRace = e.target.value;
      renderAbilityList();
    });
  }

  const filterType = document.getElementById('filterType');
  if (filterType) {
    filterType.addEventListener('change', (e) => {
      appState.filterType = e.target.value;
      renderAbilityList();
    });
  }

  // Action Buttons
  const btnAddAbility = document.getElementById('btnAddAbility');
  if (btnAddAbility) btnAddAbility.addEventListener('click', createNewAbility);

  const btnDuplicateAbility = document.getElementById('btnDuplicateAbility');
  if (btnDuplicateAbility) btnDuplicateAbility.addEventListener('click', duplicateCurrentAbility);

  const btnDeleteAbility = document.getElementById('btnDeleteAbility');
  if (btnDeleteAbility) btnDeleteAbility.addEventListener('click', deleteCurrentAbility);

  // File Operations
  const btnOpenFile = document.getElementById('btnOpenFile');
  if (btnOpenFile) btnOpenFile.addEventListener('click', openAbilityFileViaDialog);

  const fileInputSelect = document.getElementById('fileInputSelect');
  if (fileInputSelect) fileInputSelect.addEventListener('change', handleFileInputSelect);

  const btnSaveFile = document.getElementById('btnSaveFile');
  if (btnSaveFile) btnSaveFile.addEventListener('click', saveFile);

  const btnNewFile = document.getElementById('btnNewFile');
  if (btnNewFile) btnNewFile.addEventListener('click', resetNewFile);

  // Toggle Card Preview
  const btnTogglePreview = document.getElementById('btnTogglePreview');
  const previewDrawer = document.getElementById('previewDrawer');
  if (btnTogglePreview && previewDrawer) {
    btnTogglePreview.addEventListener('click', () => {
      previewDrawer.classList.toggle('active');
    });
  }

  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  if (btnCloseDrawer && previewDrawer) {
    btnCloseDrawer.addEventListener('click', () => {
      previewDrawer.classList.remove('active');
    });
  }

  // Preset Tag Select
  const presetTagSelect = document.getElementById('presetTagSelect');
  if (presetTagSelect) {
    presetTagSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        addTagToCurrentAbility(val);
        e.target.value = '';
      }
    });
  }

  // Custom Tag Input
  const btnAddCustomTag = document.getElementById('btnAddCustomTag');
  const customTagInput = document.getElementById('customTagInput');
  if (btnAddCustomTag && customTagInput) {
    const handleAddCustom = () => {
      const val = customTagInput.value.trim();
      if (val) {
        addTagToCurrentAbility(val);
        customTagInput.value = '';
      }
    };
    btnAddCustomTag.addEventListener('click', handleAddCustom);
    customTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCustom();
      }
    });
  }

  // Add Attribute Modifier Button
  const btnAddModifier = document.getElementById('btnAddModifier');
  if (btnAddModifier) {
    btnAddModifier.addEventListener('click', () => {
      const item = getSelectedAbility();
      if (!item) return;
      if (!item.Attribute_Modifier) item.Attribute_Modifier = [];
      item.Attribute_Modifier.push({ Attribute: 'speed', Value: 0.1, Type: 'Percent' });
      renderAttributeModifiers(item.Attribute_Modifier);
      updateCardPreview(item);
    });
  }

  // Quick Param Select
  const quickParamSelect = document.getElementById('quickParamSelect');
  if (quickParamSelect) {
    quickParamSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key) {
        addDynamicParamToCurrentAbility(key);
        e.target.value = '';
      }
    });
  }

  // Raw JSON Copy/Apply
  const btnCopyRawJson = document.getElementById('btnCopyRawJson');
  if (btnCopyRawJson) {
    btnCopyRawJson.addEventListener('click', () => {
      const rawText = document.getElementById('rawJsonEditor')?.value;
      if (rawText) {
        navigator.clipboard.writeText(rawText);
        alert('📋 JSON 데이터가 클립보드에 복사되었습니다.');
      }
    });
  }

  const btnApplyRawJson = document.getElementById('btnApplyRawJson');
  if (btnApplyRawJson) {
    btnApplyRawJson.addEventListener('click', () => {
      const rawText = document.getElementById('rawJsonEditor')?.value;
      if (rawText) {
        try {
          loadAbilityJsonText(rawText);
          alert('✅ JSON 데이터가 성공적으로 반영되었습니다.');
        } catch (err) {
          alert(`❌ JSON 구문 오류: ${err.message}`);
        }
      }
    });
  }
}

function switchSubSection(sectionKey) {
  appState.activeSubSection = sectionKey;

  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-section') === sectionKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.sub-section-pane').forEach(pane => {
    if (pane.id === `section-${sectionKey}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
}

function selectAbility(idKey) {
  appState.selectedId = idKey;
  renderAbilityList();
  renderFormEditor();
}

function getSelectedAbility() {
  if (!appState.selectedId) return null;
  return appState.abilities[appState.selectedId] || null;
}

function renderTagChips(tags) {
  const container = document.getElementById('tagChipContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!tags || tags.length === 0) {
    container.innerHTML = '<span class="text-muted" style="font-size:0.8rem; padding:0.4rem;">등록된 태그가 없습니다. 상단에서 태그를 추가해 주세요.</span>';
    return;
  }

  tags.forEach((tag, idx) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.setAttribute('draggable', 'true');
    chip.setAttribute('data-index', idx);

    const handle = document.createElement('span');
    handle.className = 'tag-drag-handle';
    handle.textContent = '⋮⋮';
    chip.appendChild(handle);

    const label = document.createElement('span');
    label.textContent = tag;
    label.title = '더블클릭하여 태그 수정';
    label.style.cursor = 'pointer';

    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      chip.removeAttribute('draggable');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'inline-tag-edit-input';
      input.value = tag;
      input.style.cssText = 'background:#1a1d2e; color:#fff; border:1px solid #8b5cf6; border-radius:3px; padding:1px 4px; font-size:0.8rem; outline:none; width:80px;';

      let isSaved = false;
      const saveEdit = () => {
        if (isSaved) return;
        isSaved = true;
        const val = input.value.trim();
        if (val && val !== tag) {
          tags[idx] = val;
          const item = getSelectedAbility();
          if (item) updateCardPreview(item);
        }
        renderTagChips(tags);
      };

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          saveEdit();
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          isSaved = true;
          renderTagChips(tags);
        }
      });
      input.addEventListener('blur', saveEdit);

      chip.replaceChild(input, label);
      input.focus();
      input.select();
    });

    chip.appendChild(label);

    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-remove-tag';
    btnRemove.textContent = '✕';
    btnRemove.title = '태그 삭제';
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTagFromCurrentAbility(idx);
    });
    chip.appendChild(btnRemove);

    chip.addEventListener('dragstart', handleDragStart);
    chip.addEventListener('dragover', handleDragOver);
    chip.addEventListener('drop', handleDrop);
    chip.addEventListener('dragend', handleDragEnd);

    container.appendChild(chip);
  });
}

function handleDragStart(e) {
  appState.draggedTagIndex = parseInt(this.getAttribute('data-index'), 10);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  const targetIndex = parseInt(this.getAttribute('data-index'), 10);
  const fromIndex = appState.draggedTagIndex;

  if (fromIndex !== null && fromIndex !== targetIndex) {
    const item = getSelectedAbility();
    if (item && item.Tag) {
      const moved = item.Tag.splice(fromIndex, 1)[0];
      item.Tag.splice(targetIndex, 0, moved);
      renderTagChips(item.Tag);
      updateCardPreview(item);
    }
  }
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('drag-over'));
  appState.draggedTagIndex = null;
}

function setupDragAndDrop() {
  // Drag and drop handled via renderTagChips
}

function addTagToCurrentAbility(tagValue) {
  const item = getSelectedAbility();
  if (!item) return;
  if (!item.Tag) item.Tag = [];
  if (!item.Tag.includes(tagValue)) {
    item.Tag.push(tagValue);
    renderTagChips(item.Tag);
    updateCardPreview(item);
  }
}

function removeTagFromCurrentAbility(index) {
  const item = getSelectedAbility();
  if (!item || !item.Tag) return;
  item.Tag.splice(index, 1);
  renderTagChips(item.Tag);
  updateCardPreview(item);
}

function renderFormEditor() {
  const item = getSelectedAbility();
  const formPane = document.getElementById('tab-form');
  if (!formPane) return;

  let emptyContainer = document.getElementById('abilityFormEmptyState');
  let formContainer = formPane.querySelector('.clean-form-container');

  if (!item) {
    if (formContainer) formContainer.style.display = 'none';
    if (!emptyContainer) {
      emptyContainer = document.createElement('div');
      emptyContainer.id = 'abilityFormEmptyState';
      emptyContainer.className = 'empty-state-view';
      emptyContainer.innerHTML = `
        <div style="text-align:center; padding: 4rem 2rem; color: var(--text-muted); width: 100%;">
          <div style="font-size: 2.8rem; margin-bottom: 0.8rem; opacity: 0.4;">📭</div>
          <h3 style="font-size: 1.1rem; color: #fff; margin-bottom: 0.4rem;">어빌리티 데이터가 비어 있습니다</h3>
          <p style="font-size: 0.85rem; max-width: 320px; margin: 0 auto 1.2rem auto; line-height: 1.4;">
            새 어빌리티를 생성하거나 JSON 파일을 불러오세요.
          </p>
          <button class="btn btn-primary btn-sm" onclick="createNewAbility()">+ 새 어빌리티 생성</button>
        </div>
      `;
      formPane.appendChild(emptyContainer);
    }
    emptyContainer.style.display = 'flex';
    emptyContainer.style.justifyContent = 'center';
    emptyContainer.style.alignItems = 'center';
    emptyContainer.style.minHeight = '300px';
    return;
  }

  if (emptyContainer) emptyContainer.style.display = 'none';
  if (formContainer) formContainer.style.display = 'block';

  const headerTitle = document.getElementById('currentSkillHeaderTitle');
  const headerId = document.getElementById('currentSkillHeaderId');
  if (headerTitle) headerTitle.textContent = item.StringName || item.AbilityName || '어빌리티 편집';
  if (headerId) headerId.textContent = `#${item.Id}`;

  const setVal = (id, val) => {
    const elem = document.getElementById(id);
    if (elem) elem.value = (val !== undefined && val !== null) ? val : '';
  };

  setVal('inputFieldId', item.Id);
  setVal('inputFieldAbilityName', item.AbilityName);
  setVal('inputFieldStringName', item.StringName);
  setVal('inputFieldRace', item.Race || 'none');
  setVal('inputFieldAbilityType', item.AbilityType || 'passive');
  setVal('inputFieldCatMain', item.Categories_Main);
  setVal('inputFieldCatSub', item.Categories_Sub);
  setVal('inputFieldImgRes', item.ImgRes);
  setVal('inputFieldDesc', item.Desc);

  renderTagChips(item.Tag || []);
  renderAttributeModifiers(item.Attribute_Modifier || []);
  renderDynamicParameters(item);
  updateCardPreview(item);
}

function renderAttributeModifiers(modifiers) {
  const container = document.getElementById('attrModifierList');
  if (!container) return;
  container.innerHTML = '';

  if (!modifiers || modifiers.length === 0) {
    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:0.35rem 0.6rem; background:rgba(0,0,0,0.25); border-radius:4px; border:1px dashed var(--border-color); width:100%;">등록된 스탯 수정자가 없습니다.</div>';
    return;
  }

  modifiers.forEach((mod, idx) => {
    const row = document.createElement('div');
    row.className = 'attr-modifier-row';
    row.innerHTML = `
      <input type="text" value="${mod.Attribute || ''}" placeholder="속성명 (health, speed 등)" data-field="Attribute">
      <input type="number" step="0.01" value="${mod.Value !== undefined ? mod.Value : 0}" placeholder="값" data-field="Value">
      <select data-field="Type">
        <option value="Flat" ${mod.Type === 'Flat' ? 'selected' : ''}>Flat</option>
        <option value="Percent" ${mod.Type === 'Percent' ? 'selected' : ''}>Percent</option>
      </select>
      <button class="btn btn-sm btn-outline-danger btn-remove-mod">✕</button>
    `;

    row.querySelectorAll('input, select').forEach(elem => {
      elem.addEventListener('input', () => {
        const field = elem.getAttribute('data-field');
        mod[field] = field === 'Value' ? parseFloat(elem.value) || 0 : elem.value;
        updateCardPreview(getSelectedAbility());
      });
    });

    row.querySelector('.btn-remove-mod').addEventListener('click', () => {
      const item = getSelectedAbility();
      if (item && item.Attribute_Modifier) {
        item.Attribute_Modifier.splice(idx, 1);
        renderAttributeModifiers(item.Attribute_Modifier);
        updateCardPreview(item);
      }
    });

    container.appendChild(row);
  });
}

function renderDynamicParameters(item) {
  const container = document.getElementById('dynamicParamsList');
  if (!container) return;
  container.innerHTML = '';

  const knownFields = ['Id', 'AbilityName', 'StringName', 'Race', 'AbilityType', 'Categories_Main', 'Categories_Sub', 'Desc', 'ImgRes', 'Tag', 'Attribute_Modifier'];
  const dynamicKeys = Object.keys(item).filter(k => !knownFields.includes(k));

  if (dynamicKeys.length === 0) {
    container.innerHTML = '<span class="text-muted" style="font-size:0.8rem; padding:0.4rem;">등록된 동적 속성이 없습니다. 상단에서 속성을 추가해 주세요.</span>';
    return;
  }

  dynamicKeys.forEach(key => {
    const row = document.createElement('div');
    row.className = 'dynamic-param-row';
    row.innerHTML = `
      <span class="param-key">${key}</span>
      <input type="text" class="param-val-input" value="${item[key] !== undefined ? item[key] : ''}">
      <button class="btn-remove-param" title="속성 삭제">✕</button>
    `;

    const input = row.querySelector('.param-val-input');
    input.addEventListener('input', () => {
      let val = input.value;
      if (!isNaN(val) && val.trim() !== '') {
        val = Number(val);
      }
      item[key] = val;
      updateCardPreview(item);
    });

    row.querySelector('.btn-remove-param').addEventListener('click', () => {
      delete item[key];
      renderDynamicParameters(item);
      updateCardPreview(item);
    });

    container.appendChild(row);
  });
}

function addDynamicParamToCurrentAbility(key) {
  const item = getSelectedAbility();
  if (!item) return;
  if (item[key] !== undefined) {
    alert(`'${key}' 속성이 이미 존재합니다.`);
    return;
  }

  let defaultVal = 0;
  if (key === 'Filter') defaultVal = 'enemy';
  if (key === 'Cooldown' || key === 'Duration' || key === 'Duration_Cast' || key === 'Range' || key === 'Range-px' || key === 'Damage' || key === 'Speed' || key === 'Projectile_Speed') {
    defaultVal = 1;
  }

  item[key] = defaultVal;
  renderDynamicParameters(item);
  updateCardPreview(item);
}

function updateCardPreview(item) {
  if (!item) return;

  const cardId = document.getElementById('cardId');
  if (cardId) cardId.textContent = `#${item.Id !== undefined ? item.Id : ''}`;

  const cardStringName = document.getElementById('cardStringName');
  if (cardStringName) cardStringName.textContent = item.StringName || item.AbilityName || '이름 없음';

  const cardAbilityName = document.getElementById('cardAbilityName');
  if (cardAbilityName) cardAbilityName.textContent = item.AbilityName || 'CodeName';
  
  const raceTag = document.getElementById('cardRace');
  if (raceTag) {
    const race = (item.Race || 'none').toLowerCase();
    raceTag.textContent = race;
    raceTag.className = `card-race-tag ${race}`;
  }
  
  const typeTag = document.getElementById('cardType');
  if (typeTag) {
    typeTag.textContent = (item.AbilityType || 'passive').toUpperCase();
  }

  const catMain = document.getElementById('cardCatMain');
  if (catMain) catMain.textContent = item.Categories_Main || 'body';

  const catSub = document.getElementById('cardCatSub');
  if (catSub) catSub.textContent = item.Categories_Sub || 'empower';

  const cardDesc = document.getElementById('cardDesc');
  if (cardDesc) cardDesc.textContent = item.Desc || '설명이 없습니다.';

  const statsGrid = document.getElementById('cardStatsGrid');
  if (statsGrid) {
    statsGrid.innerHTML = '';
    const statKeys = ['Cooldown', 'Range', 'Range-px', 'Duration', 'Damage', 'Speed'];
    statKeys.forEach(k => {
      if (item[k] !== undefined) {
        const badge = document.createElement('div');
        badge.className = 'stat-badge';
        badge.innerHTML = `<span>${k}:</span> <strong>${item[k]}</strong>`;
        statsGrid.appendChild(badge);
      }
    });
  }

  const modBox = document.getElementById('cardModifiersBox');
  if (modBox) {
    modBox.innerHTML = '';
    if (item.Attribute_Modifier && item.Attribute_Modifier.length > 0) {
      modBox.style.display = 'flex';
      item.Attribute_Modifier.forEach(m => {
        const line = document.createElement('div');
        const valStr = m.Type === 'Percent' ? `+${(m.Value * 100).toFixed(0)}%` : `+${m.Value}`;
        line.textContent = `⚡ ${m.Attribute}: ${valStr}`;
        modBox.appendChild(line);
      });
    } else {
      modBox.style.display = 'none';
    }
  }

  const tagsList = document.getElementById('cardTagsList');
  if (tagsList) {
    tagsList.innerHTML = '';
    (item.Tag || []).forEach(t => {
      const tagBadge = document.createElement('span');
      tagBadge.className = 'mini-tag-badge';
      tagBadge.textContent = t;
      tagsList.appendChild(tagBadge);
    });
  }
}

function renderTableEditor() {
  const tbody = document.getElementById('tableEditorBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const entries = Object.entries(appState.abilities);
  entries.forEach(([key, item]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" class="cell-input" value="${item.Id}" data-field="Id" data-id="${key}"></td>
      <td><input type="text" class="cell-input" value="${item.AbilityName || ''}" data-field="AbilityName" data-id="${key}"></td>
      <td><input type="text" class="cell-input" value="${item.StringName || ''}" data-field="StringName" data-id="${key}"></td>
      <td>
        <select class="cell-input" data-field="Race" data-id="${key}">
          <option value="none" ${item.Race === 'none' ? 'selected' : ''}>none</option>
          <option value="human" ${item.Race === 'human' ? 'selected' : ''}>human</option>
          <option value="zombie" ${item.Race === 'zombie' ? 'selected' : ''}>zombie</option>
        </select>
      </td>
      <td>
        <select class="cell-input" data-field="AbilityType" data-id="${key}">
          <option value="passive" ${item.AbilityType === 'passive' ? 'selected' : ''}>passive</option>
          <option value="active" ${item.AbilityType === 'active' ? 'selected' : ''}>active</option>
          <option value="both" ${item.AbilityType === 'both' ? 'selected' : ''}>both</option>
          <option value="toggle" ${item.AbilityType === 'toggle' ? 'selected' : ''}>toggle</option>
        </select>
      </td>
      <td><input type="number" step="0.1" class="cell-input" value="${item.Cooldown !== undefined ? item.Cooldown : ''}" data-field="Cooldown" data-id="${key}"></td>
      <td><input type="number" step="1" class="cell-input" value="${item.Damage !== undefined ? item.Damage : ''}" data-field="Damage" data-id="${key}"></td>
      <td><input type="text" class="cell-input" value="${item.Desc || ''}" data-field="Desc" data-id="${key}"></td>
    `;

    tr.querySelectorAll('.cell-input').forEach(elem => {
      elem.addEventListener('input', () => {
        const idKey = elem.getAttribute('data-id');
        const field = elem.getAttribute('data-field');
        const targetItem = appState.abilities[idKey];
        if (!targetItem) return;

        let typedVal = elem.value;
        if (field === 'Cooldown' || field === 'Damage') {
          typedVal = typedVal === '' ? undefined : parseFloat(typedVal);
        }

        if (field === 'Id') {
          const newId = parseInt(typedVal, 10);
          if (newId && newId !== targetItem.Id) {
            delete appState.abilities[idKey];
            targetItem.Id = newId;
            appState.abilities[newId.toString()] = targetItem;
            appState.selectedId = newId.toString();
          }
        } else {
          targetItem[field] = typedVal;
        }

        renderAbilityList();
      });
    });

    tbody.appendChild(tr);
  });
}

function renderAbilityList() {
  const container = document.getElementById('abilityList');
  if (!container) return;
  container.innerHTML = '';

  const entries = Object.entries(appState.abilities);
  let filtered = entries.filter(([key, item]) => {
    if (!item) return false;
    if (appState.filterRace !== 'ALL' && item.Race !== appState.filterRace) return false;
    if (appState.filterType !== 'ALL' && item.AbilityType !== appState.filterType) return false;
    if (appState.filterCategory !== 'ALL' && item.Categories_Main !== appState.filterCategory) return false;

    if (appState.searchQuery) {
      const q = appState.searchQuery.toLowerCase();
      const matchId = String(item.Id ?? key).toLowerCase().includes(q);
      const matchName = String(item.AbilityName || '').toLowerCase().includes(q);
      const matchKorean = String(item.StringName || '').toLowerCase().includes(q);
      const matchDesc = String(item.Desc || '').toLowerCase().includes(q);
      return matchId || matchName || matchKorean || matchDesc;
    }
    return true;
  });

  const countBadge = document.getElementById('abilityCountBadge');
  if (countBadge) countBadge.textContent = `${filtered.length}개 스킬`;

  filtered.forEach(([key, item]) => {
    const elem = document.createElement('div');
    elem.className = `ability-item ${key === appState.selectedId ? 'active' : ''}`;
    const displayId = item.Id !== undefined ? item.Id : key;
    const displayName = item.StringName || item.AbilityName || `어빌리티 ${displayId}`;
    const race = item.Race || 'none';
    const aType = item.AbilityType || 'passive';
    
    elem.innerHTML = `
      <div class="item-left">
        <div class="item-title-row">
          <span class="item-id">#${displayId}</span>
          <span class="item-korean">${displayName}</span>
        </div>
        <div class="item-sub-row">
          <span class="item-race-badge ${race}">${race}</span>
          <span class="item-type-badge">${aType}</span>
        </div>
      </div>
    `;

    elem.addEventListener('click', () => {
      selectAbility(key);
    });

    container.appendChild(elem);
  });
}

function createNewAbility() {
  const nextId = getNextAvailableId();
  const newAbility = {
    Id: nextId,
    AbilityName: `NewSkill_${nextId}`,
    StringName: `새 스킬 ${nextId}`,
    Race: 'human',
    AbilityType: 'active',
    Categories_Main: 'body',
    Categories_Sub: 'empower',
    Tag: ['free_action'],
    Desc: '새로 추가된 어빌리티 설명입니다.',
    ImgRes: 'res://resource/graphics/card_image/sword-svgrepo-com.png'
  };

  appState.abilities[nextId.toString()] = newAbility;
  selectAbility(nextId.toString());
  renderTableEditor();
  renderGallery();
  renderRawJsonView();
}

function duplicateCurrentAbility() {
  const item = getSelectedAbility();
  if (!item) return;

  const nextId = getNextAvailableId();
  const cloned = JSON.parse(JSON.stringify(item));
  cloned.Id = nextId;
  cloned.AbilityName = `${item.AbilityName || 'Skill'}_copy`;
  cloned.StringName = `${item.StringName || '스킬'} (복사본)`;

  appState.abilities[nextId.toString()] = cloned;
  selectAbility(nextId.toString());
  renderTableEditor();
  renderGallery();
  renderRawJsonView();
}

function deleteCurrentAbility() {
  const item = getSelectedAbility();
  if (!item) return;

  const confirmDelete = confirm(`정말로 [ID #${item.Id}: ${item.StringName || item.AbilityName}] 어빌리티를 삭제하시겠습니까?`);
  if (!confirmDelete) return;

  delete appState.abilities[appState.selectedId];
  const keys = Object.keys(appState.abilities);
  appState.selectedId = keys.length > 0 ? keys[0] : null;

  renderAbilityList();
  renderFormEditor();
  renderTableEditor();
  renderGallery();
  renderRawJsonView();
}

function getNextAvailableId() {
  const keys = Object.keys(appState.abilities).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
  if (keys.length === 0) return 1;
  return Math.max(...keys) + 1;
}

function renderGallery() {
  const container = document.getElementById('galleryGrid');
  if (!container) return;
  container.innerHTML = '';

  const entries = Object.entries(appState.abilities);
  entries.forEach(([key, item]) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    const race = (item.Race || 'none').toLowerCase();
    
    card.innerHTML = `
      <div class="gallery-card-header">
        <span class="gallery-id">#${item.Id}</span>
        <span class="card-race-tag ${race}">${race}</span>
      </div>
      <div class="gallery-card-body">
        <h4>${item.StringName || item.AbilityName || '이름 없음'}</h4>
        <p class="gallery-code-name">${item.AbilityName || ''}</p>
        <p class="gallery-desc">${item.Desc || '설명 없음'}</p>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelector('.view-tabs .tab-btn[data-tab="form"]')?.click();
      selectAbility(key);
    });

    container.appendChild(card);
  });
}

function renderRawJsonView() {
  const editor = document.getElementById('rawJsonEditor');
  if (editor) {
    editor.value = JSON.stringify(appState.abilities, null, 2);
  }
}

async function openAbilityFileViaDialog() {
  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (typeof invokeFn === 'function') {
    try {
      const filePath = await invokeFn('open_file_dialog', { filterExt: 'json' });
      if (filePath) {
        const text = await invokeFn('read_file_text', { path: filePath });
        loadAbilityJsonText(text, filePath);
        await invokeFn('update_db_path', { editorKey: 'AbilityEdit', editor_key: 'AbilityEdit', path: filePath });
        console.log(`[어빌리티 DB 로드 완료] ${filePath}`);
      }
    } catch (e) {
      alert(`파일 읽기 오류: ${e.message || e}`);
    }
    return;
  }

  const fileInputSelect = document.getElementById('fileInputSelect');
  if (fileInputSelect) fileInputSelect.click();
}

function handleFileInputSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      loadAbilityJsonText(event.target.result, file.name);
    } catch (err) {
      alert(`파일 읽기 오류: ${err.message}`);
    }
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
}

async function saveFile() {
  const jsonStr = JSON.stringify(appState.abilities, null, 2);
  const defaultName = getBaseName(appState.currentFilePath) || 'abilities.json';

  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (typeof invokeFn === 'function') {
    try {
      const savedPath = await invokeFn('save_file_dialog', {
        defaultName: defaultName,
        content: jsonStr
      });
      if (savedPath) {
        appState.currentFilePath = savedPath;
        document.getElementById('currentFileName').textContent = getBaseName(savedPath);
        await invokeFn('update_db_path', { editorKey: 'AbilityEdit', editor_key: 'AbilityEdit', path: savedPath });
      }
    } catch (err) {
      alert(`저장 중 오류 발생: ${err}`);
    }
    return;
  }

  // Web fallback download
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
}

function resetNewFile() {
  if (confirm('현재 작업 중인 내용을 초기화하고 새 파일 작업을 시작하시겠습니까?')) {
    appState.currentFilePath = '';
    appState.abilities = {};
    appState.selectedId = null;
    document.getElementById('currentFileName').textContent = '새 어빌리티 DB';
    renderAbilityList();
    renderFormEditor();
    renderTableEditor();
    renderGallery();
    renderRawJsonView();
  }
}

function getBaseName(pathStr) {
  if (!pathStr) return 'untitled.json';
  return pathStr.split(/[\\/]/).pop();
}

// Master Initialization Entry Point
async function init() {
  setupEventListeners();
  setupInlineFormListeners();
  await loadDefaultAbilities();
  loadEditorPresets();
}

// Execute Entry Point Immediately
init();
