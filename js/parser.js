// ================================================================
// BINARY PARSER & BUILDER
//
// Reads WC3 object modification files (.w3t, .w3a, .w3u, etc.)
// from ArrayBuffer into a structured object, and writes the
// editor state back to binary.
//
// Binary layout per spec:
//   https://github.com/stijnherfst/HiveWE/wiki/war3map(skin).w3*-Modifications
// ================================================================

import { BinaryReader, BinaryWriter } from './binary.js';
import {
  TYPE_INT, TYPE_REAL, TYPE_UNREAL, TYPE_STRING,
  TYPE_NAMES, TYPE_IDS,
  LEVEL_COUNT_FIELD,
} from './consts/constants.js';
import { editorState, synchronizeDOMToState } from './state.js';
import {
  getOrderedFieldIds,
  coerceValueByType,
  isFieldMainRowOnly,
  getFieldDisplayName,
  sortFieldIdsByDisplayName,
  getFieldMetaType,
  mapMetaTypeToWireType,
} from './utils.js';
import { renderTable, updateTabLabel } from './renderer.js';

// ================================================================
// PARSE BINARY → parsed object structure
// ================================================================

/**
 * Parse a WC3 binary object modification file.
 *
 * @param {ArrayBuffer} arrayBuffer  Raw file contents.
 * @param {string}      fileExtension  e.g. "w3t", "w3a".
 * @returns {{ version, hasLevels, ext, objects: { original[], custom[] } }}
 */
export function parseBinaryBuffer(arrayBuffer, fileExtension) {
  const reader  = new BinaryReader(arrayBuffer);
  const version = reader.readUInt32();

  // Per spec: .w3a and .w3q always have optional level/column ints;
  // .w3d (doodads) has them only when format_version > 0
  const hasLevels =
    (fileExtension === 'w3a' || fileExtension === 'w3q') ||
    (fileExtension === 'w3d' && version > 0);

  const parsedObjects = { original: [], custom: [] };

  for (const tableKey of ['original', 'custom']) {
    // Spec: second table may not exist — check for EOF
    if (!reader.hasMoreData()) break;

    const objectCount = reader.readUInt32();

    for (let objectIndex = 0; objectIndex < objectCount; objectIndex++) {
      const baseId   = reader.readObjectId();
      const customId = reader.readObjectId();

      // sets_count only exists in version >= 3
      const setsCount = (version >= 3) ? reader.readUInt32() : 1;

      const parsedObject = {
        base_id:   baseId,
        custom_id: (customId !== '\0\0\0\0') ? customId : null,
        fields:    [],
        _endTag:   null,
      };

      // Iterate over all sets (typically 1)
      for (let setIndex = 0; setIndex < setsCount; setIndex++) {
        // set_flag only exists in version >= 3
        if (version >= 3) {
          reader.readUInt32(); // set_flag (0 = default / all asset modes)
        }

        const modificationCount = reader.readUInt32();

        for (let modIndex = 0; modIndex < modificationCount; modIndex++) {
          const fieldId       = reader.readObjectId();
          const wireTypeCode  = reader.readUInt32();

          let level  = 0;
          let column = 0;
          if (hasLevels) {
            level  = reader.readUInt32();
            column = reader.readUInt32();
          }

          let fieldValue;
          if (wireTypeCode === TYPE_INT)         fieldValue = reader.readInt32();
          else if (wireTypeCode === TYPE_REAL)   fieldValue = reader.readFloat32();
          else if (wireTypeCode === TYPE_UNREAL) fieldValue = reader.readFloat32();
          else if (wireTypeCode === TYPE_STRING) fieldValue = reader.readNullTerminatedString();
          else                                   fieldValue = reader.readInt32(); // fallback

          // end_token only exists when format_version > 0
          let endTag = null;
          if (version > 0) {
            endTag = reader.readObjectId();
          }
          if (modIndex === 0 && parsedObject._endTag === null) {
            parsedObject._endTag = endTag;
          }

          const field = {
            id:     fieldId,
            type:   TYPE_NAMES[wireTypeCode] || String(wireTypeCode),
            value:  fieldValue,
            endTag: endTag,
          };
          if (hasLevels) {
            field.level  = level;
            field.column = column;
          }
          parsedObject.fields.push(field);
        }
      }
      parsedObjects[tableKey].push(parsedObject);
    }
  }

  return { version, hasLevels, ext: fileExtension, objects: parsedObjects };
}

// ================================================================
// BUILD BINARY from current editor state
// ================================================================

/**
 * Build a BinaryWriter containing the full binary representation
 * of the current editor state for the given tab type.
 *
 * @param {string} tabType  e.g. "items", "abilities".
 * @returns {BinaryWriter|null}
 */
export function buildBinaryFromState(tabType) {
  const tabData = editorState[tabType];
  if (!tabData) return null;

  synchronizeDOMToState(tabType);

  const hasLevels    = tabData.meta._hasLevels;
  const writeVersion = tabData.meta.version || 3;
  const writer       = new BinaryWriter();

  writer.writeUInt32(writeVersion);

  // Rebuild object lists from rows
  const objectTables = { original: [], custom: [] };

  if (!hasLevels) {
    buildFlatObjectTable(tabData, objectTables);
  } else {
    buildLeveledObjectTable(tabData, objectTables);
  }

  // Write both tables to binary
  for (const tableKey of ['original', 'custom']) {
    const objects = objectTables[tableKey];
    writer.writeUInt32(objects.length);

    for (const obj of objects) {
      writer.writeObjectId(obj.baseId);
      writer.writeObjectId(obj.customId || '\0\0\0\0');

      // sets_count and set_flag only in version >= 3
      if (writeVersion >= 3) {
        writer.writeUInt32(1); // sets_count: always 1
        writer.writeUInt32(0); // set_flag: 0 = default (all asset modes)
      }

      writer.writeUInt32(obj.fields.length);

      for (const field of obj.fields) {
        const wireTypeCode = TYPE_IDS[field.type] ?? TYPE_INT;

        writer.writeObjectId(field.id);
        writer.writeUInt32(wireTypeCode);

        if (hasLevels) {
          writer.writeUInt32(field.level ?? 0);
          writer.writeUInt32(field.column ?? 0);
        }

        if (wireTypeCode === TYPE_INT)         writer.writeInt32(Number(field.value) | 0);
        else if (wireTypeCode === TYPE_REAL)   writer.writeFloat32(Number(field.value));
        else if (wireTypeCode === TYPE_UNREAL) writer.writeFloat32(Number(field.value));
        else if (wireTypeCode === TYPE_STRING) writer.writeNullTerminatedString(String(field.value));
        else                                   writer.writeInt32(Number(field.value) | 0);

        // end_token only when format_version > 0
        if (writeVersion > 0) {
          const endTag = field.endTag != null
            ? field.endTag
            : (obj._endTag != null ? obj._endTag : '\0\0\0\0');
          writer.writeObjectId(endTag);
        }
      }
    }
  }

  return writer;
}

// ---- Helper: build flat (non-leveled) object table ----

function buildFlatObjectTable(tabData, objectTables) {
  for (const row of tabData.rows) {
    const obj = {
      baseId:   row.baseId,
      customId: row.customId || null,
      table:    row.table,
      _endTag:  row._endTag,
      fields:   [],
    };
    // Use all keys in row.values, not just those in _fieldOrder
    const allFieldIds = Object.keys(row.values);
    // Optionally, sort with _fieldOrder first, then new fields alphabetically
    const orderedIds = Array.isArray(row._fieldOrder)
      ? [...row._fieldOrder, ...allFieldIds.filter(id => !row._fieldOrder.includes(id)).sort()]
      : allFieldIds.sort();
    for (const fieldId of orderedIds) {
      const cell = row.values[fieldId];
      if (!cell) continue;
      const wireType = cell.type
        || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
        || 'string';
      obj.fields.push({
        id:     fieldId,
        type:   wireType,
        value:  coerceValueByType(cell.value, wireType),
        endTag: cell.endTag,
      });
    }
    objectTables[row.table].push(obj);
  }
}

// ---- Helper: build leveled object table ----

function buildLeveledObjectTable(tabData, objectTables) {
  // Group rows by groupId
  const groupedRows = new Map();
  const groupOrder  = [];
  for (const row of tabData.rows) {
    if (!groupedRows.has(row.groupId)) {
      groupedRows.set(row.groupId, []);
      groupOrder.push(row.groupId);
    }
    groupedRows.get(row.groupId).push(row);
  }

  for (const groupId of groupOrder) {
    const groupRows = groupedRows.get(groupId);
    const firstRow  = groupRows[0];

    const obj = {
      baseId:   firstRow.baseId,
      customId: firstRow.customId || null,
      table:    firstRow.table,
      _endTag:  firstRow._endTag,
      fields:   [],
    };

    const rowByLevel = {};
    for (const row of groupRows) rowByLevel[row.level] = row;

    if (firstRow._groupFieldOrder && firstRow._groupFieldOrder.length > 0) {
      appendFieldsFromOriginalOrder(obj, firstRow, groupRows, rowByLevel, tabData);
    } else {
      appendFieldsSequentially(obj, groupRows, tabData);
    }

    objectTables[firstRow.table].push(obj);
  }
}

function appendFieldsFromOriginalOrder(obj, firstRow, groupRows, rowByLevel, tabData) {
  const usedFieldKeys = new Set();

  // First pass: preserve original cross-level field order
  if (Array.isArray(firstRow._groupFieldOrder)) {
    for (const { id: fieldId, level: originalLevel } of firstRow._groupFieldOrder) {
      const fieldKey = fieldId + '@' + originalLevel;
      if (usedFieldKeys.has(fieldKey)) continue;
      usedFieldKeys.add(fieldKey);

      // Main-row-only fields were relocated to level 0 during ingestion;
      // try the original level first, then fall back to level 0
      let row  = rowByLevel[originalLevel];
      let cell = row ? row.values[fieldId] : null;
      if (!cell && rowByLevel[0]) {
        row  = rowByLevel[0];
        cell = row.values[fieldId];
      }
      if (!row || !cell) continue;

      const wireType  = cell.type
        || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
        || 'string';
      const writeLevel = cell._originalLevel != null ? cell._originalLevel : originalLevel;

      obj.fields.push({
        id:     fieldId,
        type:   wireType,
        level:  writeLevel,
        column: cell.column ?? 0,
        value:  coerceValueByType(cell.value, wireType),
        endTag: cell.endTag,
      });
    }
  }

  // Second pass: append any NEW fields not in the original order
  // For all groupRows, for all fields in row.values, add if not already used
  for (const row of groupRows) {
    for (const fieldId of Object.keys(row.values)) {
      const cell = row.values[fieldId];
      if (!cell) continue;
      const fieldKey = fieldId + '@' + (cell._originalLevel != null ? cell._originalLevel : row.level);
      if (usedFieldKeys.has(fieldKey)) continue;
      usedFieldKeys.add(fieldKey);

      const wireType   = cell.type
        || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
        || 'string';
      const writeLevel = cell._originalLevel != null ? cell._originalLevel : (row.level ?? 0);

      obj.fields.push({
        id:     fieldId,
        type:   wireType,
        level:  writeLevel,
        column: cell.column ?? 0,
        value:  coerceValueByType(cell.value, wireType),
        endTag: cell.endTag,
      });
    }
  }
}

function appendFieldsSequentially(obj, groupRows, tabData) {
  for (const row of groupRows) {
    const orderedIds = getOrderedFieldIds(row, tabData.columns);
    for (const fieldId of orderedIds) {
      const cell = row.values[fieldId];
      if (!cell) continue;
      const wireType   = cell.type
        || (tabData.columns.find(c => c.id === fieldId) || {}).wireType
        || 'string';
      const writeLevel = cell._originalLevel != null ? cell._originalLevel : (row.level ?? 0);

      obj.fields.push({
        id:     fieldId,
        type:   wireType,
        level:  writeLevel,
        column: cell.column ?? 0,
        value:  coerceValueByType(cell.value, wireType),
        endTag: cell.endTag,
      });
    }
  }
}

// ================================================================
// INGEST parsed data into editor state
// ================================================================

/**
 * Ingest parsed binary/JSON data into the editor state for a given tab.
 * This creates all rows, columns, and metadata, then renders the table.
 *
 * @param {string} tabType    e.g. "items", "abilities".
 * @param {object} parsed     Output from parseBinaryBuffer or JSON import.
 * @param {string} fileName   Original file name for display.
 */
export function ingestParsedData(tabType, parsed, fileName) {
  const { version, hasLevels, ext, objects } = parsed;

  const meta = {
    _format:    'war3map.' + ext,
    _type:      ext,
    _hasLevels: hasLevels,
    version:    version,
    _fileName:  fileName,
  };

  const discoveredFields = new Map(); // fieldId → { name, wireType }
  const unsortedRows     = [];
  let nextGroupId        = 0;

  for (const tableKey of ['original', 'custom']) {
    const objectList = objects[tableKey] || [];

    for (const parsedObject of objectList) {
      if (!hasLevels) {
        // ---- Simple objects: one row per object ----
        const row = createEditorRow(nextGroupId++, tableKey, parsedObject);
        for (const field of parsedObject.fields) {
          row.values[field.id] = {
            value:  field.value,
            type:   field.type,
            endTag: field.endTag,
          };
          row._fieldOrder.push(field.id);
          registerDiscoveredField(discoveredFields, field.id, field.type);
        }
        unsortedRows.push(row);
      } else {
        // ---- Leveled objects: head row (level 0) + sub-rows 1..N ----
        ingestLeveledObject(
          tabType, parsedObject, tableKey, nextGroupId++,
          discoveredFields, unsortedRows
        );
      }
    }
  }

  // ---- Sort rows: group by base_id, original before custom ----
  const sortedRows = sortAndFlattenRows(unsortedRows);

  // ---- Build ordered column list (alphabetical, Name first) ----
  const columnIds   = sortFieldIdsByDisplayName([...discoveredFields.keys()]);
  const columns     = columnIds.map(id => {
    const fieldInfo  = discoveredFields.get(id);
    const metaType   = getFieldMetaType(id);
    return {
      id,
      name:     fieldInfo.name,
      wireType: fieldInfo.wireType,
      metaType: metaType || fieldInfo.wireType, // show real type
    };
  });

  editorState[tabType] = { meta, rows: sortedRows, columns };
  renderTable(tabType);
  updateTabLabel(tabType);
}

// ================================================================
// INGEST HELPERS
// ================================================================

function createEditorRow(groupId, tableKey, parsedObject, level) {
  return {
    groupId,
    table:    tableKey,
    baseId:   parsedObject.base_id,
    customId: parsedObject.custom_id || '',
    _endTag:  parsedObject._endTag || null,
    level:    level ?? null,
    values:   {},
    _fieldOrder:      [],
    _groupFieldOrder: undefined,
  };
}

function registerDiscoveredField(fieldMap, fieldId, wireType) {
  if (!fieldMap.has(fieldId)) {
    fieldMap.set(fieldId, {
      name:     getFieldDisplayName(fieldId),
      wireType: wireType,
    });
  }
}

function ingestLeveledObject(tabType, parsedObject, tableKey, groupId, discoveredFields, unsortedRows) {
  const groupFieldOrder = parsedObject.fields.map(f => ({
    id:    f.id,
    level: f.level ?? 0,
  }));

  const levelCountFieldId = LEVEL_COUNT_FIELD[tabType] || null;

  // Determine level count from the level-count field (alev/glvl/dvar)
  let levelCountFromField = 0;
  if (levelCountFieldId) {
    for (const field of parsedObject.fields) {
      if (field.id === levelCountFieldId) {
        levelCountFromField = parseInt(field.value) || 0;
        break;
      }
    }
  }

  // Find the max level referenced by any data field
  let maxLevelInData = 0;
  for (const field of parsedObject.fields) {
    const fieldLevel = field.level ?? 0;
    if (fieldLevel > maxLevelInData) maxLevelInData = fieldLevel;
  }

  // The number of sub-rows = max of the two
  const totalLevels = Math.max(levelCountFromField, maxLevelInData);

  // Distribute fields into per-level buckets
  const fieldsByLevel = new Map();
  fieldsByLevel.set(0, []); // head row always exists
  for (let levelNum = 1; levelNum <= totalLevels; levelNum++) {
    fieldsByLevel.set(levelNum, []);
  }

  for (const field of parsedObject.fields) {
    const originalLevel = field.level ?? 0;
    registerDiscoveredField(discoveredFields, field.id, field.type);

    // Main-row-only fields → head row (level 0)
    if (isFieldMainRowOnly(tabType, field.id)) {
      fieldsByLevel.get(0).push({ ...field, _originalLevel: originalLevel });
    } else {
      // Level-specific fields stay at their exact original level
      let targetLevel = originalLevel;
      if (targetLevel < 0) targetLevel = 0;
      if (!fieldsByLevel.has(targetLevel)) fieldsByLevel.set(targetLevel, []);
      fieldsByLevel.get(targetLevel).push({ ...field, _originalLevel: originalLevel });
    }
  }

  const sortedLevels = [...fieldsByLevel.keys()].sort((a, b) => a - b);

  for (let levelIndex = 0; levelIndex < sortedLevels.length; levelIndex++) {
    const currentLevel = sortedLevels[levelIndex];
    const row = createEditorRow(groupId, tableKey, parsedObject, currentLevel);

    // Store original field order on the first (head) row
    if (levelIndex === 0) {
      row._groupFieldOrder = groupFieldOrder;
    }

    for (const field of (fieldsByLevel.get(currentLevel) || [])) {
      row.values[field.id] = {
        value:          field.value,
        type:           field.type,
        column:         field.column,
        endTag:         field.endTag,
        _originalLevel: field._originalLevel,
      };
      row._fieldOrder.push(field.id);
    }
    unsortedRows.push(row);
  }
}

function sortAndFlattenRows(unsortedRows) {
  // Collect groups by groupId to keep sub-rows together with their head
  const groupMap   = new Map(); // groupId → { baseId, customId, table, rows[] }
  const groupOrder = [];

  for (const row of unsortedRows) {
    if (!groupMap.has(row.groupId)) {
      groupMap.set(row.groupId, {
        baseId:   row.baseId,
        customId: row.customId,
        table:    row.table,
        rows:     [],
      });
      groupOrder.push(row.groupId);
    }
    groupMap.get(row.groupId).rows.push(row);
  }

  // Sort: base_id → original-before-custom → custom_id
  groupOrder.sort((a, b) => {
    const groupA = groupMap.get(a);
    const groupB = groupMap.get(b);
    if (groupA.baseId < groupB.baseId) return -1;
    if (groupA.baseId > groupB.baseId) return  1;
    if (groupA.table !== groupB.table) return groupA.table === 'original' ? -1 : 1;
    const customA = groupA.customId || '';
    const customB = groupB.customId || '';
    return customA.localeCompare(customB);
  });

  // Re-assign sequential groupIds and flatten
  const flatRows      = [];
  let sequentialGroupId = 0;
  for (const oldGroupId of groupOrder) {
    const group         = groupMap.get(oldGroupId);
    const newGroupId    = sequentialGroupId++;
    for (const row of group.rows) {
      row.groupId = newGroupId;
      flatRows.push(row);
    }
  }

  return flatRows;
}
