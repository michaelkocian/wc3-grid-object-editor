// ================================================================
// TABLE RENDERER
//
// Builds HTML for the data tables and manages display columns,
// category grouping, and statistics display.
// ================================================================

import { KNOWN } from './consts/columns.js';
import { META_TYPE_OPTIONS } from './consts/columnoptions.js';
import {
  LEVEL_COUNT_FIELD, GRID_COLUMNS, CATEGORY_LABELS, CATEGORY_ORDER,
  SUBROW_ALWAYS_VISIBLE_COLUMNS, TAB_DISPLAY_LABELS,
} from './consts/constants.js';
import {
  editorState, getShowAllColumns, getCollapsedCategories,
} from './state.js';
import {
  escapeHtml, escapeAttribute, lookupObjectCodeName,
  getFieldMetaType, mapMetaTypeToWireType, isFieldMainRowOnly,
  sortColumnsByDisplayName,
} from './utils.js';
import { unitTypes } from './consts/codes_unittypes.js';

// ================================================================
// DISPLAY COLUMN RESOLUTION
// ================================================================

/**
 * Get the columns to display for a given tab type.
 *
 * When "All Columns" is OFF → only columns that appear in loaded data.
 * When "All Columns" is ON  → all columns from GRID_COLUMNS for the
 *   type, plus any extra data-only columns not in the predefined list.
 * Columns are sorted alphabetically with the Name field first.
 */
export function getDisplayColumns(tabType) {
  const tabData = editorState[tabType];
  if (!tabData) return [];

  if (!getShowAllColumns()) return tabData.columns;

  const predefinedColumnIds = GRID_COLUMNS[tabType] || [];
  const existingColumnMap   = new Map(tabData.columns.map(c => [c.id, c]));

  // Collect all field IDs: predefined columns + any data-only fields
  const allFieldIds = new Set([...predefinedColumnIds]);
  for (const column of tabData.columns) allFieldIds.add(column.id);

  // Build column list
  const displayColumns = [];
  const seenIds = new Set();

  for (const fieldId of allFieldIds) {
    if (seenIds.has(fieldId)) continue;
    seenIds.add(fieldId);

    if (existingColumnMap.has(fieldId)) {
      displayColumns.push(existingColumnMap.get(fieldId));
    } else {
      const knownField = KNOWN[fieldId];
      if (knownField) {
        displayColumns.push({
          id:       fieldId,
          name:     knownField.n,
          wireType: mapMetaTypeToWireType(knownField.t),
          metaType: knownField.t || mapMetaTypeToWireType(knownField.t),
        });
      }
    }
  }

  sortColumnsByDisplayName(displayColumns);
  return displayColumns;
}

// ================================================================
// CATEGORY GROUPING
// ================================================================

/**
 * Groups an array of column objects by their KNOWN[id].c categories.
 * Fields without a category: uppercase-start or contains digit → 'data', else 'other'.
 *
 * @returns {Array<{ category: { id, label }, columns: col[] }>}
 */
function buildCategoryGroups(tabType, columns) {
  const categoryOrderMap = {};
  CATEGORY_ORDER.forEach((catId, index) => categoryOrderMap[catId] = index);

  const categorizedColumns = new Map();

  for (const column of columns) {
    let categoryId = KNOWN[column.id]?.c;
    if (!categoryId) {
      categoryId = (/^[A-Z]/.test(column.id) || /\d/.test(column.id)) ? 'data' : 'other';
    }
    if (!categorizedColumns.has(categoryId)) categorizedColumns.set(categoryId, []);
    categorizedColumns.get(categoryId).push(column);
  }

  const categoryGroups = [];
  for (const [categoryId, groupColumns] of categorizedColumns) {
    const label = CATEGORY_LABELS[categoryId]
      || categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
    categoryGroups.push({
      category: { id: categoryId, label },
      columns:  groupColumns,
    });
  }

  categoryGroups.sort((a, b) =>
    (categoryOrderMap[a.category.id] ?? 999) - (categoryOrderMap[b.category.id] ?? 999)
  );

  return categoryGroups;
}

// ================================================================
// CATEGORY HEADER ROW
// ================================================================

/**
 * Renders the category header <tr> above the column header row.
 * Collapsed categories appear as a single narrow stub column.
 */
function buildCategoryHeaderRow(tabType, categoryGroups, collapsedCategories, spacerColspan) {
  let html = '<tr class="cat-head-row">';
  html += '<th colspan="' + (spacerColspan || 5) + '" class="cat-spacer"></th>';

  for (const group of categoryGroups) {
    const isCollapsed  = collapsedCategories.has(group.category.id);
    const escapedCatId = group.category.id.replace(/'/g, '\\"');
    const escapedLabel = escapeHtml(group.category.label);
    const columnCount  = group.columns.length;

    if (isCollapsed) {
      html += '<th class="cat-head cat-collapsed"'
        + ' onclick="toggleCategory(\'' + escapeHtml(tabType) + '\',\'' + escapedCatId + '\')"'
        + ' title="Expand ' + escapedLabel + ' (' + columnCount + ' columns)">'
        + '<span class="cat-toggle">+</span> '
        + escapedLabel + ' (' + columnCount + ')</th>';
    } else {
      html += '<th class="cat-head cat-expanded"'
        + ' colspan="' + columnCount + '"'
        + ' onclick="toggleCategory(\'' + escapeHtml(tabType) + '\',\'' + escapedCatId + '\')"'
        + ' title="Collapse ' + escapedLabel + ' (' + columnCount + ' columns)">'
        + escapedLabel + ' (' + columnCount + ')</th>';
    }
  }

  html += '</tr>';
  return html;
}

// ================================================================
// COLUMN HEADER SUBTITLE (show real type)
// ================================================================

/**
 * Build the subtitle text for a column header.
 * Shows the field ID and the real metadata type (e.g. "bool", "icon"),
 * not the inferred binary wire type.
 */
function buildColumnSubtitle(column) {
  const displayType = column.metaType || column.wireType || 'string';
  return escapeHtml(column.id) + ' (' + displayType + ')';
}

// ================================================================
// DATA CELL RENDERING
// ================================================================

/**
 * Renders data cells for a row using category groups.
 * Collapsed categories insert a single stub <td> instead of their columns.
 */
function buildCategorizedDataCells(rowIndex, row, categoryGroups, collapsedCategories, subRowType, ownerType, groupId) {
  let html = '';
  for (const group of categoryGroups) {
    if (collapsedCategories.has(group.category.id)) {
      html += '<td class="cat-stub"></td>';
    } else {
      html += buildDataCells(rowIndex, row, group.columns, subRowType, ownerType, groupId);
    }
  }
  return html;
}

/**
 * Render the data cells for a row (shared between main and sub-rows).
 *
 * @param {number}       rowIndex     Index into tabData.rows
 * @param {object}       row          The row object
 * @param {Array}        columns      Column definitions to render
 * @param {string|null}  subRowType   If truthy, main-row-only fields are read-only
 * @param {string}       ownerType    Tab type for context
 * @param {number}       groupId      Group ID for context
 */
function buildDataCells(rowIndex, row, columns, subRowType, ownerType, groupId) {
  let html = '';
  const levelCountFieldId = ownerType ? (LEVEL_COUNT_FIELD[ownerType] || null) : null;

  for (const column of columns) {
    // ---- Level-count field: special editable number input ----
    if (levelCountFieldId && column.id === levelCountFieldId && !subRowType) {
      const cell       = row.values[column.id];
      const storedValue = cell ? (cell.value ?? '') : '';
      html += '<td style="text-align:center">'
        + '<input type="number" min="1" value="' + storedValue + '"'
        + ' data-r="' + rowIndex + '" data-f="' + column.id + '"'
        + ' style="width:48px;background:#252550;color:#e0e0e0;border:1px solid #0f3460;'
        + 'border-radius:2px;font:11px Consolas,monospace;text-align:center;padding:1px"'
        + ' onchange="changeLevelCount(\'' + ownerType + '\',' + groupId + ',this.value)"'
        + ' title="Number of levels/variations (source value)">'
        + '</td>';
      continue;
    }

    const cell      = row.values[column.id];
    let cellValue   = cell ? cell.value ?? '' : '';
    const wireType  = column.wireType || 'string';

    // Format real/unreal to 3 decimal places
    if (cellValue !== '' && (wireType === 'real' || wireType === 'unreal')) {
      cellValue = parseFloat(Number(cellValue).toFixed(3));
    }

    // ---- Read-only cell for main-row-only fields in sub-rows ----
    if (subRowType && isFieldMainRowOnly(subRowType, column.id)) {
      html += '<td class="ro-cell">' + escapeHtml(String(cellValue)) + '</td>';
      continue;
    }

    // ---- Dropdown for fields with predefined options ----
    const fieldMetaType = getFieldMetaType(column.id);
    const dropdownOptions = fieldMetaType ? META_TYPE_OPTIONS[fieldMetaType] : null;

    if (dropdownOptions) {
      html += '<td><select data-r="' + rowIndex + '" data-f="' + column.id
        + '" data-mt="' + (fieldMetaType || '') + '">';
      html += '<option value=""' + (cellValue === '' ? ' selected' : '') + '></option>';
      for (const option of dropdownOptions) {
        const isSelected = (String(cellValue) === option.value) ? ' selected' : '';
        html += '<option value="' + escapeAttribute(option.value) + '"' + isSelected + '>'
          + escapeHtml(option.label) + '</option>';
      }
      html += '</select></td>';
    } else {
      // ---- Text input for all other fields ----
      html += '<td><input value="' + escapeAttribute(String(cellValue)) + '"'
        + ' data-r="' + rowIndex + '" data-f="' + column.id
        + '" data-mt="' + (fieldMetaType || '') + '"></td>';
    }
  }
  return html;
}

// ================================================================
// MAIN RENDER TABLE
// ================================================================

/**
 * Renders the full data table for a given tab type and inserts it
 * into the corresponding pane element.
 */
export function renderTable(tabType) {
  const tabData = editorState[tabType];
  if (!tabData) return;

  const { meta, rows }  = tabData;
  const displayColumns   = getDisplayColumns(tabType);
  const hasLevels        = meta._hasLevels;
  const levelCountField  = LEVEL_COUNT_FIELD[tabType] || null;
  const paneElement      = document.getElementById(tabType + 'Pane');

  let html = '<div class="tw">';

  if (tabType === 'units') {
    html += buildSplitUnitTables(tabType, rows, displayColumns);
  } else {
    html += '<table>';
    if (!hasLevels) {
      html += buildFlatTable(tabType, rows, displayColumns);
    } else {
      html += buildLeveledTable(tabType, rows, displayColumns, levelCountField);
    }
    html += '</tbody></table>';
  }

  html += '</div>';
  paneElement.innerHTML = html;
  tabData._renderedAllCols = getShowAllColumns();
  updateStatsBar(tabType);
}

// ================================================================
// UNIT ROW CLASSIFICATION
// ================================================================

/**
 * Section definitions for the split unit tables.
 */
const UNIT_SECTIONS = [
  { key: 'heroes',    label: 'Heroes',    icon: '\u2694' },
  { key: 'buildings', label: 'Buildings', icon: '\u{1F3F0}' },
  { key: 'units',     label: 'Units',     icon: '\u{1F6E1}' },
];

/**
 * Classify a unit row into one of the three sections.
 * Uses the unitTypes lookup for the baseId, with an override
 * when the "Is a Building" (ubdg) field is set to 1.
 *
 * @returns {{ section: string, overridden: boolean }}
 */
function classifyUnitRow(row) {
  const baseType = unitTypes[row.baseId] || '';

  // Already a building or environment by definition
  if (baseType === 'Buildings' || baseType === 'Environment') {
    return { section: 'buildings', overridden: false };
  }

  // ubdg override: "Is a Building" = 1 moves any row to buildings
  const ubdgCell = row.values['ubdg'];
  if (ubdgCell && (String(ubdgCell.value) === '1')) {
    return { section: 'buildings', overridden: true };
  }

  if (baseType === 'Heroes') return { section: 'heroes', overridden: false };

  // Units, Vfx, or unknown
  return { section: 'units', overridden: false };
}


/**
 * Get the set of column IDs that should be included for a given section.
 * Uses the new GRID_COLUMNS.unitheroes/unitbuildings/units for each section.
 */
function getSectionColumns(sectionKey) {
  switch (sectionKey) {
    case 'heroes':    return new Set(GRID_COLUMNS.unitheroes);
    case 'buildings': return new Set(GRID_COLUMNS.unitbuildings);
    case 'units':     return new Set(GRID_COLUMNS.units);
    default:          return new Set();
  }
}

/**
 * Filter display columns for a unit section.
 *
 * When "All Columns" is OFF → only columns that have data in the
 *   section's rows (matches existing behaviour).
 * When "All Columns" is ON  → all columns for this section (from GRID_COLUMNS),
 *   plus any columns that actually have data in this section's rows.
 */
function filterColumnsForSection(sectionKey, rows, rowIndices, allColumns) {
  // Collect column IDs that have data in this section
  const usedIds = new Set();
  for (const ri of rowIndices) {
    for (const col of allColumns) {
      const cell = rows[ri].values[col.id];
      if (cell && cell.value !== '' && cell.value !== null && cell.value !== undefined) {
        usedIds.add(col.id);
      }
    }
  }

  if (!getShowAllColumns()) {
    return allColumns.filter(c => usedIds.has(c.id));
  }

  // "All Columns" ON: show only columns for this section, plus any with data
  const sectionColumns = getSectionColumns(sectionKey);
  return allColumns.filter(c => sectionColumns.has(c.id) || usedIds.has(c.id));
}

// ================================================================
// SPLIT UNIT TABLES  (Heroes / Buildings / Units)
// ================================================================

/**
 * Build three separate tables for the units tab, one per unit section.
 * Each section shows only columns that have data in its rows.
 */
function buildSplitUnitTables(tabType, rows, displayColumns) {
  const sectionIndices = { heroes: [], buildings: [], units: [] };
  const overriddenRows = new Set();

  for (let i = 0; i < rows.length; i++) {
    const { section, overridden } = classifyUnitRow(rows[i]);
    sectionIndices[section].push(i);
    if (overridden) overriddenRows.add(i);
  }

  let html = '';

  for (const sectionDef of UNIT_SECTIONS) {
    const indices = sectionIndices[sectionDef.key];

    // When All Columns is ON, build the displayColumns for this section from GRID_COLUMNS
    let sectionDisplayColumns = displayColumns;
    if (getShowAllColumns()) {
      // Use all columns from GRID_COLUMNS for this section, plus any extra columns with data
      const sectionColIds = Array.from(getSectionColumns(sectionDef.key));
      const allColMap = new Map(displayColumns.map(c => [c.id, c]));
      // Add all columns from GRID_COLUMNS for this section
      sectionDisplayColumns = sectionColIds.map(id => {
        if (allColMap.has(id)) return allColMap.get(id);
        // If not present, create from KNOWN
        const knownField = KNOWN[id];
        if (knownField) {
          return {
            id,
            name: knownField.n,
            wireType: mapMetaTypeToWireType(knownField.t),
            metaType: knownField.t || mapMetaTypeToWireType(knownField.t),
          };
        }
        return null;
      }).filter(Boolean);
      // Add any extra columns with data in this section
      const usedIds = new Set();
      for (const ri of indices) {
        for (const col of displayColumns) {
          const cell = rows[ri].values[col.id];
          if (cell && cell.value !== '' && cell.value !== null && cell.value !== undefined) {
            usedIds.add(col.id);
          }
        }
      }
      for (const id of usedIds) {
        if (!sectionColIds.includes(id) && allColMap.has(id)) {
          sectionDisplayColumns.push(allColMap.get(id));
        }
      }
      sortColumnsByDisplayName(sectionDisplayColumns);
    }

    const sectionColumns = filterColumnsForSection(sectionDef.key, rows, indices, sectionDisplayColumns);

    html += '<div class="unit-section-header">' + sectionDef.icon + ' '
      + escapeHtml(sectionDef.label) + ' (' + indices.length + ')</div>';

    if (indices.length === 0) {
      html += '<div class="unit-section-empty">No entries</div>';
      continue;
    }

    html += '<table>';
    html += buildFlatTableForSection(tabType, rows, indices, sectionColumns, overriddenRows);
    html += '</tbody></table>';
  }

  return html;
}

/**
 * Build a flat table (thead + tbody rows) for a subset of rows.
 * Used by the split unit tables.  Accepts original row indices so
 * that data-r attributes remain correct for state synchronization.
 */
function buildFlatTableForSection(tabType, rows, rowIndices, columns, overriddenRows) {
  const categoryGroups = buildCategoryGroups(tabType, columns);
  const collapsedCats  = getCollapsedCategories(tabType);

  let html = '<thead>';
  html += buildCategoryHeaderRow(tabType, categoryGroups, collapsedCats);
  html += '<tr>';
  html += buildFixedColumnHeaders();

  let columnIndex = 5;
  for (const group of categoryGroups) {
    if (collapsedCats.has(group.category.id)) {
      html += '<th class="cat-stub"><span class="col-resize" data-ci="' + columnIndex + '"></span></th>';
      columnIndex++;
    } else {
      for (const column of group.columns) {
        const subtitle = buildColumnSubtitle(column);
        html += '<th style="width:160px" data-default-w="160" title="' + subtitle + '">'
          + escapeHtml(column.name)
          + '<span class="sub">' + subtitle + '</span>'
          + '<span class="col-resize" data-ci="' + columnIndex + '"></span></th>';
        columnIndex++;
      }
    }
  }
  html += '</tr></thead><tbody>';

  // ---- Data rows ----
  let previousGroupId = -1;
  let alternateGroupShading = false;

  for (const rowIndex of rowIndices) {
    const row = rows[rowIndex];
    if (row.groupId !== previousGroupId) {
      alternateGroupShading = !alternateGroupShading;
      previousGroupId = row.groupId;
    }

    const tableClass    = row.table === 'original' ? 'r0' : 'r1';
    const altClass      = alternateGroupShading ? 'ga' : '';
    const overrideClass = overriddenRows.has(rowIndex) ? ' ubdg-override' : '';
    const objectCodeName = lookupObjectCodeName(row.baseId);
    const searchableText = escapeHtml(
      [row.baseId, row.customId, ...Object.keys(row.values).map(k => row.values[k].value)]
        .join(' ').toLowerCase()
    );

    html += '<tr class="' + tableClass + ' ' + altClass + overrideClass + '" data-s="' + searchableText + '">';
    html += '<td style="color:#555;text-align:right;padding-right:4px">' + (rowIndex + 1) + '</td>';
    html += '<td class="del-c">'
      + '<button class="btn b-del b-sm" onclick="removeRow(\'' + tabType + '\',' + rowIndex + ')" title="Remove row">&times;</button>'
      + '<button class="btn b-add b-sm" onclick="duplicateRow(\'' + tabType + '\',' + rowIndex + ')" title="Duplicate row" style="margin-left:2px">&#x2398;</button>'
      + '</td>';
    html += '<td style="font-size:11px;color:#999">' + row.table + '</td>';
    html += '<td class="idc">' + escapeHtml(row.baseId) + ' (' + escapeHtml(objectCodeName) + ')</td>';
    html += '<td class="idc">' + escapeHtml(row.customId || '\u2014') + '</td>';
    html += buildCategorizedDataCells(rowIndex, row, categoryGroups, collapsedCats, null, tabType, row.groupId);
    html += '</tr>';
  }

  return html;
}

// ================================================================
// FLAT TABLE (non-leveled types: items, buffs, destructables)
// ================================================================

function buildFlatTable(tabType, rows, columns) {
  const categoryGroups    = buildCategoryGroups(tabType, columns);
  const collapsedCats     = getCollapsedCategories(tabType);

  let html = '<thead>';
  html += buildCategoryHeaderRow(tabType, categoryGroups, collapsedCats);
  html += '<tr>';
  html += buildFixedColumnHeaders();

  let columnIndex = 5;
  for (const group of categoryGroups) {
    if (collapsedCats.has(group.category.id)) {
      html += '<th class="cat-stub"><span class="col-resize" data-ci="' + columnIndex + '"></span></th>';
      columnIndex++;
    } else {
      for (const column of group.columns) {
        const subtitle = buildColumnSubtitle(column);
        html += '<th style="width:160px" data-default-w="160" title="' + subtitle + '">'
          + escapeHtml(column.name)
          + '<span class="sub">' + subtitle + '</span>'
          + '<span class="col-resize" data-ci="' + columnIndex + '"></span></th>';
        columnIndex++;
      }
    }
  }
  html += '</tr></thead><tbody>';

  // ---- Data rows ----
  let previousGroupId = -1;
  let alternateGroupShading = false;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (row.groupId !== previousGroupId) {
      alternateGroupShading = !alternateGroupShading;
      previousGroupId = row.groupId;
    }

    const tableClass    = row.table === 'original' ? 'r0' : 'r1';
    const altClass      = alternateGroupShading ? 'ga' : '';
    const objectCodeName = lookupObjectCodeName(row.baseId);
    const searchableText = escapeHtml(
      [row.baseId, row.customId, ...Object.keys(row.values).map(k => row.values[k].value)]
        .join(' ').toLowerCase()
    );

    html += '<tr class="' + tableClass + ' ' + altClass + '" data-s="' + searchableText + '">';
    html += '<td style="color:#555;text-align:right;padding-right:4px">' + (rowIndex + 1) + '</td>';
    html += '<td class="del-c">'
      + '<button class="btn b-del b-sm" onclick="removeRow(\'' + tabType + '\',' + rowIndex + ')" title="Remove row">&times;</button>'
      + '<button class="btn b-add b-sm" onclick="duplicateRow(\'' + tabType + '\',' + rowIndex + ')" title="Duplicate row" style="margin-left:2px">&#x2398;</button>'
      + '</td>';
    html += '<td style="font-size:11px;color:#999">' + row.table + '</td>';
    html += '<td class="idc">' + escapeHtml(row.baseId) + ' (' + escapeHtml(objectCodeName) + ')</td>';
    html += '<td class="idc">' + escapeHtml(row.customId || '\u2014') + '</td>';
    html += buildCategorizedDataCells(rowIndex, row, categoryGroups, collapsedCats, null, tabType, row.groupId);
    html += '</tr>';
  }

  return html;
}

// ================================================================
// LEVELED TABLE (abilities, doodads, upgrades)
// ================================================================

function buildLeveledTable(tabType, rows, columns, levelCountField) {
  // Split columns into main-row and level-specific
  const mainRowColumns  = [];
  const levelColumns    = [];
  for (const column of columns) {
    if (isFieldMainRowOnly(tabType, column.id) || (levelCountField && column.id === levelCountField)) {
      mainRowColumns.push(column);
    } else {
      levelColumns.push(column);
    }
  }

  const mainCategoryGroups = buildCategoryGroups(tabType, mainRowColumns);
  const collapsedCats      = getCollapsedCategories(tabType);

  // Extra column for the early level-count field
  const hasEarlyLevelCol = !!levelCountField;
  const fixedPlusLevelCols = hasEarlyLevelCol ? 6 : 5;

  let html = '<thead>';
  html += buildCategoryHeaderRow(tabType, mainCategoryGroups, collapsedCats, fixedPlusLevelCols);
  html += '<tr>';
  html += buildFixedColumnHeaders();

  // Early level-count column header (duplicated at start for quick access)
  if (hasEarlyLevelCol) {
    const lcFieldName = KNOWN[levelCountField]?.n || 'Levels';
    const lcSubtitle = escapeHtml(levelCountField) + ' (int)';
    html += '<th style="width:60px" data-default-w="60" title="' + lcSubtitle + '">' 
      + escapeHtml(lcFieldName)
      + '<span class="sub">' + lcSubtitle + '</span>'
      + '<span class="col-resize" data-ci="5"></span></th>';
  }

  let columnIndex = fixedPlusLevelCols;
  for (const group of mainCategoryGroups) {
    if (collapsedCats.has(group.category.id)) {
      html += '<th class="cat-stub"><span class="col-resize" data-ci="' + columnIndex + '"></span></th>';
      columnIndex++;
    } else {
      for (const column of group.columns) {
        const subtitle = buildColumnSubtitle(column);
        html += '<th style="width:160px" data-default-w="160" title="' + subtitle + '">'
          + escapeHtml(column.name)
          + '<span class="sub">' + subtitle + '</span>'
          + '<span class="col-resize" data-ci="' + columnIndex + '"></span></th>';
        columnIndex++;
      }
    }
  }
  html += '</tr></thead><tbody>';

  // Calculate total outer column count (for colspan on sub-table rows)
  let totalOuterColumns = fixedPlusLevelCols;
  for (const group of mainCategoryGroups) {
    totalOuterColumns += collapsedCats.has(group.category.id) ? 1 : group.columns.length;
  }

  // Build group index
  const rowGroups = buildRowGroups(rows);

  // Pre-compute merged level columns per base_id
  const mergedLevelColumnsByBaseId = computeMergedLevelColumns(
    rowGroups, rows, levelColumns, tabType
  );

  // Render each group
  let alternateGroupShading = false;
  for (const group of rowGroups) {
    alternateGroupShading = !alternateGroupShading;
    const indices = group.indices;
    indices.sort((a, b) => (rows[a].level ?? 0) - (rows[b].level ?? 0));

    const headIndex  = indices[0];
    const headRow    = rows[headIndex];
    const subIndices = indices.filter(ri => (rows[ri].level ?? 0) > 0);

    const tableClass = headRow.table === 'original' ? 'r0' : 'r1';
    const altClass   = alternateGroupShading ? 'ga' : '';
    const objectCodeName = lookupObjectCodeName(headRow.baseId);

    // Collect search text from entire group
    const searchableText = escapeHtml(
      indices.map(ri => {
        const r = rows[ri];
        return [r.baseId, r.customId, ...Object.keys(r.values).map(k => r.values[k].value)]
          .join(' ').toLowerCase();
      }).join(' ')
    );

    // ---- Head row ----
    html += '<tr class="' + tableClass + ' ' + altClass + ' grp-head"'
      + ' data-s="' + searchableText + '" data-gid="' + headRow.groupId + '">';
    html += '<td style="color:#555;text-align:right;padding-right:4px">' + (headIndex + 1) + '</td>';
    html += '<td class="del-c">'
      + '<button class="btn b-del b-sm" onclick="removeGroup(\'' + tabType + '\',' + headRow.groupId + ')" title="Remove object">&times;</button>'
      + '<button class="btn b-add b-sm" onclick="duplicateRow(\'' + tabType + '\',' + headIndex + ')" title="Duplicate object" style="margin-left:2px">&#x2398;</button>'
      + '</td>';
    html += '<td style="font-size:11px;color:#999">' + headRow.table + '</td>';
    html += '<td class="idc">' + escapeHtml(headRow.baseId) + ' (' + escapeHtml(objectCodeName) + ')</td>';
    html += '<td class="idc">' + escapeHtml(headRow.customId || '\u2014') + '</td>';

    // Early level-count cell (mirror of the one in category columns)
    if (hasEarlyLevelCol) {
      const lcCell = headRow.values[levelCountField];
      const lcValue = lcCell ? (lcCell.value ?? '') : '';
      html += '<td style="text-align:center">'
        + '<input type="number" min="1" value="' + lcValue + '"'
        + ' style="width:48px;background:#252550;color:#e0e0e0;border:1px solid #0f3460;'
        + 'border-radius:2px;font:11px Consolas,monospace;text-align:center;padding:1px"'
        + ' onchange="changeLevelCount(\'' + tabType + '\',' + headRow.groupId + ',this.value)"'
        + ' title="Number of levels/variations (quick access)">' 
        + '</td>';
    }

    html += buildCategorizedDataCells(headIndex, headRow, mainCategoryGroups, collapsedCats, null, tabType, headRow.groupId);
    html += '</tr>';

    // ---- Level sub-table ----
    const mergedLevelCols = mergedLevelColumnsByBaseId.get(headRow.baseId) || [];
    if (mergedLevelCols.length > 0 && subIndices.length > 0) {
      html += buildLevelSubTable(
        tabType, rows, subIndices, mergedLevelCols,
        tableClass, altClass, headRow.groupId, searchableText, totalOuterColumns
      );
    }
  }

  return html;
}

function buildLevelSubTable(tabType, rows, subIndices, levelColumns, tableClass, altClass, groupId, searchText, totalOuterColumns) {
  let html = '<tr class="' + tableClass + ' ' + altClass + ' sub-table-row"'
    + ' data-gid="' + groupId + '" data-s="' + searchText + '">';
  html += '<td colspan="' + totalOuterColumns + '">';
  html += '<table class="level-table">';
  html += '<thead><tr>';
  html += '<th style="width:30px" data-default-w="30">Lvl</th>';

  let levelColumnIndex = 1;
  for (const column of levelColumns) {
    const subtitle = buildColumnSubtitle(column);
    html += '<th style="width:140px" data-default-w="140"'
      + ' data-code="' + escapeHtml(column.id) + '" title="' + subtitle + '">'
      + escapeHtml(column.name)
      + '<span class="sub">' + subtitle + '</span>'
      + '<span class="col-resize" data-ci="' + levelColumnIndex + '"></span></th>';
    levelColumnIndex++;
  }
  html += '</tr></thead><tbody>';

  for (const subIndex of subIndices) {
    const subRow   = rows[subIndex];
    const rowClass = subRow.table === 'original' ? 'r0' : 'r1';
    html += '<tr class="' + rowClass + '">';
    html += '<td class="sr-lvl">' + (subRow.level ?? '') + '</td>';
    html += buildDataCells(subIndex, subRow, levelColumns, null, tabType, subRow.groupId);
    html += '</tr>';
  }

  html += '</tbody></table></td></tr>';
  return html;
}

// ================================================================
// HELPERS
// ================================================================

function buildFixedColumnHeaders() {
  return '<th style="width:40px" data-default-w="40">#<span class="col-resize" data-ci="0"></span></th>'
    + '<th style="width:52px" data-default-w="52"><span class="col-resize" data-ci="1"></span></th>'
    + '<th style="width:60px" data-default-w="60">Table<span class="col-resize" data-ci="2"></span></th>'
    + '<th style="width:60px" data-default-w="60">Base ID<span class="col-resize" data-ci="3"></span></th>'
    + '<th style="width:70px" data-default-w="70">Custom ID<span class="col-resize" data-ci="4"></span></th>';
}

function buildRowGroups(rows) {
  const groups   = [];
  const groupMap = new Map();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!groupMap.has(row.groupId)) {
      const group = { groupId: row.groupId, indices: [] };
      groupMap.set(row.groupId, group);
      groups.push(group);
    }
    groupMap.get(row.groupId).indices.push(rowIndex);
  }

  return groups;
}

function computeMergedLevelColumns(rowGroups, rows, levelColumns, tabType) {
  // Groups with the same baseId share the same set of level columns
  const baseIdGroupMap = new Map();
  for (let groupIndex = 0; groupIndex < rowGroups.length; groupIndex++) {
    const group  = rowGroups[groupIndex];
    const baseId = rows[group.indices[0]].baseId;
    if (!baseIdGroupMap.has(baseId)) baseIdGroupMap.set(baseId, []);
    baseIdGroupMap.get(baseId).push(groupIndex);
  }

  // For each baseId, collect the union of level columns that have data
  const mergedColumnsByBaseId = new Map();
  for (const [baseId, groupIndices] of baseIdGroupMap) {
    const usedColumnIds = new Set();
    for (const groupIndex of groupIndices) {
      const group = rowGroups[groupIndex];
      for (const rowIndex of group.indices) {
        if ((rows[rowIndex].level ?? 0) === 0) continue; // skip head rows
        for (const column of levelColumns) {
          const cell = rows[rowIndex].values[column.id];
          if (cell && cell.value !== '' && cell.value !== null && cell.value !== undefined) {
            usedColumnIds.add(column.id);
          }
        }
      }
    }
    mergedColumnsByBaseId.set(baseId, levelColumns.filter(c => usedColumnIds.has(c.id)));
  }

  // When showAllColumns is ON, add always-visible sub-row columns
  if (getShowAllColumns() && SUBROW_ALWAYS_VISIBLE_COLUMNS[tabType]) {
    const alwaysVisibleIds = new Set(SUBROW_ALWAYS_VISIBLE_COLUMNS[tabType]);
    for (const [baseId, currentColumns] of mergedColumnsByBaseId) {
      const existingIds = new Set(currentColumns.map(c => c.id));
      const additionalColumns = levelColumns.filter(
        c => alwaysVisibleIds.has(c.id) && !existingIds.has(c.id)
      );
      if (additionalColumns.length > 0) {
        const merged = [...currentColumns, ...additionalColumns];
        sortColumnsByDisplayName(merged);
        mergedColumnsByBaseId.set(baseId, merged);
      }
    }
  }

  return mergedColumnsByBaseId;
}

// ================================================================
// TAB LABEL & STATS
// ================================================================

/**
 * Update the text of a tab button with row count and filename.
 */
export function updateTabLabel(tabType) {
  const tabData = editorState[tabType];
  if (!tabData) return;

  const displayLabel = TAB_DISPLAY_LABELS[tabType] || tabType;
  const rowCount     = tabData.rows.length;
  const fileNamePart = tabData.meta._fileName ? (' \u2014 ' + tabData.meta._fileName) : '';

  const tabElement = document.querySelector('.tab[data-t="' + tabType + '"]');
  if (tabElement) {
    tabElement.textContent = displayLabel + ' (' + rowCount + ' rows)' + fileNamePart;
  }
}

/**
 * Update the stats bar with a summary of the current tab's data.
 */
export function updateStatsBar(tabType) {
  const tabData  = editorState[tabType];
  const statsBar = document.getElementById('statsBar');

  if (!tabData) {
    statsBar.textContent = '';
    return;
  }

  const originalObjectCount = new Set(
    tabData.rows.filter(r => r.table === 'original').map(r => r.groupId)
  ).size;
  const customObjectCount = new Set(
    tabData.rows.filter(r => r.table === 'custom').map(r => r.groupId)
  ).size;
  const filledCellCount = tabData.rows.reduce(
    (sum, row) => sum + Object.keys(row.values).length, 0
  );

  let statsText =
    originalObjectCount + ' original + ' + customObjectCount + ' custom objects  |  '
    + tabData.columns.length + ' columns  |  ' + filledCellCount + ' values  |  v'
    + tabData.meta.version + '  |  .' + tabData.meta._type;

  // For units, add per-section breakdown
  if (tabType === 'units') {
    let heroCount = 0, buildingCount = 0, unitCount = 0;
    for (const row of tabData.rows) {
      const { section } = classifyUnitRow(row);
      if (section === 'heroes') heroCount++;
      else if (section === 'buildings') buildingCount++;
      else unitCount++;
    }
    statsText += '  |  ' + heroCount + ' heroes, ' + buildingCount + ' buildings, ' + unitCount + ' units';
  }

  statsBar.textContent = statsText;
}
