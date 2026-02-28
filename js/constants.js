// ================================================================
// TYPE CONSTANTS  (binary wire types)
// ================================================================
export const TYPE_INT    = 0;
export const TYPE_REAL   = 1;
export const TYPE_UNREAL = 2;
export const TYPE_STRING = 3;

export const TYPE_NAMES = {
  [TYPE_INT]:    'int',
  [TYPE_REAL]:   'real',
  [TYPE_UNREAL]: 'unreal',
  [TYPE_STRING]: 'string',
};

export const TYPE_IDS = {
  int:    TYPE_INT,
  real:   TYPE_REAL,
  unreal: TYPE_UNREAL,
  string: TYPE_STRING,
};

// Object types that carry level + column per modification
export const TYPES_WITH_LEVELS = new Set(['w3a', 'w3d', 'w3q']);

// ================================================================
// EXTENSION / TAB MAPPING
// ================================================================
export const EXTENSION_INFO = {
  w3t: { label: 'Items',         hasLevels: false },
  w3a: { label: 'Abilities',     hasLevels: true  },
  w3u: { label: 'Units',         hasLevels: false },
  w3b: { label: 'Destructables', hasLevels: false },
  w3h: { label: 'Buffs',         hasLevels: false },
  w3d: { label: 'Doodads',       hasLevels: true  },
  w3q: { label: 'Upgrades',      hasLevels: true  },
};

export const EXTENSION_TO_TAB_TYPE = {
  w3t: 'items',
  w3a: 'abilities',
  w3u: 'units',
  w3h: 'buffs',
  w3q: 'upgrades',
  w3b: 'destructables',
  w3d: 'doodads',
};

export const TAB_DISPLAY_LABELS = {
  items: 'Items',
  abilities: 'Abilities',
  units: 'Units',
  buffs: 'Buffs',
  upgrades: 'Upgrades',
  destructables: 'Destructables',
  doodads: 'Doodads',
};

export const TAB_ENTITY_NAMES = {
  items: 'Item',
  abilities: 'Ability',
  units: 'Unit',
  buffs: 'Buff',
  upgrades: 'Upgrade',
  destructables: 'Destructable',
  doodads: 'Doodad',
};

export const TAB_ID_PREFIXES = {
  items: 'I',
  abilities: 'A',
  units: 'U',
  buffs: 'B',
  upgrades: 'R',
  destructables: 'D',
  doodads: 'O',
};

export const ALL_TAB_TYPES = [
  'items', 'abilities', 'units', 'buffs',
  'upgrades', 'destructables', 'doodads',
];

// ================================================================
// LEVEL / ROW CONFIGURATION
// ================================================================

/** Field ID that stores the level/variation count for each leveled type. */
export const LEVEL_COUNT_FIELD = {
  abilities: 'alev',
  upgrades:  'glvl',
  doodads:   'dvar',
};

/** Fields that can ONLY be edited in the main (head) row, not sub-rows. */
export const MAIN_ROW_ONLY_FIELDS = {
  abilities: new Set([
    'aani', 'aaea', 'abpx', 'abpy', 'arpx', 'arpy', 'aubx', 'auby',
    'acat', 'acap', 'aca1', 'acac', 'aeat', 'aart', 'arar', 'auar',
    'alig', 'amac', 'amat', 'amho', 'amsp', 'asat', 'aspt', 'unsf',
    'atat', 'ata0', 'ata1', 'ata2', 'ata3', 'ata4', 'ata5', 'atac',
    'ausk', 'aefs', 'aefl', 'aher', 'aite', 'alsk', 'alev', 'apri',
    'arac', 'arlv', 'achd', 'areq', 'arqa', 'ansf', 'arhk', 'ahky',
    'auhk', 'anam', 'aoro', 'aorf', 'aoru', 'aord', 'aret', 'arut',
  ]),
};

/** For doodads/upgrades, only these fields are editable in sub-rows. */
export const SUB_ROW_EDITABLE_FIELDS = {
  doodads:  new Set(['dvr1', 'dvg1', 'dvb1']),
  upgrades: new Set(['gar1', 'greq', 'grqc', 'gnsf', 'ghk1', 'gnam', 'gtp1', 'gub1']),
};

/** Columns always visible in sub-rows when "All Columns" is ON. */
export const SUBROW_ALWAYS_VISIBLE_COLUMNS = {
  doodads:   ['dvr1', 'dvg1', 'dvb1'],
  upgrades:  ['gar1', 'greq', 'grqc', 'gnsf', 'ghk1', 'gnam', 'gtp1', 'gub1'],
  abilities: ['atp1', 'aub1', 'amcs', 'atar', 'adur'],
};

// ================================================================
// COLUMN IDENTIFIERS
// ================================================================

/** Name field IDs (always sorted first in column lists). */
export const NAME_FIELD_IDS = new Set([
  'unam', 'anam', 'dnam', 'bnam', 'fnam', 'gnam',
]);

/** Characters used for auto-generating custom object IDs. */
export const ID_GENERATION_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

// ================================================================
// GRID COLUMNS PER TAB TYPE
// (Name first, then alphabetical.  Ability-specific data fields
//  with uppercase IDs are discovered dynamically.)
// ================================================================
export const GRID_COLUMNS = {
  items: [
    'unam','iabi','iarm','iclb','iclg','iclr','icid','icla','ides','idro','idrp',
    'ifil','igol','ihtp','iicd','iico','ilev','ilum','ilvo','imor','ipaw','iper',
    'ipow','ipri','iprn','isca','isel','issc','isst','isto','istr','iusa','iuse',
    'ubpx','ubpy','ufoo','uhot','isit','ureq','urqa','utip','utub','bdns',
  ],
  abilities: [
    'anam','aaea','aani','aare','aart','abpx','abpy','abuf','aca1','acac','acap',
    'acas','acat','achd','acdn','adur','aeat','aeff','aefl','aefs','ahdu','aher',
    'ahky','aite','alev','alig','alsk','amac','amat','amcs','amho','amsp','ansf',
    'aord','aorf','aoro','aoru','apri','arac','aran','arar','areq','aret','arhk',
    'arlv','arpx','arpy','arqa','arut','asat','aspt','ata0','ata1','ata2','ata3',
    'ata4','ata5','atac','atar','atat','atp1','auar','aub1','aubx','auby','auhk',
    'ausk','aut1','auu1','urq1','urq2','urq3','urq4','urq5','urq6','urq7','urq8',
  ],
  units: [
    'unam','ua1b','ua1c','ua1d','ua1f','ua1g','ua1h','ua1m','ua1p','ua1q','ua1r',
    'ua1s','ua1t','ua1w','ua1z','ua2b','ua2c','ua2d','ua2f','ua2g','ua2h','ua2m',
    'ua2p','ua2q','ua2r','ua2s','ua2t','ua2w','ua2z','uaap','uabi','uabs','uabr',
    'uabt','uacq','uaen','uagi','uagp','ualp','uamn','uani','uarm','uawt','ubba',
    'ubdg','ubdi','uble','ubld','ubpx','ubpy','ubpr','ubs1','ubs2','ubsi','ubui',
    'ucam','ucar','ucbs','uclb','uclg','uclr','ucol','ucpt','ucs1','ucs2','ucua',
    'ucun','ucut','udaa','udea','udef','udep','udl1','udl2','udp1','udp2','udro',
    'udtm','udty','udu1','udu2','udup','uept','uerd','ufle','ufma','ufoo','ufor',
    'ufrd','ugol','ugor','uhab','uhas','uhd1','uhd2','uhhb','uhhd','uhhm','uhom',
    'uhos','uhot','uhpm','uhpr','uhrt','uico','uimz','uine','uinp','uint','uisz',
    'ulba','ulbd','ulbs','ulev','ulfi','ulfo','ulos','ulpx','ulpy','ulpz','ulsz',
    'ulum','ulur','uma1','uma2','umas','upor','umdl','umh1','umh2','umis','umki',
    'umpi','umpm','umpr','umsl','umvf','umvh','umvr','umvs','umvt','umxp','umxr',
    'unsf','uocc','uori','upap','upar','upat','upaw','upoi','upra','upri','upro',
    'uprw','upru','upgr','uqd1','uqd2','urac','urb1','urb2','ureq','ures','urev',
    'urpg','urpo','urpp','urpr','urqa','urtm','urun','ursl','urva','usca','uscb',
    'usd1','usd2','usei','useu','usew','ushb','ushh','ushr','ushu','ushw','ushx',
    'ushy','usid','usin','usle','uslz','usma','usit','usnd','uspa','uspe','usr1',
    'usr2','usrg','ussc','ussi','usst','ustp','ustr','utaa','utar','utc1','utc2',
    'utcc','utco','util','utip','utpr','utra','utss','utub','utyp','uub1','uubs',
    'uuch','uupt','uver','uwal','uwu1','uwu2','unbr','unbs',
  ],
  buffs: [
    'fnam','fart','feat','feff','fefl','fefs','feft','flig','fmac','fmat','fmho',
    'fmsp','fnsf','frac','fsat','fspd','fspt','fta0','fta1','fta2','fta3','fta4',
    'fta5','ftac','ftat','ftip','fube',
  ],
  upgrades: [
    'gnam','gar1','gba1','gba2','gba3','gba4','gbpx','gbpy','gcls','gco1','gco2',
    'gco3','gco4','gef1','gef2','gef3','gef4','gglb','gglm','ghk1','ginh','glmb',
    'glmm','glob','glvl','gmo1','gmo2','gmo3','gmo4','gnsf','grac','greq','grqc',
    'gtib','gtim','gtp1','gub1',
  ],
  destructables: [
    'bnam','barm','bbut','bcat','bclh','bcpd','bcpr','bdsn','bfil','bflh','bflo',
    'bfra','bfvi','bfxr','bgpm','bgsc','bgse','bhps','blit','bmap','bmar','bmas',
    'bmis','bmmb','bmmg','bmmr','boch','bonc','bonw','bptd','bptx','brad','breg',
    'brel','bret','bsel','bshd','bsmm','bsuf','btar','btil','btsp','btxf','btxi',
    'buch','bumm','busr','bvar','bvcb','bvcg','bvcr','bwal',
  ],
  doodads: [
    'dnam','danf','dcat','dcpr','ddes','dfil','dflt','dfxr','dimc','dmap','dmar',
    'dmas','dmis','dmmb','dmmg','dmmr','donc','donw','dptx','dsel','dshd','dshf',
    'dsmm','dsnd','dtil','dtsp','duch','dumc','dusr','dvar','dvb1','dvg1','dvis',
    'dvr1','dwlk',
  ],
};

// ================================================================
// CATEGORY LABELS AND ORDER
// ================================================================
export const CATEGORY_LABELS = {
  text: 'Text', abilities: 'Abilities', art: 'Art', combat: 'Combat',
  data: 'Data', editor: 'Editor', hero: 'Hero', movement: 'Movement',
  pathing: 'Pathing', sound: 'Sound', stats: 'Stats', techtree: 'Techtree',
};

export const CATEGORY_ORDER = [
  'text', 'abilities', 'art', 'combat', 'data', 'editor',
  'hero', 'movement', 'pathing', 'sound', 'stats', 'techtree',
];
