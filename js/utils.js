// ================================================================
// UTILITY FUNCTIONS
//
// Pure helpers: HTML escaping, code lookups, field name resolution,
// type mapping, value coercion, column sorting.
// ================================================================

import { KNOWN } from './consts/columns.js';
import { codes } from './consts/codes.js';
import { abilityCodes } from './consts/codes_abilities.js';
import { doodatCodes } from './consts/codes_doodats.js';
import { destructibleCodes } from './consts/codes_destructibles.js';
import { upgradeCodes } from './consts/codes_upgrades.js';
import { itemCodes } from './consts/codes_items.js';
import { unitCodes } from './consts/codes_units.js';
import { buffCodes } from './consts/codes_buffs.js';
import { NAME_FIELD_IDS, ID_GENERATION_CHARS, TAB_ID_PREFIXES } from './consts/constants.js';
import { editorState } from './state.js';

// ================================================================
// HTML ESCAPING
// ================================================================

/** Escape a string for safe insertion into HTML content. */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape a string for safe insertion into an HTML attribute value. */
export function escapeAttribute(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ================================================================
// CODE LOOKUPS
// ================================================================

/**
 * Look up a human-readable name for a WC3 object code.
 * Searches items, units, abilities, and buffs in that order.
 */
export function lookupObjectCodeName(code) {
  return abilityCodes[code]
      || doodatCodes[code]
      || destructibleCodes[code]
      || upgradeCodes[code]
      || itemCodes[code]
      || buffCodes[code]
      || unitCodes[code]      
      || codes[code]
      || '❔';
}

/**
 * Return the human-readable field name for a given field ID.
 * Falls back to the raw ID if not found in the KNOWN definitions.
 */
export function getFieldDisplayName(fieldId) {
  return KNOWN[fieldId]?.n || fieldId;
}

// ================================================================
// META-TYPE RESOLUTION
//
// The binary format stores only int/real/unreal/string (wire types).
// KNOWN[fieldId].t carries a richer metadata type (e.g. "bool",
// "icon", "unitRace", "techList").  These helpers bridge the two.
// ================================================================

/**
 * Return the metadata type for a field id, e.g. "bool", "icon".
 * Returns null if no metadata type is defined.
 */
export function getFieldMetaType(fieldId) {
  return KNOWN[fieldId]?.t || null;
}

/**
 * Map a metadata type to the binary wire-type name used by the format.
 * E.g. "bool" → "int", "icon" → "string", "unreal" → "unreal".
 */
export function mapMetaTypeToWireType(metaType) {
  if (!metaType) return 'string';
  if (metaType === 'bool' || metaType === 'int') return 'int';
  if (metaType === 'real')   return 'real';
  if (metaType === 'unreal') return 'unreal';
  return 'string'; // icon, model, unitRace, techList, etc.
}

// ================================================================
// VALUE COERCION
// ================================================================

/**
 * Coerce a raw value to the correct JavaScript type based on its wire type.
 * Used when writing data back to binary or JSON export.
 */
export function coerceValueByType(rawValue, wireType) {
  if (wireType === 'int') {
    const parsed = parseInt(rawValue, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (wireType === 'real' || wireType === 'unreal') {
    const parsed = parseFloat(rawValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  return String(rawValue);
}

// ================================================================
// COLUMN / FIELD SORTING
// ================================================================

/**
 * Sort an array of field IDs alphabetically by display name,
 * with Name fields (unam, anam, etc.) always first.
 */
export function sortFieldIdsByDisplayName(fieldIds) {
  return fieldIds.sort((a, b) => {
    const aIsName = NAME_FIELD_IDS.has(a);
    const bIsName = NAME_FIELD_IDS.has(b);
    if (aIsName !== bIsName) return aIsName ? -1 : 1;
    return getFieldDisplayName(a).localeCompare(getFieldDisplayName(b));
  });
}

/**
 * Sort an array of column objects alphabetically by display name,
 * with Name fields always first.
 */
export function sortColumnsByDisplayName(columns) {
  columns.sort((a, b) => {
    const aIsName = NAME_FIELD_IDS.has(a.id);
    const bIsName = NAME_FIELD_IDS.has(b.id);
    if (aIsName !== bIsName) return aIsName ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ================================================================
// FIELD ORDER HELPERS
// ================================================================

/**
 * Get the ordered list of field IDs for a row:
 * preserves original file order first, then appends any new fields.
 */
export function getOrderedFieldIds(row, columns) {
  const originalOrder = row._fieldOrder || [];
  const seenIds = new Set(originalOrder);
  const result = [...originalOrder];
  for (const column of columns) {
    if (!seenIds.has(column.id) && row.values[column.id]) {
      result.push(column.id);
    }
  }
  return result;
}

// ================================================================
// ROW FIELD CLASSIFICATION
// ================================================================

import {
  MAIN_ROW_ONLY_FIELDS,
  SUB_ROW_EDITABLE_FIELDS,
} from './consts/constants.js';

/**
 * Check whether a field should be read-only in sub-rows (levels/variations).
 * Returns true if the field belongs to the main (head) row only.
 */
export function isFieldMainRowOnly(tabType, fieldId) {
  if (MAIN_ROW_ONLY_FIELDS[tabType]) {
    return MAIN_ROW_ONLY_FIELDS[tabType].has(fieldId);
  }
  if (SUB_ROW_EDITABLE_FIELDS[tabType]) {
    return !SUB_ROW_EDITABLE_FIELDS[tabType].has(fieldId);
  }
  return false;
}

// ================================================================
// CUSTOM ID GENERATION
// ================================================================

/**
 * Generate the next unused 4-character custom object ID.
 * Format: prefix letter + 3 alphanumeric chars (0-9a-z).
 * Scans all loaded tabs to avoid collisions.
 */
export function generateNextUnusedCustomId(tabType) {
  const prefix = TAB_ID_PREFIXES[tabType] || 'X';

  // Collect all existing custom IDs across all tabs
  const usedIds = new Set();
  for (const key of Object.keys(editorState)) {
    const tabData = editorState[key];
    if (!tabData) continue;
    for (const row of tabData.rows) {
      if (row.customId) usedIds.add(row.customId);
    }
  }

  // Iterate through all 36^3 = 46656 combinations
  const charCount = ID_GENERATION_CHARS.length;
  for (let i = 0; i < charCount * charCount * charCount; i++) {
    const char0 = ID_GENERATION_CHARS[Math.floor(i / (charCount * charCount)) % charCount];
    const char1 = ID_GENERATION_CHARS[Math.floor(i / charCount) % charCount];
    const char2 = ID_GENERATION_CHARS[i % charCount];
    const candidateId = prefix + char0 + char1 + char2;
    if (!usedIds.has(candidateId)) return candidateId;
  }

  alert('No unused IDs remaining!');
  return null;
}
