// ================================================================
// FILE I/O
//
// Handles loading binary / JSON files and exporting data back
// to binary (.w3t, .w3a, etc.) or JSON format.
// ================================================================

import {
  TYPES_WITH_LEVELS, EXTENSION_INFO, EXTENSION_TO_TAB_TYPE,
} from './constants.js';
import {
  editorState, getActiveTab, synchronizeDOMToState,
} from './state.js';
import {
  getOrderedFieldIds, coerceValueByType,
} from './utils.js';
import { parseBinaryBuffer, buildBinaryFromState, ingestParsedData } from './parser.js';

// Forward-declared: set by core.js after all modules load
let _switchTab = null;

/**
 * Wire up the switchTab callback so fileio can switch tabs after loading.
 * Called once from core.js during initialisation.
 */
export function setFileSwitchTabCallback(fn) {
  _switchTab = fn;
}

// ================================================================
// UNIFIED LOAD FILE  (auto-detect format from extension)
// ================================================================

export function loadFile() {
  const fileInput = document.createElement('input');
  fileInput.type     = 'file';
  fileInput.multiple = true;
  fileInput.accept   = '.w3t,.w3a,.w3u,.w3b,.w3h,.w3d,.w3q,.json';

  fileInput.onchange = (event) => {
    const files = [...event.target.files];
    if (!files.length) return;

    let lastTabType = null;
    let pendingCount = files.length;

    function onFileProcessed(tabType) {
      lastTabType = tabType;
      if (--pendingCount === 0 && lastTabType && _switchTab) {
        _switchTab(lastTabType);
      }
    }

    for (const file of files) {
      const extension = file.name.split('.').pop().toLowerCase();

      if (extension === 'json') {
        loadSingleJSONFile(file, onFileProcessed);
        continue;
      }

      const extensionInfo = EXTENSION_INFO[extension];
      if (!extensionInfo) {
        alert('Unsupported file type: .' + extension);
        onFileProcessed(null);
        continue;
      }

      const tabType = EXTENSION_TO_TAB_TYPE[extension] || 'items';
      const reader  = new FileReader();

      reader.onload = (loadEvent) => {
        try {
          const parsed = parseBinaryBuffer(loadEvent.target.result, extension);
          ingestParsedData(tabType, parsed, file.name);
          onFileProcessed(tabType);
        } catch (error) {
          alert('Binary parse error (' + file.name + '): ' + error.message + '\n' + error.stack);
          onFileProcessed(null);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  fileInput.click();
}

// ================================================================
// LOAD BINARY FILE  (single file, type-specific)
// ================================================================

export function loadBinaryFile(tabType) {
  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = '.w3t,.w3a,.w3u,.w3b,.w3h,.w3d,.w3q';

  fileInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const extension    = file.name.split('.').pop().toLowerCase();
    const extensionInfo = EXTENSION_INFO[extension];
    if (!extensionInfo) {
      alert('Unsupported file type: .' + extension);
      return;
    }

    const detectedTabType = EXTENSION_TO_TAB_TYPE[extension] || 'items';
    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      try {
        const parsed = parseBinaryBuffer(loadEvent.target.result, extension);
        ingestParsedData(detectedTabType, parsed, file.name);
        if (_switchTab) _switchTab(detectedTabType);
      } catch (error) {
        alert('Binary parse error: ' + error.message + '\n' + error.stack);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  fileInput.click();
}

// ================================================================
// LOAD JSON FILE  (legacy import)
// ================================================================

export function loadJSONFile() {
  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = '.json';

  fileInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const json = JSON.parse(loadEvent.target.result);
        const fileExtension = json._type || 'w3t';
        const hasLevels = json._hasLevels || TYPES_WITH_LEVELS.has(fileExtension);
        const parsed = {
          version:   json.version || 3,
          hasLevels,
          ext:       fileExtension,
          objects: {
            original: json.original || json.original_items || [],
            custom:   json.custom   || json.custom_items   || [],
          },
        };
        const detectedTabType = EXTENSION_TO_TAB_TYPE[fileExtension] || 'items';
        ingestParsedData(detectedTabType, parsed, file.name);
        if (_switchTab) _switchTab(detectedTabType);
      } catch (error) {
        alert('JSON error: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  fileInput.click();
}

// ================================================================
// HELPER: load a single JSON file (used by the multi-file loader)
// ================================================================

function loadSingleJSONFile(file, onComplete) {
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    try {
      const json = JSON.parse(loadEvent.target.result);
      const fileExtension = json._type || 'w3t';
      const hasLevels = json._hasLevels || TYPES_WITH_LEVELS.has(fileExtension);
      const parsed = {
        version:   json.version || 3,
        hasLevels,
        ext:       fileExtension,
        objects: {
          original: json.original || json.original_items || [],
          custom:   json.custom   || json.custom_items   || [],
        },
      };
      const detectedTabType = EXTENSION_TO_TAB_TYPE[fileExtension] || 'items';
      ingestParsedData(detectedTabType, parsed, file.name);
      onComplete(detectedTabType);
    } catch (error) {
      alert('JSON error (' + file.name + '): ' + error.message);
      onComplete(null);
    }
  };
  reader.readAsText(file);
}

// ================================================================
// EXPORT BINARY  (.w3t / .w3a / etc.)
// ================================================================

export function exportBinary(tabType) {
  // Default to active tab
  if (!tabType) tabType = getActiveTab();

  // Fall back to active tab if specified type has no data
  if (!editorState[tabType] && editorState[getActiveTab()]) {
    tabType = getActiveTab();
  }

  const tabData = editorState[tabType];
  if (!tabData) {
    alert('No ' + tabType + ' data loaded.');
    return;
  }

  const writer = buildBinaryFromState(tabType);
  if (!writer) {
    alert('No ' + tabType + ' data loaded.');
    return;
  }

  const fileExtension = tabData.meta._type || 'w3t';
  const blob = writer.toBlob();
  const downloadUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href     = downloadUrl;
  anchor.download = tabData.meta._fileName || ('war3map.' + fileExtension);
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

// ================================================================
// EXPORT JSON  (debug / legacy)
// ================================================================

export function exportJSON() {
  const tabType = getActiveTab();
  const tabData = editorState[tabType];
  if (!tabData) {
    alert('No ' + tabType + ' data loaded.');
    return;
  }
  synchronizeDOMToState(tabType);

  const hasLevels = tabData.meta._hasLevels;
  const jsonOutput = {
    _format:    tabData.meta._format,
    _type:      tabData.meta._type,
    _hasLevels: hasLevels,
    version:    tabData.meta.version,
    original:   [],
    custom:     [],
  };

  if (!hasLevels) {
    buildFlatJSONExport(tabData, jsonOutput);
  } else {
    buildLeveledJSONExport(tabData, jsonOutput);
  }

  const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href     = downloadUrl;
  anchor.download = (tabType || 'data') + '.json';
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

// ================================================================
// JSON EXPORT BUILDERS
// ================================================================

function buildFlatJSONExport(tabData, jsonOutput) {
  for (const row of tabData.rows) {
    const exportObject = {
      base_id:   row.baseId,
      custom_id: row.customId || null,
      fields:    [],
    };

    const orderedIds = getOrderedFieldIds(row, tabData.columns);
    for (const fieldId of orderedIds) {
      const cell = row.values[fieldId];
      if (!cell) continue;
      const fieldType = cell.type
        || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
        || 'string';
      exportObject.fields.push({
        id:    fieldId,
        type:  fieldType,
        value: coerceValueByType(cell.value, fieldType),
      });
    }
    jsonOutput[row.table].push(exportObject);
  }
}

function buildLeveledJSONExport(tabData, jsonOutput) {
  const rowGroupsByGroupId = new Map();
  const groupIdOrder = [];

  for (const row of tabData.rows) {
    if (!rowGroupsByGroupId.has(row.groupId)) {
      rowGroupsByGroupId.set(row.groupId, []);
      groupIdOrder.push(row.groupId);
    }
    rowGroupsByGroupId.get(row.groupId).push(row);
  }

  for (const groupId of groupIdOrder) {
    const groupRows = rowGroupsByGroupId.get(groupId);
    const firstRow  = groupRows[0];

    const exportObject = {
      base_id:   firstRow.baseId,
      custom_id: firstRow.customId || null,
      fields:    [],
    };

    const rowByLevel = {};
    for (const row of groupRows) rowByLevel[row.level] = row;

    if (firstRow._groupFieldOrder && firstRow._groupFieldOrder.length > 0) {
      appendFieldsFromOriginalOrder(exportObject, firstRow, groupRows, rowByLevel, tabData);
    } else {
      appendFieldsSequentially(exportObject, groupRows, tabData);
    }

    jsonOutput[firstRow.table].push(exportObject);
  }
}

function appendFieldsFromOriginalOrder(exportObject, firstRow, groupRows, rowByLevel, tabData) {
  const processedKeys = new Set();

  for (const { id: fieldId, level } of firstRow._groupFieldOrder) {
    const deduplicationKey = fieldId + '@' + level;
    if (processedKeys.has(deduplicationKey)) continue;
    processedKeys.add(deduplicationKey);

    let sourceRow  = rowByLevel[level];
    let sourceCell = sourceRow ? sourceRow.values[fieldId] : null;
    if (!sourceCell && rowByLevel[0]) {
      sourceRow  = rowByLevel[0];
      sourceCell = sourceRow.values[fieldId];
    }
    if (!sourceRow || !sourceCell) continue;

    const fieldType = sourceCell.type
      || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
      || 'string';
    const writeLevel = sourceCell._originalLevel != null ? sourceCell._originalLevel : level;

    exportObject.fields.push({
      id:     fieldId,
      type:   fieldType,
      level:  writeLevel,
      column: sourceCell.column ?? 0,
      value:  coerceValueByType(sourceCell.value, fieldType),
    });
  }

  // Append any NEW fields not in original order
  for (const row of groupRows) {
    for (const column of tabData.columns) {
      const cell = row.values[column.id];
      if (!cell) continue;
      const deduplicationKey = column.id + '@'
        + (cell._originalLevel != null ? cell._originalLevel : row.level);
      if (processedKeys.has(deduplicationKey)) continue;
      processedKeys.add(deduplicationKey);

      const fieldType = cell.type || column.wireType;
      const writeLevel = cell._originalLevel != null ? cell._originalLevel : (row.level ?? 0);
      exportObject.fields.push({
        id:     column.id,
        type:   fieldType,
        level:  writeLevel,
        column: cell.column ?? 0,
        value:  coerceValueByType(cell.value, cell.type || column.wireType),
      });
    }
  }
}

function appendFieldsSequentially(exportObject, groupRows, tabData) {
  for (const row of groupRows) {
    const orderedIds = getOrderedFieldIds(row, tabData.columns);
    for (const fieldId of orderedIds) {
      const cell = row.values[fieldId];
      if (!cell) continue;
      const fieldType = cell.type
        || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
        || 'string';
      const writeLevel = cell._originalLevel != null ? cell._originalLevel : (row.level ?? 0);
      exportObject.fields.push({
        id:     fieldId,
        type:   fieldType,
        level:  writeLevel,
        column: cell.column ?? 0,
        value:  coerceValueByType(cell.value, fieldType),
      });
    }
  }
}
