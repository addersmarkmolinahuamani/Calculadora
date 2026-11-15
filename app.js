/**
 * CALCULADORA PRIME - INSPIRADA EN HP PRIME
 * Motor de plantillas matemáticas interactivas (Textbook Math AST)
 * Soporta:
 * - Posicionamiento de cursor carácter por carácter y entre signos/plantillas
 * - Anidación recursiva completa (Fracción, Raíz con índice, Potencia)
 * - Ajuste automático de línea (salto de línea) y seguimiento de cursor
 * - Multiplicación implícita, historial persistente y conversión Decimal ⇄ Fracción
 */

class HPPrimeCalculator {
  constructor() {
    // Árbol sintáctico de la expresión (AST recursivo)
    // Nodos soportados:
    // - Texto (normalizado carácter a carácter): { type: 'text', val: '5' }
    // - Fracción: { type: 'fraction', id: 1, num: [...], den: [...] }
    // - Potencia: { type: 'power', id: 2, base: [...], exp: [...] }
    // - Raíz: { type: 'radical', id: 3, index: [...], radicand: [...] }
    this.items = [];

    // Foco actual:
    // - null (final de la línea principal)
    // - { id: number, slot: string } (final de una casilla de plantilla)
    // - { type: 'gap', parentId: number|null, slot: string|null, index: number } (antes de cualquier dígito, signo o plantilla)
    this.activeTarget = null;
    this.templateCounter = 0;

    // Estado del cálculo
    this.lastResult = '0';
    this.numericValue = 0;
    this.isEvaluated = false;
    this.showingFractionResult = false;
    this.currentFractionString = null;
    this.historyStack = [];
    this.angleMode = 'DEG';
    this.soundEnabled = true;

    // Elementos del DOM
    this.dom = {
      displayExpression: document.getElementById('display-expression'),
      displayResult: document.getElementById('display-result'),
      previewLabel: document.getElementById('preview-label'),
      stackContainer: document.getElementById('stack-container'),
      stackList: document.getElementById('stack-list'),
      stackEmptyNotice: document.getElementById('stack-empty-notice'),
      systemTime: document.getElementById('system-time'),
      batteryLevel: document.getElementById('battery-level'),
      batteryIndicator: document.getElementById('battery-indicator'),
      btnToggleSound: document.getElementById('btn-toggle-sound'),
      soundIconOn: document.getElementById('sound-icon-on'),
      soundIconOff: document.getElementById('sound-icon-off'),
      btnToggleAngle: document.getElementById('btn-toggle-angle'),
      btnCopyResult: document.getElementById('btn-copy-result'),
      toast: document.getElementById('toast-notification'),
      toastMessage: document.getElementById('toast-message'),
      badgeFracMode: document.getElementById('badge-frac-mode'),
    };

    // Inicializar AudioContext (Web Audio API)
    this.audioCtx = null;

    // Inicialización del sistema
    this.initSoundSetting();
    this.initHistorySetting();
    this.initClock();
    this.initBattery();
    this.bindEvents();
    this.updateDisplay();
  }

  /* ==========================================================================
     SISTEMA DE AUDIO (CLIC MECÁNICO SINTETIZADO)
     ========================================================================== */
  initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  initSoundSetting() {
    try {
      const saved = localStorage.getItem('hp_prime_sound');
      if (saved !== null) {
        this.soundEnabled = saved === 'true';
      }
    } catch {
      // localStorage no disponible
    }
    this.updateSoundIcons();
  }

  initHistorySetting() {
    try {
      const savedHistory = localStorage.getItem('hp_prime_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.historyStack = parsed.slice(0, 30);
          this.renderHistory();
        }
      }
    } catch {
      // Ignorar errores de lectura de historial
    }
  }

  saveHistorySetting() {
    try {
      localStorage.setItem('hp_prime_history', JSON.stringify(this.historyStack.slice(0, 30)));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    try {
      localStorage.setItem('hp_prime_sound', this.soundEnabled);
    } catch {}
    this.updateSoundIcons();
    this.showToast(this.soundEnabled ? 'Sonido activado' : 'Sonido desactivado');
    if (this.soundEnabled) {
      this.playKeySound('default');
    }
  }

  updateSoundIcons() {
    if (!this.dom.soundIconOn || !this.dom.soundIconOff) return;
    if (this.soundEnabled) {
      this.dom.soundIconOn.classList.remove('hidden');
      this.dom.soundIconOff.classList.add('hidden');
    } else {
      this.dom.soundIconOn.classList.add('hidden');
      this.dom.soundIconOff.classList.remove('hidden');
    }
  }

  playKeySound(type = 'default') {
    if (!this.soundEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'enter') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.045);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'clear') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.035);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'slot') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.02);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
        osc.start(now);
        osc.stop(now + 0.022);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.022);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        osc.start(now);
        osc.stop(now + 0.025);
      }
    } catch {
      // Audio no disponible o silenciado
    }
  }

  /* ==========================================================================
     RELOJ Y BATERÍA EN BARRA DE ESTADO
     ========================================================================== */
  initClock() {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      if (this.dom.systemTime) {
        this.dom.systemTime.textContent = `${hours}:${minutes}`;
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  async initBattery() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        const updateBatteryUI = () => {
          const level = Math.round(battery.level * 100);
          this.dom.batteryLevel.style.width = `${level}%`;
          this.dom.batteryIndicator.title = `Batería: ${level}%${battery.charging ? ' (Cargando)' : ''}`;
          if (level <= 20) {
            this.dom.batteryLevel.style.backgroundColor = 'var(--hp-coral)';
          } else {
            this.dom.batteryLevel.style.backgroundColor = 'var(--hp-green)';
          }
        };
        updateBatteryUI();
        battery.addEventListener('levelchange', updateBatteryUI);
        battery.addEventListener('chargingchange', updateBatteryUI);
      }
    } catch {
      if (this.dom.batteryLevel) {
        this.dom.batteryLevel.style.width = '100%';
      }
    }
  }

  /* ==========================================================================
     NORMALIZACIÓN Y NAVEGACIÓN EN ÁRBOL SINTÁCTICO (AST HELPERS)
     ========================================================================== */

  /**
   * Normaliza recursivamente cualquier lista de nodos para que cada nodo de texto
   * represente un único carácter individual (permitiendo posicionar el cursor
   * entre cualquier dígito como en "100" o antes/después de cualquier signo como "×").
   */
  normalizeList(list = this.items) {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) {
        list.splice(i, 1);
        i--;
        continue;
      }
      if (item.type === 'text') {
        const clean = String(item.val || '')
          .replace(/×/g, '*')
          .replace(/÷/g, '/')
          .replace(/−/g, '-')
          .replace(/\s+/g, '');
        if (clean.length === 0) {
          list.splice(i, 1);
          i--;
        } else if (clean.length === 1) {
          item.val = clean;
        } else {
          const chars = clean.split('').map(c => ({ type: 'text', val: c }));
          list.splice(i, 1, ...chars);
          i += chars.length - 1;
        }
      } else if (item.type === 'fraction') {
        if (item.id > this.templateCounter) this.templateCounter = item.id;
        this.normalizeList(item.num);
        this.normalizeList(item.den);
      } else if (item.type === 'power') {
        if (item.id > this.templateCounter) this.templateCounter = item.id;
        this.normalizeList(item.base);
        this.normalizeList(item.exp);
      } else if (item.type === 'radical') {
        if (item.id > this.templateCounter) this.templateCounter = item.id;
        this.normalizeList(item.index);
        this.normalizeList(item.radicand);
      }
    }
  }

  /**
   * Normaliza el estado del cursor activo para evitar posiciones fuera de rango
   * o duplicadas al final de una casilla/expresión.
   */
  normalizeActiveTarget() {
    if (!this.activeTarget) return;
    if (this.activeTarget.type === 'gap') {
      if (!this.activeTarget.parentId) {
        if (this.activeTarget.index < 0) {
          this.activeTarget.index = 0;
        } else if (this.activeTarget.index >= this.items.length) {
          this.activeTarget = null;
        }
      } else {
        const info = this.findNodeAndParent(this.activeTarget.parentId);
        if (!info || !info.node) {
          this.activeTarget = null;
          return;
        }
        const slotList = info.node[this.activeTarget.slot];
        if (!Array.isArray(slotList) || this.activeTarget.index >= slotList.length) {
          this.activeTarget = {
            id: this.activeTarget.parentId,
            slot: this.activeTarget.slot
          };
        } else if (this.activeTarget.index < 0) {
          this.activeTarget.index = 0;
        }
      }
    }
  }

  /**
   * Busca un nodo por su ID en cualquier nivel de anidación del AST
   * Retorna { node, parent, parentSlot, list }
   */
  findNodeAndParent(id, currentList = this.items, parent = null, parentSlot = null) {
    for (const item of currentList) {
      if (item.id === id) {
        return { node: item, parent, parentSlot, list: currentList };
      }
      if (item.type === 'fraction') {
        const inNum = this.findNodeAndParent(id, item.num, item, 'num');
        if (inNum) return inNum;
        const inDen = this.findNodeAndParent(id, item.den, item, 'den');
        if (inDen) return inDen;
      } else if (item.type === 'power') {
        const inBase = this.findNodeAndParent(id, item.base, item, 'base');
        if (inBase) return inBase;
        const inExp = this.findNodeAndParent(id, item.exp, item, 'exp');
        if (inExp) return inExp;
      } else if (item.type === 'radical') {
        const inIdx = this.findNodeAndParent(id, item.index, item, 'index');
        if (inIdx) return inIdx;
        const inRad = this.findNodeAndParent(id, item.radicand, item, 'radicand');
        if (inRad) return inRad;
      }
    }
    return null;
  }

  /**
   * Obtiene la lista actual de nodos donde está posicionado el cursor
   */
  getActiveList() {
    if (!this.activeTarget) {
      return this.items;
    }
    if (this.activeTarget.type === 'gap') {
      if (!this.activeTarget.parentId) {
        return this.items;
      }
      const info = this.findNodeAndParent(this.activeTarget.parentId);
      if (!info || !info.node) return this.items;
      return info.node[this.activeTarget.slot];
    }
    const info = this.findNodeAndParent(this.activeTarget.id);
    if (!info || !info.node) {
      this.activeTarget = null;
      return this.items;
    }
    return info.node[this.activeTarget.slot];
  }

  /**
   * Inserta un nodo (plantilla o texto) en la posición activa, respetando los espacios (gaps)
   */
  insertNodeIntoActiveList(node) {
    const list = this.getActiveList();
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      const idx = typeof this.activeTarget.index === 'number' ? this.activeTarget.index : list.length;
      if (idx <= list.length) {
        list.splice(idx, 0, node);
      } else {
        list.push(node);
      }
      return;
    }
    list.push(node);
  }

  /**
   * Extrae el número inmediatamente anterior al cursor en una lista para transferirlo a base o numerador
   */
  extractTrailingNumber(list) {
    this.normalizeList(list);
    let endIdx = list.length;
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      endIdx = Math.min(Math.max(0, this.activeTarget.index), list.length);
    }

    let startIdx = endIdx;
    while (startIdx > 0 && list[startIdx - 1].type === 'text' && /[\d.]/.test(list[startIdx - 1].val)) {
      startIdx--;
    }

    if (startIdx < endIdx) {
      const removed = list.splice(startIdx, endIdx - startIdx);
      if (this.activeTarget && this.activeTarget.type === 'gap') {
        this.activeTarget.index = startIdx;
      }
      return removed.map(t => t.val).join('');
    }
    return '';
  }

  /**
   * Verifica si una plantilla ya tiene contenido escrito en alguna de sus casillas
   */
  isTemplateNonEmpty(item) {
    if (!item || item.type === 'text') return false;
    if (item.type === 'fraction') return item.num.length > 0 || item.den.length > 0;
    if (item.type === 'power') return item.base.length > 0 || item.exp.length > 0;
    if (item.type === 'radical') return item.index.length > 0 || item.radicand.length > 0;
    return false;
  }

  /**
   * Si no hay un número previo, pero inmediatamente antes del cursor hay una plantilla
   * ya rellenada (ej. 88/4), permite envolverla como numerador o base al pulsar Fracción/Potencia
   */
  extractTrailingFilledTemplate(list) {
    let endIdx = list.length;
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      endIdx = Math.min(Math.max(0, this.activeTarget.index), list.length);
    }
    if (endIdx > 0) {
      const prevNode = list[endIdx - 1];
      if (prevNode && prevNode.type !== 'text' && this.isTemplateNonEmpty(prevNode)) {
        list.splice(endIdx - 1, 1);
        if (this.activeTarget && this.activeTarget.type === 'gap') {
          this.activeTarget.index = endIdx - 1;
        }
        return prevNode;
      }
    }
    return null;
  }

  /* ==========================================================================
     INSERCIÓN DE PLANTILLAS ANIDABLES (FRACCIÓN, RAÍZ, POTENCIA)
     ========================================================================== */

  /**
   * 1. PLANTILLA DE FRACCIÓN [ □ / □ ]
   */
  insertFractionTemplate() {
    this.playKeySound('slot');

    if (this.isEvaluated) {
      this.clearAll(false);
    }

    this.normalizeList();
    const list = this.getActiveList();
    const initialNum = this.extractTrailingNumber(list);
    let numNodes = [];
    let wrappedTemplate = false;

    if (initialNum !== '') {
      numNodes = initialNum.split('').map(c => ({ type: 'text', val: c }));
    } else {
      const prevTpl = this.extractTrailingFilledTemplate(list);
      if (prevTpl) {
        numNodes = [prevTpl];
        wrappedTemplate = true;
      }
    }

    this.templateCounter++;
    const newFrac = {
      type: 'fraction',
      id: this.templateCounter,
      num: numNodes,
      den: []
    };

    this.insertNodeIntoActiveList(newFrac);

    if (initialNum !== '' || wrappedTemplate) {
      this.activeTarget = { id: newFrac.id, slot: 'den' };
      this.showToast('Escribe el denominador');
    } else {
      this.activeTarget = { id: newFrac.id, slot: 'num' };
      this.showToast('Plantilla de Fracción • Escribe el numerador');
    }

    this.updateDisplay();
  }

  /**
   * 2. PLANTILLA DE RAÍZ CON ÍNDICE Y RADICANDO [ ⁿ√□ ]
   */
  insertRadicalTemplate() {
    this.playKeySound('slot');

    if (this.isEvaluated) {
      this.clearAll(false);
    }

    this.normalizeList();
    this.templateCounter++;
    const newRad = {
      type: 'radical',
      id: this.templateCounter,
      index: [], // Vacío = raíz cuadrada estándar (2)
      radicand: []
    };

    this.insertNodeIntoActiveList(newRad);

    // Enfocar radicando para que el usuario escriba dentro de la raíz
    this.activeTarget = { id: newRad.id, slot: 'radicand' };
    this.showToast('Plantilla de Raíz • Escribe dentro de la raíz (o en el índice)');

    this.updateDisplay();
  }

  /**
   * 3. PLANTILLA DE POTENCIA [ □^□ ]
   */
  insertPowerTemplate() {
    this.playKeySound('slot');

    if (this.isEvaluated) {
      this.clearAll(false);
    }

    this.normalizeList();
    const list = this.getActiveList();
    const initialBase = this.extractTrailingNumber(list);

    this.templateCounter++;
    const baseNodes = initialBase !== '' ? initialBase.split('').map(c => ({ type: 'text', val: c })) : [];
    const newPow = {
      type: 'power',
      id: this.templateCounter,
      base: baseNodes,
      exp: []
    };

    this.insertNodeIntoActiveList(newPow);

    if (initialBase !== '') {
      this.activeTarget = { id: newPow.id, slot: 'exp' };
      this.showToast(`Base ${initialBase} • Escribe el exponente`);
    } else {
      this.activeTarget = { id: newPow.id, slot: 'base' };
      this.showToast('Plantilla de Potencia • Escribe la base');
    }

    this.updateDisplay();
  }

  /**
   * Enfoca una casilla específica al hacer clic en ella en la pantalla
   */
  focusSlot(id, slot) {
    this.playKeySound('slot');
    if (this.isEvaluated) {
      this.isEvaluated = false;
    }
    this.activeTarget = { id, slot };
    const labelMap = {
      num: 'Numerador',
      den: 'Denominador',
      base: 'Base',
      exp: 'Exponente',
      index: 'Índice del radical',
      radicand: 'Dentro de la raíz (Radicando)'
    };
    this.showToast(labelMap[slot] || slot);
    this.updateDisplay();
  }

  /**
   * Genera una etiqueta descriptiva para la posición actual del cursor
   */
  getStopLabel(list, idx, parentId, slotName) {
    if (idx === 0) {
      return parentId ? 'Inicio de casilla' : 'Inicio de la expresión';
    }
    const prev = list[idx - 1];
    const next = list[idx];
    if (next && next.type === 'text' && this.isOperator(next.val)) {
      return 'Antes del operador';
    }
    if (prev && prev.type === 'text' && this.isOperator(prev.val)) {
      return 'Después del operador';
    }
    if (prev && prev.type !== 'text' && next && next.type !== 'text') {
      return 'Espacio entre plantillas';
    }
    return 'Posición de edición';
  }

  /**
   * Obtiene TODAS las paradas navegables en orden visual de lectura (de izquierda a derecha):
   * - Antes y después de cada plantilla
   * - Antes y después de cada signo de operación (+, −, ×, ÷)
   * - Entre cada dígito individual (ej. después del 1 en "100")
   * - Dentro de cada recuadro de fracción, raíz y potencia
   */
  getAllNavigableStops(items = this.items) {
    this.normalizeList(items);
    const stops = [];

    const traverseList = (list, parentId = null, slotName = null) => {
      if (!list) return;

      for (let i = 0; i < list.length; i++) {
        const item = list[i];

        // 1. Parada antes del elemento i:
        // En la línea principal (parentId === null) siempre hay parada antes de cada dígito, signo o plantilla.
        // Dentro de una casilla (parentId !== null), hay parada entre cada carácter/elemento (i >= 1)
        // o al inicio (i === 0) si el primer elemento es una plantilla anidada.
        if (parentId === null || i > 0 || item.type !== 'text') {
          stops.push({
            type: 'gap',
            parentId,
            slot: slotName,
            index: i,
            label: this.getStopLabel(list, i, parentId, slotName)
          });
        }

        // 2. Si el elemento es una plantilla, recorrer sus casillas internas
        if (item.type === 'fraction') {
          traverseList(item.num, item.id, 'num');
          stops.push({ id: item.id, slot: 'num', type: 'slot', label: 'Numerador' });

          traverseList(item.den, item.id, 'den');
          stops.push({ id: item.id, slot: 'den', type: 'slot', label: 'Denominador' });
        } else if (item.type === 'radical') {
          traverseList(item.index, item.id, 'index');
          stops.push({ id: item.id, slot: 'index', type: 'slot', label: 'Índice del radical' });

          traverseList(item.radicand, item.id, 'radicand');
          stops.push({ id: item.id, slot: 'radicand', type: 'slot', label: 'Radicando (dentro de la raíz)' });
        } else if (item.type === 'power') {
          traverseList(item.base, item.id, 'base');
          stops.push({ id: item.id, slot: 'base', type: 'slot', label: 'Base' });

          traverseList(item.exp, item.id, 'exp');
          stops.push({ id: item.id, slot: 'exp', type: 'slot', label: 'Exponente' });
        }
      }

      // Parada al final de la línea principal
      if (parentId === null && list.length > 0) {
        stops.push({
          type: 'gap',
          parentId: null,
          slot: null,
          index: list.length,
          label: 'Final de la expresión'
        });
      }
    };

    traverseList(items, null, null);
    return stops;
  }

  getAllFocusableSlots(items = this.items) {
    return this.getAllNavigableStops(items);
  }

  isCurrentTarget(stop, target) {
    if (!target) {
      return stop.type === 'gap' && !stop.parentId && stop.index === this.items.length;
    }
    if (target.type === 'gap') {
      if (target.parentId) {
        const info = this.findNodeAndParent(target.parentId);
        const slotList = info && info.node ? info.node[target.slot] : null;
        if (slotList && target.index >= slotList.length) {
          return stop.type === 'slot' && stop.id === target.parentId && stop.slot === target.slot;
        }
      } else if (target.index >= this.items.length) {
        return stop.type === 'gap' && !stop.parentId && stop.index === this.items.length;
      }
      return stop.type === 'gap' &&
             (stop.parentId || null) === (target.parentId || null) &&
             (stop.slot || null) === (target.slot || null) &&
             stop.index === target.index;
    }
    return stop.type === 'slot' && stop.id === target.id && stop.slot === target.slot;
  }

  applyStop(stop) {
    if (!stop) return;
    if (this.isEvaluated) {
      this.isEvaluated = false;
    }
    if (stop.type === 'gap') {
      if (!stop.parentId && stop.index === this.items.length) {
        this.activeTarget = null;
      } else {
        this.activeTarget = {
          type: 'gap',
          parentId: stop.parentId || null,
          slot: stop.slot || null,
          index: stop.index
        };
      }
    } else {
      this.activeTarget = { id: stop.id, slot: stop.slot };
    }
  }

  /**
   * Navega fluidamente paso a paso entre dígitos, operadores y recuadros punteados
   */
  navigateSlot(direction) {
    this.playKeySound('slot');
    this.normalizeList();
    this.normalizeActiveTarget();

    const stops = this.getAllNavigableStops();
    if (stops.length === 0) {
      this.showToast('Línea principal');
      return;
    }

    if (direction === 'left' || direction === 'prev') {
      const currIndex = stops.findIndex(s => this.isCurrentTarget(s, this.activeTarget));
      if (currIndex > 0) {
        this.applyStop(stops[currIndex - 1]);
      } else if (currIndex === -1) {
        this.applyStop(stops[stops.length - 1]);
      } else {
        this.applyStop(stops[0]);
      }
    } else if (direction === 'right' || direction === 'next' || direction === 'exit') {
      const currIndex = stops.findIndex(s => this.isCurrentTarget(s, this.activeTarget));
      if (currIndex !== -1 && currIndex < stops.length - 1) {
        this.applyStop(stops[currIndex + 1]);
      } else if (currIndex === -1) {
        this.applyStop(stops[0]);
      } else {
        this.activeTarget = null;
      }
    } else if (direction === 'up' || direction === 'down' || direction === 'toggle') {
      const targetId = this.activeTarget ? (this.activeTarget.id || this.activeTarget.parentId) : null;
      const targetSlot = this.activeTarget ? this.activeTarget.slot : null;
      if (!targetId) {
        const target = direction === 'up' ? stops[stops.length - 1] : stops[0];
        this.applyStop(target);
      } else {
        const info = this.findNodeAndParent(targetId);
        if (info && info.node) {
          const { node, parent, parentSlot } = info;
          if (node.type === 'fraction') {
            if (direction === 'down' && targetSlot === 'den' && parent && parent.type === 'fraction' && parentSlot === 'num') {
              // Bajar desde el denominador de una sub-fracción superior al denominador de la fracción principal
              this.activeTarget = { id: parent.id, slot: 'den' };
              this.showToast('Denominador principal');
            } else if (direction === 'up' && targetSlot === 'num' && parent && parent.type === 'fraction' && parentSlot === 'den') {
              // Subir desde el numerador de una sub-fracción inferior al numerador de la fracción principal
              this.activeTarget = { id: parent.id, slot: 'num' };
              this.showToast('Numerador principal');
            } else {
              const nextSlot = targetSlot === 'num' ? 'den' : 'num';
              this.activeTarget = { id: node.id, slot: nextSlot };
              this.showToast(nextSlot === 'num' ? 'Numerador' : 'Denominador');
            }
          } else if (node.type === 'radical') {
            const nextSlot = targetSlot === 'radicand' ? 'index' : 'radicand';
            this.activeTarget = { id: node.id, slot: nextSlot };
            this.showToast(nextSlot === 'index' ? 'Índice del radical' : 'Radicando');
          } else if (node.type === 'power') {
            const nextSlot = targetSlot === 'base' ? 'exp' : 'base';
            this.activeTarget = { id: node.id, slot: nextSlot };
            this.showToast(nextSlot === 'base' ? 'Base' : 'Exponente');
          }
        }
      }
    }

    this.updateDisplay();
  }

  /* ==========================================================================
     ENTRADA DE CARACTERES EN CUALQUIER POSICIÓN DEL CURSOR
     ========================================================================== */
  appendCharacter(char) {
    this.playKeySound('default');
    this.showingFractionResult = false;
    this.normalizeList();
    this.normalizeActiveTarget();

    if (this.isEvaluated) {
      if (this.isOperator(char)) {
        const resChars = String(this.lastResult).split('').map(c => ({ type: 'text', val: c }));
        this.items = [...resChars, { type: 'text', val: char }];
      } else {
        this.items = [];
        if (char === '.') {
          this.items.push({ type: 'text', val: '0' }, { type: 'text', val: '.' });
        } else {
          this.items.push({ type: 'text', val: char });
        }
      }
      this.activeTarget = null;
      this.isEvaluated = false;
      this.updateDisplay();
      return;
    }

    const list = this.getActiveList();
    const isGap = Boolean(this.activeTarget && this.activeTarget.type === 'gap');
    let insertIdx = isGap ? Math.min(Math.max(0, this.activeTarget.index), list.length) : list.length;

    // 1. Punto decimal (.)
    if (char === '.') {
      // Verificar si el número contiguo actual ya contiene un punto decimal
      let left = insertIdx - 1;
      while (left >= 0 && list[left].type === 'text' && /[\d.]/.test(list[left].val)) {
        if (list[left].val === '.') return;
        left--;
      }
      let right = insertIdx;
      while (right < list.length && list[right].type === 'text' && /[\d.]/.test(list[right].val)) {
        if (list[right].val === '.') return;
        right++;
      }

      const hasDigitBefore = insertIdx > 0 && list[insertIdx - 1].type === 'text' && /\d/.test(list[insertIdx - 1].val);
      if (!hasDigitBefore) {
        list.splice(insertIdx, 0, { type: 'text', val: '0' }, { type: 'text', val: '.' });
        if (isGap) this.activeTarget.index = insertIdx + 2;
      } else {
        list.splice(insertIdx, 0, { type: 'text', val: '.' });
        if (isGap) this.activeTarget.index = insertIdx + 1;
      }
      this.normalizeActiveTarget();
      this.updateDisplay();
      return;
    }

    // 2. Operador aritmético (+, -, *, /)
    if (this.isOperator(char)) {
      const prevItem = insertIdx > 0 ? list[insertIdx - 1] : null;
      if (prevItem && prevItem.type === 'text' && this.isOperator(prevItem.val)) {
        // Reemplazar el operador inmediatamente anterior al cursor
        prevItem.val = char;
        this.updateDisplay();
        return;
      }

      list.splice(insertIdx, 0, { type: 'text', val: char });
      if (isGap) {
        this.activeTarget.index = insertIdx + 1;
      }
      this.normalizeActiveTarget();
      this.updateDisplay();
      return;
    }

    // 3. Dígitos y paréntesis
    list.splice(insertIdx, 0, { type: 'text', val: char });
    if (isGap) {
      this.activeTarget.index = insertIdx + 1;
    }
    this.normalizeActiveTarget();
    this.updateDisplay();
  }

  isOperator(char) {
    return ['+', '-', '*', '/'].includes(char);
  }

  /* ==========================================================================
     BORRADO INTELIGENTE (BACKSPACE Y SUPR)
     ========================================================================== */
  backspace() {
    this.playKeySound('clear');
    this.showingFractionResult = false;
    this.normalizeList();
    this.normalizeActiveTarget();

    if (this.isEvaluated) {
      this.clearAll();
      return;
    }

    // 1. Borrado cuando el cursor está en una posición intermedia (gap)
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      const list = this.getActiveList();
      let gapIdx = typeof this.activeTarget.index === 'number' ? this.activeTarget.index : list.length;
      if (gapIdx > list.length) gapIdx = list.length;

      if (gapIdx > 0) {
        const itemToLeft = list[gapIdx - 1];
        if (itemToLeft.type === 'text') {
          list.splice(gapIdx - 1, 1);
          this.activeTarget.index = Math.max(0, gapIdx - 1);
          this.normalizeActiveTarget();
          this.updateDisplay();
          return;
        } else {
          // El elemento a la izquierda es una plantilla: entrar a editar su última casilla
          const lastSlot = itemToLeft.type === 'fraction' ? 'den' : (itemToLeft.type === 'power' ? 'exp' : 'radicand');
          this.activeTarget = { id: itemToLeft.id, slot: lastSlot };
          const labelMap = { den: 'Denominador', exp: 'Exponente', radicand: 'Radicando' };
          this.showToast('Editando ' + (labelMap[lastSlot] || lastSlot));
          this.updateDisplay();
          return;
        }
      } else {
        // Estamos al inicio de una casilla (index === 0)
        if (this.activeTarget.parentId) {
          const info = this.findNodeAndParent(this.activeTarget.parentId);
          if (info && info.node) {
            const { node, parent, parentSlot, list: parentList } = info;
            const slot = this.activeTarget.slot;
            if (node.type === 'fraction' && slot === 'den') {
              this.activeTarget = { id: node.id, slot: 'num' };
            } else if (node.type === 'power' && slot === 'exp') {
              this.activeTarget = { id: node.id, slot: 'base' };
            } else if (node.type === 'radical' && slot === 'radicand') {
              this.activeTarget = { id: node.id, slot: 'index' };
            } else {
              const nodeIdx = parentList.indexOf(node);
              this.activeTarget = {
                type: 'gap',
                parentId: parent ? parent.id : null,
                slot: parentSlot || null,
                index: Math.max(0, nodeIdx)
              };
            }
            this.normalizeActiveTarget();
            this.updateDisplay();
          }
        }
        return;
      }
    }

    // 2. Borrado cuando el cursor está al final de la lista activa (línea principal o casilla)
    const list = this.getActiveList();

    if (list.length > 0) {
      const lastItem = list[list.length - 1];

      if (lastItem.type === 'text') {
        list.pop();
        this.updateDisplay();
        return;
      } else {
        // Si el último elemento es una plantilla anidada, entrar a editar su última casilla
        if (lastItem.type === 'fraction') {
          this.activeTarget = { id: lastItem.id, slot: 'den' };
        } else if (lastItem.type === 'power') {
          this.activeTarget = { id: lastItem.id, slot: 'exp' };
        } else if (lastItem.type === 'radical') {
          this.activeTarget = { id: lastItem.id, slot: 'radicand' };
        }
        this.showToast('Editando plantilla interna');
        this.updateDisplay();
        return;
      }
    }

    // 3. Si la casilla actual ya está vacía, moverse a la anterior o eliminar la plantilla
    if (this.activeTarget) {
      const info = this.findNodeAndParent(this.activeTarget.id);
      if (info) {
        const { node, parent, parentSlot, list: parentList } = info;
        const slot = this.activeTarget.slot;

        if (node.type === 'fraction') {
          if (slot === 'den') {
            this.activeTarget.slot = 'num';
            this.showToast('Regresando al Numerador');
          } else if (slot === 'num') {
            const idx = parentList.indexOf(node);
            if (idx !== -1) parentList.splice(idx, 1);
            this.activeTarget = parent ? { id: parent.id, slot: parentSlot } : null;
            this.showToast('Fracción eliminada');
          }
        } else if (node.type === 'power') {
          if (slot === 'exp') {
            this.activeTarget.slot = 'base';
            this.showToast('Regresando a la Base');
          } else if (slot === 'base') {
            const idx = parentList.indexOf(node);
            if (idx !== -1) parentList.splice(idx, 1);
            this.activeTarget = parent ? { id: parent.id, slot: parentSlot } : null;
            this.showToast('Potencia eliminada');
          }
        } else if (node.type === 'radical') {
          if (slot === 'index') {
            this.activeTarget.slot = 'radicand';
            this.showToast('Regresando al Radicando');
          } else if (slot === 'radicand') {
            const idx = parentList.indexOf(node);
            if (idx !== -1) parentList.splice(idx, 1);
            this.activeTarget = parent ? { id: parent.id, slot: parentSlot } : null;
            this.showToast('Raíz eliminada');
          }
        }
        this.updateDisplay();
      }
    }
  }

  /**
   * Borra el elemento inmediatamente a la derecha del cursor (tecla Supr / Delete)
   */
  deleteForward() {
    this.playKeySound('clear');
    this.normalizeList();
    this.normalizeActiveTarget();

    if (this.activeTarget && this.activeTarget.type === 'gap') {
      const list = this.getActiveList();
      const idx = this.activeTarget.index;
      if (idx >= 0 && idx < list.length) {
        list.splice(idx, 1);
        this.normalizeActiveTarget();
        this.updateDisplay();
      }
    }
  }

  clearAll(keepHistory = true) {
    this.playKeySound('clear');
    this.items = [];
    this.activeTarget = null;
    this.lastResult = '0';
    this.numericValue = 0;
    this.isEvaluated = false;
    this.showingFractionResult = false;
    this.currentFractionString = null;
    if (this.dom.badgeFracMode) {
      this.dom.badgeFracMode.classList.add('hidden');
    }
    this.dom.displayResult.classList.remove('error-state', 'result-medium', 'result-compact');
    this.updateDisplay();
  }

  toggleSign() {
    this.playKeySound('default');
    this.normalizeList();
    const list = this.getActiveList();
    let endIdx = list.length;
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      endIdx = Math.min(Math.max(0, this.activeTarget.index), list.length);
    }
    let startIdx = endIdx;
    while (startIdx > 0 && list[startIdx - 1].type === 'text' && /[\d.]/.test(list[startIdx - 1].val)) {
      startIdx--;
    }
    if (startIdx < endIdx) {
      if (startIdx > 0 && list[startIdx - 1].type === 'text' && list[startIdx - 1].val === '-') {
        const beforeMinus = startIdx - 2 >= 0 ? list[startIdx - 2] : null;
        if (!beforeMinus || (beforeMinus.type === 'text' && (this.isOperator(beforeMinus.val) || beforeMinus.val === '('))) {
          list.splice(startIdx - 1, 1);
          if (this.activeTarget && this.activeTarget.type === 'gap') {
            this.activeTarget.index = Math.max(0, this.activeTarget.index - 1);
          }
          this.updateDisplay();
          return;
        }
      }
      list.splice(startIdx, 0, { type: 'text', val: '-' });
      if (this.activeTarget && this.activeTarget.type === 'gap') {
        this.activeTarget.index++;
      }
      this.updateDisplay();
    }
  }

  applyPercent() {
    this.playKeySound('default');
    this.appendCharacter('%');
  }

  /* ==========================================================================
     EVALUACIÓN MATEMÁTICA Y FORMULACIÓN (RECURSIVA + MULTIPLICACIÓN IMPLÍCITA)
     ========================================================================== */
  toFormula(list = this.items) {
    const tokens = [];

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;

      if (item.type === 'text') {
        const cleanVal = String(item.val || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        tokens.push({ kind: 'text', code: cleanVal });
      } else if (item.type === 'fraction') {
        const numStr = this.toFormula(item.num).trim() || '0';
        const denStr = this.toFormula(item.den).trim() || '1';
        tokens.push({ kind: 'expr', code: `((${numStr}) / (${denStr}))` });
      } else if (item.type === 'power') {
        const baseStr = this.toFormula(item.base).trim() || '0';
        const expStr = this.toFormula(item.exp).trim() || '1';
        tokens.push({ kind: 'expr', code: `(Math.pow((${baseStr}), (${expStr})))` });
      } else if (item.type === 'radical') {
        const idxStr = this.toFormula(item.index).trim();
        const radStr = this.toFormula(item.radicand).trim() || '0';
        if (!idxStr || idxStr === '2') {
          tokens.push({ kind: 'expr', code: `(Math.sqrt(${radStr}))` });
        } else {
          tokens.push({
            kind: 'expr',
            code: `(((${radStr}) < 0 && (${idxStr}) % 2 !== 0) ? -Math.pow(-(${radStr}), 1 / (${idxStr})) : Math.pow((${radStr}), 1 / (${idxStr})))`
          });
        }
      }
    }

    // Construir cadena aplicando multiplicación implícita entre plantillas, paréntesis y números
    let formula = '';
    for (let i = 0; i < tokens.length; i++) {
      const curr = tokens[i];
      const prev = i > 0 ? tokens[i - 1] : null;

      if (prev) {
        const prevLast = prev.code.trim().slice(-1);
        const currFirst = curr.code.trim().charAt(0);
        const prevEndsOperand = prev.kind === 'expr' || /[\d.)%]/.test(prevLast);
        const currStartsOperand = curr.kind === 'expr' || currFirst === '(' || (prev.kind === 'expr' && /[\d.]/.test(currFirst)) || (prevLast === ')' && /[\d.]/.test(currFirst));

        if (prevEndsOperand && currStartsOperand) {
          formula += '*';
        }
      }
      formula += curr.code;
    }

    formula = formula.trim().replace(/(\d+\.?\d*)%/g, '($1/100)');
    return formula;
  }

  /**
   * Convierte un decimal en una fracción exacta simplificada (si existe con denominador razonable)
   */
  decimalToFraction(val) {
    if (!isFinite(val) || Number.isInteger(val)) return null;
    const sign = val < 0 ? '-' : '';
    const absVal = Math.abs(val);

    const tolerance = 1.0e-9;
    let h1 = 1, h2 = 0;
    let k1 = 0, k2 = 1;
    let b = absVal;

    for (let iter = 0; iter < 25; iter++) {
      const a = Math.floor(b);
      let aux = h1;
      h1 = a * h1 + h2;
      h2 = aux;
      aux = k1;
      k1 = a * k1 + k2;
      k2 = aux;

      if (k1 > 100000) break;
      if (Math.abs(absVal - h1 / k1) <= absVal * tolerance) {
        if (k1 > 1 && String(h1).length <= 7 && String(k1).length <= 6) {
          return `${sign}${h1}/${k1}`;
        }
        return null;
      }
      const rem = b - a;
      if (rem < 1e-12) break;
      b = 1 / rem;
    }
    return null;
  }

  toggleFractionResult() {
    if (!this.currentFractionString) return;
    this.playKeySound('slot');
    this.showingFractionResult = !this.showingFractionResult;
    this.renderResultLine(this.numericValue, this.isEvaluated ? '=' : '≈');
  }

  evaluate() {
    this.playKeySound('enter');
    this.normalizeList();

    if (this.items.length === 0) return;

    let formula = this.toFormula();
    const openP = (formula.match(/\(/g) || []).length;
    const closeP = (formula.match(/\)/g) || []).length;
    if (openP > closeP) {
      formula += ')'.repeat(openP - closeP);
    }

    const result = this.evaluateMath(formula);

    if (result === null || isNaN(result) || !isFinite(result)) {
      if (result === Infinity || result === -Infinity) {
        this.showError('División por cero');
      } else {
        this.showError('Sintaxis inválida');
      }
      return;
    }

    this.numericValue = result;
    this.showingFractionResult = false;
    const formattedResult = this.formatNumber(result);

    // Guardar en el historial
    this.addToHistory(JSON.parse(JSON.stringify(this.items)), formattedResult);

    this.lastResult = formattedResult;
    this.isEvaluated = true;
    this.activeTarget = null;
    this.updateDisplay();
  }

  evaluateMath(expr) {
    if (!expr || expr === '-') return null;

    try {
      // eslint-disable-next-line no-new-func
      const calcFunc = new Function(`'use strict'; return (${expr});`);
      const val = calcFunc();
      return typeof val === 'number' ? val : null;
    } catch {
      return null;
    }
  }

  formatNumber(num) {
    if (!isFinite(num)) {
      return num === Infinity ? '∞' : (num === -Infinity ? '-∞' : 'Error');
    }
    if (Number.isInteger(num)) {
      if (Math.abs(num) >= 1e14) {
        return num.toExponential(6).replace('e+', 'E+').replace('e-', 'E-');
      }
      return String(num);
    }
    const rounded = parseFloat(num.toPrecision(12));
    if (Math.abs(rounded) >= 1e14 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-6)) {
      return rounded.toExponential(6).replace('e+', 'E+').replace('e-', 'E-');
    }
    return String(rounded);
  }

  formatExpression(expr) {
    if (!expr) return '';
    return expr
      .replace(/\*/g, ' × ')
      .replace(/\//g, ' ÷ ')
      .replace(/\+/g, ' + ')
      .replace(/-/g, ' − ');
  }

  formatSingleChar(char) {
    if (char === '*') return '×';
    if (char === '/') return '÷';
    if (char === '+') return '+';
    if (char === '-') return '−';
    return char;
  }

  showError(message) {
    this.dom.displayResult.textContent = message;
    this.dom.displayResult.classList.remove('result-medium', 'result-compact');
    this.dom.displayResult.classList.add('error-state');
    this.dom.previewLabel.textContent = 'ERROR';
    if (this.dom.badgeFracMode) {
      this.dom.badgeFracMode.classList.add('hidden');
    }
  }

  /* ==========================================================================
     ACTUALIZACIÓN VISUAL DE LA PANTALLA LCD (RENDER RECURSIVO + SEGUIMIENTO DE CURSOR)
     ========================================================================== */
  isNodeFocused(nodeId) {
    if (!this.activeTarget) return false;
    return this.activeTarget.id === nodeId || this.activeTarget.parentId === nodeId;
  }

  isSlotActive(nodeId, slotName) {
    if (!this.activeTarget) return false;
    if (this.activeTarget.type === 'gap') {
      return this.activeTarget.parentId === nodeId && this.activeTarget.slot === slotName;
    }
    return this.activeTarget.id === nodeId && this.activeTarget.slot === slotName;
  }

  isSlotEndCursor(nodeId, slotName) {
    if (!this.activeTarget || this.activeTarget.type === 'gap') return false;
    return this.activeTarget.id === nodeId && this.activeTarget.slot === slotName;
  }

  /**
   * Calcula la profundidad vertical máxima de una plantilla para escalar paréntesis y barras de fracción
   */
  getTemplateVerticalDepth(item) {
    if (!item || item.type === 'text') return 0;
    if (item.type === 'fraction') {
      const numDepth = item.num.reduce((m, it) => Math.max(m, this.getTemplateVerticalDepth(it)), 0);
      const denDepth = item.den.reduce((m, it) => Math.max(m, this.getTemplateVerticalDepth(it)), 0);
      return 1 + Math.max(numDepth, denDepth);
    }
    if (item.type === 'radical') {
      const radDepth = item.radicand.reduce((m, it) => Math.max(m, this.getTemplateVerticalDepth(it)), 0);
      return Math.max(1, radDepth);
    }
    if (item.type === 'power') {
      const baseDepth = item.base.reduce((m, it) => Math.max(m, this.getTemplateVerticalDepth(it)), 0);
      return baseDepth;
    }
    return 0;
  }

  /**
   * Determina el nivel de altura (0..3) que debe tener un paréntesis '(' o ')' según las fracciones que encierra
   */
  getParenScaleLevel(list, parenIdx) {
    const token = list[parenIdx];
    if (!token || token.type !== 'text') return 0;

    let start = parenIdx;
    let end = parenIdx;

    if (token.val === '(') {
      let depth = 0;
      end = list.length - 1;
      for (let i = parenIdx; i < list.length; i++) {
        if (list[i].type === 'text' && list[i].val === '(') depth++;
        else if (list[i].type === 'text' && list[i].val === ')') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
    } else if (token.val === ')') {
      let depth = 0;
      start = 0;
      for (let i = parenIdx; i >= 0; i--) {
        if (list[i].type === 'text' && list[i].val === ')') depth++;
        else if (list[i].type === 'text' && list[i].val === '(') {
          depth--;
          if (depth === 0) {
            start = i;
            break;
          }
        }
      }
    } else {
      return 0;
    }

    let maxVert = 0;
    for (let i = start; i <= end; i++) {
      maxVert = Math.max(maxVert, this.getTemplateVerticalDepth(list[i]));
    }
    return Math.min(3, maxVert);
  }

  renderItemList(list, containerEl, parentId = null, slotName = null) {
    const isThisListGap = this.activeTarget &&
      this.activeTarget.type === 'gap' &&
      (this.activeTarget.parentId || null) === parentId &&
      (this.activeTarget.slot || null) === slotName;

    // Si el cursor gap está en el inicio de esta lista (índice 0)
    if (isThisListGap && this.activeTarget.index === 0) {
      const gapCursor = document.createElement('span');
      const nextIsTemplate = list[0] && list[0].type !== 'text';
      gapCursor.className = `cursor-blink gap-cursor ${nextIsTemplate ? 'gap-template-cursor' : ''}`;
      containerEl.appendChild(gapCursor);
    }

    list.forEach((item, idx) => {
      if (item.type === 'text') {
        const span = document.createElement('span');
        const isOp = this.isOperator(item.val);
        const prevItem = idx > 0 ? list[idx - 1] : null;
        const isUnaryMinus = item.val === '-' && (idx === 0 || (prevItem && prevItem.type === 'text' && (this.isOperator(prevItem.val) || prevItem.val === '(')));
        const isParen = item.val === '(' || item.val === ')';
        const parenLevel = isParen ? this.getParenScaleLevel(list, idx) : 0;

        if (isParen && parenLevel > 0) {
          span.className = `math-text-token math-paren-token math-paren-tall paren-level-${parenLevel}`;
          const pathData = item.val === '('
            ? 'M 6.5 1 C 1.2 9, 1.2 31, 6.5 39'
            : 'M 1.5 1 C 6.8 9, 6.8 31, 1.5 39';
          span.innerHTML = `<svg class="paren-svg" viewBox="0 0 8 40" preserveAspectRatio="none" aria-hidden="true"><path d="${pathData}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
        } else {
          span.className = `math-text-token ${isUnaryMinus ? 'math-unary-token' : (isOp ? 'math-op-token' : (isParen ? 'math-paren-token' : ''))}`;
          span.textContent = this.formatSingleChar(item.val);
        }

        span.addEventListener('click', (e) => {
          e.stopPropagation();
          let clickRightHalf = true;
          if (typeof span.getBoundingClientRect === 'function' && typeof e.clientX === 'number') {
            const rect = span.getBoundingClientRect();
            if (rect.width > 0) {
              clickRightHalf = (e.clientX - rect.left) >= (rect.width / 2);
            }
          }
          const targetIndex = clickRightHalf ? idx + 1 : idx;
          this.playKeySound('slot');
          if (this.isEvaluated) {
            this.isEvaluated = false;
          }
          this.activeTarget = {
            type: 'gap',
            parentId,
            slot: slotName,
            index: targetIndex
          };
          this.normalizeActiveTarget();
          this.updateDisplay();
        });
        containerEl.appendChild(span);

      } else if (item.type === 'fraction') {
        const fracBlock = document.createElement('div');
        const isFracFocused = this.isNodeFocused(item.id);
        const isCompound = item.num.some(it => it.type === 'fraction') || item.den.some(it => it.type === 'fraction');
        fracBlock.className = `math-fraction-block ${isCompound ? 'is-compound-fraction' : ''} ${isFracFocused ? 'has-focus' : ''}`;
        fracBlock.title = 'Fracción: clic en numerador o denominador para escribir';

        // Numerador
        const isNumActive = this.isSlotActive(item.id, 'num');
        const numSlot = document.createElement('div');
        numSlot.className = `frac-slot frac-num ${isNumActive ? 'is-active' : ''} ${item.num.length === 0 ? 'is-empty' : ''}`;
        if (item.num.length === 0) {
          numSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.num, numSlot, item.id, 'num');
        }
        if (this.isSlotEndCursor(item.id, 'num')) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          numSlot.appendChild(cursor);
        }
        numSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'num');
        });

        // Barra horizontal
        const fracLine = document.createElement('div');
        fracLine.className = 'frac-divider-bar';

        // Denominador
        const isDenActive = this.isSlotActive(item.id, 'den');
        const denSlot = document.createElement('div');
        denSlot.className = `frac-slot frac-den ${isDenActive ? 'is-active' : ''} ${item.den.length === 0 ? 'is-empty' : ''}`;
        if (item.den.length === 0) {
          denSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.den, denSlot, item.id, 'den');
        }
        if (this.isSlotEndCursor(item.id, 'den')) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          denSlot.appendChild(cursor);
        }
        denSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'den');
        });

        fracBlock.appendChild(numSlot);
        fracBlock.appendChild(fracLine);
        fracBlock.appendChild(denSlot);
        containerEl.appendChild(fracBlock);

      } else if (item.type === 'power') {
        const powerBlock = document.createElement('div');
        const isPowerFocused = this.isNodeFocused(item.id);
        powerBlock.className = `math-power-block ${isPowerFocused ? 'has-focus' : ''}`;
        powerBlock.title = 'Potencia: clic en base o exponente para escribir';

        // Base
        const isBaseActive = this.isSlotActive(item.id, 'base');
        const baseSlot = document.createElement('div');
        baseSlot.className = `power-slot power-base ${isBaseActive ? 'is-active' : ''} ${item.base.length === 0 ? 'is-empty' : ''}`;
        if (item.base.length === 0) {
          baseSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.base, baseSlot, item.id, 'base');
        }
        if (this.isSlotEndCursor(item.id, 'base')) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          baseSlot.appendChild(cursor);
        }
        baseSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'base');
        });

        // Exponente
        const isExpActive = this.isSlotActive(item.id, 'exp');
        const expSlot = document.createElement('div');
        expSlot.className = `power-slot power-exp ${isExpActive ? 'is-active' : ''} ${item.exp.length === 0 ? 'is-empty' : ''}`;
        if (item.exp.length === 0) {
          expSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.exp, expSlot, item.id, 'exp');
        }
        if (this.isSlotEndCursor(item.id, 'exp')) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          expSlot.appendChild(cursor);
        }
        expSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'exp');
        });

        powerBlock.appendChild(baseSlot);
        powerBlock.appendChild(expSlot);
        containerEl.appendChild(powerBlock);

      } else if (item.type === 'radical') {
        const radBlock = document.createElement('div');
        const isRadFocused = this.isNodeFocused(item.id);
        radBlock.className = `math-radical-block ${isRadFocused ? 'has-focus' : ''}`;
        radBlock.title = 'Raíz: clic en el índice o en el radicando para escribir';

        // Índice (arriba a la izquierda)
        const indexContainer = document.createElement('div');
        indexContainer.className = 'radical-index-container';

        const isIndexActive = this.isSlotActive(item.id, 'index');
        const indexSlot = document.createElement('div');
        indexSlot.className = `radical-slot radical-index ${isIndexActive ? 'is-active' : ''} ${item.index.length === 0 ? 'is-empty' : ''}`;
        if (item.index.length === 0) {
          indexSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.index, indexSlot, item.id, 'index');
        }
        if (this.isSlotEndCursor(item.id, 'index')) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          indexSlot.appendChild(cursor);
        }
        indexSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'index');
        });
        indexContainer.appendChild(indexSlot);

        // Cuerpo de la raíz: Símbolo radical SVG + Radicando con vinculum
        const radBody = document.createElement('div');
        radBody.className = 'radical-body';

        const glyphDiv = document.createElement('div');
        glyphDiv.className = 'radical-sign-glyph';
        glyphDiv.innerHTML = `<svg class="radical-svg" viewBox="0 0 14 32" preserveAspectRatio="none"><path d="M 1 18 L 4 28 L 12 2 L 14 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        const radicandWrapper = document.createElement('div');
        radicandWrapper.className = 'radical-radicand-wrapper';

        const isRadActive = this.isSlotActive(item.id, 'radicand');
        const radicandSlot = document.createElement('div');
        radicandSlot.className = `radical-slot radical-radicand ${isRadActive ? 'is-active' : ''} ${item.radicand.length === 0 ? 'is-empty' : ''}`;
        if (item.radicand.length === 0) {
          radicandSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.radicand, radicandSlot, item.id, 'radicand');
        }
        if (this.isSlotEndCursor(item.id, 'radicand')) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          radicandSlot.appendChild(cursor);
        }
        radicandSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'radicand');
        });

        radicandWrapper.appendChild(radicandSlot);
        radBody.appendChild(glyphDiv);
        radBody.appendChild(radicandWrapper);

        radBlock.appendChild(indexContainer);
        radBlock.appendChild(radBody);
        containerEl.appendChild(radBlock);
      }

      // Si el cursor gap está inmediatamente después de este elemento
      if (isThisListGap && this.activeTarget.index === idx + 1) {
        const gapCursor = document.createElement('span');
        const nextItem = list[idx + 1];
        const betweenTemplates = item.type !== 'text' || (nextItem && nextItem.type !== 'text');
        gapCursor.className = `cursor-blink gap-cursor ${betweenTemplates ? 'gap-template-cursor' : ''}`;
        containerEl.appendChild(gapCursor);
      }
    });
  }

  renderResultLine(numVal, symbolLabel = '=') {
    const formattedDec = this.formatNumber(numVal);
    const fracStr = this.decimalToFraction(numVal);
    this.currentFractionString = fracStr;

    const displayStr = (this.showingFractionResult && fracStr) ? fracStr : formattedDec;
    this.dom.displayResult.textContent = displayStr;
    this.dom.previewLabel.textContent = symbolLabel;

    // Ajustar tamaño de fuente dinámicamente si el resultado es muy largo
    this.dom.displayResult.classList.remove('result-medium', 'result-compact');
    if (displayStr.length > 20) {
      this.dom.displayResult.classList.add('result-compact');
    } else if (displayStr.length > 13) {
      this.dom.displayResult.classList.add('result-medium');
    }

    if (this.dom.badgeFracMode) {
      if (fracStr) {
        this.dom.badgeFracMode.classList.remove('hidden');
        this.dom.badgeFracMode.textContent = this.showingFractionResult ? `DEC: ${formattedDec}` : `FRAC: ${fracStr}`;
        this.dom.badgeFracMode.title = 'Haz clic para alternar entre Decimal y Fracción exacta';
      } else {
        this.dom.badgeFracMode.classList.add('hidden');
      }
    }
  }

  updateDisplay() {
    this.normalizeList();
    this.normalizeActiveTarget();

    this.dom.displayResult.classList.remove('error-state');
    this.dom.displayExpression.innerHTML = '';

    if (this.items.length === 0) {
      const zeroSpan = document.createElement('span');
      zeroSpan.className = 'math-text-token';
      zeroSpan.textContent = '0';
      this.dom.displayExpression.appendChild(zeroSpan);

      const cursor = document.createElement('span');
      cursor.className = 'cursor-blink';
      this.dom.displayExpression.appendChild(cursor);
    } else {
      this.renderItemList(this.items, this.dom.displayExpression, null, null);

      // Si el cursor está en la línea principal al final y activeTarget === null
      if (this.activeTarget === null && !this.isEvaluated) {
        const mainCursor = document.createElement('span');
        mainCursor.className = 'cursor-blink';
        this.dom.displayExpression.appendChild(mainCursor);
      }
    }

    // Permitir clic en el área vacía del visor para volver al final de la línea principal
    this.dom.displayExpression.onclick = (e) => {
      if (e.target === this.dom.displayExpression || (e.target.classList && e.target.classList.contains('display-expression-wrapper'))) {
        if (this.isEvaluated) {
          this.isEvaluated = false;
        }
        this.activeTarget = null;
        this.updateDisplay();
      }
    };

    // Hacer que la pantalla siga automáticamente al cursor activo
    if (typeof this.dom.displayExpression.querySelector === 'function') {
      const activeCursorEl = this.dom.displayExpression.querySelector('.cursor-blink');
      if (activeCursorEl && typeof activeCursorEl.scrollIntoView === 'function') {
        activeCursorEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    // 2. Línea de Resultado / Vista Previa en tiempo real
    if (this.isEvaluated) {
      this.renderResultLine(this.numericValue, '=');
    } else {
      if (this.items.length > 0) {
        let formula = this.toFormula();
        // Si la expresión termina temporalmente en un operador mientras el usuario escribe, evaluar la parte válida previa
        const cleanFormula = formula.replace(/[\+\-\*\/]+$/, '');
        const openP = (cleanFormula.match(/\(/g) || []).length;
        const closeP = (cleanFormula.match(/\)/g) || []).length;
        const balancedFormula = openP > closeP ? cleanFormula + ')'.repeat(openP - closeP) : cleanFormula;

        if (balancedFormula) {
          const previewVal = this.evaluateMath(balancedFormula);
          if (previewVal !== null && !isNaN(previewVal) && isFinite(previewVal)) {
            this.numericValue = previewVal;
            this.renderResultLine(previewVal, '≈');
            return;
          }
        }
      }
      this.dom.displayResult.textContent = this.lastResult;
      this.dom.previewLabel.textContent = '=';
      if (this.dom.badgeFracMode) {
        this.dom.badgeFracMode.classList.add('hidden');
      }
    }
  }

  /* ==========================================================================
     HISTORIAL / PILA HP PRIME (STACK)
     ========================================================================== */
  formatSummary(list) {
    return list.map(item => {
      if (item.type === 'text') return item.val;
      if (item.type === 'fraction') return `(${this.formatSummary(item.num) || '□'}/${this.formatSummary(item.den) || '□'})`;
      if (item.type === 'power') return `(${this.formatSummary(item.base) || '□'}^${this.formatSummary(item.exp) || '□'})`;
      if (item.type === 'radical') {
        const idx = this.formatSummary(item.index);
        return `${idx ? idx : ''}√(${this.formatSummary(item.radicand) || '□'})`;
      }
      return '';
    }).join('');
  }

  addToHistory(itemsSnapshot, result) {
    this.historyStack.unshift({
      id: Date.now(),
      index: this.historyStack.length + 1,
      items: itemsSnapshot,
      result
    });

    if (this.historyStack.length > 30) {
      this.historyStack.pop();
    }

    this.saveHistorySetting();
    this.renderHistory();
  }

  clearHistory() {
    this.playKeySound('clear');
    this.historyStack = [];
    this.saveHistorySetting();
    this.renderHistory();
    this.showToast('Historial borrado');
  }

  renderHistory() {
    if (!this.dom.stackList) return;
    if (this.historyStack.length === 0) {
      this.dom.stackList.innerHTML = '';
      if (this.dom.stackEmptyNotice) {
        this.dom.stackList.appendChild(this.dom.stackEmptyNotice);
      }
      return;
    }

    this.dom.stackList.innerHTML = '';
    this.historyStack.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'stack-row';
      row.title = 'Haz clic para restaurar esta operación en pantalla';

      const indexSpan = document.createElement('span');
      indexSpan.className = 'stack-index';
      indexSpan.textContent = `${this.historyStack.length - idx}:`;

      const exprSpan = document.createElement('span');
      exprSpan.className = 'stack-expr';
      exprSpan.textContent = this.formatExpression(this.formatSummary(entry.items));

      const resultSpan = document.createElement('span');
      resultSpan.className = 'stack-result';
      resultSpan.textContent = entry.result;

      row.appendChild(indexSpan);
      row.appendChild(exprSpan);
      row.appendChild(resultSpan);

      row.addEventListener('click', () => {
        this.playKeySound('default');
        this.items = JSON.parse(JSON.stringify(entry.items));
        this.normalizeList();
        this.activeTarget = null;
        this.isEvaluated = false;
        this.updateDisplay();
        this.showToast('Operación restaurada en pantalla');
      });

      this.dom.stackList.appendChild(row);
    });
  }

  /* ==========================================================================
     PORTAPAPELES Y NOTIFICACIÓN TOAST
     ========================================================================== */
  copyResultToClipboard() {
    this.playKeySound('default');
    const valueToCopy = this.isEvaluated ? this.lastResult : this.dom.displayResult.textContent;
    navigator.clipboard.writeText(valueToCopy || '0').then(() => {
      this.showToast(`Copiado: ${valueToCopy}`);
    }).catch(() => {
      this.showToast('Error al copiar');
    });
  }

  showToast(message) {
    if (!this.dom.toast || !this.dom.toastMessage) return;
    this.dom.toastMessage.textContent = message;
    this.dom.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.dom.toast.classList.remove('show');
    }, 2200);
  }

  /* ==========================================================================
     VINCULACIÓN DE EVENTOS (TECLADO FÍSICO, REPETICIÓN CONTINUA Y BOTONERA)
     ========================================================================== */
  bindEvents() {
    // 1. Clics en la botonera física del chasis + soporte de mantener presionado para ◀, ▶ y ⌫
    document.querySelectorAll('.key-btn').forEach(btn => {
      const key = btn.getAttribute('data-key');
      const action = btn.getAttribute('data-action');
      const isRepeatable = action === 'arrow-left' || action === 'arrow-right' || action === 'backspace';

      let holdTimer = null;
      let repeatInterval = null;
      let didRepeat = false;

      const clearRepeat = () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (repeatInterval) {
          clearInterval(repeatInterval);
          repeatInterval = null;
        }
      };

      if (isRepeatable) {
        btn.addEventListener('pointerdown', (e) => {
          if (e.button && e.button !== 0) return;
          didRepeat = false;
          clearRepeat();
          holdTimer = setTimeout(() => {
            didRepeat = true;
            repeatInterval = setInterval(() => {
              this.executeAction(action);
            }, 75);
          }, 360);
        });
        btn.addEventListener('pointerup', clearRepeat);
        btn.addEventListener('pointerleave', clearRepeat);
        btn.addEventListener('pointercancel', clearRepeat);
      }

      btn.addEventListener('click', () => {
        if (didRepeat) {
          didRepeat = false;
          return;
        }
        if (key !== null) {
          this.appendCharacter(key);
        } else if (action) {
          this.executeAction(action);
        }
      });
    });

    // 2. Barra de Estado e Iconos
    if (this.dom.btnToggleSound) {
      this.dom.btnToggleSound.addEventListener('click', () => this.toggleSound());
    }
    if (this.dom.btnCopyResult) {
      this.dom.btnCopyResult.addEventListener('click', () => this.copyResultToClipboard());
    }
    if (this.dom.btnToggleAngle) {
      this.dom.btnToggleAngle.addEventListener('click', () => {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.dom.btnToggleAngle.textContent = this.angleMode;
        this.playKeySound('default');
        this.showToast(`Modo: ${this.angleMode}`);
      });
    }
    if (this.dom.badgeFracMode) {
      this.dom.badgeFracMode.addEventListener('click', () => this.toggleFractionResult());
    }

    // 3. Teclado Físico
    window.addEventListener('keydown', (e) => this.handlePhysicalKeyboard(e));
  }

  executeAction(action) {
    switch (action) {
      case 'clear':
        this.clearAll();
        break;
      case 'backspace':
        this.backspace();
        break;
      case 'evaluate':
        this.evaluate();
        break;
      case 'fraction':
        this.insertFractionTemplate();
        break;
      case 'sqrt':
        this.insertRadicalTemplate();
        break;
      case 'power':
        this.insertPowerTemplate();
        break;
      case 'arrow-left':
        this.navigateSlot('left');
        break;
      case 'arrow-right':
        this.navigateSlot('right');
        break;
      case 'sign':
        this.toggleSign();
        break;
      case 'percent':
        this.applyPercent();
        break;
    }
  }

  handlePhysicalKeyboard(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let matchedButtonId = null;

    if (e.key >= '0' && e.key <= '9') {
      matchedButtonId = `key-${e.key}`;
      this.appendCharacter(e.key);
      e.preventDefault();
    } else if (e.key === '.' || e.key === ',') {
      matchedButtonId = 'key-dot';
      this.appendCharacter('.');
      e.preventDefault();
    } else if (e.key === '+') {
      matchedButtonId = 'key-add';
      this.appendCharacter('+');
      e.preventDefault();
    } else if (e.key === '-') {
      matchedButtonId = 'key-subtract';
      this.appendCharacter('-');
      e.preventDefault();
    } else if (e.key === '*' || e.key === 'x' || e.key === 'X') {
      matchedButtonId = 'key-multiply';
      this.appendCharacter('*');
      e.preventDefault();
    } else if (e.key === '/') {
      matchedButtonId = 'key-divide';
      this.appendCharacter('/');
      e.preventDefault();
    } else if (e.key === '^' || e.key.toLowerCase() === 'p') {
      matchedButtonId = 'key-power';
      this.insertPowerTemplate();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'q') {
      matchedButtonId = 'key-sqrt';
      this.insertRadicalTemplate();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'f') {
      matchedButtonId = 'key-frac';
      this.insertFractionTemplate();
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      this.navigateSlot('down');
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      this.navigateSlot('up');
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      matchedButtonId = 'key-arrow-right';
      this.navigateSlot('right');
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      matchedButtonId = 'key-arrow-left';
      this.navigateSlot('left');
      e.preventDefault();
    } else if (e.key === 'Home') {
      const stops = this.getAllNavigableStops();
      if (stops.length > 0) {
        this.playKeySound('slot');
        this.applyStop(stops[0]);
        this.updateDisplay();
      }
      e.preventDefault();
    } else if (e.key === 'End') {
      this.playKeySound('slot');
      this.activeTarget = null;
      this.updateDisplay();
      e.preventDefault();
    } else if (e.key === '(') {
      matchedButtonId = 'key-paren-open';
      this.appendCharacter('(');
      e.preventDefault();
    } else if (e.key === ')') {
      matchedButtonId = 'key-paren-close';
      this.appendCharacter(')');
      e.preventDefault();
    } else if (e.key === '%') {
      this.applyPercent();
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === '=') {
      matchedButtonId = 'key-enter';
      this.evaluate();
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      matchedButtonId = 'key-delete';
      this.backspace();
      e.preventDefault();
    } else if (e.key === 'Delete') {
      matchedButtonId = 'key-delete';
      this.deleteForward();
      e.preventDefault();
    } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
      matchedButtonId = 'key-clear';
      this.clearAll();
      e.preventDefault();
    }

    // Efecto visual de tecla física pulsada en el chasis
    if (matchedButtonId) {
      const btn = document.getElementById(matchedButtonId);
      if (btn) {
        btn.classList.add('active-press');
        setTimeout(() => {
          btn.classList.remove('active-press');
        }, 110);
      }
    }
  }
}

// Inicializar la calculadora al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  window.primeCalc = new HPPrimeCalculator();
});
