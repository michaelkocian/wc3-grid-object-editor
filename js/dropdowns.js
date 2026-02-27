/**
 * Dropdown / enum option lists keyed by metadata type.
 * Each entry is an array of { value, label } objects.
 *
 * To add a dropdown for a new type later, just add an entry here:
 *   META_TYPE_OPTIONS['unitRace'] = [
 *     { value:'human', label:'Human' },
 *     { value:'orc',   label:'Orc'   },
 *     ...
 *   ];
 */
export const META_TYPE_OPTIONS = {
  bool: [
    { value: '1', label: 'True'  },
    { value: '0', label: 'False' }
  ],
  unitRace: [
    { value: 'commoner',  label: 'Commoner'  },
    { value: 'creeps',    label: 'Creeps'    },
    { value: 'critters',  label: 'Critters'  },
    { value: 'demon',     label: 'Demon'     },
    { value: 'human',     label: 'Human'     },
    { value: 'naga',      label: 'Naga'      },
    { value: 'nightelf',  label: 'Nightelf'  },
    { value: 'orc',       label: 'Orc'       },
    { value: 'other',     label: 'Other'     },
    { value: 'undead',    label: 'Undead'    },
    { value: 'unknown',   label: 'Unknown'   }
  ],
  defenseType: [
    { value: 'normal', label: 'Normal' },
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
    { value: 'fort', label: 'Fortified' },
    { value: 'hero', label: 'Hero' },
    { value: 'divine', label: 'Divine' },
    { value: 'none', label: 'Unarmored' }
  ],
  moveType: [
    { value: 'foot', label: 'Foot' },
    { value: 'horse', label: 'Horse' },
    { value: 'fly', label: 'Fly' },
    { value: 'hover', label: 'Hover' },
    { value: 'float', label: 'Float' },
    { value: 'amph', label: 'Amphipic' }
  ],
  weaponType: [
    { value: 'normal', label: 'Normal' },
    { value: 'instant', label: 'Instant' },
    { value: 'artillery', label: 'Artillery' },
    { value: 'aline', label: 'ArtilleryLine' },
    { value: 'missile', label: 'Missile' },
    { value: 'msplash', label: 'MissileSplash' },
    { value: 'mbounce', label: 'MissileBounce' },
    { value: 'mline', label: 'MissileLine' },
    { value: '_', label: 'None' }
  ],
  combatSound: [
    { value: 'Nothing', label: 'Nothing' },
    { value: 'AxeMediumChop', label: 'AxeMediumChop' },
    { value: 'MetalHeavyBash', label: 'MetalHeavyBash' },
    { value: 'MetalHeavyChop', label: 'MetalHeavyChop' },
    { value: 'MetalHeavySlice', label: 'MetalHeavySlice' },
    { value: 'MetalLightChop', label: 'MetalLightChop' },
    { value: 'MetalLightSlice', label: 'MetalLightSlice' },
    { value: 'MetalMediumBash', label: 'MetalMediumBash' },
    { value: 'MetalMediumChop', label: 'MetalMediumChop' },
    { value: 'MetalMediumSlice', label: 'MetalMediumSlice' },
    { value: 'RockHeavyBash', label: 'RockHeavyBash' },
    { value: 'WoodHeavyBash', label: 'WoodHeavyBash' },
    { value: 'WoodLightBash', label: 'WoodLightBash' },
    { value: 'WoodMediumBash', label: 'WoodMediumBash' }
  ],
  attackType: [
    { value: 'unknown', label: 'Unknown' },
    { value: 'normal', label: 'Normal' },
    { value: 'pierce', label: 'Pierce' },
    { value: 'siege', label: 'Siege' },
    { value: 'spells', label: 'Spells' },
    { value: 'chaos', label: 'Chaos' },
    { value: 'magic', label: 'Magic' },
    { value: 'hero', label: 'Hero' }
  ],
  armorType: [
    { value: 'Ethereal', label: 'Ethereal' },
    { value: 'Flesh', label: 'Flesh' },
    { value: 'Wood', label: 'Wood' },
    { value: 'Stone', label: 'Stone' },
    { value: 'Metal', label: 'Metal' }
  ]
};