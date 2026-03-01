// ================================================================
// CENTRAL EDITOR STATE
//
// State structure:
//   editorState[tabType] = {
//     meta:    { _format, _type, _hasLevels, version, _fileName },
//     rows:    [{ groupId, table, baseId, customId, level,
//                 values: { fieldId: { value, type, column?, endTag, _originalLevel? } },
//                 _fieldOrder, _groupFieldOrder? }],
//     columns: [{ id, name, wireType, metaType }]
//   }
// ================================================================

import {
  getFieldDisplayName, getFieldMetaType, mapMetaTypeToWireType,
} from './utils.js';

/**
 * The main state store, one entry per editor tab.
 * null means no data has been loaded for that tab.
 */
export const editorState = {
  items:          null,
  abilities:      null,
  units:          null,
  buffs:          null,
  upgrades:       null,
  destructables:  null,
  doodads:        null,
};

// ---- Active tab ----

let currentActiveTab = 'items';

export function getActiveTab() {
  return currentActiveTab;
}

export function setActiveTab(tabType) {
  currentActiveTab = tabType;
}

// ---- Show-all-columns toggle ----

let allColumnsVisible = false;

export function getShowAllColumns() {
  return allColumnsVisible;
}

export function setShowAllColumns(visible) {
  allColumnsVisible = visible;
}

// ---- Collapsed category tracking ----

const collapsedCategoriesMap = {};

export function getCollapsedCategories(tabType) {
  if (!collapsedCategoriesMap[tabType]) {
    collapsedCategoriesMap[tabType] = new Set();
  }
  return collapsedCategoriesMap[tabType];
}

// ================================================================
// DOM → STATE SYNCHRONIZATION
//
// Reads every <input> and <select> with data-r/data-f attributes
// inside the active tab pane, and writes their values back into
// the corresponding row.values[fieldId].
// Must be called before any export or destructive state operation.
// ================================================================

export function synchronizeDOMToState(tabType) {
  const tabData = editorState[tabType];
  if (!tabData) return;

  const paneElement = document.getElementById(tabType + 'Pane');
  const inputElements = paneElement.querySelectorAll('input[data-r], select[data-r]');

  for (const element of inputElements) {
    const rowIndex = parseInt(element.dataset.r);
    const fieldId  = element.dataset.f;
    const row = tabData.rows[rowIndex];
    if (!row) continue;

    const rawValue = element.value;

    if (row.values[fieldId]) {
      // --- Existing cell: update its value ---
      const cell = row.values[fieldId];
      if (cell.type === 'int') {
        const parsed = parseInt(rawValue, 10);
        cell.value = isNaN(parsed) ? 0 : parsed;
      } else if (cell.type === 'real' || cell.type === 'unreal') {
        const parsed = parseFloat(rawValue);
        cell.value = isNaN(parsed) ? 0 : parsed;
      } else {
        cell.value = rawValue;
      }
    } else if (rawValue !== '') {
      // --- New cell: create only when the user typed/selected something ---
      let column = tabData.columns.find(col => col.id === fieldId);

      // Column may not be in tabData.columns yet (e.g. added via "All Columns").
      // Resolve the wire type from KNOWN metadata and register the column.
      if (!column) {
        const metaType = getFieldMetaType(fieldId);
        const wireType = mapMetaTypeToWireType(metaType);
        column = {
          id:       fieldId,
          name:     getFieldDisplayName(fieldId),
          wireType: wireType,
          metaType: metaType || wireType,
        };
        tabData.columns.push(column);
      }

      const cellWireType = column.wireType;
      const newCell = { value: rawValue, type: cellWireType };

      if (cellWireType === 'int') {
        const parsed = parseInt(rawValue, 10);
        newCell.value = isNaN(parsed) ? 0 : parsed;
      } else if (cellWireType === 'real' || cellWireType === 'unreal') {
        const parsed = parseFloat(rawValue);
        newCell.value = isNaN(parsed) ? 0 : parsed;
      }

      if (tabData.meta._hasLevels) {
        newCell.column = 0;
      }
      row.values[fieldId] = newCell;
    }
  }
}
