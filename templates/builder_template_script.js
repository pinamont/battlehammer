
  // --- REGOLE DI COMPOSIZIONE ---

  var ARMY_RULES = {
    min_truppe_pct: 25,
    max_personaggi_pct: 50,
    max_macchine_pct: 25
  };

  setInterval(autoSaveArmy, 10000);

  // --- DATI CARICATI INLINE DA FILE JSON ---

  // Eserciti e Unità
  const UNITS_BY_FACTION = JSON.parse(
    document.getElementById("FACTION_DATA").textContent
  );

  // Oggetti magici (comprese Ricompense e Virtù)
  const MAGIC_ITEMS =
    JSON.parse(document.getElementById("ITEM_DATA").textContent).magic_items.concat(
      JSON.parse(document.getElementById("ITEM_DATA").textContent).chaos_rewards.concat(
        JSON.parse(document.getElementById("ITEM_DATA").textContent).knightly_virtues
      )
  );

  // Stendardi Magici
  const MAGIC_BANNERS = JSON.parse(
    document.getElementById("ITEM_DATA").textContent
  ).magic_banners;

  // Dividi gli oggetti magici in categorie
  const magicByCategory = {};
  for (const item of MAGIC_ITEMS) {
    if (!magicByCategory[item.category]) {
      magicByCategory[item.category] = [];
    }
    magicByCategory[item.category].push(item);
  }

  let magicItemsById = {};
  for (const item of MAGIC_ITEMS) {
    magicItemsById[item.id] = item;
  }

  // --- VARIABILI DI STATO ---

  let currentFaction = "";
  let army = {
    maxPoints: 2000,
    entries: []
  };
  let selectedUnit = null;
  let nextEntryId = 1;

  // --- UTILITY ---

  // Ordine categorie
  const categories = ["Personaggi", "Truppe", "Macchine e Mostri"];

  // Dizionario nome fazione
  const ARMY_NAMES = {
    orchi_e_goblin: "Orchi e Goblin",
    impero: "Impero",
    elfi_alti: "Elfi Alti",
    elfi_silvani: "Elfi Silvani",
    nommorti: "Nommorti",
    caos: "Caos",
    bretonia: "Bretonnia"
    // aggiungi qui le altre fazioni
  };

  function armyName(army) {
    return ARMY_NAMES[army] || autoRenderName(army);
  }

  function autoRenderName(name) {
    return name
    .replace(/_/g, " ")
    .replace("\\","")
    .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Nomi senza caratteri speciali
  function renderName(name) {
    name = name.replace("\\","");
    return name;
  }

  // Funzione che popola il menu delle fazioni
  function populateFactionSelect() {
    const select = document.getElementById("factionSelect");
    select.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Seleziona...";
    emptyOpt.selected = true;
    emptyOpt.disabled = true;
    emptyOpt.hidden = true;
    select.appendChild(emptyOpt);
    for (const faction of Object.keys(UNITS_BY_FACTION).sort()) {
      const opt = document.createElement("option");
      opt.value = faction;
      opt.textContent = armyName(faction);
      select.appendChild(opt);
    }
    select.selectedIndex = 0;
    currentFaction = "";
  }

  // Calcola punti unità
  function calcUnitPoints(unit, size, selectedOptionIds, optionCounts = {}, magicItems = [], magicItemCounts = {}, magicBanner = null, knightlyVirtues = []) {
    let total = unit.cost_per_model * size;
    for (const opt of unit.options || []) {
      if (!selectedOptionIds.includes(opt.id)) continue;
      const count = optionCounts[opt.id] ?? 1;
      if (opt.max_count) {
        if (opt.cost) total += opt.cost * count;
        if (opt.cost_per_model) total += opt.cost_per_model * size * count;
      } else {
        if (opt.cost) total += opt.cost;
        if (opt.cost_per_model) total += opt.cost_per_model * size;
      }
    }
    if (magicItems) {
      for (const id of magicItems) {
        const item = MAGIC_ITEMS.find(m => m.id === id);
        if (item) {
          const count = magicItemCounts[item.id] ?? 1;
          total += item.cost * count;
        }
      }
    }
    if (magicBanner) {
      const banner = MAGIC_BANNERS.find(b => b.id === magicBanner);
      if (banner) total += banner.cost;
    }
    if (knightlyVirtues) {
      for (const id of knightlyVirtues) {
        const virtue = MAGIC_ITEMS.find(m => m.id === id);
        if (virtue) total += virtue.cost;
      }
    }
    return total;
  }

  // Statistiche esercito
  function computeArmyStats() {
    let total = 0;
    const limit = army.maxPoints;
    let byCat = { "Personaggi": 0, "Truppe": 0, "Macchine e Mostri": 0 };
    for (const e of army.entries) {
      total += e.points;
      if (!byCat[e.category]) byCat[e.category] = 0;
      byCat[e.category] += e.points;
    }
    const pct = {};
    for (const cat of Object.keys(byCat)) {
      // pct[cat] = total > 0 ? (byCat[cat] / total) * 100 : 0;
      pct[cat] = total > 0 ? (byCat[cat] / limit) * 100 : 0; // percentuale del limite massimo (!)
    }
    return { total, byCat, pct };
  }

  function isOptionEnabled(opt, selectedOptionIds) {
    if (!opt.required_option) return true;
    return selectedOptionIds.has(opt.required_option);
  }

  function isMagicItemTaken(itemId, currentEntryId = null) {
    for (const e of army.entries) {
      if (e.id === currentEntryId) continue;
      if (e.magicItems && e.magicItems.includes(itemId)) return true;
    }
    return false;
  }

  function isKnightlyVirtueTaken(virtueId, currentEntryId = null) {
    for (const e of army.entries) {
      if (e.id === currentEntryId) continue;
      if (e.knightlyVirtues && e.knightlyVirtues.includes(itemId)) return true;
    }
    return false;
  }

  function isMagicBannerTaken(bannerId, currentEntryId = null) {
    for (const e of army.entries) {
      if (e.id === currentEntryId) continue;
      if (e.magicBanner === bannerId) return true;
    }
    return false;
  }

  // Valido per oggetti magici, stendardi magici e virtù
  function isItemAllowedForUnit(item, unit, currentFaction) {
    const unitTypes = unit.type || [];

    // Normalizza a array
    const onlyForType = Array.isArray(item.only_for_type)
    ? item.only_for_type
    : item.only_for_type ? [item.only_for_type] : [];

    const notForType = Array.isArray(item.not_for_type)
    ? item.not_for_type
    : item.not_for_type ? [item.not_for_type] : [];

    const onlyForArmy = Array.isArray(item.only_for_army)
    ? item.only_for_army
    : item.only_for_army ? [item.only_for_army] : [];

    const notForArmy = Array.isArray(item.not_for_army)
    ? item.not_for_army
    : item.not_for_army ? [item.not_for_army] : [];

    const onlyForUnit = Array.isArray(item.only_for_unit)
    ? item.only_for_unit
    : item.only_for_unit ? [item.only_for_unit] : [];

    // --- Filtri per tipo ---
    if (onlyForType.length > 0) {
      if (!onlyForType.some(t => unitTypes.includes(t))) {
        return false;
      }
    }

    if (notForType.length > 0) {
      if (notForType.some(t => unitTypes.includes(t))) {
        return false;
      }
    }

    // --- Filtri per armata ---
    if (onlyForArmy.length > 0) {
      if (!onlyForArmy.includes(currentFaction)) {
        return false;
      }
    }

    if (notForArmy.length > 0) {
      if (notForArmy.includes(currentFaction)) {
        return false;
      }
    }

    // --- Filtri per unità ---
    if (onlyForUnit.length > 0) {
      if (!onlyForUnit.includes(unit.id)) {
        return false;
      }
    }

    return true;
  }

  function adjustValueUp(inputID) {
    const input = document.getElementById(inputID);
    input.stepUp();
  }

  function adjustValueDown(inputID) {
    const input = document.getElementById(inputID);
    input.stepDown();
  }

  function checkValue(sender) {
    let min = sender.min;
    let max = sender.max;
    let value = parseInt(sender.value);
    if (value>max) {
      sender.value = max;
    } else if (value<min) {
      sender.value = min;
    }
  }

  // --- EXPORT ---------------------------------------------------------------

  let counts = {};

  function validateArmy() {
    const stats = computeArmyStats();
    const errors = [];

    // Eccezione per Bretonnia: alza la frazione di Personaggi concessi (FIXE: sarebbe meglio avere una proprietà di ogni armata che definisce le frazioni)
    if (currentFaction === "bretonnia") ARMY_RULES.max_personaggi_pct = 75;
    else ARMY_RULES.max_personaggi_pct = 50;

    if (stats.total > army.maxPoints) {
      errors.push("Punti totali oltre il limite.");
    }
    if (stats.pct["Truppe"] < ARMY_RULES.min_truppe_pct) {
      errors.push(`Truppe sotto il minimo (${ARMY_RULES.min_truppe_pct}%).`);
    }
    if (stats.pct["Personaggi"] > ARMY_RULES.max_personaggi_pct) {
      errors.push(`Personaggi oltre il massimo (${ARMY_RULES.max_personaggi_pct}%).`);
    }
    if (stats.pct["Macchine e Mostri"] > ARMY_RULES.max_macchine_pct) {
      errors.push(`Macchine e Mostri oltre il massimo (${ARMY_RULES.max_macchine_pct}%).`);
    }

    const hasPersonaggio = army.entries.some(e => e.category === "Personaggi");
    if (!hasPersonaggio) {
      errors.push("Devi includere almeno un Personaggio.");
    }

    counts = {};
    for (const e of army.entries) {
      counts[e.unitId] = (counts[e.unitId] || 0) + 1;
    }

    return { stats, errors, hasPersonaggio };
  }

  function exportArmyText() {
    const { stats } = validateArmy();
    const title = document.getElementById("listTitleInput").value || "Lista senza titolo";

    let lines = [];

    // Header
    lines.push(title);
    lines.push(`Battle Hammer – ${armyName(currentFaction)}`);
    lines.push(`Punti totali: ${stats.total}/${army.maxPoints}`);
    lines.push("");

    for (const cat of categories) {
      const entries = army.entries.filter(e => e.category === cat);
      if (entries.length === 0) continue;

      lines.push(cat.toUpperCase());

      for (const e of entries) {
        // Riga principale
        if (e.size === 1) {
          lines.push(`- ${e.name} – ${e.points} pt`);
        } else {
          lines.push(`- ${e.name} (${e.size} modelli) – ${e.points} pt`);
        }

        // Opzioni
        if (e.options?.length || e.preselectedOptions?.length) {
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          const parts = [];

          for (const optName of e.preselectedOptions) {
            parts.push(optName);
          }

          for (const optId of e.options) {
            // controlla che le opzioni fossero disponibili per l'unità dell'armata
            const opt = unit.options.find(o => o.id === optId);
            if (!opt) continue;
            const count = e.optionCounts?.[optId] || 1;
            if (opt.max_count) {
              parts.push(`${opt.name} ×${count}`);
            } else {
              parts.push(opt.name);
            }
          }

          if (parts.length > 0) {
            lines.push("    " + parts.join(", "));
          }
        }

        // Oggetti Magici
        if (e.magicItems?.length || e.preselectedMagicItems?.length) {
          let names = []
          if (e.preselectedMagicItems?.length) names = names.concat(e.preselectedMagicItems
            .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
            .filter(Boolean));
          for (const id of e.magicItems) {
            const item = MAGIC_ITEMS.find(m => m.id === id);
            if (!id) continue;
            const count = e.magicItemCounts?.[id] || 1;
            if (item.allow_multiple_per_model) {
              names.push(`${renderName(item.name)} ×${count}`);
            } else {
              names.push(renderName(item.name));
            }
          }
          if (names.length > 0) {
            lines.push(renderName("    " + names.join(", ")));
          }
        }

        // Virtù Cavalleresche
        if (e.knightlyVirtues?.length || e.preselectedKnightlyVirtues?.length) {
          let names = []
          if (e.preselectedKnightlyVirtues?.length) names = names.concat(e.preselectedKnightlyVirtues
            .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
            .filter(Boolean));
          if (e.knightlyVirtues?.length) names = names.concat(e.knightlyVirtues
            .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
            .filter(Boolean));
          if (names.length > 0) {
            lines.push(renderName("    " + names.join(", ")));
          }
        }

        // Stendardo Magico
        if (e.magicBanner) {
          const banner = MAGIC_BANNERS.find(b => b.id === e.magicBanner);
          if (banner) {
            lines.push(renderName("    " + banner.name));
          }
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  function exportArmyTextMarkdown() {
    const { stats } = validateArmy();
    const title = document.getElementById("listTitleInput").value || "Lista senza titolo";

    let lines = [];

    // Header
    lines.push(`# ${title}`);
    lines.push(`**Battle Hammer – ${armyName(currentFaction)}**`);
    lines.push(`**Punti totali:** ${stats.total}/${army.maxPoints}`);
    lines.push("");

    for (const cat of categories) {
      const entries = army.entries.filter(e => e.category === cat);
      if (entries.length === 0) continue;

      lines.push(`## ${cat}`);
      lines.push("");

      for (const e of entries) {
        // Titolo unità
        if (e.size === 1) {
          lines.push(`- **${e.name}** — ${e.points} pt`);
        } else {
          lines.push(`- **${e.name}** (${e.size} modelli) — ${e.points} pt`);
        }

        // Opzioni
        if (e.options?.length || e.preselectedOptions?.length) {
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          const parts = [];

          for (const optName of e.preselectedOptions) {
            parts.push(optName);
          }

          for (const optId of e.options) {
            const opt = unit.options.find(o => o.id === optId);
            if (!opt) continue;
            const count = e.optionCounts?.[optId] || 1;
            if (opt.max_count) {
              parts.push(`${opt.name} ×${count}`);
            } else {
              parts.push(opt.name);
            }
          }
          if (parts.length > 0) {
            lines.push(`  - ${parts.join(", ")}`);
          }
        }

        // Oggetti Magici
        if (e.magicItems?.length || e.preselectedMagicItems?.length) {
          let names = []
          if (e.preselectedMagicItems?.length) names = names.concat(e.preselectedMagicItems
            .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
            .filter(Boolean));
          for (const id of e.magicItems) {
            const item = MAGIC_ITEMS.find(m => m.id === id);
            if (!id) continue;
            const count = e.magicItemCounts?.[id] || 1;
            if (item.allow_multiple_per_model) {
              names.push(`${renderName(item.name)} ×${count}`);
            } else {
              names.push(renderName(item.name));
            }
          }
          if (names.length > 0) {
            lines.push(renderName(`  - ${names.join(", ")}`));
          }
        }

        // Virtù
        if (e.knightlyVirtues?.length || e.preselectedKnightlyVirtues?.length) {
          let names = []
          if (e.preselectedKnightlyVirtues?.length) names = names.concat(e.preselectedKnightlyVirtues);
          if (e.knightlyVirtues?.length) names = names.concat(e.knightlyVirtues
            .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
            .filter(Boolean));
          if (names.length > 0) {
            lines.push(renderName(`  - ${names.join(", ")}`));
          }
        }

        // Stendardo Magico
        if (e.magicBanner) {
          const banner = MAGIC_BANNERS.find(b => b.id === e.magicBanner);
          if (banner) {
            lines.push(renderName(`  - ${banner.name}`));
          }
        }

        lines.push("");
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  function buildArmyDataForPdf() {

    // ---
    // funzioni interne
    // ---

    function collectEquipment(unit, selectedOptionIds) {
      const eq = [...(unit.equipment || [])];
      for (const opt of unit.options || []) {
        if (selectedOptionIds.has(opt.id) && opt.add_equipment) {
          eq.push(...opt.add_equipment);
        }
      }
      return eq;
    }

    // function collectMount(unit, selectedOptionIds) {
    //   // try with optional first
    //   for (const opt of unit.options || []) {
    //     // caso 1: mount profile definito
    //     if (selectedOptionIds.has(opt.id)){
    //       if (opt.mount_profile) {
    //         opt.mount_profile.specs = collectSpecModifiers(opt.mount_profile,[]);
    //         opt.mount_profile.rangedSpecs = collectRangedSpecs(opt.mount_profile.ranged);
    //         return opt.mount_profile;
    //       }
    //       else if (opt.add_mount) {
    //         const mountUnit = findMountById(opt.add_mount);
    //         // caso 2: nome corrispondente a un'unità della lista
    //         if (mountUnit) {
    //           return {
    //             name: mountUnit.name,
    //             stats: mountUnit.stats,
    //             spec: mountUnit.spec,
    //             specs: collectSpecModifiers(mountUnit,[]),
    //             type: mountUnit.type,
    //             min_size: mountUnit.min_size,
    //             max_size: mountUnit.max_size,
    //             rules: mountUnit.rules,
    //             equipment: mountUnit.equipment,
    //             ranged: mountUnit.ranged,
    //             rangedSpecs: collectRangedSpecs(mountUnit.ranged)
    //           };
    //         }
    //         // caso 3: nessuna delle precedenti (cavalcatura senza profilo)
    //         else {
    //           let mount = {};
    //           mount.name = opt.add_mount;
    //           return mount;
    //         }
    //       }
    //     }
    //   }
    //   // then default ones
    //   if (unit.mount) {
    //     // caso 1: mount profile definito
    //     if (unit.mount.stats){
    //       unit.mount.specs = collectSpecModifiers(unit.mount,[]);
    //       unit.mount.rangedSpecs = collectRangedSpecs(unit.mount.ranged);
    //       return unit.mount;
    //     }
    //     else {
    //       const mountUnit = findMountById(opt.add_mount);
    //       // caso 2: nome corrispondente a un'unità della lista
    //       if (mountUnit) {
    //         return {
    //           name: mountUnit.name,
    //           stats: mountUnit.stats,
    //           spec: mountUnit.spec,
    //           specs: collectSpecModifiers(mountUnit,[]),
    //           type: mountUnit.type,
    //           min_size: mountUnit.min_size,
    //           max_size: mountUnit.max_size,
    //           rules: mountUnit.rules,
    //           equipment: mountUnit.equipment,
    //           ranged: mountUnit.ranged,
    //           rangedSpecs: collectRangedSpecs(mountUnit.ranged)
    //         };
    //       }
    //       else {
    //         let mount = {};
    //         mount.name = unit.mount;
    //         return mount;
    //       }
    //     }
    //   }
    //   return null;
    // }

    // function collectUpgrades(unit, selectedOptionIds) {
    //   const upgrades = [];
    //   for (const opt of unit.options || []) {
    //     if (!selectedOptionIds.has(opt.id)) continue;
    //     if (opt.add_equipment) continue;
    //     if (opt.add_mount) continue;
    //     if (opt.is_magic_item) continue;
    //     upgrades.push(opt.name);
    //   }
    //   return upgrades;
    // }

    // function computeModifiedRules(unit, selectedOptionIds) {
    //   let rules = [...(unit.rules || [])];
    //   for (const opt of unit.options || []) {
    //     if (selectedOptionIds.has(opt.id) && opt.add_rules) {
    //       rules.push(...opt.add_rules);
    //     }
    //   }
    //   return rules;
    // }

    // function computeModifiedStats(unit, selectedOptionIds) {
    //   const stats = {};
    //   for (const [k, v] of Object.entries(unit.stats)) {
    //     stats[k] = Number(v);
    //   }
    //   for (const opt of unit.options || []) {
    //     if (selectedOptionIds.has(opt.id) && opt.stat_modifiers) {
    //       for (const [stat, delta] of Object.entries(opt.stat_modifiers)) {
    //         stats[stat] = (stats[stat] ?? 0) + Number(delta);
    //       }
    //     }
    //   }
    //   return stats;
    // }

    // function collectSpecModifiers(unit, selectedOptionIds) {
    //   const grouped = {};
    //   if (unit.spec) {
    //     for (const [stat, text] of Object.entries(unit.spec)) {
    //       if (!grouped[stat]) grouped[stat] = [];
    //       grouped[stat].push(text);
    //     }
    //   }
    //   for (const opt of unit.options || []) {
    //     if (selectedOptionIds.has(opt.id) && opt.add_spec) {
    //       for (const [stat, text] of Object.entries(opt.add_spec)) {
    //         if (!grouped[stat]) grouped[stat] = [];
    //         grouped[stat].push(text);
    //       }
    //     }
    //   }
    //   return grouped;
    // }

    // function collectRangedWeapons(unit, selectedOptionIds) {
    //   const ranged = [];
    //   if (unit.ranged) ranged.push(...unit.ranged);
    //   for (const opt of unit.options || []) {
    //     if (selectedOptionIds.has(opt.id) && opt.add_ranged) {
    //       ranged.push(...opt.add_ranged);
    //     }
    //   }
    //   return ranged;
    // }

    // function collectRangedSpecs(rangedWeapons) {
    //   const specs = [];
    //   if (!rangedWeapons || rangedWeapons.length === 0) return specs;
    //   rangedWeapons.forEach((weapon, index) => {
    //     if (weapon.spec && weapon.spec !== "-") {
    //       specs.push({ index, text: weapon.spec });
    //     }
    //   });
    //   return specs;
    // }

    // ---

    const { stats } = validateArmy();
    const title = document.getElementById("listTitleInput").value || "Lista senza titolo";

    const sections = categories.map(cat => {
      const entries = army.entries.filter(e => e.category === cat);
      if (entries.length === 0) return null;

      return {
        name: cat,
        units: entries.map(e => {
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);

          // --- OPZIONI SELEZIONATE ---
          const selectedOptionIds = new Set([
            ...(e.preselectedOptions || []),
                                            ...(e.options || [])
          ]);

          // --- MAGIC ITEMS ---
          const magicItemList = [
            ...(e.preselectedMagicItems || []).map(id => MAGIC_ITEMS.find(m => m.id === id)?.name).filter(Boolean),
                           ...(e.magicItems || []).map(id => MAGIC_ITEMS.find(m => m.id === id)?.name).filter(Boolean)
          ];

          // --- KNIGHTLY VIRTUES ---
          const knightlyVirtueList = [
            ...(e.preselectedKnightlyVirtues || []).map(id => MAGIC_ITEMS.find(m => m.id === id)?.name).filter(Boolean),
                           ...(e.knightlyVirtues || []).map(id => MAGIC_ITEMS.find(m => m.id === id)?.name).filter(Boolean)
          ];

          // --- EQUIPAGGIAMENTO ---
          const equipment = collectEquipment(unit, selectedOptionIds);

          // --- UPGRADE ---
          const upgrades = collectUpgrades(unit, selectedOptionIds);

          // --- REGOLE SPECIALI ---
          const rules = computeModifiedRules(unit, selectedOptionIds);

          // --- STATISTICHE MODIFICATE ---
          const modifiedStats = computeModifiedStats(unit, selectedOptionIds);

          // --- SPEC MODIFICATI ---
          const groupedSpecs = collectSpecModifiers(unit, selectedOptionIds);

          // --- ARMI A DISTANZA ---
          const rangedWeapons = collectRangedWeapons(unit, selectedOptionIds);
          const rangedSpecs = collectRangedSpecs(rangedWeapons);

          // --- TIPO UNITÀ ---
          const type = unit.type || null;

          // --- CAVALCATURE ---
          const mount = collectMount(unit, selectedOptionIds) || null;

          return {
            name: e.name,
            points: e.points,
            size: e.size,

            // Nuovi campi per il PDF
            stats: modifiedStats,
            specs: groupedSpecs,
            type,
            rules,
            equipment,
            upgrades,
            magicItems: magicItemList,
            knightlyVirtues: knightlyVirtueList,
            magicBanner: e.magicBanner
            ? MAGIC_BANNERS.find(b => b.id === e.magicBanner)?.name
            : null,

            ranged: rangedWeapons,
            rangedSpecs,

            mount
            // ,
            // mountProfile
          };
        })
      };
    }).filter(Boolean);

    return {
      name: title,
      faction: currentFaction,
      totalPoints: stats.total,
      sections
    };
  }

  // function exportArmyPDF(armyData) {
  //   const { jsPDF } = window.jspdf;
  //   const doc = new jsPDF({ unit: "pt", format: "a4" });
  //
  //   const pageWidth = doc.internal.pageSize.getWidth();
  //   const pageHeight = doc.internal.pageSize.getHeight();
  //   const margin = 40;
  //   let y = margin;
  //
  //   // --- HEADER PRINCIPALE ---
  //   doc.setFont("helvetica", "bold");
  //   doc.setFontSize(18);
  //   doc.text("Battle Hammer", pageWidth / 2, y, { align: "center" });
  //   y += 10;
  //   doc.line(margin, y, pageWidth - margin, y);
  //   y += 20;
  //
  //   // --- INFO LISTA ---
  //   doc.setFont("helvetica", "bolditalic");
  //   doc.setFontSize(14);
  //   const headerLine = `${armyData.name} — ${armyName(armyData.faction)} — ${armyData.totalPoints} pt`;
  //   doc.text(headerLine, pageWidth / 2, y, { align: "center" });
  //   y += 15;
  //
  //   // doc.line(margin, y, pageWidth - margin, y);
  //   y += 20;
  //
  //   // --- SEZIONI ---
  //   armyData.sections.forEach(section => {
  //     // separatore
  //     doc.line(margin, y, pageWidth - margin, y);
  //     y += 20;
  //
  //     // titolo sezione
  //     doc.setFont("helvetica", "bold");
  //     doc.setFontSize(14);
  //     doc.text(section.name, margin, y);
  //     y += 20;
  //
  //     // unità
  //     section.units.forEach(unit => {
  //       // --- UNITÀ ---
  //       doc.setFont("helvetica", "normal");
  //       doc.setFontSize(12);
  //
  //       const sizeText = unit.size > 1 ? ` (${unit.size} modelli)` : "";
  //       const unitLine = `• ${unit.name}${sizeText} — ${unit.points} pt`;
  //
  //       doc.text(unitLine, margin + 20, y);
  //       y += 20;
  //
  //       // --- OPZIONI (tutte in una riga) ---
  //       doc.setFont("helvetica", "italic");
  //       doc.setFontSize(11);
  //
  //       const optionsLine = [];
  //
  //       if (unit.options.length > 0) {
  //         optionsLine.push(unit.options.join(", "));
  //       }
  //
  //       if (unit.magicItems.length > 0) {
  //         optionsLine.push(renderName(unit.magicItems.join(", ")));
  //       }
  //
  //       if (unit.knightlyVirtues.length > 0) {
  //         optionsLine.push(rednerName(unit.knightlyVirtues.join(", ")));
  //       }
  //
  //       if (unit.magicBanner) {
  //         optionsLine.push(renderName(unit.magicBanner));
  //       }
  //
  //       if (optionsLine.length > 0) {
  //         y -= 5;
  //         optionText = optionsLine.join(" — ");
  //         splitOptionText = doc.splitTextToSize(optionText, doc.internal.pageSize.width - (margin * 2 + 40));
  //         doc.text(splitOptionText, margin + 40, y);
  //         y += 20;
  //       }
  //
  //       // salto pagina
  //       if (y > pageHeight - 60) {
  //         addFooter(doc, pageWidth, pageHeight);
  //         doc.addPage();
  //         y = margin;
  //       }
  //     });
  //   });
  //
  //   // footer finale
  //   addFooter(doc, pageWidth, pageHeight);
  //
  //   doc.save(`BattleHammer - ${armyName(currentFaction)} - ${armyData.name}.pdf`);
  //
  //   // --- FOOTER ---
  //   function addFooter(doc, pageWidth, pageHeight) {
  //     doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);
  //     doc.setFontSize(10);
  //     doc.text(
  //       `${doc.internal.getNumberOfPages()}`,
  //              pageWidth / 2,
  //              pageHeight - 25,
  //              { align: "center" }
  //     );
  //   }
  // }

  function exportArmyPDF(armyData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    const columnWidth = (pageWidth - margin * 3) / 2;
    let col = 0; // 0 = sinistra, 1 = destra
    let y = margin;

    function colX() {
      return col === 0
      ? margin
      : margin * 2 + columnWidth;
    }

    function addFooter() {
      doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);
      doc.setFontSize(10);
      doc.text(
        `Pagina ${doc.internal.getNumberOfPages()}`,
               pageWidth / 2,
               pageHeight - 25,
               { align: "center" }
      );
    }

    function ensureSpace(lines = 1) {
      const needed = lines * 14;
      // Se non c'è spazio nella colonna corrente → passa alla colonna destra
      if (y + needed > pageHeight - 60) {
        if (col === 0) {
          col = 1;
          y = margin;
          if (doc.internal.getNumberOfPages() === 1) y += 65;
        } else {
          // entrambe le colonne piene → nuova pagina
          addFooter();
          doc.addPage();
          col = 0;
          y = margin;
        }
      }
    }

    function drawLabelAndWrappedText(doc, label, text, x, y, colWidth) {
      doc.setFont("helvetica", "bold");
      doc.text(label, x, y);

      // shift test according to label width
      const labelWidth = doc.getTextWidth(label + " ");
      let spaces = "";
      while (doc.getTextWidth(spaces)<labelWidth) {
        spaces += " ";
      }
      const newText = spaces+text;

      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(newText, colWidth);
      doc.text(lines, x, y);

      return y + lines.length * 13; // nuova Y
    }

    function printUnit(unit) {
      // Tabella statistiche
      const stats = unit.stats;
      const statKeys = Object.keys(stats);
      const colWidth = columnWidth / statKeys.length;

      // Aggiunge gli asterischi alle statistiche
      const statsWithStars = { ...unit.stats };
      let starIndex = 0;
      for (const stat of Object.keys(unit.specs || {})) {
        const stars = "*".repeat(starIndex + 1);
        // Se la statistica ha già asterischi (caso raro), aggiungi spazio
        if (String(statsWithStars[stat]).includes("*")) {
          statsWithStars[stat] += " " + stars;
        } else {
          statsWithStars[stat] += stars;
        }
        starIndex++;
      }

      // Aggiunge gli asterischi alle armi a distanza
      const rangedWeapons = unit.ranged || [];
      const rangedSpecs = unit.rangedSpecs || [];
      const rangedWithStars = rangedWeapons.map((weapon, index) => {
        let specMark = "";
        if (weapon.spec === "-") {
          specMark = "-";
        } else if (weapon.spec) {
          specMark = "*".repeat(index + 1);
        }
        return {
          ...weapon,
          specMark
        };
      });

      // Header con sfondo grigio
      doc.setFillColor(120, 120, 120);     // grigio chiaro
      doc.setTextColor(255, 255, 255);  // testo bianco
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");

      // Disegna rettangolo header
      doc.rect(colX(), y, columnWidth, 14, "F");

      // Testo header
      statKeys.forEach((k, i) => {
        const x = colX() + i * colWidth;
        doc.rect(x, y, colWidth, 14); // bordo cella
        const headerX = x + colWidth / 2;
        doc.text(k, headerX, y + 10, { align: "center" });
      });

      y += 14;

      // Ripristina testo nero
      doc.setFillColor(255, 255, 255);   // bianco
      doc.rect(colX(), y, columnWidth, 14, "F"); // sfondo
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      // Riga valori con bordi
      statKeys.forEach((k, i) => {
        const x = colX() + i * colWidth;
        doc.rect(x, y, colWidth, 14); // bordo cella
        const cellX = x + colWidth / 2;
        doc.text(String(statsWithStars[k]), cellX, y + 10, { align: "center" });
      });

      y += 26;

      // Legenda spec
      const specs = unit.specs || {};
      const specEntries = Object.entries(specs);
      if (specEntries.length > 0) {
        let starIndex = 0;
        specEntries.forEach(([stat, texts]) => {
          const stars = "*".repeat(starIndex + 1);
          const line = `${stars}: ${texts.join(", ")}`;

          doc.setFont("helvetica", "italic");
          // doc.text(line, colX(), y);
          const lines = doc.splitTextToSize(line, columnWidth);
          doc.text(lines, colX(), y);
          y += 2 + lines.length * 12;
          doc.setFont("helvetica", "normal");
          starIndex++;
        });
      }

      // Tipo unità
      if (unit.type) {
        doc.setFontSize(11);
        const text = unit.type.map(t => {return autoRenderName(t);}).join(", ");
        y = drawLabelAndWrappedText(doc, "Tipo unità:", text, colX(), y, columnWidth);
      }

      // Regole speciali
      if (unit.rules && unit.rules.length > 0) {
        doc.setFontSize(11);
        const text = unit.rules.map(t => {return autoRenderName(t);}).join(", ");
        y = drawLabelAndWrappedText(doc, "Regole speciali:", text, colX(), y, columnWidth);
      }

      // Equipaggiamento
      if (unit.equipment && unit.equipment.length > 0) {
        doc.setFontSize(11);
        const text = unit.equipment.map(t => {return autoRenderName(t);}).join(", ");
        y = drawLabelAndWrappedText(doc, "Equipaggiamento:", text, colX(), y, columnWidth);
      }

      // Cavalcatura
      if (unit.mount) {
        doc.setFontSize(11);
        let text = null;
        console.log(unit.mount.name);
        if (unit.mount.name) text = autoRenderName(unit.mount.name);
        else text = autoRenderName(unit.mount);
        y = drawLabelAndWrappedText(doc, "Cavalcatura:", text, colX(), y, columnWidth);
      }

      // Upgrade
      if (unit.upgrades && unit.upgrades.length > 0) {
        doc.setFontSize(11);
        const text = unit.upgrades.map(t => {return autoRenderName(t);}).join(", ");
        y = drawLabelAndWrappedText(doc, "Upgrade:", text, colX(), y, columnWidth);
      }

      // Tabelle armi a distanza
      if (rangedWithStars.length > 0) {
        y -= 6;

        const cols = ["Att. a distanza", "Raggio", "Attacco", "Speciale"];
        const colWidth = columnWidth / cols.length;

        // Header grigio
        doc.setFillColor(120, 120, 120);
        doc.setTextColor(255, 255, 255);
        doc.rect(colX(), y, columnWidth, 14, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        cols.forEach((h, i) => {
          const x = colX() + i * colWidth;
          doc.rect(x, y, colWidth, 14);
          const cellX = x + colWidth / 2;
          doc.text(h, cellX, y + 10, { align: "center" });
        });

        y += 14;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        // Righe
        rangedWithStars.forEach(weapon => {
          doc.rect(colX(), y, columnWidth, 14, "F"); // sfondo

          // Bordi
          cols.forEach((_, i) => {
            const x = colX() + i * colWidth;
            doc.rect(x, y, colWidth, 14);
          });

          // Contenuto
          doc.text(weapon.name, colX() + colWidth/2, y + 10, { align: "center" });
          doc.text(String(weapon.range), colX() + colWidth + colWidth/2, y + 10, { align: "center" });
          doc.text(String(weapon.att), colX() + colWidth * 2 + colWidth/2, y + 10, { align: "center" });
          doc.text(weapon.specMark, colX() + colWidth * 3 + colWidth/2, y + 10, { align: "center" });

          y += 16;
        });
        y += 14;

        // Legenda
        if (rangedSpecs.length > 0) {
          y -= 2;
          rangedSpecs.forEach((spec, index) => {
            const stars = "*".repeat(index + 1);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(10);
            // doc.text(`${stars}: ${spec.text}`, colX(), y);
            const lines = doc.splitTextToSize(`${stars}: ${spec.text}`, columnWidth);
            doc.text(lines, colX(), y);
            y += lines.length * 14;
            doc.setFont("helvetica", "normal");
          });
          y += 2;
        }

      }

      if (unit.magicItems && unit.magicItems.length > 0) {
        doc.setFontSize(11);
        const items = unit.magicItems.map(t => {return autoRenderName(t);});
        const text = items.join(", ");
        y = drawLabelAndWrappedText(doc, "Oggetti Magici:", text, colX(), y, columnWidth);
      }

      // Stendardo magico
      if (unit.magicBanner) {
        doc.setFontSize(11);
        const text = autoRenderName(unit.magicBanner);
        y = drawLabelAndWrappedText(doc, "Stendardo Magico:", text, colX(), y, columnWidth);
      }
    }

    function measureMountBlock(doc, mount, columnWidth) {
      let h = 0;

      // Titolo "Cavalcatura: X"
      h += 14;

      // Tabella caratteristiche
      const statKeys = Object.keys(mount.stats || {});
      if (statKeys.length > 0) {
        h += 14; // header
        h += 14; // valori
        h += 4;  // spazio
      }

      // Spec
      if (mount.spec) {
        for (const [stat, text] of Object.entries(mount.spec)) {
          const lines = doc.splitTextToSize(text, columnWidth);
          h += lines.length * 10 + 4;
        }
      }

      // Tipo
      if (mount.type && mount.type.length > 0) {
        const text = mount.type.join(", ");
        const lines = doc.splitTextToSize(text, columnWidth);
        h += lines.length * 11 + 5;
      }

      // Regole speciali
      if (mount.rules && mount.rules.length > 0) {
        const text = mount.rules.join(", ");
        const lines = doc.splitTextToSize(text, columnWidth);
        h += lines.length * 11 + 5;
      }

      // Equipaggiamento
      if (mount.equipment && mount.equipment.length > 0) {
        const text = mount.equipment.join(", ");
        const lines = doc.splitTextToSize(text, columnWidth);
        h += lines.length * 11 + 5;
      }

      // Armi a distanza
      if (mount.ranged && mount.ranged.length > 0) {
        const cols = 4;
        h += 14; // header
        h += mount.ranged.length * 14; // righe
        h += 4; // spazio

        if (mount.rangedSpecs && mount.rangedSpecs.length > 0) {
          h += mount.rangedSpecs.length * 11 + 4;
        }
      }
      h += 6

      return h;
    }

    // HEADER PRINCIPALE
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Battle Hammer", pageWidth / 2, y, { align: "center" });
    y += 10;
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // INFO LISTA
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(14);
    const headerLine = `${armyData.name} — ${armyName(armyData.faction)} — ${armyData.totalPoints} pt`;
    doc.text(headerLine, pageWidth / 2, y, { align: "center" });
    y += 15;
    y += 20;

    // Raccoglie tutti gli oggetti magici usati
    const usedMagicItems = new Map();   // id → oggetto JSON
    const usedMagicBanners = new Map(); // id → stendardo JSON

    armyData.sections.forEach(section => {
      section.units.forEach(unit => {
        // Oggetti magici
        (unit.magicItems || []).forEach(name => {
          const item = MAGIC_ITEMS.find(m => m.name === name);
          if (item) usedMagicItems.set(item.id, item);
        });

          // Virtù cavalleresche (se usi lo stesso JSON)
          (unit.knightlyVirtues || []).forEach(name => {
            const item = MAGIC_ITEMS.find(m => m.name === name);
            if (item) usedMagicItems.set(item.id, item);
          });

            // Stendardi magici
            if (unit.magicBanner) {
              const banner = MAGIC_BANNERS.find(b => b.name === unit.magicBanner);
              if (banner) usedMagicBanners.set(banner.id, banner);
            }
      });
    });

    // SEZIONI + UNITÀ
    armyData.sections.forEach(section => {
      y += 6;
      ensureSpace(13);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(section.name, colX(), y);
      y += 6;
      doc.line(colX(), y, colX()+columnWidth, y);
      y += 24;

      section.units.forEach(unit => {
        ensureSpace(10);

        // Nome unità + punti
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        const sizeText = unit.size > 1 ? ` (${unit.size} modelli)` : "";
        const unitLine = `${unit.name}${sizeText} — ${unit.points} pt`;
        doc.text(unitLine, colX(), y);
        y += 4;
        printUnit(unit);

        // Cavalcatura con profilo
        if (unit.mount && unit.mount.stats) {
          y += 4;
          let yy = y;

          const mountHeight = measureMountBlock(doc, unit.mount, columnWidth);
          ensureSpace(mountHeight/12);

          doc.setFillColor(215, 215, 215);
          doc.rect(colX()-4, y-12, columnWidth+8, mountHeight, "F");
          doc.rect(colX()-4, y-12, columnWidth+8, mountHeight);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text(`${unit.mount.name}:`, colX(), y);
          y += 4;
          printUnit(unit.mount);

          y = yy + mountHeight;
        }

        y += 16;
      });

      y += 20;
    });

    if (usedMagicItems.size > 0 || usedMagicBanners.size > 0) {
      ensureSpace(3);
      y += 3*14;
    }

    // ----------------------------
    // APPENDICE: OGGETTI MAGICI
    // ----------------------------
    if (usedMagicItems.size > 0) {
      ensureSpace(10);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Oggetti Magici", colX(), y);
      y += 6;
      doc.line(colX(), y, colX()+columnWidth, y);
      y += 24;

      usedMagicItems.forEach(item => {
        ensureSpace(5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${autoRenderName(item.name)} — ${item.cost} pt`, colX(), y);
        y += 12;

        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text(item.category, colX(), y);
        y += 12;

        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(item.description, columnWidth);
        doc.setFontSize(11);
        doc.text(lines, colX(), y);
        y += lines.length * 12 + 10;
      });

      y += 24;
    }

    // ----------------------------
    // APPENDICE: STENDARDI MAGICI
    // ----------------------------
    if (usedMagicBanners.size > 0) {
      ensureSpace(10);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Stendardi Magici", colX(), y);
      y += 6;
      doc.line(colX(), y, colX()+columnWidth, y);
      y += 24;

      usedMagicBanners.forEach(banner => {
        ensureSpace(5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${banner.name} — ${banner.cost} pt`, colX(), y);
        y += 12;

        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text(banner.category, colX(), y);
        y += 12;

        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(banner.description, columnWidth);
        doc.setFontSize(11);
        doc.text(lines, colX(), y);
        y += lines.length * 12 + 10;
      });

      y += 24;
    }

    addFooter();
    doc.save(`${armyData.name}_BattleHammer.pdf`);
  }

  function exportArmyJson() {
    const { stats } = validateArmy();
    const title = document.getElementById("listTitleInput").value || "Lista senza titolo";
    const data = {
      title: title,
      faction: currentFaction,
      total_points: stats.total,
      max_points: army.maxPoints,
      categories: stats.byCat,
      units: army.entries.map(e => ({
        id: e.id,
        unitId: e.unitId,
        name: e.name,
        category: e.category,
        size: e.size,
        options: [...e.options],
        optionCounts: e.optionCounts || {},
        magicItems: e.magicItems || [],
        magicItemCounts: e.magicItemCounts || {},
        knightlyVirtues: e.knightlyVirtues || [],
        magicBanner: e.magicBanner || null,
        preselectedOptions: [...(e.preselectedOptions || [])],
        preselectedMagicItems: [...(e.preselectedMagicItems || [])],
        preselectedKnightlyVirtues: [...(e.preselectedKnightlyVirtues || [])],
        points: e.points
      }))
    };
    return JSON.stringify(data, null, 2);
  }

  // --- RENDERING ------------------------------------------------------------

  function renderModelCount(entry) {
    const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === entry.unitId);
    if (unit.min_size === 1 && unit.max_size === 1) {
      return "";
    }

    return `<span style="font-size:11px; opacity:0.8;">(${entry.size} mod.)</span>`;
  }

  function renderUnitList() {
    const container = document.getElementById("unitList");
    container.innerHTML = "";
    const units = UNITS_BY_FACTION[currentFaction] || [];

    const byCat = {};
    for (const u of units) {
      if (!byCat[u.category]) byCat[u.category] = [];
      byCat[u.category].push(u);
    }

    for (const cat of categories) {
      if (!byCat[cat] || byCat[cat].length === 0) continue;

      const header = document.createElement("div");
      header.textContent = cat;
      header.style.padding = "6px 8px";
      header.style.cursor = "pointer";
      header.style.background = "#161b22";
      header.style.fontWeight = "bold";
      header.style.fontSize = "12px";
      header.style.textTransform = "uppercase";
      container.appendChild(header);

      // Contenuto nascosto
      const content = document.createElement("div");
      content.className = "unit-category-content";
      // content.style.display = "none";
      // content.style.padding = "6px 8px";
      content.style.fontSize = "12px";

      header.onclick = () => {
        // Chiudi tutte le altre categorie
        const allContents = container.querySelectorAll(".unit-category-content");
        allContents.forEach(c => {
          if (c !== content) c.classList.remove("open");
          // if (c !== content) c.style.display = "none";
        });
        // Apri/chiudi questa categoria
        content.classList.toggle("open");
        // content.style.display = content.style.display === "none" ? "block" : "none";
      };

      for (const unit of byCat[cat]) {
        const card = document.createElement("div");
        card.className = "unit-card";
        card.style.padding = "6px 8px";
        card.onclick = () => selectUnit(unit);

        const left = document.createElement("div");
        const name = document.createElement("div");
        name.textContent = unit.name;
        const meta = document.createElement("div");
        meta.className = "unit-meta";
        if (unit.min_size === 1 && unit.max_size === 1) {
          meta.textContent = `${unit.cost_per_model} pt`;
        } else {
          meta.textContent = `${unit.cost_per_model} pt/mod., ${unit.min_size}-${unit.max_size} mod.`;
        }
        left.appendChild(name);
        left.appendChild(meta);

        const right = document.createElement("div");
        right.textContent = "";

        card.appendChild(left);
        card.appendChild(right);
        container.appendChild(content);
        content.appendChild(card);
      }
    }
  }

  function selectUnit(unit) {
    // controllo di unicità
    if (unit.max_per_army && counts[unit.id] >= unit.max_per_army) {
      showInfoToast("Questa unità è già stata selezionata il numero massimo di volte","alert",3000);
    } else {
      clearConfigPanel();
      selectedUnit = unit;
      renderConfigPanel();
      if (window.innerWidth < 768) {
        moveToTab("config");
      }
    }
  }

  function computeModifiedStats(unit, selectedOptionIds) {
    const stats = {};
    for (const [k, v] of Object.entries(unit.stats)) {
      stats[k] = Number(v);
    }
    for (const opt of unit.options || []) {
      if (selectedOptionIds.has(opt.id) && opt.stat_modifiers) {
        for (const [stat, delta] of Object.entries(opt.stat_modifiers)) {
          stats[stat] = (stats[stat] ?? 0) + Number(delta);
        }
      }
    }
    return stats;
  }

  // function renderUnitStats(unit) {
  function renderUnitStats(stats) {
    const box = document.getElementById("unitStatsBox");
    box.innerHTML = "";
    if (!stats) return;
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.marginBottom = "8px";
    table.style.tableLayout = "fixed";
    table.style.fontSize = "12px";
    const header = document.createElement("tr");
    header.style.fontWeight = "bold";
    header.style.background = "#161b22";
    const valueRow = document.createElement("tr");
    for (const [stat, val] of Object.entries(stats)) {
      const th = document.createElement("th");
      th.textContent = stat;
      th.style.padding = "4px";
      th.style.border = "1px solid #30363d";
      header.appendChild(th);
      const td = document.createElement("td");
      td.textContent = val;
      td.style.padding = "4px";
      td.style.border = "1px solid #30363d";
      td.align = "center";
      valueRow.appendChild(td);
    }
    table.appendChild(header);
    table.appendChild(valueRow);
    box.appendChild(table);
  }

  function collectSpecModifiers(unit, selectedOptionIds) {
    const grouped = {};
    // 1) Modificatori base dell’unità
    if (unit.spec) {
      for (const [stat, text] of Object.entries(unit.spec)) {
        if (!grouped[stat]) grouped[stat] = [];
        grouped[stat].push(text);
      }
    }
    // 2) Modificatori aggiunti dalle opzioni
    for (const opt of unit.options || []) {
      if (selectedOptionIds.has(opt.id) && opt.add_spec) {
        for (const [stat, text] of Object.entries(opt.add_spec)) {
          if (!grouped[stat]) grouped[stat] = [];
          grouped[stat].push(text);
        }
      }
    }
    return grouped; // { Att: ["...", "..."], Dif: ["..."], ... }
  }

  function applySpecAsterisks(stats, groupedSpecs) {
    const modifiedStats = { ...stats };
    let index = 0;
    for (const stat of Object.keys(groupedSpecs)) {
      const star = "*".repeat(index + 1);
      // Se ci sono già asterischi, aggiungi uno spazio
      if (typeof modifiedStats[stat] === "string" && modifiedStats[stat].includes("*")) {
        modifiedStats[stat] += " " + star;
      } else {
        modifiedStats[stat] += star;
      }
      index++;
    }
    return modifiedStats;
  }

  function renderUnitSpec(groupedSpecs) {
    const box = document.getElementById("unitSpecBox");
    box.innerHTML = "";
    if (!groupedSpecs || Object.keys(groupedSpecs).length === 0) return;
    let index = 0;
    for (const [stat, texts] of Object.entries(groupedSpecs)) {
      const star = "*".repeat(index + 1);
      const row = document.createElement("div");
      row.style.fontSize = "12px";
      row.style.marginTop = "2px";
      row.style.fontStyle = "italic";
      row.textContent = `${star}: ${texts.join(", ")}`;
      box.appendChild(row);
      index++;
    }
  }

  function computeModifiedType(unit, selectedOptionIds) {
    // Tipo base: può essere stringa o array
    let types = [];

    if (Array.isArray(unit.type)) {
      types = [...unit.type];
    } else if (typeof unit.type === "string") {
      types = [unit.type];
    }

    // Applica le sostituzioni delle opzioni
    for (const opt of unit.options || []) {
      if (!selectedOptionIds.has(opt.id)) continue;

      if (opt.change_type) {
        for (const [from, to] of Object.entries(opt.change_type)) {
          const idx = types.indexOf(from);
          if (idx !== -1) {
            types.splice(idx, 1);   // rimuove il tipo originale
            types.push(to);         // aggiunge il nuovo tipo
          }
        }
      }
    }

    // Rimuove duplicati
    return [...new Set(types)];
  }

  function renderUnitType(types) {
    const box = document.getElementById("unitTypeBox");
    box.innerHTML = "";
    if (!types || types.length === 0) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Tipo unità: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    let unitTypes = types.map(t => {return autoRenderName(t);});
    list.textContent = unitTypes.join(", ");
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function computeModifiedRules(unit, selectedOptionIds) {
    let rules = [...(unit.rules || [])];
    for (const opt of unit.options || []) {
      if (selectedOptionIds.has(opt.id) && opt.add_rules) {
        rules.push(...opt.add_rules);
      }
    }
    return rules;
  }

  function renderUnitSpecialRules(rules) {
    const box = document.getElementById("unitSpecialRulesBox");
    box.innerHTML = "";
    if (!rules || rules.length === 0) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Regole speciali: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    list.textContent = rules.join(", ");
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function renderUnitEquipment(unit, selectedOptionIds) {
    const box = document.getElementById("unitEquipmentBox");
    box.innerHTML = "";
    // Equipaggiamento base
    let eq = [...(unit.equipment || [])];
    // Equipaggiamento aggiunto dalle opzioni
    for (const opt of unit.options || []) {
      if (selectedOptionIds.has(opt.id) && opt.add_equipment) {
        eq.push(...opt.add_equipment);
      }
    }
    if (eq.length === 0) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Equipaggiamento: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    list.textContent = eq.join(", ");
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function findMountById(id) {
    const units = UNITS_BY_FACTION[currentFaction];
    return units.find(u => u.id === id) || null;
  }

  function collectMount(unit, selectedOptionIds) {
    // try with optional first
    for (const opt of unit.options || []) {
      // caso 1: mount profile definito
      if (selectedOptionIds.has(opt.id)){
        if (opt.mount_profile) {
          opt.mount_profile.specs = collectSpecModifiers(opt.mount_profile,[]);
          opt.mount_profile.rangedSpecs = collectRangedSpecs(opt.mount_profile.ranged);
          return opt.mount_profile;
        }
        else if (opt.add_mount) {
          const mountUnit = findMountById(opt.add_mount);
          // caso 2: nome corrispondente a un'unità della lista
          if (mountUnit) {
            return {
              name: mountUnit.name,
              stats: mountUnit.stats,
              spec: mountUnit.spec,
              specs: collectSpecModifiers(mountUnit,[]),
              type: mountUnit.type,
              min_size: mountUnit.min_size,
              max_size: mountUnit.max_size,
              rules: mountUnit.rules,
              equipment: mountUnit.equipment,
              ranged: mountUnit.ranged,
              rangedSpecs: collectRangedSpecs(mountUnit.ranged)
            };
          }
          // caso 3: nessuna delle precedenti (cavalcatura senza profilo)
          else {
            let mount = {};
            mount.name = opt.add_mount;
            return mount;
          }
        }
      }
    }
    // then default ones
    if (unit.mount) {
      // caso 1: mount profile definito
      if (unit.mount.stats){
        unit.mount.specs = collectSpecModifiers(unit.mount,[]);
        unit.mount.rangedSpecs = collectRangedSpecs(unit.mount.ranged);
        return unit.mount;
      }
      else {
        const mountUnit = findMountById(unit.add_mount);
        // caso 2: nome corrispondente a un'unità della lista
        if (mountUnit) {
          return {
            name: mountUnit.name,
            stats: mountUnit.stats,
            spec: mountUnit.spec,
            specs: collectSpecModifiers(mountUnit,[]),
            type: mountUnit.type,
            min_size: mountUnit.min_size,
            max_size: mountUnit.max_size,
            rules: mountUnit.rules,
            equipment: mountUnit.equipment,
            ranged: mountUnit.ranged,
            rangedSpecs: collectRangedSpecs(mountUnit.ranged)
          };
        }
        else {
          let mount = {};
          mount.name = unit.mount;
          return mount;
        }
      }
    }
    return null;
  }

  function renderUnitMount(unit, selectedOptionIds) {
    const box = document.getElementById("unitMountBox");
    box.innerHTML = "";
    const mount = collectMount(unit, selectedOptionIds) || null;
    if (!mount) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Cavalcatura: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    list.textContent = mount.name;
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function renderUnitMagicItems(selectedMagicItems, magicItemCounts, magicItemsById) {
    const box = document.getElementById("unitMagicItemsBox");
    box.innerHTML = "";
    if (selectedMagicItems.size === 0) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Oggetti magici: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    const parts = [];
    for (const id of selectedMagicItems) {
      const item = magicItemsById[id];
      const count = magicItemCounts[id] ?? 1;
      if (count > 1) parts.push(`${renderName(item.name)} ×${count}`);
      else parts.push(renderName(item.name));
    }
    list.textContent = parts.join(", ");
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function collectRangedWeapons(unit, selectedOptionIds) {
    const ranged = [];
    // Armi base
    if (unit.ranged) {
      ranged.push(...unit.ranged);
    }
    // Armi aggiunte da opzioni
    for (const opt of unit.options || []) {
      if (selectedOptionIds.has(opt.id) && opt.add_ranged) {
        ranged.push(...opt.add_ranged);
      }
    }
    return ranged;
  }

  function collectRangedSpecs(rangedWeapons) {
    const specs = [];
    if (!rangedWeapons || rangedWeapons.length === 0) return specs;
    rangedWeapons.forEach((weapon, index) => {
      if (weapon.spec && weapon.spec !== "-") {
        specs.push({ index, text: weapon.spec });
      }
    });
    return specs;
  }

  function renderUnitRanged(rangedWeapons) {
    const box = document.getElementById("unitRangedBox");
    box.innerHTML = "";

    if (!rangedWeapons || rangedWeapons.length === 0) return;

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.fontSize = "12px";
    table.style.borderCollapse = "collapse";
    table.style.marginTop = "10px";
    table.style.tableLayout = "auto";

    // Header
    const header = document.createElement("tr");
    ["Att. a distanza", "Raggio", "Att", "Speciale"].forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.padding = "4px";
      th.style.border = "1px solid #30363d";
      th.style.fontWeight = "bold";
      th.style.background = "#161b22";
      header.appendChild(th);
    });
    table.appendChild(header);

    // Rows
    rangedWeapons.forEach((weapon, index) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = weapon.name;
      tdName.style.padding = "4px";
      tdName.style.border = "1px solid #30363d";
      tdName.align = "center";
      tr.appendChild(tdName);

      const tdRange = document.createElement("td");
      tdRange.textContent = weapon.range;
      tdRange.style.padding = "4px";
      tdRange.style.border = "1px solid #30363d";
      tdRange.align = "center";
      tr.appendChild(tdRange);

      const tdAtt = document.createElement("td");
      tdAtt.textContent = weapon.att;
      tdAtt.style.padding = "4px";
      tdAtt.style.border = "1px solid #30363d";
      tdAtt.align = "center";
      tr.appendChild(tdAtt);

      const tdSpec = document.createElement("td");
      if (weapon.spec === "-") {
        tdSpec.textContent = "-";
      } else if (weapon.spec) {
        tdSpec.textContent = "*".repeat(index + 1);
      } else {
        tdSpec.textContent = "";
      }
      tdSpec.style.padding = "4px";
      tdSpec.style.border = "1px solid #30363d";
      tdSpec.align = "center";
      tr.appendChild(tdSpec);

      table.appendChild(tr);
    });

    box.appendChild(table);
  }

  function renderUnitRangedSpec(rangedSpecs) {
    const box = document.getElementById("unitRangedSpecBox");
    box.innerHTML = "";

    if (!rangedSpecs || rangedSpecs.length === 0) return;

    rangedSpecs.forEach((spec, index) => {
      const star = "*".repeat(index + 1);

      const row = document.createElement("div");
      row.style.fontSize = "12px";
      row.style.marginTop = "2px";
      row.textContent = `${star}: ${spec.text}`;

      box.appendChild(row);
    });
  }

  function collectUpgrades(unit, selectedOptionIds) {
    const upgrades = [];
    for (const opt of unit.options || []) {
      if (!selectedOptionIds.has(opt.id)) continue;
      // Escludi equipaggiamento
      if (opt.add_equipment) continue;
      // Escludi Cavalcatura
      if (opt.add_mount || opt.mount_profile) continue;
      // Escludi oggetti magici
      if (opt.is_magic_item) continue;
      upgrades.push(opt.name);
    }
    return upgrades;
  }

  function renderUnitUpgrades(upgrades) {
    const box = document.getElementById("unitUpgradeBox");
    box.innerHTML = "";
    if (!upgrades || upgrades.length === 0) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Upgrade: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    list.textContent = upgrades.join(", ");
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function renderUnitMagicBanners(magicBanner) {
    const box = document.getElementById("unitMagicBannersBox");
    box.innerHTML = "";
    if (!magicBanner) return;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "6px";
    wrapper.style.fontSize = "12px";
    const title = document.createElement("span");
    title.textContent = "Stendardo Magico: ";
    title.style.fontWeight = "bold";
    const list = document.createElement("span");
    const banner = MAGIC_BANNERS.find(b => b.id === magicBanner);
    list.textContent = banner.name;
    wrapper.appendChild(title);
    wrapper.appendChild(list);
    box.appendChild(wrapper);
  }

  function renderConfigPanel(existingEntry = null) {
    const panel = document.getElementById("configPanel");
    if (!selectedUnit) {
      panel.innerHTML = "<p style='font-size:13px; opacity:0.8;'>Seleziona un'unità dalla lista per configurarla.</p>";
      return;
    }
    let magicBannerSection = null;
    let optionCounts = existingEntry ? { ...existingEntry.optionCounts } : {};
    let selectedMagicItems = new Set(existingEntry ? existingEntry.magicItems : []);
    let magicItemCounts = existingEntry ? { ...existingEntry.magicItemCounts } : {};
    let selectedKnightlyVirtues = new Set(existingEntry ? existingEntry.knightlyVirtues : []);
    let selectedMagicBanner = existingEntry ? existingEntry.magicBanner : null;
    const unit = selectedUnit;
    const isEdit = !!existingEntry;
    const sizeValue = isEdit ? existingEntry.size : unit.min_size;
    const selectedOptionIds = new Set(isEdit ? existingEntry.options : []);
    const tempPoints = calcUnitPoints(unit, sizeValue, Array.from(selectedOptionIds), optionCounts, Array.from(selectedMagicItems), magicItemCounts, selectedMagicBanner, Array.from(selectedKnightlyVirtues));
    panel.innerHTML = "";
    document.getElementById("configUnitName").textContent = unit.name;
    let textContent = "";
    if (unit.min_size === 1 && unit.max_size === 1) {
      textContent = `${unit.cost_per_model} pt (modello singolo)`;
    } else {
      textContent = `${unit.cost_per_model} pt/mod., ${unit.min_size}-${unit.max_size} modelli`;
    }
    document.getElementById("configUnitMeta").textContent = textContent;
    const modifiedStats = computeModifiedStats(unit, selectedOptionIds);
    const specs = collectSpecModifiers(unit, selectedOptionIds);
    const statsWithStars = applySpecAsterisks(modifiedStats, specs);
    renderUnitStats(statsWithStars);
    renderUnitSpec(specs);
    const types = computeModifiedType(unit, selectedOptionIds);
    renderUnitType(types);
    const modifiedRules = computeModifiedRules(unit, selectedOptionIds);
    renderUnitSpecialRules(modifiedRules);
    renderUnitEquipment(unit, selectedOptionIds);
    renderUnitMount(unit, selectedOptionIds);
    renderUnitMagicItems(selectedMagicItems, magicItemCounts, magicItemsById);
    const rangedWeapons = collectRangedWeapons(unit, selectedOptionIds);
    renderUnitRanged(rangedWeapons);
    const rangedSpecs = collectRangedSpecs(rangedWeapons);
    renderUnitRangedSpec(rangedSpecs);
    const upgrades = collectUpgrades(unit, selectedOptionIds);
    renderUnitUpgrades(upgrades);
    renderUnitMagicBanners(selectedMagicBanner);
    let sizeInput = 1
    if (unit.min_size != 1 || unit.max_size != 1) {
      const sizeRow = document.createElement("div");
      sizeRow.className = "config-row";
      const sizeLabel = document.createElement("label");
      sizeLabel.textContent = "Numero di modelli";
      sizeLabel.style.marginTop = "8px";
      sizeInput = document.createElement("input");
      sizeInput.id = "unitSizeInput";
      sizeInput.type = "number";
      sizeInput.style.width = "32px";
      sizeInput.min = unit.min_size;
      sizeInput.max = unit.max_size;
      sizeInput.value = sizeValue;
      sizeInput.onchange = () => {
        checkValue(sizeInput);
        updatePointsPreview();
      };
      sizeMinus = document.createElement("button");
      sizeMinus.textContent = "–";
      sizeMinus.style.marginLeft = "2px";
      sizeMinus.style.marginRight = "2px";
      sizeMinus.onclick = () => {
        adjustValueDown('unitSizeInput');
        updatePointsPreview();
      }
      sizePlus = document.createElement("button");
      sizePlus.textContent = "+";
      sizePlus.style.marginLeft = "2px";
      sizePlus.style.marginRight = "2px";
      sizePlus.onclick = () => {
        adjustValueUp('unitSizeInput');
        updatePointsPreview();
      }
      sizeRow.appendChild(sizeLabel);
      sizeRow.appendChild(sizeInput);
      sizeRow.appendChild(sizeMinus);
      sizeRow.appendChild(sizePlus);
      panel.appendChild(sizeRow);
    }
    const optsRow = document.createElement("div");
    optsRow.className = "config-row";
    const optsLabel = document.createElement("label");
    optsLabel.style.marginTop = "8px";
    optsLabel.textContent = "Opzioni";
    optsRow.appendChild(optsLabel);
    const optsBox = document.createElement("div");
    optsBox.className = "options-list";

    // --- Riempi liste di opzioni mutualmente esclusive
    const categoryOptionIds = new Set();
    if (unit.option_categories) {
      for (const arr of Object.values(unit.option_categories)) {
        arr.forEach(id => categoryOptionIds.add(id));
      }
    }

    // --- RENDER CATEGORIE DI OPZIONI (dropdown) ---
    if (unit.option_categories) {
      for (const [catName, optionIds] of Object.entries(unit.option_categories)) {
        const wrapper = document.createElement("div");
        wrapper.className = "option-row";
        wrapper.id = "optionRow-"+catName;
        wrapper.style.display = "flex";
        wrapper.style.justifyContent = "space-between";
        wrapper.style.alignItems = "center";

        const left = document.createElement("span");
        const right = document.createElement("span");

        // Etichetta categoria
        const label = document.createElement("span");
        label.textContent = catName + ": ";
        left.appendChild(label);

        // Select
        const select = document.createElement("select");
        select.style.background = "#0d1117";
        select.style.color = "#e6edf3";
        select.style.border = "1px solid #30363d";
        select.style.borderRadius = "4px";
        select.style.padding = "2px 4px";
        select.style.marginLeft = "4px";

        const hasNone = optionIds.includes("nessuno");

        // Aggiorna lista menu in fase di inizializzazione e prima di ogni click sul menu
        populateOptionCategory(catName,optionIds,unit,select,hasNone);
        wrapper.onmousedown = () => {
          populateOptionCategory(catName,optionIds,unit,select,hasNone);
        }

        // Listener
        select.addEventListener("change", () => {
          // 1) rimuovi tutte le opzioni della categoria
          optionIds.forEach(id => {
            selectedOptionIds.delete(id);
            delete optionCounts[id];
          });

          // 2) aggiungi quella selezionata (se non è "nessuno")
          if (select.value) {
            selectedOptionIds.add(select.value);
          }

          // 3) rimuovi eventuali opzioni condizionali non più valide
          unit.options.forEach(o => {
            if (o.required_option && !selectedOptionIds.has(o.required_option)) {
              selectedOptionIds.delete(o.id);
              delete optionCounts[o.id];
            }
          });

          // 4) aggiorna visibilità delle opzioni condizionali
          refreshConditionalOptionsVisibility(unit, selectedOptionIds);

          // 5) punti + riepilogo
          updatePointsPreview();
          renderArmy();
        });

        left.appendChild(select);
        wrapper.appendChild(left);
        wrapper.appendChild(right);
        optsBox.appendChild(wrapper);
      }
    }

    // --- EQUIPAGGIAMENTO E CAVALCATURE BASE ---
    let defOpts = [];
    if (unit.equipment) defOpts.concat(unit.equipment);
    if (unit.mount) {
      if (unit.mount.name) defOpts.push(unit.mount.name);
      else defOpts.push(unit.mount);
    }
    for (const opt of defOpts) {
      const div = document.createElement("div");
      div.className = "option disabled-option";
      div.innerHTML = `
        <input type="checkbox" checked disabled>
        <span class="greyed">${opt}</span>
      `;
      optsBox.appendChild(div);
    }

    if (!unit.options || unit.options.length === 0) {
      const noOpt = document.createElement("div");
      noOpt.style.opacity = "0.7";
      noOpt.textContent = "Nessuna opzione disponibile.";
      optsBox.appendChild(noOpt);
    } else {
      for (const opt of unit.options) {
        if (categoryOptionIds.has(opt.id)) continue;

        const row = document.createElement("div");
        row.className = "option-row";
        row.id = "optionRow-"+opt.id;
        if (isOptionEnabled(opt,selectedOptionIds)) row.style.display = "flex";
        else row.style.display = "none";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";

        const left = document.createElement("span");
        const right = document.createElement("span");

        if (opt.max_count) {
          // Opzione con quantità
          const qty = document.createElement("input");
          qty.id = "qtyInput"
          qty.type = "number";
          qty.min = 0;
          qty.max = opt.max_count;
          qty.style.width = "32px";
          qty.style.marginLeft = "4px";
          qty.style.background = "#0d1117";
          qty.style.color = "#e6edf3";
          qty.style.border = "1px solid #30363d";
          qty.style.borderRadius = "4px";
          qty.style.padding = "2px 4px";
          qty.value = optionCounts[opt.id] ?? 0;
          qty.onchange = () => {
            checkValue(qty);
            if (qty.value > 0) selectedOptionIds.add(opt.id);
            else selectedOptionIds.delete(opt.id);
            optionCounts[opt.id] = qty.value;
            updatePointsPreview();
          };

          qtyMinus = document.createElement("button");
          qtyMinus.style.background= "#30363d";
          qtyMinus.textContent = "–";
          qtyMinus.style.marginLeft = "1px";
          qtyMinus.style.marginRight = "1px";
          qtyMinus.onclick = () => {
            adjustValueDown('qtyInput');
            if (qty.value > 0) selectedOptionIds.add(opt.id);
            else selectedOptionIds.delete(opt.id);
            optionCounts[opt.id] = qty.value;
            updatePointsPreview();
          }

          qtyPlus = document.createElement("button");
          qtyPlus.style.background= "#30363d";
          qtyPlus.textContent = "+";
          qtyPlus.style.marginLeft = "1px";
          qtyPlus.style.marginRight = "1px";
          qtyPlus.onclick = () => {
            adjustValueUp('qtyInput');
            if (qty.value > 0) selectedOptionIds.add(opt.id);
            else selectedOptionIds.delete(opt.id);
            optionCounts[opt.id] = qty.value;
            refreshConditionalOptionsVisibility(unit, selectedOptionIds);
            updatePointsPreview();
          }

          left.appendChild(qty);
          left.appendChild(qtyMinus);
          left.appendChild(qtyPlus);

        } else {
          // Opzione normale (checkbox)
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = selectedOptionIds.has(opt.id);

          cb.onchange = () => {
            if (cb.checked) selectedOptionIds.add(opt.id);
            else selectedOptionIds.delete(opt.id);
            if (opt.id === "stendardo" && magicBannerSection) {
              const can = unit.magic_banner_slot || selectedOptionIds.has("stendardo");
              magicBannerSection.style.display = can ? "block" : "none";
              if (!can) {
                selectedMagicBanner = null;
                magicBannerSection.querySelectorAll('input[type="radio"]').forEach(r => {
                  r.checked = false;
                });
              }
            }
            refreshConditionalOptionsVisibility(unit, selectedOptionIds);
            updatePointsPreview();
          };

          left.appendChild(cb);
        }

        // Nome dell’opzione
        const text = document.createTextNode(" " + opt.name);
        left.appendChild(text);

        // Costi
        let costText = "";
        if (opt.cost) costText += `+${opt.cost} pt`;
        if (opt.cost_per_model) {
          if (costText) costText += ", ";
          costText += `+${opt.cost_per_model} pt/mod.`;
        }
        right.appendChild(document.createTextNode(costText));

        row.appendChild(left);
        row.appendChild(right);
        optsBox.appendChild(row);
      }
    }

    // --- Rimuovi opzioni che non sono più valide ---
    unit.options.forEach(o => {
      if (o.required_option && !selectedOptionIds.has(o.required_option)) {
        selectedOptionIds.delete(o.id);
        delete optionCounts[o.id];
      }
    });

    optsRow.appendChild(optsBox);
    panel.appendChild(optsRow);

    // Sezione Stendaro Magico
    magicBannerSection = document.createElement("div");

    const bannerBox = document.createElement("div");
    bannerBox.style.marginTop = "8px";
    bannerBox.style.border = "1px solid #30363d";
    bannerBox.style.borderRadius = "6px";
    bannerBox.style.overflow = "hidden";

    // Header cliccabile
    const header = document.createElement("div");
    header.textContent = "Stendardo Magico";
    header.style.padding = "6px 8px";
    header.style.cursor = "pointer";
    header.style.background = "#161b22";
    header.style.fontWeight = "bold";
    header.style.fontSize = "12px";

    // Contenuto nascosto
    const content = document.createElement("div");
    content.style.display = "none";
    content.style.padding = "6px 8px";
    content.style.fontSize = "12px";

    header.onclick = () => {
      content.style.display = content.style.display === "none" ? "block" : "none";
    };

    // Aggiungi gli stendardi
    // Opzione "nessuno"
    const noneRow = document.createElement("div");
    noneRow.className = "option-row";
    noneRow.style.display = "flex";
    noneRow.style.justifyContent = "space-between";
    noneRow.style.alignItems = "center";
    noneRow.style.margin = "2px 0";

    const noneLeft = document.createElement("span");
    const noneRight = document.createElement("span");

    const noneRb = document.createElement("input");
    noneRb.type = "radio";
    noneRb.name = "magic_banner_choice";
    noneRb.value = "";
    noneRb.checked = !selectedMagicBanner;

    noneRb.onchange = () => {
      if (noneRb.checked) {
        selectedMagicBanner = null;
        updatePointsPreview();
      }
    };

    noneLeft.appendChild(noneRb);
    const noneText = document.createTextNode(" Nessuno");
    noneLeft.appendChild(noneText);
    noneRight.appendChild(document.createTextNode("0 pt"));

    noneRow.appendChild(noneLeft);
    noneRow.appendChild(noneRight);
    content.appendChild(noneRow);

    // Stendardi Magici
    RenderMagicBanners();

    // Oggetti Magici
    if ((unit.magic_item_slots && unit.magic_item_slots > 0) || unit.magic_items?.length > 0) {
      RenderMagicItems(unit,magicByCategory);
    }

    // Virtù Cavalleresche
    if ((unit.knightly_virtue_slots && unit.knightly_virtue_slots > 0) || unit.knightly_virtues?.length > 0) {
      RenderKnightlyVirtues();
    }

    // Costo in punti complessivo
    {
      let textContent = `${tempPoints} pt`;
      document.getElementById("configPoints").textContent = textContent;
    }

    const btnRow = document.getElementById("configButtons");

    const mainBtn = document.createElement("button");
    mainBtn.textContent = isEdit ? "Aggiorna" : "Aggiungi";
    mainBtn.id = "mainBtn";
    mainBtn.onclick = () => {
      const size = parseInt(sizeInput.value, 10) || unit.min_size;
      const opts = Array.from(selectedOptionIds);
      const pts = calcUnitPoints(unit, size, opts, optionCounts, Array.from(selectedMagicItems), magicItemCounts, selectedMagicBanner, Array.from(selectedKnightlyVirtues));

      let preselectedOptions = [];
      if (unit.mount) {
        if (unit.mount.name) preselectedOptions.push( unit.mount.name );
        else preselectedOptions.push( unit.mount );
      }
      if (unit.equipment) preselectedOptions.concat( unit.equipment );

      if (isEdit) {
        existingEntry.size = size;
        existingEntry.options = opts;
        existingEntry.optionCounts = optionCounts;
        existingEntry.points = pts;
        existingEntry.magicItems = Array.from(selectedMagicItems);
        existingEntry.magicItemCounts = magicItemCounts;
        existingEntry.knightlyVirtues = Array.from(selectedKnightlyVirtues);
        existingEntry.magicBanner = selectedMagicBanner;
        existingEntry.preselectedOptions = preselectedOptions;
        existingEntry.preselectedMagicItems = [...(unit.magic_items || [])];
        existingEntry.preselectedKnightlyVirtues = [...(unit.knightly_virtues || [])];
        clearConfigPanel();
        // in mobile-mode, torna a lista esercito
        if (window.innerWidth < 768) {
          moveToTab("army");
        }
      } else {
        army.entries.push({
          id: nextEntryId++,
          unitId: unit.id,
          name: unit.name,
          category: unit.category,
          size: size,
          options: opts,
          optionCounts: optionCounts,
          magicItems: Array.from(selectedMagicItems),
          magicItemCounts: magicItemCounts,
          knightlyVirtues: Array.from(selectedKnightlyVirtues),
          magicBanner: selectedMagicBanner,
          preselectedOptions: preselectedOptions,
          preselectedMagicItems: [...(unit.magic_items || [])],
          preselectedKnightlyVirtues: [...(unit.knightly_virtues || [])],
          points: pts
        });
        clearConfigPanel();
        // in mobile-mode, torna a lista unità
        if (window.innerWidth < 768) {
          moveToTab("units");
        }
      }
      renderArmy();
    };
    btnRow.appendChild(mainBtn);

    if (isEdit) {
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Annulla";
      cancelBtn.className = "secondary";
      cancelBtn.style.marginLeft = "4px";
      cancelBtn.onclick = () => {
        selectedUnit = null;
        clearConfigPanel();
        renderConfigPanel();
      };
      btnRow.appendChild(cancelBtn);
    }

    // -------------------------------------------- //
    // --- FUNZIONI INTERNE A renderConfigPanel --- //
    // -------------------------------------------- //
    function updatePointsPreview() {
      // Update all unit stats and extras
      const modifiedStats = computeModifiedStats(unit, selectedOptionIds);
      const specs = collectSpecModifiers(unit, selectedOptionIds);
      const statsWithStars = applySpecAsterisks(modifiedStats, specs);
      renderUnitStats(statsWithStars);
      renderUnitSpec(specs);
      const types = computeModifiedType(unit, selectedOptionIds);
      renderUnitType(types);
      const modifiedRules = computeModifiedRules(unit, selectedOptionIds);
      renderUnitSpecialRules(modifiedRules);
      renderUnitEquipment(unit, selectedOptionIds);
      renderUnitMount(unit, selectedOptionIds);
      renderUnitMagicItems(selectedMagicItems, magicItemCounts, magicItemsById);
      const upgrades = collectUpgrades(unit, selectedOptionIds);
      const rangedWeapons = collectRangedWeapons(unit, selectedOptionIds);
      renderUnitRanged(rangedWeapons);
      const rangedSpecs = collectRangedSpecs(rangedWeapons);
      renderUnitRangedSpec(rangedSpecs);
      renderUnitUpgrades(upgrades);
      renderUnitMagicBanners(selectedMagicBanner);
      // Update actual points
      const size = parseInt(sizeInput.value, 10) || unit.min_size;
      const pts = calcUnitPoints(unit, size, Array.from(selectedOptionIds), optionCounts, Array.from(selectedMagicItems), magicItemCounts, selectedMagicBanner, Array.from(selectedKnightlyVirtues));
      configPoints = document.getElementById("configPoints");
      configPoints.textContent = `${pts} pt`;
    }

    function refreshConditionalOptionsVisibility(unit, selectedOptionIds) {
      const rows = document.querySelectorAll(`[id*="optionRow-"]`);
      const rowList = Array.prototype.slice.call(rows);
      rowList.forEach(row => {
        const optId = row.id ? row.id : "NONE";
        if (optId === "NONE") return;
        // retrieve option object
        const opt = unit.options.find(o => o.id === optId.replace("optionRow-",""));
        if (!opt) return;
        if (isOptionEnabled(opt, selectedOptionIds)) {
          row.style.display = "flex";
        }
        else {
          row.style.display = "none";
        }
      });
    }

    function populateOptionCategory(catName,optionIds,unit,select,hasNone){
      // Ripulisci il menu
      while (select.lastElementChild) {
        select.removeChild(select.lastElementChild);
      }

      // Opzione "nessuno" (solo se presente nella categoria)
      if (hasNone) {
        const noneOpt = document.createElement("option");
        noneOpt.value = "";
        noneOpt.textContent = "Nessuno";
        select.appendChild(noneOpt);
      }

      // Opzioni della categoria
      optionIds.forEach(id => {
        const opt = unit.options.find(o => o.id === id);
        if (!opt) return;
        if (!isOptionEnabled(opt,selectedOptionIds)) return;

        const o = document.createElement("option");
        o.value = id;

        let label = opt.name;
        if (opt.cost) label += ` (+${opt.cost} pt)`;
        if (opt.cost_per_model) label += ` (+${opt.cost_per_model} pt/mod.)`;

        o.textContent = label;
        select.appendChild(o);
      });

      // Valore attuale (se una delle opzioni è selezionata)
      let current = [...selectedOptionIds].find(id => optionIds.includes(id)) || "";
      if (!hasNone && current === "") {
        current = optionIds[0]; // prima opzione della categoria
        selectedOptionIds.add(current);
      }
      select.value = current;
    }

    function RenderMagicBanners() {
      // Loop sugli stendardi disponibili
      for (const banner of MAGIC_BANNERS) {
        if (!isItemAllowedForUnit(banner, unit, currentFaction)) {
          continue;
        }

        const row = document.createElement("div");
        row.className = "option-row";
        row.id = "optionRow-"+banner.id;
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.margin = "2px 0";

        const left = document.createElement("span");
        const right = document.createElement("span");

        const rb = document.createElement("input");
        rb.type = "radio";
        rb.name = "magic_banner_choice";
        rb.value = banner.id;
        rb.checked = selectedMagicBanner === banner.id;

        rb.onchange = () => {
          if (rb.checked) {
            if (!banner.allow_multiple && isMagicBannerTaken(banner.id, existingEntry?.id)) {
              showInfoToast("Questo stendardo magico è già stato selezionato da un'altra unità");
              rb.checked = false;
              selectedMagicBanner = null;
              noneRb.checked = true;
              updatePointsPreview();
              return;
            }
            selectedMagicBanner = banner.id;
            updatePointsPreview();
          }
        };
        left.appendChild(rb);

        const labelSpan = document.createElement("span");
        labelSpan.textContent = " " + banner.name;
        // Tooltip solo se esiste la description
        if (banner.description) {
          labelSpan.addEventListener("mousemove", (e) => {
            showMagicTooltip(banner.description, e.clientX, e.clientY);
          });
          labelSpan.addEventListener("mouseleave", hideMagicTooltip);
        }
        left.appendChild(labelSpan);

        let costText = `${banner.cost} pt`;
        right.appendChild(document.createTextNode(costText));

        row.appendChild(left);
        row.appendChild(right);
        content.appendChild(row);
      }

      bannerBox.appendChild(header);
      bannerBox.appendChild(content);
      magicBannerSection.appendChild(bannerBox);
      panel.appendChild(magicBannerSection);

      // A meno di stendardo selezionato, nascondi la sezione
      if (!unit.magic_banner_slot && !selectedOptionIds.has("stendardo")) {
        magicBannerSection.style.display = "none";
      }
    }

    function RenderMagicItems(unit,magicByCategory) {
      const title = document.createElement("div");
      title.style.marginTop = "10px";
      title.style.fontSize = "12px";
      title.textContent = "Oggetti Magici";
      title.textContent += ` (fino a ${unit.magic_item_slots})`;
      panel.appendChild(title);

      // Crea un blocco collassabile per ogni categoria
      for (const [category, items] of Object.entries(magicByCategory)) {

        // salta le virtù Cavalleresche
        if (category === "Virtù Cavalleresche") continue;

        const catBox = document.createElement("div");
        catBox.style.marginTop = "8px";
        catBox.style.border = "1px solid #30363d";
        catBox.style.borderRadius = "6px";
        catBox.style.overflow = "hidden";

        // Header cliccabile
        const header = document.createElement("div");
        header.textContent = category;
        header.style.padding = "6px 8px";
        header.style.cursor = "pointer";
        header.style.background = "#161b22";
        header.style.fontWeight = "bold";
        header.style.fontSize = "12px";

        // Contenuto nascosto
        const content = document.createElement("div");
        content.style.display = "none";
        content.style.padding = "6px 8px";
        content.style.fontSize = "12px";

        header.onclick = () => {
          content.style.display = content.style.display === "none" ? "block" : "none";
        };

        // Aggiungi gli oggetti della categoria
        let n_items = 0;
        for (const item of items) {
          if (!isItemAllowedForUnit(item, unit, currentFaction)) {
            continue;
          }

          const row = document.createElement("div");
          row.className = "option-row";
          row.id = "optionRow-"+item.id;
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.margin = "2px 0";

          const left = document.createElement("span");
          const right = document.createElement("span");

          const div = document.createElement("div");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          const labelSpan = document.createElement("span");
          labelSpan.textContent = " " + renderName(item.name);
          if (item.description) {
            labelSpan.addEventListener("mousemove", (e) => {
              showMagicTooltip(item.description, e.clientX, e.clientY);
            });
            labelSpan.addEventListener("mouseleave", hideMagicTooltip);
          }

          // oggetto tra quelli pre-selezionati...
          if (unit.magic_items && unit.magic_items.includes(item.id)) {
            div.className = "option disabled-option";
            cb.checked = true;
            cb.disabled = true;
            div.appendChild(cb);
            labelSpan.class = "greyed";
            div.appendChild(labelSpan);
            left.appendChild(div);
          } else { // ... o selezionabile
            if (item.allow_multiple_per_model) {
              // --- Oggetto con quantità per modello ---
              const qty = document.createElement("input");
              qty.type = "number";
              qty.min = 0;
              qty.max = 9; // o quello che vuoi
              qty.style.width = "25px";
              qty.style.background = "#0d1117";
              qty.style.color = "#e6edf3";
              qty.style.border = "1px solid #30363d";
              qty.style.borderRadius = "4px";
              qty.style.padding = "2px 4px";
              // valore attuale
              qty.value = magicItemCounts[item.id] ?? 0;
              qty.onchange = () => {
                let v = parseInt(qty.value);
                if (isNaN(v) || v < 0) v = 0;
                qty.value = v;
                if (v === 0) {
                  delete magicItemCounts[item.id];
                  selectedMagicItems.delete(item.id);
                } else {
                  magicItemCounts[item.id] = v;
                  selectedMagicItems.add(item.id);
                  // check sul massimo di oggetti magici
                  if (countMagicItems(selectedMagicItems,magicItemCounts) > unit.magic_item_slots) {
                    showInfoToast("Hai già raggiunto il numero massimo di oggetti magici","alert",3000);
                    v = v-1;
                    qty.value = v;
                    if (v === 0) {
                      delete magicItemCounts[item.id];
                      selectedMagicItems.delete(item.id);
                    }
                    else {
                      magicItemCounts[item.id] = v;
                    }
                    return;
                  }
                }
                updatePointsPreview();
              };
              left.appendChild(qty);
            } else {
              cb.checked = selectedMagicItems.has(item.id);
              cb.onchange = () => {
                if (cb.checked) {
                  if (countMagicItems(selectedMagicItems,magicItemCounts) < unit.magic_item_slots) {
                    // Controllo unicità
                    if (!item.allow_multiple && isMagicItemTaken(item.id, existingEntry?.id)) {
                      showInfoToast("Questo oggetto magico è già stato selezionato da un'altra unità","alert",3000);
                      cb.checked = false;
                      return;
                    }
                    if (!selectedMagicItems.has(item.id)) selectedMagicItems.add(item.id);
                  } else {
                    cb.checked = false;
                    showInfoToast("Hai già raggiunto il numero massimo di oggetti magici","alert",3000);
                  }
                } else {
                  if (selectedMagicItems.has(item.id)) selectedMagicItems.delete(item.id);
                }
                updatePointsPreview();
              };
              left.appendChild(cb);
            }
            left.appendChild(labelSpan);
          }

          // Costi
          let costText = `${item.cost} pt`;
          right.appendChild(document.createTextNode(costText));

          n_items += 1;

          row.appendChild(left);
          row.appendChild(right);
          content.appendChild(row);
        }

        if (n_items === 0) {
          header.style.display = "none"
          catBox.style.display = "none"
        }

        catBox.appendChild(header);
        catBox.appendChild(content);
        panel.appendChild(catBox);
      }
    }

    function countMagicItems(selectedMagicItems,magicItemCounts) {
      let n = 0;
      for (const id of selectedMagicItems) {
        const item = MAGIC_ITEMS.find(m => m.id === id);
        if (item) {
          const count = magicItemCounts[item.id] ?? 1;
          n += count;
        }
      }
      return n;
    }

    function RenderKnightlyVirtues() {
      const title = document.createElement("div");
      title.style.marginTop = "10px";
      title.style.fontSize = "12px";
      title.textContent = "Virtù";
      title.textContent += ` (fino a ${unit.knightly_virtue_slots})`;
      panel.appendChild(title);

      const category = "Virtù Cavalleresche";
      const virtues = magicByCategory[category];

      const catBox = document.createElement("div");
      catBox.style.marginTop = "8px";
      catBox.style.border = "1px solid #30363d";
      catBox.style.borderRadius = "6px";
      catBox.style.overflow = "hidden";

      // Header cliccabile
      const header = document.createElement("div");
      header.textContent = category;
      header.style.padding = "6px 8px";
      header.style.cursor = "pointer";
      header.style.background = "#161b22";
      header.style.fontWeight = "bold";
      header.style.fontSize = "12px";

      // Contenuto nascosto
      const content = document.createElement("div");
      content.style.display = "none";
      content.style.padding = "6px 8px";
      content.style.fontSize = "12px";

      header.onclick = () => {
        content.style.display = content.style.display === "none" ? "block" : "none";
      };

      // Aggiungi le virtù
      let n_items = 0;
      for (const virtue of virtues) {
        if (!isItemAllowedForUnit(virtue, unit, currentFaction)) {
          continue; // non mostrare l'oggetto
        }

        const row = document.createElement("div");
        row.className = "option-row";
        row.id = "optionRow-"+virtue.id;
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.margin = "2px 0";

        const left = document.createElement("span");
        const right = document.createElement("span");

        const div = document.createElement("div");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        const labelSpan = document.createElement("span");
        labelSpan.textContent = " " + virtue.name;
        if (virtue.description) {
          labelSpan.addEventListener("mousemove", (e) => {
            showMagicTooltip(virtue.description, e.clientX, e.clientY);
          });
          labelSpan.addEventListener("mouseleave", hideMagicTooltip);
        }

        // virtù pre-selezionate?
        if (unit.knightly_virtues && unit.knightly_virtues.includes(virtue.name)) {
          div.className = "option disabled-option";
          cb.checked = true;
          cb.disabled = true;
          div.appendChild(cb);
          labelSpan.class = "greyed";
          div.appendChild(labelSpan);
          left.appendChild(div);
        } else { // ... o selezionabile
          // const cb = document.createElement("input");
          cb.checked = selectedKnightlyVirtues.has(virtue.id);
          cb.onchange = () => {
            if (cb.checked) {
              if (selectedKnightlyVirtues.size < unit.knightly_virtue_slots) {
                if (!selectedKnightlyVirtues.has(virtue.id)) selectedKnightlyVirtues.add(virtue.id);
              } else {
                cb.checked = false;
                showInfoToast("Hai già raggiunto il numero massimo di Virtù Cavalleresche","alert",3000);
              }
            } else {
              if (selectedKnightlyVirtues.has(virtue.id)) selectedKnightlyVirtues.delete(virtue.id);
            }
            updatePointsPreview();
          };
          left.appendChild(cb);
          left.appendChild(labelSpan);
        }

        // Costi
        let costText = `${virtue.cost} pt`;
        right.appendChild(document.createTextNode(costText));

        n_items += 1;

        row.appendChild(left);
        row.appendChild(right);
        content.appendChild(row);
      }

      if (n_items === 0) {
        header.style.display = "none"
        catBox.style.display = "none"
      }

      catBox.appendChild(header);
      catBox.appendChild(content);
      panel.appendChild(catBox);
    }
  }

  function clearConfigPanel() {
    const panel = document.getElementById("configPanel");
    panel.innerHTML = "";
    const configUnitName = document.getElementById("configUnitName");
    configUnitName.innerHTML = "";
    const configPoints = document.getElementById("configPoints");
    configPoints.innerHTML = "";
    const configUnitMeta = document.getElementById("configUnitMeta");
    configUnitMeta.innerHTML = "";
    const configButtons = document.getElementById("configButtons");
    configButtons.innerHTML = "";
    const unitStatsBox = document.getElementById("unitStatsBox");
    unitStatsBox.innerHTML = "";
    const unitSpecBox = document.getElementById("unitSpecBox");
    unitSpecBox.innerHTML = "";
    const unitTypeBox = document.getElementById("unitTypeBox");
    unitTypeBox.innerHTML = "";
    const unitSpecialRulesBox = document.getElementById("unitSpecialRulesBox");
    unitSpecialRulesBox.innerHTML = "";
    const unitEquipmentBox = document.getElementById("unitEquipmentBox");
    unitEquipmentBox.innerHTML = "";
    const unitMountBox = document.getElementById("unitMountBox");
    unitMountBox.innerHTML = "";
    const unitMagicItemsBox = document.getElementById("unitMagicItemsBox");
    unitMagicItemsBox.innerHTML = "";
    document.getElementById("unitRangedBox").innerHTML = "";
    document.getElementById("unitRangedSpecBox").innerHTML = "";
    const unitUpgradeBox = document.getElementById("unitUpgradeBox");
    unitUpgradeBox.innerHTML = "";
    const unitMagicBannersBox = document.getElementById("unitMagicBannersBox");
    unitMagicBannersBox.innerHTML = "";
    const msg = document.createElement("div");
    msg.style.opacity = "0.7";
    msg.style.fontStyle = "italic";
    msg.textContent = "Seleziona un'unità per configurarla.";
    panel.appendChild(msg);
  }

  function renderArmy() {
    const { stats, errors, hasPersonaggio } = validateArmy();

    const top = document.getElementById("armySummaryTop");
    top.innerHTML = "";

    const totalRow = document.createElement("div");
    totalRow.className = "summary-row";
    totalRow.innerHTML = `<strong>Punti totali</strong><span>${stats.total} / ${army.maxPoints}</span>`;
    top.appendChild(totalRow);

    for (const cat of categories) {
      const row = document.createElement("div");
      row.className = "summary-row";
      const pct = stats.pct[cat] || 0;
      row.innerHTML = `<span>${cat}</span><span>${pct.toFixed(1)}%</span>`;
      top.appendChild(row);
    }

    const list = document.getElementById("armyUnits");
    list.innerHTML = "";

    for (const cat of categories) {
      const entries = army.entries.filter(e => e.category === cat);
      if (entries.length === 0) continue;

      // Titolo categoria
      const title = document.createElement("div");
      title.textContent = cat;
      title.style.fontSize = "12px";
      title.style.marginTop = "6px";
      title.style.marginBottom = "4px";
      title.style.textTransform = "uppercase";
      title.style.opacity = "0.7";
      list.appendChild(title);

      // Unità della categoria
      for (const e of entries) {
        const div = document.createElement("div");
        div.className = "army-unit";

        const header = document.createElement("div");
        header.className = "army-unit-header";

        // Clic sul nome = modifica
        const left = document.createElement("div");
        left.innerHTML = `<strong class="editable-unit">${e.name}</strong> ${renderModelCount(e)}`;
        left.querySelector(".editable-unit").style.cursor = "pointer";
        left.querySelector(".editable-unit").onclick = () => {
          selectedUnit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          if (window.innerWidth < 768) {
            moveToTab("config");
          }
          clearConfigPanel();
          renderConfigPanel(e);
        };

        // Punti + icona rimozione
        const right = document.createElement("div");
        right.innerHTML = `
        <span>${e.points} pt</span>
        <span class="remove-unit" style="margin-left:8px; cursor:pointer; color:#f85149; font-weight:bold;">✖</span>
        `;
        right.querySelector(".remove-unit").onclick = () => {
          army.entries = army.entries.filter(x => x.id !== e.id);
          counts[e.unitId] -= 1;
          clearConfigPanel();
          renderArmy();
        };

        header.appendChild(left);
        header.appendChild(right);
        div.appendChild(header);

        // Opzioni
        if ((e.options && e.options.length > 0) || (e.preselectedOptions && e.preselectedOptions.length > 0)) {
          const optsLine = document.createElement("div");
          optsLine.style.fontSize = "11px";
          optsLine.style.opacity = "0.8";
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          const parts = [];
          for (const eq of e.preselectedOptions) {
            parts.push(eq);
          }
          for (const optId of e.options) {
            const opt = unit.options.find(o => o.id === optId);
            if (!opt) continue;
            const count = e.optionCounts?.[optId] || 1;
            if (opt.max_count) {
              parts.push(`${opt.name} ×${count}`);
            } else {
              parts.push(opt.name);
            }
          }
          optsLine.textContent = parts.join(", ");
          div.appendChild(optsLine);
        }

        // Virtù Cavalleresche
        if (e.knightlyVirtues?.length > 0 || e.preselectedKnightlyVirtues?.length > 0) {
          const line = document.createElement("div");
          line.style.fontSize = "11px";
          line.style.opacity = "0.8";
          const fullList = [];
          for (const virtueId of e.preselectedKnightlyVirtues) {
            const virtue = MAGIC_ITEMS.find(o => o.id === virtueId);
            if (!virtue) continue;
            fullList.push(renderName(virtue.name));
          }
          for (const virtueId of e.knightlyVirtues) {
            const virtue = MAGIC_ITEMS.find(o => o.id === virtueId);
            if (!virtue) continue;
            fullList.push(renderName(virtue.name));
          }
          line.textContent = fullList.join(", ");
          div.appendChild(line);
        }

        // Oggetti Magici
        if (e.magicItems?.length > 0 || e.preselectedMagicItems?.length > 0) {
          const line = document.createElement("div");
          line.style.fontSize = "11px";
          line.style.opacity = "0.8";
          const fullList = [];
          for (const itemId of e.preselectedMagicItems) {
            const item = MAGIC_ITEMS.find(o => o.id === itemId);
            if (!item) continue;
            fullList.push(renderName(item.name));
          }
          for (const itemId of e.magicItems) {
            const item = MAGIC_ITEMS.find(o => o.id === itemId);
            if (!item) continue;
            const count = e.magicItemCounts?.[item.id] || 1;
            if (item.allow_multiple_per_model) {
              fullList.push(`${renderName(item.name)} ×${count}`);
            } else {
              fullList.push(renderName(item.name));
            }
          }
          line.textContent = fullList.join(", ");
          div.appendChild(line);
        }

        // Stendardo Magico
        if (e.magicBanner) {
          const banner = MAGIC_BANNERS.find(b => b.id === e.magicBanner);
          if (banner) {
            const line = document.createElement("div");
            line.style.fontSize = "11px";
            line.style.opacity = "0.8";
            line.textContent = banner.name;
            div.appendChild(line);
          }
        }

        list.appendChild(div);
      }
    }

    const val = document.getElementById("validationPanel");
    val.innerHTML = "";

    const pills = document.createElement("div");
    const truppeOk = stats.pct["Truppe"] >= ARMY_RULES.min_truppe_pct;
    const personaggiOk = stats.pct["Personaggi"] <= ARMY_RULES.max_personaggi_pct;
    const macchineOk = stats.pct["Macchine e Mostri"] <= ARMY_RULES.max_macchine_pct;
    const pointsOk = stats.total <= army.maxPoints;

    function pill(text, ok) {
      const span = document.createElement("span");
      span.className = "pill " + (ok ? "pill-ok" : "pill-err");
      span.textContent = text;
      return span;
    }

    pills.appendChild(pill("Truppe min", truppeOk));
    pills.appendChild(pill("Personaggi max", personaggiOk));
    pills.appendChild(pill("Macchine/Mostri max", macchineOk));
    pills.appendChild(pill("Punti", pointsOk));
    pills.appendChild(pill("Personaggio obbligatorio", hasPersonaggio));
    val.appendChild(pills);

    const msg = document.createElement("div");
    msg.className = "validation";
    if (errors.length === 0) {
      msg.innerHTML = `<div class="validation-ok">✔ Lista valida secondo le regole base.</div>`;
    } else {
      msg.innerHTML = `<div class="validation-error">✘ Problemi nella lista:</div>`;
      const ul = document.createElement("ul");
      ul.style.marginTop = "2px";
      ul.style.paddingLeft = "18px";
      for (const err of errors) {
        const li = document.createElement("li");
        li.textContent = err;
        ul.appendChild(li);
      }
      msg.appendChild(ul);
    }
    val.appendChild(msg);
  }

  // --- EVENTI GLOBALI -------------------------------------------------------

  document.getElementById("factionSelect").addEventListener("change", (e) => {
    currentFaction = e.target.value;
    army.entries = [];
    selectedUnit = null;
    renderUnitList();
    renderConfigPanel();
    renderArmy();
  });

  // document.getElementById("maxPointsInput").addEventListener("input", (e) => {
  document.getElementById("maxPointsInput").addEventListener("change", (e) => {
    const val = parseInt(e.target.value, 10) || 500;
    army.maxPoints = val;
    renderArmy();
  });

  document.getElementById("maxPointsDownBtn").onclick = () => {
    adjustValueDown('maxPointsInput');
    army.maxPoints = parseInt(document.getElementById("maxPointsInput").value);
    renderArmy();
  }

  document.getElementById("maxPointsUpBtn").onclick = () => {
    adjustValueUp('maxPointsInput');
    army.maxPoints = parseInt(document.getElementById("maxPointsInput").value);
    renderArmy();
  }

  // --- ESPORTAZIONE -----------------------------------------------------------

  // Funzione generica per scaricare file
  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  // --- IMPORTAZIONE -----------------------------------------------------------

  // Ricostruisce l'esercito dalla struttura JSON esportata
  function importArmyJson(data) {
    // Validazione minima
    if (!data.units || !Array.isArray(data.units)) {
      showInfoToast("JSON non valido: manca la lista delle unità","alert",3000);
      return;
    }

    // Titolo
    if (data.title) {
      document.getElementById("listTitleInput").value = data.title;
    }

    // Fazione
    if (data.faction && UNITS_BY_FACTION[data.faction]) {
      currentFaction = data.faction;
      document.getElementById("factionSelect").value = data.faction;
    } else {
      showInfoToast("Attenzione: la fazione nel JSON non è riconosciuta.","alert",3000);
    }

    // Punti massimi
    if (data.max_points) {
      army.maxPoints = data.max_points;
      document.getElementById("maxPointsInput").value = data.max_points;
    }

    // Ricostruisci unità
    army.entries = [];

    for (const u of data.units) {
      army.entries.push({
        id: nextEntryId++,
        unitId: u.unitId,
        name: u.name,
        category: u.category,
        size: u.size,
        options: u.options || [],
        optionCounts: u.optionCounts || {},
        magicItems: u.magicItems || [],
        magicItemCounts: u.magicItemCounts || {},
        knightlyVirtues: u.knightlyVirtues || [],
        magicBanner: u.magicBanner || null,
        preselectedOptions: [...(u.preselectedOptions || [])],
        preselectedMagicItems: [...(u.preselectedMagicItems || [])],
        preselectedKnightlyVirtues: [...(u.preselectedKnightlyVirtues || [])],
        points: u.points
      });
    }

    // Aggiorna UI
    renderUnitList();
    renderConfigPanel();
    renderArmy();

    showInfoToast("Lista importata correttamente");
  }

  // --- SALVATAGGI ONLINE ---
  function saveArmyToLocal(name) {
    const data = exportArmyJson();
    localStorage.setItem(name, data);
  }

  function loadArmyFromLocal(name) {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function deleteArmyFromLocal(name) {
    localStorage.removeItem(name);
  }

  function listSavedArmies(autoSave=false) {
    const prefix = "army_"+ (autoSave ? "autosave_" : "save_");
    return Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .map(k => k.replace(prefix, ""));
  }

  function refreshSavedListUI(autoSave=false) {
    const container = document.getElementById(autoSave ? "autoSavedListContainer" : "savedListContainer");
    container.innerHTML = "";

    const names = listSavedArmies(autoSave);
    if (names.length === 0) {
      container.innerHTML = "<p style='opacity:0.7;'>Nessuna lista salvata.</p>";
      return;
    }

    names.forEach(name => {
      const div = document.createElement("div");
      div.className = "saved-item";

      div.innerHTML = `
      <div style="width:60%">
      <span style="font-size:12px">${name}</span>
      </div>
      <button class="primary" style="font-size:12px;width:20%" data-load="${name}">Carica</button>
      <button class="danger" style="font-size:12px;width:20%" data-del="${name}">Elimina</button>
      `;

      container.appendChild(div);
    });

    // Listener Carica
    container.querySelectorAll("[data-load]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.load;
        const data = loadArmyFromLocal("army_"+(autoSave ? "autosave_" : "save_")+name);
        if (data) {
          importArmyJson(data);
          moveToTab("army");
          clearConfigPanel();
          selectedUnit = null;
          renderConfigPanel();
        }
        else {
          console.error("Impossibile caricare i dati...");
        }
        closeModal();
      });
    });

    // Listener Elimina
    container.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.del;
        deleteArmyFromLocal("army_"+(autoSave ? "autosave_" : "save_")+name);
        refreshSavedListUI(autoSave);
      });
    });
  }

  function openModal(title, contentHtml) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalContent").innerHTML = contentHtml;
    document.getElementById("modalOverlay").style.display = "flex";
    // document.getElementById("modalOverlay").hidden = false;
  }

  function closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
    // document.getElementById("modalOverlay").hidden = true;
  }

  document.getElementById("newListBtn").addEventListener("click", () => {
    populateFactionSelect();
    document.getElementById("listTitleInput").value = "";
    renderUnitList();
    renderConfigPanel();
    clearConfigPanel();
    army.entries = [];
    renderArmy();
  });

  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  document.getElementById("openLoadModalBtn").addEventListener("click", () => {
    openModal("Carica lista", `
    <button id="loadFromBrowserBtn" class="primary">Carica da salvataggi</button>
    <button id="loadFromAutosaveBtn" class="primary">Carica da autosave</button>
    <button id="loadFromFileBtn" class="primary">Carica da file JSON</button>
    `);

    document.getElementById("loadFromBrowserBtn").addEventListener("click", () => {
      closeModal();
      openModal("Liste disponibili", `
        <div id="savedListContainer"></div>
      `);
      refreshSavedListUI();
    });

    document.getElementById("loadFromAutosaveBtn").addEventListener("click", () => {
      closeModal();
      openModal("Auto-save disponibili", `
      <div id="autoSavedListContainer"></div>
      `);
      refreshSavedListUI(true);
    });

    document.getElementById("loadFromFileBtn").addEventListener("click", () => {
      var input = document.createElement("input");
      input.type = "file";
      input.onchange = event => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            importArmyJson(data);
          } catch (err) {
            showInfoToast("Errore: il file non è un JSON valido","alert",3000);
            console.error(err);
          }
        };
        reader.readAsText(file);
      }
      input.click();
      closeModal();
    });
  });

  document.getElementById("openSaveModalBtn").addEventListener("click", () => {
    openModal("Salva lista", `
    <button id="saveToBrowserBtn" class="primary">Salva nel browser</button>
    <button id="exportTxtBtn" class="primary">Esporta TXT</button>
    <button id="exportMarkDownBtn" class="primary">Esporta MarkDown</button>
    <button id="exportJsonBtn" class="primary">Esporta JSON</button>
    <button id="exportPdfBtn" class="primary">Esporta PDF</button>
    `);

    document.getElementById("saveToBrowserBtn").addEventListener("click", () => {
      saveName = "army_save_"+document.getElementById("listTitleInput").value
      saveArmyToLocal(saveName);
      closeModal();
    });

    document.getElementById("exportTxtBtn").addEventListener("click", () => {
      const text = exportArmyText();
      const title = document.getElementById("listTitleInput").value || "Lista senza titolo";
      downloadFile(text, `BattleHammer - ${armyName(currentFaction)} - ${title}.txt`, "text/plain");
      closeModal();
    });

    document.getElementById("exportMarkDownBtn").addEventListener("click", () => {
      const text = exportArmyTextMarkdown();
      const title = document.getElementById("listTitleInput").value || "Lista senza titolo";
      downloadFile(text, `BattleHammer - ${armyName(currentFaction)} - ${title}.md`, "text/markdown");
      closeModal();
    });

    document.getElementById("exportJsonBtn").addEventListener("click", () => {
      const json = exportArmyJson();
      const title = document.getElementById("listTitleInput").value || "Lista senza titolo";
      downloadFile(json, `BattleHammer - ${armyName(currentFaction)} - ${title}.json`, "application/json");
      closeModal();
    });

    document.getElementById("exportPdfBtn").addEventListener("click", () => {
      // document.getElementById("exportPdfBtn").click();
      const pdfData = buildArmyDataForPdf();
      exportArmyPDF(pdfData);
      closeModal();
    });
  });

  function autoSaveArmy() {
    try {
      const data = exportArmyJson(); // JSON string
      // Se non è cambiato, non salvare
      if (data === lastAutosaveData) return;
      // Aggiorna cache
      lastAutosaveData = data;
      // Salva
      localStorage.setItem("army_autosave", data);
      // Notifica
      showAutosaveToast();
      // Backup ogni X minuti
      const now = Date.now();
      if (now - lastBackupTime > BACKUP_INTERVAL) {
        createAutosaveBackup(data);
        lastBackupTime = now;
      }
    } catch (err) {
      console.error("Autosave fallito:", err);
    }
  }

  let autosaveToastTimer = null;
  let lastAutosaveData = null;
  let lastBackupTime = 0;
  const BACKUP_INTERVAL = 5 * 60 * 1000; // ogni 5 minuti

  function showAutosaveToast() {
    const toast = document.getElementById("autosaveToast");
    toast.classList.add("show");

    if (autosaveToastTimer) clearTimeout(autosaveToastTimer);

    autosaveToastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1500); // visibile per 1.5 secondi
  }

  let infoToastTimer = null;

  function showInfoToast(text="",level="info",visibleTime=1500) {
    const old_toast = document.getElementById("toast");
    if (old_toast) {
      old_toast.remove();
    }
    const toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
    toast.textContent = text;
    if (level === "info") toast.className = "info-toast";
    if (level === "alert") toast.className = "alert-toast";
    toast.classList.add("show");
    if (infoToastTimer) clearTimeout(infoToastTimer);
    infoToastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toast.remove();
    },visibleTime);
  }

  function getTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  function createAutosaveBackup(data) {
    const ts = getTimestamp();
    const key = "army_autosave_" + ts;
    localStorage.setItem(key, data);
    rotateAutosaveBackups();
  }

  const MAX_AUTOSAVE_BACKUPS = 10;

  function rotateAutosaveBackups() {
    const keys = Object.keys(localStorage)
    .filter(k => k.startsWith("army_autosave_"))
    .sort(); // ordinati dal più vecchio al più nuovo

    while (keys.length > MAX_AUTOSAVE_BACKUPS) {
      const oldest = keys.shift();
      localStorage.removeItem(oldest);
    }
  }

  // --- MOBILE TABS ---
  document.querySelectorAll("#mobileTabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.body.setAttribute("data-tab", btn.dataset.tab);
    });
  });

  document.getElementById("armyOkBtn").addEventListener("click", () => {
    moveToTab("units");
  });

  function moveControlsForMobile() {
    const headerControls = document.getElementById("headerControls");
    const settingsControls = document.getElementById("settingsControls");
    let settingsSection = document.getElementById("settingsSection");

    if (window.innerWidth < 768) {
      // Sposta gli input nella scheda Impostazioni
      if (settingsControls.children.length === 0 && headerControls.children.length > 0) {
        while (headerControls.firstChild) {
          settingsControls.appendChild(headerControls.firstChild);
        }
      }
      // if (document.body.getAttribute("data-tab") === "settings") settingsSection.style.display = "block";
    } else {
      // Torna alla versione desktop
      if (headerControls.children.length === 0) {
        while (settingsControls.firstChild) {
          headerControls.appendChild(settingsControls.firstChild);
        }
      }
      settingsSection.style.display = "none";
    }
  }

  document.querySelectorAll("#mobileTabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      moveToTab(btn.dataset.tab);
    });
  });

  function moveToTab(name) {
    // setta la tab attiva
    document.body.setAttribute("data-tab",name)
    // aggiorna stile tab attiva
    document.querySelectorAll("#mobileTabs button")
    .forEach(b => b.classList.remove("active-tab"));
    const btn = document.querySelector('#mobileTabs button[data-tab="'+name+'"]');
    if (btn) btn.classList.add("active-tab");
  }

  // Imposta tab iniziale
  if (window.innerWidth < 768) {
    moveToTab("settings");
  }

  // Tast ESC
  document.body.addEventListener('keyup', function(e) {
    if (e.key == "Escape") {
      if (!document.getElementById("modalOverlay").hidden) closeModal();
      else clearConfigPanel();
    }
    if (e.key == "Enter") {
      document.getElementById("mainBtn")?.click();
    }
  });


  // --- MAGIC TOOLTIP ---
  const magicTooltip = document.getElementById("magicTooltip");

  function showMagicTooltip(text, x, y) {
    magicTooltip.textContent = text;
    magicTooltip.style.left = (x + 12) + "px";
    magicTooltip.style.top = (y + 12) + "px";
    magicTooltip.style.opacity = 1;
  }

  function hideMagicTooltip() {
    magicTooltip.style.opacity = 0;
  }

  // --- INIT -----------------------------------------------------------------

  moveControlsForMobile();
  window.addEventListener("resize", moveControlsForMobile);

  populateFactionSelect();
  renderUnitList();
  renderConfigPanel();
  renderArmy();

  (function loadAutosaveOnStart() {
    const raw = localStorage.getItem("army_autosave");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      importArmyJson(data);

      // Imposta il delta allo stato caricato
      lastAutosaveData = JSON.stringify(data);

      console.log("Autosave caricato all'avvio");
    } catch (err) {
      console.error("Errore nel caricamento autosave:", err);
    }
  })();
