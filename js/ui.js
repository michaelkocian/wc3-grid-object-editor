// ================================================================
// UI INTERACTIONS
//
// Tab switching, row search/filter, add/remove/duplicate rows,
// level count changes, scroll preservation, popup management,
// keyboard navigation, column auto-fit, and column resize.
// ================================================================

import {
  LEVEL_COUNT_FIELD, TAB_ENTITY_NAMES, ALL_TAB_TYPES,
} from './constants.js';
import {
  editorState, getActiveTab, setActiveTab,
  getShowAllColumns, setShowAllColumns,
  getCollapsedCategories, synchronizeDOMToState,
} from './state.js';
import { generateNextUnusedCustomId } from './utils.js';
import { renderTable, updateTabLabel, updateStatsBar } from './renderer.js';

// ================================================================
// SCROLL SAVE / RESTORE
// ================================================================

function saveScrollPosition(tabType) {
  const paneElement   = document.getElementById(tabType + 'Pane');
  const tableWrapper  = paneElement ? paneElement.querySelector('.tw') : null;
  return tableWrapper
    ? { top: tableWrapper.scrollTop, left: tableWrapper.scrollLeft }
    : { top: 0, left: 0 };
}

function restoreScrollPosition(tabType, savedPosition) {
  if (!savedPosition) return;
  const paneElement  = document.getElementById(tabType + 'Pane');
  const tableWrapper = paneElement ? paneElement.querySelector('.tw') : null;
  if (tableWrapper) {
    tableWrapper.scrollTop  = savedPosition.top;
    tableWrapper.scrollLeft = savedPosition.left;
  }
}

// ================================================================
// TAB SWITCHING
// ================================================================

export function switchTab(tabType) {
  setActiveTab(tabType);
  document.querySelectorAll('.tab').forEach(
    tabElement => tabElement.classList.toggle('active', tabElement.dataset.t === tabType)
  );
  for (const type of ALL_TAB_TYPES) {
    document.getElementById(type + 'Pane').classList.toggle('hidden', tabType !== type);
  }

  // Re-render if showAllColumns state changed since last render
  const tabData = editorState[tabType];
  if (tabData && tabData._renderedAllCols !== getShowAllColumns()) {
    synchronizeDOMToState(tabType);
    const scrollPosition = saveScrollPosition(tabType);
    renderTable(tabType);
    restoreScrollPosition(tabType, scrollPosition);
  }
  updateStatsBar(tabType);
}

// ================================================================
// TOGGLE ALL COLUMNS
// ================================================================

export function toggleAllColumns() {
  setShowAllColumns(document.getElementById('showAllColsToggle').checked);
  const tabType = getActiveTab();
  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);
  const scrollPosition = saveScrollPosition(tabType);
  renderTable(tabType);
  restoreScrollPosition(tabType, scrollPosition);
}

// ================================================================
// TOGGLE CATEGORY (collapse / expand)
// ================================================================

export function toggleCategory(tabType, categoryId) {
  const collapsedSet = getCollapsedCategories(tabType);
  if (collapsedSet.has(categoryId)) {
    collapsedSet.delete(categoryId);
  } else {
    collapsedSet.add(categoryId);
  }

  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);
  const scrollPosition = saveScrollPosition(tabType);
  renderTable(tabType);
  restoreScrollPosition(tabType, scrollPosition);
}

// ================================================================
// SEARCH / FILTER
// ================================================================

export function filterRows() {
  const query    = document.getElementById('searchBox').value.toLowerCase().trim();
  const tabType  = getActiveTab();
  const paneElem = document.getElementById(tabType + 'Pane');
  const allRows  = paneElem.querySelectorAll('tbody tr');

  if (!query) {
    allRows.forEach(row => row.style.display = '');
    return;
  }

  const tabData = editorState[tabType];
  if (tabData && tabData.meta._hasLevels) {
    // Leveled: show entire group if any row matches
    const matchedGroupIds = new Set();
    allRows.forEach(row => {
      if ((row.dataset.s || '').includes(query)) {
        matchedGroupIds.add(row.dataset.gid);
      }
    });
    allRows.forEach(row => {
      row.style.display = matchedGroupIds.has(row.dataset.gid) ? '' : 'none';
    });
  } else {
    allRows.forEach(row => {
      row.style.display = (row.dataset.s || '').includes(query) ? '' : 'none';
    });
  }
}

// ================================================================
// ADD ROW
// ================================================================

export function showAddRow() {
  const tabType = getActiveTab();
  if (!editorState[tabType]) {
    alert('Load data first.');
    return;
  }

  const entityName = TAB_ENTITY_NAMES[tabType] || 'Object';
  document.getElementById('popRowTitle').textContent = 'Add New ' + entityName;

  const hasLevels = editorState[tabType]?.meta._hasLevels;
  document.getElementById('arLevelWrap').style.display = hasLevels ? '' : 'none';
  document.getElementById('arBase').value   = '';
  document.getElementById('arLevels').value = '1';
  document.getElementById('popRow').classList.remove('hidden');
  document.getElementById('arBase').focus();
}

export function confirmAddRow() {
  const tabType = getActiveTab();
  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);

  const baseId = document.getElementById('arBase').value.trim();
  const table  = document.getElementById('arTable').value;

  if (!baseId || baseId.length !== 4) {
    alert('Base ID must be exactly 4 characters.');
    return;
  }

  let customId = '';
  if (table === 'custom') {
    customId = generateNextUnusedCustomId(tabType);
    if (!customId) return;
  }

  const nextGroupId = tabData.rows.length > 0
    ? Math.max(...tabData.rows.map(row => row.groupId)) + 1
    : 0;

  if (!tabData.meta._hasLevels) {
    tabData.rows.push({
      groupId:  nextGroupId,
      table,
      baseId,
      customId,
      level:    null,
      values:   {},
      _fieldOrder: [],
    });
  } else {
    const levelCount = parseInt(document.getElementById('arLevels').value) || 1;
    for (let level = 0; level <= levelCount; level++) {
      tabData.rows.push({
        groupId:  nextGroupId,
        table,
        baseId,
        customId,
        level,
        values:   {},
        _fieldOrder: [],
      });
    }
  }

  renderTable(tabType);
  updateTabLabel(tabType);
  closePopup('popRow');
}

// ================================================================
// REMOVE ROW / GROUP
// ================================================================

export function removeRow(tabType, rowIndex) {
  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);

  if (!confirm('Remove this row? Warcraft3 import can only overwrite existing data. '
    + 'Unless you delete it from your map it will not disappear.')) return;

  const scrollPosition = saveScrollPosition(tabType);
  tabData.rows.splice(rowIndex, 1);
  renderTable(tabType);
  updateTabLabel(tabType);
  restoreScrollPosition(tabType, scrollPosition);
}

export function removeGroup(tabType, groupId) {
  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);

  if (!confirm('Remove this object and all its levels? Warcraft3 import can only overwrite '
    + 'existing data. Unless you delete it from your map it will not disappear.')) return;

  const scrollPosition = saveScrollPosition(tabType);
  tabData.rows = tabData.rows.filter(row => row.groupId !== groupId);
  renderTable(tabType);
  updateTabLabel(tabType);
  restoreScrollPosition(tabType, scrollPosition);
}

// ================================================================
// CHANGE LEVEL COUNT
// ================================================================

export function changeLevelCount(tabType, groupId, rawValue) {
  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);

  const scrollPosition = saveScrollPosition(tabType);
  let desiredLevelCount = parseInt(rawValue, 10);
  if (isNaN(desiredLevelCount) || desiredLevelCount < 0) desiredLevelCount = 0;

  // Find all rows in this group, sorted by level
  const groupRows = tabData.rows.filter(row => row.groupId === groupId);
  if (groupRows.length === 0) return;
  groupRows.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  const headRow          = groupRows[0]; // level-0 row
  const currentSubRows   = groupRows.filter(row => row.level > 0);
  const currentLevelCount = currentSubRows.length;

  if (desiredLevelCount === currentLevelCount) return;

  // Update the level-count field in the head row
  const levelCountFieldId = LEVEL_COUNT_FIELD[tabType];
  if (levelCountFieldId) {
    if (headRow.values[levelCountFieldId]) {
      headRow.values[levelCountFieldId].value = desiredLevelCount;
    } else {
      headRow.values[levelCountFieldId] = { value: desiredLevelCount, type: 'int', column: 0 };
    }
  }

  if (desiredLevelCount > currentLevelCount) {
    // Add new sub-rows
    const lastGroupRowIndex = tabData.rows.lastIndexOf(groupRows[groupRows.length - 1]);
    const startLevel = currentLevelCount + 1;
    const newSubRows = [];
    for (let level = startLevel; level <= desiredLevelCount; level++) {
      newSubRows.push({
        groupId:  headRow.groupId,
        table:    headRow.table,
        baseId:   headRow.baseId,
        customId: headRow.customId,
        _endTag:  headRow._endTag,
        level,
        values:       {},
        _fieldOrder:  [],
      });
    }
    tabData.rows.splice(lastGroupRowIndex + 1, 0, ...newSubRows);
  } else {
    // Remove excess sub-rows (highest levels first)
    const rowsToRemove = new Set();
    for (let i = currentSubRows.length - 1; i >= desiredLevelCount; i--) {
      rowsToRemove.add(currentSubRows[i]);
    }
    tabData.rows = tabData.rows.filter(row => !rowsToRemove.has(row));
  }

  renderTable(tabType);
  updateTabLabel(tabType);
  restoreScrollPosition(tabType, scrollPosition);
}

// ================================================================
// DUPLICATE ROW / GROUP
// ================================================================

export function duplicateRow(tabType, rowIndex) {
  const tabData = editorState[tabType];
  if (!tabData) return;
  synchronizeDOMToState(tabType);

  const scrollPosition = saveScrollPosition(tabType);
  const sourceRow   = tabData.rows[rowIndex];
  const newCustomId = generateNextUnusedCustomId(tabType);
  if (!newCustomId) return;

  const newGroupId = tabData.rows.length > 0
    ? Math.max(...tabData.rows.map(row => row.groupId)) + 1
    : 0;

  if (!tabData.meta._hasLevels) {
    // Simple: duplicate single row
    const duplicatedRow = {
      groupId:  newGroupId,
      table:    'custom',
      baseId:   sourceRow.baseId,
      customId: newCustomId,
      level:    sourceRow.level,
      values:   JSON.parse(JSON.stringify(sourceRow.values)),
      _fieldOrder: [...(sourceRow._fieldOrder || [])],
    };
    tabData.rows.splice(rowIndex + 1, 0, duplicatedRow);
  } else {
    // Leveled: duplicate all rows in the same group
    const sourceGroupId = sourceRow.groupId;
    const sourceGroupRows = tabData.rows.filter(row => row.groupId === sourceGroupId);

    let lastGroupRowIndex = rowIndex;
    for (let i = 0; i < tabData.rows.length; i++) {
      if (tabData.rows[i].groupId === sourceGroupId) lastGroupRowIndex = i;
    }

    const duplicatedRows = sourceGroupRows.map((row, i) => {
      const newRow = {
        groupId:  newGroupId,
        table:    'custom',
        baseId:   row.baseId,
        customId: newCustomId,
        level:    row.level,
        values:   JSON.parse(JSON.stringify(row.values)),
        _fieldOrder: [...(row._fieldOrder || [])],
      };
      if (i === 0 && row._groupFieldOrder) {
        newRow._groupFieldOrder = JSON.parse(JSON.stringify(row._groupFieldOrder));
      }
      return newRow;
    });

    tabData.rows.splice(lastGroupRowIndex + 1, 0, ...duplicatedRows);
  }

  renderTable(tabType);
  updateTabLabel(tabType);
  restoreScrollPosition(tabType, scrollPosition);
}

// ================================================================
// POPUP HELPERS
// ================================================================

export function closePopup(popupId) {
  document.getElementById(popupId).classList.add('hidden');
}

// ================================================================
// EVENT LISTENERS
// ================================================================

/** Enter key: move cursor to the cell directly below. */
document.addEventListener('keydown', function(event) {
  if (event.key !== 'Enter') return;

  const targetElement = event.target;
  if (!targetElement.matches || !targetElement.matches('td input[data-r], td select[data-r]')) return;

  event.preventDefault();
  const currentCell = targetElement.closest('td');
  const currentRow  = currentCell.closest('tr');
  const parentTable = currentRow.closest('table');
  if (!currentCell || !currentRow || !parentTable) return;

  const columnIndex = Array.from(currentRow.children).indexOf(currentCell);

  // Walk forward through sibling rows to find the next visible row
  let nextRow = currentRow.nextElementSibling;
  while (nextRow && nextRow.offsetParent === null) {
    nextRow = nextRow.nextElementSibling;
  }
  if (!nextRow) return;

  const nextCell = nextRow.children[columnIndex];
  if (!nextCell) return;

  const nextInput = nextCell.querySelector('input, select');
  if (nextInput) {
    nextInput.focus();
    if (nextInput.select) nextInput.select();
  }
});

// ================================================================
// DOUBLE-CLICK COLUMN HEADER TO AUTO-FIT WIDTH
// ================================================================

function setColumnWidth(headerElement, width, dataCells) {
  headerElement.style.width    = width + 'px';
  headerElement.style.minWidth = width + 'px';
  headerElement.style.maxWidth = width + 'px';
  for (const cell of dataCells) {
    cell.style.width    = width + 'px';
    cell.style.minWidth = width + 'px';
    cell.style.maxWidth = width + 'px';
  }
}

function getDirectColumnCells(table, columnIndex) {
  return Array.from(
    table.querySelectorAll(':scope > tbody > tr > td:nth-child(' + (columnIndex + 1) + ')')
  );
}

document.addEventListener('dblclick', function(event) {
  const headerElement = event.target.closest('th');
  if (!headerElement || event.target.closest('.col-resize')) return;

  const parentTable = headerElement.closest('table');
  if (!parentTable) return;

  const columnIndex     = Array.from(headerElement.parentElement.children).indexOf(headerElement);
  if (columnIndex < 0) return;

  const isLevelTable    = parentTable.classList.contains('level-table');
  const isCurrentlyWide = headerElement.dataset.expanded === '1';

  // Collect all related headers and cells (for level-table sync)
  let allHeaders  = [headerElement];
  let allCellSets = [{ header: headerElement, cells: getDirectColumnCells(parentTable, columnIndex) }];

  if (isLevelTable && headerElement.dataset.code) {
    const fieldCode = headerElement.dataset.code;
    document.querySelectorAll('.level-table th[data-code="' + fieldCode + '"]').forEach(otherHeader => {
      if (otherHeader === headerElement) return;
      allHeaders.push(otherHeader);
      const otherTable       = otherHeader.closest('table');
      const otherColumnIndex = Array.from(otherHeader.parentElement.children).indexOf(otherHeader);
      allCellSets.push({
        header: otherHeader,
        cells:  getDirectColumnCells(otherTable, otherColumnIndex),
      });
    });
  }

  if (isCurrentlyWide) {
    // Restore default width
    for (const cellSet of allCellSets) {
      const defaultWidth = parseInt(cellSet.header.dataset.defaultW) || 140;
      setColumnWidth(cellSet.header, defaultWidth, cellSet.cells);
      cellSet.header.dataset.expanded = '0';
    }
  } else {
    // Auto-fit: measure widest content across all related columns
    let maxContentWidth = 30;
    const measurer = document.createElement('span');
    measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;'
      + 'font:12px Consolas,monospace;padding:2px 6px';
    document.body.appendChild(measurer);

    for (const cellSet of allCellSets) {
      measurer.textContent = cellSet.header.textContent;
      maxContentWidth = Math.max(maxContentWidth, measurer.offsetWidth + 12);

      for (const cell of cellSet.cells) {
        const inputElement = cell.querySelector('input,select');
        const displayText  = inputElement ? inputElement.value : cell.textContent;
        measurer.textContent = displayText;
        maxContentWidth = Math.max(maxContentWidth, measurer.offsetWidth + 12);
      }
    }
    document.body.removeChild(measurer);

    for (const cellSet of allCellSets) {
      setColumnWidth(cellSet.header, maxContentWidth, cellSet.cells);
      cellSet.header.dataset.expanded = '1';
    }
  }
});

// ================================================================
// COLUMN RESIZE (drag handle)
// ================================================================
(function initColumnResize() {
  let isResizing     = false;
  let dragStartX     = 0;
  let dragStartWidth = 0;
  let resizingHeader = null;
  let resizingColumnIndex = -1;

  function applyColumnWidth(newWidth) {
    resizingHeader.style.width    = newWidth + 'px';
    resizingHeader.style.minWidth = newWidth + 'px';
    resizingHeader.style.maxWidth = newWidth + 'px';

    const parentTable = resizingHeader.closest('table');
    if (!parentTable) return;

    // Use :scope > to avoid matching cells in nested sub-tables
    const dataCells = parentTable.querySelectorAll(
      ':scope > tbody > tr > td:nth-child(' + (resizingColumnIndex + 1) + ')'
    );
    for (const cell of dataCells) {
      cell.style.width    = newWidth + 'px';
      cell.style.minWidth = newWidth + 'px';
      cell.style.maxWidth = newWidth + 'px';
    }

    // For level-table columns, sync all tables with the same field code
    if (parentTable.classList.contains('level-table') && resizingHeader.dataset.code) {
      const fieldCode = resizingHeader.dataset.code;
      document.querySelectorAll('.level-table th[data-code="' + fieldCode + '"]').forEach(otherHeader => {
        if (otherHeader === resizingHeader) return;
        otherHeader.style.width    = newWidth + 'px';
        otherHeader.style.minWidth = newWidth + 'px';
        otherHeader.style.maxWidth = newWidth + 'px';
        const otherTable       = otherHeader.closest('table');
        const otherColumnIndex = Array.from(otherHeader.parentElement.children).indexOf(otherHeader);
        const otherCells = otherTable.querySelectorAll(
          ':scope > tbody > tr > td:nth-child(' + (otherColumnIndex + 1) + ')'
        );
        for (const cell of otherCells) {
          cell.style.width    = newWidth + 'px';
          cell.style.minWidth = newWidth + 'px';
          cell.style.maxWidth = newWidth + 'px';
        }
      });
    }
  }

  document.addEventListener('mousedown', function(event) {
    const resizeHandle = event.target.closest('.col-resize');
    if (!resizeHandle) return;
    event.preventDefault();
    event.stopPropagation();

    resizingHeader      = resizeHandle.parentElement;
    resizingColumnIndex = parseInt(resizeHandle.dataset.ci);
    isResizing          = true;
    dragStartX          = event.pageX;
    dragStartWidth      = resizingHeader.getBoundingClientRect().width;
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove', function(event) {
    if (!isResizing) return;
    event.preventDefault();
    const newWidth = Math.max(10, dragStartWidth + (event.pageX - dragStartX));
    applyColumnWidth(newWidth);
  });

  document.addEventListener('mouseup', function() {
    if (!isResizing) return;
    isResizing          = false;
    resizingHeader      = null;
    resizingColumnIndex = -1;
    document.body.classList.remove('resizing');
  });
})();
