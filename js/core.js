// ================================================================
// CORE  -  Application Entry Point
//
// Thin entry point that re-exports every public function from the
// individual modules.  editor.html imports this single file and
// exposes the functions on `window` for inline onclick handlers.
// ================================================================

// ---- File I/O ----
import {
  loadFile,
  loadBinaryFile,
  loadJSONFile,
  exportBinary,
  exportJSON,
  loadDemoFiles,
  setFileSwitchTabCallback,
} from './fileio.js';

// ---- UI interactions ----
import {
  switchTab,
  toggleAllColumns,
  toggleCategory,
  filterRows,
  showAddRow,
  confirmAddRow,
  removeRow,
  removeGroup,
  changeLevelCount,
  duplicateRow,
  closePopup,
} from './ui.js';

// Wire the switchTab callback into fileio (avoids circular import)
setFileSwitchTabCallback(switchTab);

// ---- Re-export everything the HTML needs ----
export {
  loadFile,
  loadBinaryFile,
  loadJSONFile,
  exportBinary,
  exportJSON,
  loadDemoFiles,
  switchTab,
  toggleAllColumns,
  toggleCategory,
  filterRows,
  showAddRow,
  confirmAddRow,
  removeRow,
  removeGroup,
  changeLevelCount,
  duplicateRow,
  closePopup,
};

