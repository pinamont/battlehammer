  // // --- FONT PER PDF --------------------------------------------------------
  // const FONT_IM_FELL = `__IMFELL__`;
  // const FONT_GARAMOND = `__EBGARAMOND__`;
  //
  // // Registrazione font
  // function registerDeluxeFonts(doc) {
  //   doc.addFileToVFS("IMFell.ttf", FONT_IM_FELL);
  //   doc.addFont("IMFell.ttf", "IMFell", "normal");
  //   doc.addFileToVFS("Garamond.ttf", FONT_GARAMOND);
  //   doc.addFont("Garamond.ttf", "Garamond", "normal");
  // }
  //
  // const ICONS = {
  //   "Personaggi": `<svg width="24" height="24"><path d="M12 2c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5zm0 12c5 0 9 3 9 6v2H3v-2c0-3 4-6 9-6z"/></svg>`,
  //   "Truppe": `<svg width="24" height="24"><path d="M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z"/></svg>`,
  //   "Macchine e Mostri": `<svg width="24" height="24"><path d="M12 2l4 8H8l4-8zm0 20l-4-8h8l-4 8z"/></svg>`
  // };
  //
  // const BORDER_IMAGE = "__BORDER_IMAGE__";
  // // doc.addImage(BORDER_IMAGE, "PNG", 10, 10, 575, 820);

  // --- REGOLE DI COMPOSIZIONE ----------------------------------------------

  const ARMY_RULES = {
    min_truppe_pct: 25,
    max_personaggi_pct: 50,
    max_macchine_pct: 25
  };

  // --- DATI CARICATI INLINE DAL TAG JSON -----------------------------------

  const UNITS_BY_FACTION = JSON.parse(
    document.getElementById("FACTION_DATA").textContent
  );

  const MAGIC_ITEMS = JSON.parse(
    document.getElementById("ITEM_DATA").textContent
  ).magic_items;

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

  // --- STATO ----------------------------------------------------------------

  let currentFaction = "";
  let army = {
    maxPoints: 2000,
    entries: []
  };
  let selectedUnit = null;
  let nextEntryId = 1;

  // --- UTILITY --------------------------------------------------------------

  const ARMY_NAMES = {
    orchi_e_goblin: "Orchi e Goblin",
    // impero: "Impero",
    // elfi_alti: "Elfi Alti",
    // elfi_silvani: "Elfi Silvani",
    // nommorti: "Nommorti",
    // caos: "Caos"
    // aggiungi qui le altre fazioni
  };

  // Ordine categorie
  const categories = ["Personaggi", "Truppe", "Macchine e Mostri"];

  function armyName(army) {
    return ARMY_NAMES[army] || autoArmyName(army);
  }

  function autoArmyName(army) {
    return army
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  }

  function populateFactionSelect() {
    const select = document.getElementById("factionSelect");
    select.innerHTML = "";
    for (const faction of Object.keys(UNITS_BY_FACTION).sort()) {
      const opt = document.createElement("option");
      opt.value = faction;
      opt.textContent = armyName(faction);
      select.appendChild(opt);
      // assegna la prima fazione come default
      if (currentFaction === "") currentFaction = faction;
    }
  }

  function calcUnitPoints(unit, size, selectedOptionIds, optionCounts = {}, magicItems = [], magicBanner = null) {
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
        if (item) total += item.cost;
      }
    }
    if (magicBanner) {
      const banner = MAGIC_BANNERS.find(b => b.id === magicBanner);
      if (banner) total += banner.cost;
    }
    return total;
  }

  function computeArmyStats() {
    let total = 0;
    let byCat = { "Personaggi": 0, "Truppe": 0, "Macchine e Mostri": 0 };
    for (const e of army.entries) {
      total += e.points;
      if (!byCat[e.category]) byCat[e.category] = 0;
      byCat[e.category] += e.points;
    }
    const pct = {};
    for (const cat of Object.keys(byCat)) {
      pct[cat] = total > 0 ? (byCat[cat] / total) * 100 : 0;
    }
    return { total, byCat, pct };
  }

  function isMagicItemTaken(itemId, currentEntryId = null) {
    for (const e of army.entries) {
      if (e.id === currentEntryId) continue; // permette modifica dell’unità stessa
      if (e.magicItems && e.magicItems.includes(itemId)) return true;
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

  function isMagicItemAllowedForUnit(item, unit, currentFaction) {
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

  // input[type="number"] {
    // -webkit-appearance: textfield;
    // -moz-appearance: textfield;
    // appearance: textfield;
  // }
  // input[type="number"]::-webkit-inner-spin-button,
  // input[type="number"]::-webkit-outer-spin-button {
  //   -webkit-appearance: none;
  // }

  // --- EXPORT ---------------------------------------------------------------

  let counts = {};

  function validateArmy() {
    const stats = computeArmyStats();
    const errors = [];

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
          lines.push(`- ${e.name} – ${e.points} pt (${e.size} modelli)`);
        }

        // Opzioni
        if (e.options?.length) {
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          const parts = [];

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
            lines.push("    Opzioni: " + parts.join(", "));
          }
        }

        // Oggetti Magici
        if (e.magicItems?.length) {
          const names = e.magicItems
          .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
          .filter(Boolean);

          if (names.length > 0) {
            lines.push("    Oggetti Magici: " + names.join(", "));
          }
        }

        // Stendardo Magico
        if (e.magicBanner) {
          const banner = MAGIC_BANNERS.find(b => b.id === e.magicBanner);
          if (banner) {
            lines.push("    Stendardo Magico: " + banner.name);
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
          lines.push(`- **${e.name}** — ${e.points} pt (${e.size} modelli)`);
        }

        // Opzioni
        if (e.options?.length) {
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          const parts = [];

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
            lines.push(`  - *Opzioni:* ${parts.join(", ")}`);
          }
        }

        // Oggetti Magici
        if (e.magicItems?.length) {
          const names = e.magicItems
          .map(id => MAGIC_ITEMS.find(m => m.id === id)?.name)
          .filter(Boolean);

          if (names.length > 0) {
            lines.push(`  - *Oggetti Magici:* ${names.join(", ")}`);
          }
        }

        // Stendardo Magico
        if (e.magicBanner) {
          const banner = MAGIC_BANNERS.find(b => b.id === e.magicBanner);
          if (banner) {
            lines.push(`  - *Stendardo Magico:* ${banner.name}`);
          }
        }

        lines.push("");
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  function buildArmyDataForPdf() {
    const { stats } = validateArmy();
    const title = document.getElementById("listTitleInput").value || "Lista senza titolo";

    const sections = categories.map(cat => {
      const entries = army.entries.filter(e => e.category === cat);
      if (entries.length === 0) return null;

      return {
        name: cat,
        units: entries.map(e => {
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);

          return {
            name: e.name,
            points: e.points,
            size: e.size,
            options: (e.options || []).map(optId => {
              const opt = unit.options.find(o => o.id === optId);
              if (!opt) return null;

              const count = e.optionCounts?.[optId] || 1;
              return opt.max_count ? `${opt.name} ×${count}` : opt.name;
            }).filter(Boolean),
                           magicItems: (e.magicItems || []).map(id =>
                           MAGIC_ITEMS.find(m => m.id === id)?.name
                           ).filter(Boolean),
                           magicBanner: e.magicBanner
                           ? MAGIC_BANNERS.find(b => b.id === e.magicBanner)?.name
                           : null
          };
        })
      };
    }).filter(Boolean);

    return {
      name: title,
      faction: armyName(currentFaction),
      totalPoints: stats.total,
      sections
    };
  }

  function exportArmyPDF(armyData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    // --- HEADER PRINCIPALE ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Battle Hammer", pageWidth / 2, y, { align: "center" });
    y += 10;
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // --- INFO LISTA ---
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(14);
    const headerLine = `${armyData.name} — ${armyData.faction} — ${armyData.totalPoints} pt`;
    doc.text(headerLine, pageWidth / 2, y, { align: "center" });
    y += 15;

    // doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // --- SEZIONI ---
    armyData.sections.forEach(section => {
      // separatore
      doc.line(margin, y, pageWidth - margin, y);
      y += 20;

      // titolo sezione
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(section.name, margin, y);
      y += 20;

      // unità
      section.units.forEach(unit => {
        // --- UNITÀ ---
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);

        const sizeText = unit.size > 1 ? ` (${unit.size} modelli)` : "";
        const unitLine = `• ${unit.name}${sizeText} — ${unit.points} pt`;

        doc.text(unitLine, margin + 20, y);
        y += 20;

        // --- OPZIONI (tutte in una riga) ---
        doc.setFont("helvetica", "italic");
        doc.setFontSize(11);

        const optionsLine = [];

        if (unit.options.length > 0) {
          optionsLine.push(unit.options.join(", "));
        }

        if (unit.magicItems.length > 0) {
          optionsLine.push(unit.magicItems.join(", "));
        }

        if (unit.magicBanner) {
          optionsLine.push(unit.magicBanner);
        }

        if (optionsLine.length > 0) {
          y -= 5;
          doc.text(optionsLine.join(" — "), margin + 40, y);
          y += 20;
        }

        // salto pagina
        if (y > pageHeight - 60) {
          addFooter(doc, pageWidth, pageHeight);
          doc.addPage();
          y = margin;
        }
      });
    });

    // footer finale
    addFooter(doc, pageWidth, pageHeight);

    doc.save(`${armyData.name}_BattleHammer.pdf`);

    // --- FOOTER ---
    function addFooter(doc, pageWidth, pageHeight) {
      doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);
      doc.setFontSize(10);
      doc.text(
        `${doc.internal.getNumberOfPages()}`,
               pageWidth / 2,
               pageHeight - 25,
               { align: "center" }
      );
    }
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
        preselectedEquipment: [...(e.equipment || [])],
        preselectedMagicItems: [...(e.magic_items || [])],
        optionCounts: e.optionCounts || {},
        magicItems: e.magicItems || [],
        magicBanner: e.magicBanner || null,
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
      content.style.display = "none";
      content.style.padding = "6px 8px";
      content.style.fontSize = "12px";

      header.onclick = () => {
        content.style.display = content.style.display === "none" ? "block" : "none";
      };

      for (const unit of byCat[cat]) {
        const card = document.createElement("div");
        card.className = "unit-card";
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
      alert("Questo unità è già stato selezionata in numero massimo di volte.")
    } else {
      clearConfigPanel();
      selectedUnit = unit;
      renderConfigPanel();
      if (window.innerWidth < 768) {
        moveToTab("config");
      }
    }
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
    let selectedMagicBanner = existingEntry ? existingEntry.magicBanner : null;
    const unit = selectedUnit;
    const isEdit = !!existingEntry;

    const sizeValue = isEdit ? existingEntry.size : unit.min_size;
    const selectedOptionIds = new Set(isEdit ? existingEntry.options : []);

    const tempPoints = calcUnitPoints(unit, sizeValue, Array.from(selectedOptionIds), optionCounts, Array.from(selectedMagicItems), selectedMagicBanner);

    panel.innerHTML = "";

    document.getElementById("configUnitName").textContent = unit.name;

    let textContent = "";
    if (unit.min_size === 1 && unit.max_size === 1) {
      textContent = `${unit.cost_per_model} pt (modello singolo)`;
    } else {
      textContent = `${unit.cost_per_model} pt/mod., ${unit.min_size}-${unit.max_size} modelli`;
    }
    document.getElementById("configUnitMeta").textContent = textContent;

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

    // --- EQUIPAGGIAMENTO BASE ---
    for (const eq of unit.equipment) {
      const div = document.createElement("div");
      div.className = "option disabled-option";
      div.innerHTML = `
        <input type="checkbox" checked disabled>
        <span class="greyed">${eq}</span>
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
        const row = document.createElement("div");
        row.className = "option-row";
        row.style.display = "flex";
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

    // Loop sugli stendardi disponibili
    for (const banner of MAGIC_BANNERS) {
      if (!isMagicItemAllowedForUnit(banner, unit, currentFaction)) {
        continue;
      }

      const row = document.createElement("div");
      row.className = "option-row";
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
            alert("Questo stendardo magico è già stato selezionato da un'altra unità.");
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
      const text = document.createTextNode(" " + banner.name);
      left.appendChild(text);

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

    // Oggetti Magici
    if ((unit.magic_item_slots && unit.magic_item_slots > 0) || (unit.magic_items && unit.magic_items.size > 0)) {
      const title = document.createElement("div");
      title.style.marginTop = "10px";
      title.style.fontSize = "12px";
      title.textContent = "Oggetti Magici";
      title.textContent += ` (fino a ${unit.magic_item_slots})`;
      panel.appendChild(title);

      // Crea un blocco collapsible per ogni categoria
      for (const [category, items] of Object.entries(magicByCategory)) {
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
          if (!isMagicItemAllowedForUnit(item, unit, currentFaction)) {
            continue; // non mostrare l'oggetto
          }

          const row = document.createElement("div");
          row.className = "option-row";
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.margin = "2px 0";

          const left = document.createElement("span");
          const right = document.createElement("span");

          // oggetto tra quelli pre-selezionati...
          if (unit.magic_items && unit.magic_items.includes(item.name)) {
            const div = document.createElement("div");
            div.className = "option disabled-option";
            div.innerHTML = `
              <input type="checkbox" checked disabled>
              <span class="greyed">${item.name}</span>
            `;
            left.appendChild(div);
          } else { // ... o selezionabile
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = selectedMagicItems.has(item.id);

            cb.onchange = () => {
              if (cb.checked) {
                if (selectedMagicItems.size < unit.magic_item_slots) {
                  // Controllo unicità
                  if (!item.allow_multiple && isMagicItemTaken(item.id, existingEntry?.id)) {
                    alert("Questo oggetto magico è già stato selezionato da un'altra unità.");
                    cb.checked = false;
                    return;
                  }
                  if (!selectedMagicItems.has(item.id)) selectedMagicItems.add(item.id);
                } else {
                  cb.checked = false;
                  alert("Hai già raggiunto il numero massimo di oggetti magici.");
                }
              } else {
                if (selectedMagicItems.has(item.id)) selectedMagicItems.delete(item.id);
              }
              updatePointsPreview();
            };

            left.appendChild(cb);
            const text = document.createTextNode(" " + item.name);
            left.appendChild(text);
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

    // Costo in punti complessivo
    {
      let textContent = `${tempPoints} pt`;
      document.getElementById("configPoints").textContent = textContent;
    }

    const btnRow = document.getElementById("configButtons");

    const mainBtn = document.createElement("button");
    mainBtn.textContent = isEdit ? "Aggiorna" : "Aggiungi";
    mainBtn.onclick = () => {
      const size = parseInt(sizeInput.value, 10) || unit.min_size;
      const opts = Array.from(selectedOptionIds);
      const pts = calcUnitPoints(unit, size, opts, optionCounts, Array.from(selectedMagicItems), selectedMagicBanner);

      if (isEdit) {
        existingEntry.size = size;
        existingEntry.options = opts;
        existingEntry.points = pts;
        existingEntry.magicItems = Array.from(selectedMagicItems);
        existingEntry.magicBanner = selectedMagicBanner;
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
          size,
          options: opts,
          preselectedEquipment: [...(unit.equipment || [])],
          preselectedMagicItems: [...(unit.magic_items || [])],
          optionCounts: optionCounts,
          magicItems: Array.from(selectedMagicItems),
          magicBanner: selectedMagicBanner,
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

    // panel.appendChild(btnRow);

    function updatePointsPreview() {
      const size = parseInt(sizeInput.value, 10) || unit.min_size;
      const pts = calcUnitPoints(unit, size, Array.from(selectedOptionIds), optionCounts, Array.from(selectedMagicItems), selectedMagicBanner);
      configPoints = document.getElementById("configPoints");
      configPoints.textContent = `${pts} pt`;
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
          renderArmy();
        };

        header.appendChild(left);
        header.appendChild(right);
        div.appendChild(header);

        // Opzioni
        if ((e.options && e.options.length > 0) || (e.preselectedEquipment && e.preselectedEquipment.length > 0)) {
          const optsLine = document.createElement("div");
          optsLine.style.fontSize = "11px";
          optsLine.style.opacity = "0.8";
          const unit = UNITS_BY_FACTION[currentFaction].find(u => u.id === e.unitId);
          const parts = [];
          for (const eq of e.preselectedEquipment) {
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

        // Oggetti Magici
        if ((e.magicItems && e.magicItems.length > 0) || (e.preselectedMagicItems && e.preselectedMagicItems.length > 0)) {
          const itemNames = e.magicItems.map(id => MAGIC_ITEMS.find(m => m.id === id)?.name).filter(Boolean);
          const line = document.createElement("div");
          line.style.fontSize = "11px";
          line.style.opacity = "0.8";
          let fullList = e.preselectedMagicItems;
          fullList = fullList.concat(itemNames);
          // console.log(fullList)
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

  // document.getElementById("maxPointsInput").onChange = () => {
  //   const val = document.getElementById("maxPointsInput").value;
  //   army.maxPoints = val;
  //   renderArmy();
  // };

  // --- ESPORTAZIONE -----------------------------------------------------------

  // Scarica file di testo
  // document.getElementById("exportTextBtn").addEventListener("click", () => {
  //   const text = exportArmyText();
  //   downloadFile(text, "lista.txt", "text/plain");
  // });
  //
  // document.getElementById("exportMarkdownBtn").addEventListener("click", () => {
  //   const md = exportArmyTextMarkdown();
  //   downloadFile(md, "lista.md", "text/markdown");
  // });
  //
  // document.getElementById("exportPdfBtn").addEventListener("click", () => {
  //   const pdfData = buildArmyDataForPdf();
  //   exportArmyPDF(pdfData);
  // });
  //
  // document.getElementById("exportJsonBtn").addEventListener("click", () => {
  //   const json = exportArmyJson();
  //   downloadFile(json, "lista.json", "application/json");
  // });

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

  // Apri il selettore file
  // document.getElementById("importBtn").addEventListener("click", () => {
  //   document.getElementById("importFile").click();
  // });

  // // Gestisci il file selezionato
  // document.getElementById("importFile").addEventListener("change", (event) => {
  //   const file = event.target.files[0];
  //   if (!file) return;
  //
  //   const reader = new FileReader();
  //   reader.onload = (e) => {
  //     try {
  //       const data = JSON.parse(e.target.result);
  //       console.error(data);
  //       importArmyJson(data);
  //     } catch (err) {
  //       alert("Errore: il file non è un JSON valido.");
  //       console.error(err);
  //     }
  //   };
  //   reader.readAsText(file);
  // });

  // Ricostruisce l'esercito dalla struttura JSON esportata
  function importArmyJson(data) {
    // Validazione minima
    if (!data.units || !Array.isArray(data.units)) {
      alert("JSON non valido: manca la lista delle unità.");
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
      alert("Attenzione: la fazione nel JSON non è riconosciuta.");
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
        preselectedEquipment: [...(u.equipment || [])],
        preselectedMagicItems: [...(u.magic_items || [])],
        magicItems: u.magicItems || [],
        magicBanner: u.magicBanner || null,
        points: u.points
      });
    }

    // Aggiorna UI
    renderUnitList();
    renderConfigPanel();
    renderArmy();

    alert("Lista importata correttamente.");
  }

  // --- SALVATAGGI ONLINE ---
  function saveArmyToLocal(name) {
    const data = exportArmyJson();
    localStorage.setItem("army_" + name, data);
  }

  function loadArmyFromLocal(name) {
    const raw = localStorage.getItem("army_" + name);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function deleteArmyFromLocal(name) {
    localStorage.removeItem("army_" + name);
  }

  function listSavedArmies() {
    return Object.keys(localStorage)
    .filter(k => k.startsWith("army_"))
    .map(k => k.replace("army_", ""));
  }

  function refreshSavedListUI() {
    const container = document.getElementById("savedListContainer");
    container.innerHTML = "";

    const names = listSavedArmies();
    if (names.length === 0) {
      container.innerHTML = "<p style='opacity:0.7;'>Nessuna lista salvata.</p>";
      return;
    }

    names.forEach(name => {
      const div = document.createElement("div");
      div.className = "saved-item";

      div.innerHTML = `
      <span>${name}</span>
      <div>
      <button class="secondary" data-load="${name}">Carica</button>
      <button class="danger" data-del="${name}">Elimina</button>
      </div>
      `;

      container.appendChild(div);
    });

    // Listener Carica
    container.querySelectorAll("[data-load]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.load;
        const data = loadArmyFromLocal(name);
        if (data) {
          importArmyJson(data);
          moveToTab("army");
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
        deleteArmyFromLocal(btn.dataset.del);
        refreshSavedListUI();
      });
    });
  }

  // document.getElementById("saveArmyBtn").addEventListener("click", () => {
  //   const name = document.getElementById("saveNameInput").value.trim();
  //   if (!name) return;
  //
  //   saveArmyToLocal(name);
  //   refreshSavedListUI();
  //   document.getElementById("saveNameInput").value = "";
  // });

  function openModal(title, contentHtml) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalContent").innerHTML = contentHtml;
    document.getElementById("modalOverlay").style.display = "flex";
  }

  function closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
  }

  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  document.getElementById("openLoadModalBtn").addEventListener("click", () => {
    openModal("Carica lista", `
    <button id="loadFromBrowserBtn" class="secondary">Carica da salvataggi</button>
    <button id="loadFromFileBtn" class="secondary">Carica da file JSON</button>
    `);

    document.getElementById("loadFromBrowserBtn").addEventListener("click", () => {
      closeModal();
      // if (window.innerWidth < 768) {
      //   document.body.setAttribute("data-tab", "saves");
      // }
      // else {
        openModal("Liste disponibili", `
        <div id="savedListContainer"></div>
        `);
        refreshSavedListUI();
      // }
    });

    document.getElementById("loadFromFileBtn").addEventListener("click", () => {
      document.getElementById("importFile").click();
      closeModal();
    });
  });

  document.getElementById("openSaveModalBtn").addEventListener("click", () => {
    openModal("Salva lista", `
    <button id="saveToBrowserBtn" class="secondary">Salva nel browser</button>
    <button id="exportTxtBtn" class="secondary">Esporta TXT</button>
    <button id="exportJsonBtn" class="secondary">Esporta JSON</button>
    <button id="exportPdfBtn" class="secondary">Esporta PDF</button>
    `);

    document.getElementById("saveToBrowserBtn").addEventListener("click", () => {
      saveArmyToLocal(document.getElementById("listTitleInput").value);
      closeModal();
    });

    document.getElementById("exportTxtBtn").addEventListener("click", () => {
      document.getElementById("exportTextBtn").click();
      closeModal();
    });

    document.getElementById("exportJsonBtn").addEventListener("click", () => {
      document.getElementById("exportJsonBtn").click();
      closeModal();
    });

    document.getElementById("exportPdfBtn").addEventListener("click", () => {
      document.getElementById("exportPdfBtn").click();
      closeModal();
    });
  });

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

  // --- INIT -----------------------------------------------------------------

  moveControlsForMobile();
  window.addEventListener("resize", moveControlsForMobile);

  populateFactionSelect();
  renderUnitList();
  renderConfigPanel();
  renderArmy();
  // refreshSavedListUI();
