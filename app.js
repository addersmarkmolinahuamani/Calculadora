/**
 * CALCULADORA PRIME - INSPIRADA EN HP PRIME
 * Motor de plantillas matemáticas interactivas (Textbook Math AST)
 * Soporta anidación recursiva completa:
 * - Raíz dentro de numerador/denominador de fracción
 * - Fracción dentro de la raíz o dentro de potencias
 * - Potencias en cualquier recuadro con recuadros punteados en vivo
 */

class HPPrimeCalculator {
  constructor() {
    // Árbol sintáctico de la expresión (AST recursivo)
    // Nodos soportados:
    // - Texto: { type: 'text', val: '5 + ' }
    // - Fracción: { type: 'fraction', id: 1, num: [...], den: [...] }
    // - Potencia: { type: 'power', id: 2, base: [...], exp: [...] }
    // - Raíz: { type: 'radical', id: 3, index: [...], radicand: [...] }
    this.items = [];
    
    // Foco actual: null (línea principal) o { id: number, slot: string }
    this.activeTarget = null;
    this.templateCounter = 0;

    // Estado del cálculo
    this.lastResult = '0';
    this.numericValue = 0;
    this.isEvaluated = false;
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
    const saved = localStorage.getItem('hp_prime_sound');
    if (saved !== null) {
      this.soundEnabled = saved === 'true';
    }
    this.updateSoundIcons();
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('hp_prime_sound', this.soundEnabled);
    this.updateSoundIcons();
    this.showToast(this.soundEnabled ? 'Sonido activado' : 'Sonido desactivado');
    if (this.soundEnabled) {
      this.playKeySound('default');
    }
  }

  updateSoundIcons() {
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
      this.dom.systemTime.textContent = `${hours}:${minutes}`;
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
      this.dom.batteryLevel.style.width = '100%';
    }
  }

  /* ==========================================================================
     NAVEGACIÓN EN ÁRBOL SINTÁCTICO (AST HELPERS)
     ========================================================================== */

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
      if (idx < list.length) {
        list.splice(idx, 0, node);
      } else {
        list.push(node);
      }
      return;
    }
    list.push(node);
  }

  /**
   * Extrae el último número escrito en una lista para transferirlo a base o numerador
   */
  extractTrailingNumber(list) {
    if (list.length > 0 && list[list.length - 1].type === 'text') {
      const lastText = list[list.length - 1];
      const match = lastText.val.match(/(\d+\.?\d*)$/);
      if (match) {
        const num = match[0];
        lastText.val = lastText.val.slice(0, -num.length);
        if (lastText.val === '') {
          list.pop();
        }
        return num;
      }
    }
    return '';
  }

  /* ==========================================================================
     INSERCIÓN DE PLANTILLAS ANIDABLES (FRACCIÓN, RAÍZ, POTENCIA)
     ========================================================================== */

  /**
   * 1. PLANTILLA DE FRACCIÓN [ □ / □ ]
   * Se inserta directamente en el recuadro activo o en la línea principal
   */
  insertFractionTemplate() {
    this.playKeySound('slot');

    if (this.isEvaluated) {
      this.clearAll(false);
    }

    const list = this.getActiveList();
    const initialNum = this.extractTrailingNumber(list);

    this.templateCounter++;
    const newFrac = {
      type: 'fraction',
      id: this.templateCounter,
      num: initialNum !== '' ? [{ type: 'text', val: initialNum }] : [],
      den: []
    };

    this.insertNodeIntoActiveList(newFrac);

    if (initialNum !== '') {
      this.activeTarget = { id: newFrac.id, slot: 'den' };
      this.showToast(`Numerador ${initialNum} • Escribe el denominador`);
    } else {
      this.activeTarget = { id: newFrac.id, slot: 'num' };
      this.showToast('Plantilla de Fracción • Escribe el numerador');
    }

    this.updateDisplay();
  }

  /**
   * 2. PLANTILLA DE RAÍZ CON ÍNDICE Y RADICANDO [ ⁿ√□ ]
   * Se inserta directamente en el recuadro activo (ej. numerador) o en la línea principal
   */
  insertRadicalTemplate() {
    this.playKeySound('slot');

    if (this.isEvaluated) {
      this.clearAll(false);
    }

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
    this.showToast('Plantilla de Raíz • Escribe dentro de la raíz (o en el radical)');

    this.updateDisplay();
  }

  /**
   * 3. PLANTILLA DE POTENCIA [ □^□ ]
   * Se inserta directamente en el recuadro activo o en la línea principal
   */
  insertPowerTemplate() {
    this.playKeySound('slot');

    if (this.isEvaluated) {
      this.clearAll(false);
    }

    const list = this.getActiveList();
    const initialBase = this.extractTrailingNumber(list);

    this.templateCounter++;
    const newPow = {
      type: 'power',
      id: this.templateCounter,
      base: initialBase !== '' ? [{ type: 'text', val: initialBase }] : [],
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
   * Obtiene todas las paradas navegables (recuadros y espacios intermedios entre plantillas)
   * en orden visual de lectura (de izquierda a derecha).
   */
  getAllNavigableStops(items = this.items) {
    const stops = [];

    const traverseList = (list, parentId = null, slotName = null) => {
      if (!list || list.length === 0) return;

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const prevItem = i > 0 ? list[i - 1] : null;

        // 1. Espacios (gaps) antes de plantillas o entre plantillas
        if (i === 0) {
          if (item.type !== 'text') {
            stops.push({
              type: 'gap',
              parentId,
              slot: slotName,
              index: 0,
              label: parentId ? 'Inicio de casilla' : 'Inicio de la expresión'
            });
          }
        } else {
          if (item.type !== 'text') {
            stops.push({
              type: 'gap',
              parentId,
              slot: slotName,
              index: i,
              label: prevItem.type !== 'text' ? 'Espacio entre plantillas' : 'Espacio de operador'
            });
          }
        }

        // 2. Recuadros interactivos de cada plantilla
        if (item.type === 'fraction') {
          const hasChildTemplatesNum = item.num.some(it => it.type !== 'text');
          if (!hasChildTemplatesNum) {
            stops.push({ id: item.id, slot: 'num', type: 'slot', label: 'Numerador' });
          }
          traverseList(item.num, item.id, 'num');

          const hasChildTemplatesDen = item.den.some(it => it.type !== 'text');
          if (!hasChildTemplatesDen) {
            stops.push({ id: item.id, slot: 'den', type: 'slot', label: 'Denominador' });
          }
          traverseList(item.den, item.id, 'den');
        } else if (item.type === 'radical') {
          const hasChildTemplatesIdx = item.index.some(it => it.type !== 'text');
          if (!hasChildTemplatesIdx) {
            stops.push({ id: item.id, slot: 'index', type: 'slot', label: 'Índice del radical' });
          }
          traverseList(item.index, item.id, 'index');

          const hasChildTemplatesRad = item.radicand.some(it => it.type !== 'text');
          if (!hasChildTemplatesRad) {
            stops.push({ id: item.id, slot: 'radicand', type: 'slot', label: 'Radicando (dentro de la raíz)' });
          }
          traverseList(item.radicand, item.id, 'radicand');
        } else if (item.type === 'power') {
          const hasChildTemplatesBase = item.base.some(it => it.type !== 'text');
          if (!hasChildTemplatesBase) {
            stops.push({ id: item.id, slot: 'base', type: 'slot', label: 'Base' });
          }
          traverseList(item.base, item.id, 'base');

          const hasChildTemplatesExp = item.exp.some(it => it.type !== 'text');
          if (!hasChildTemplatesExp) {
            stops.push({ id: item.id, slot: 'exp', type: 'slot', label: 'Exponente' });
          }
          traverseList(item.exp, item.id, 'exp');
        }
      }

      // Espacio después de la última plantilla en la lista
      const lastItem = list[list.length - 1];
      if (lastItem && lastItem.type !== 'text') {
        stops.push({
          type: 'gap',
          parentId,
          slot: slotName,
          index: list.length,
          label: parentId ? 'Final de casilla' : 'Final de la expresión'
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
      return stop.type === 'gap' &&
             (stop.parentId || null) === (target.parentId || null) &&
             (stop.slot || null) === (target.slot || null) &&
             stop.index === target.index;
    }
    return stop.type === 'slot' && stop.id === target.id && stop.slot === target.slot;
  }

  applyStop(stop) {
    if (!stop) return;
    if (stop.type === 'gap') {
      if (!stop.parentId && stop.index === this.items.length) {
        this.activeTarget = null;
        this.showToast('Línea principal (final)');
      } else {
        this.activeTarget = {
          type: 'gap',
          parentId: stop.parentId || null,
          slot: stop.slot || null,
          index: stop.index
        };
        this.showToast(stop.label || 'Espacio entre plantillas');
      }
    } else {
      this.activeTarget = { id: stop.id, slot: stop.slot };
      this.showToast(stop.label || 'Casilla activa');
    }
  }

  /**
   * Navega fluidamente entre recuadros punteados y espacios intermedios (izquierda/derecha/arriba/abajo)
   */
  navigateSlot(direction) {
    this.playKeySound('slot');

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
        // En la primera parada (índice 0)
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
        this.showToast('Línea principal (final)');
      }
    } else if (direction === 'up' || direction === 'down' || direction === 'toggle') {
      if (!this.activeTarget || this.activeTarget.type === 'gap') {
        const target = direction === 'up' ? stops[stops.length - 1] : stops[0];
        this.applyStop(target);
      } else {
        const info = this.findNodeAndParent(this.activeTarget.id);
        if (info && info.node) {
          const { node } = info;
          const slot = this.activeTarget.slot;
          if (node.type === 'fraction') {
            this.activeTarget.slot = slot === 'num' ? 'den' : 'num';
            this.showToast(this.activeTarget.slot === 'num' ? 'Numerador' : 'Denominador');
          } else if (node.type === 'radical') {
            this.activeTarget.slot = slot === 'radicand' ? 'index' : 'radicand';
            this.showToast(this.activeTarget.slot === 'index' ? 'Índice del radical' : 'Radicando');
          } else if (node.type === 'power') {
            this.activeTarget.slot = slot === 'base' ? 'exp' : 'base';
            this.showToast(this.activeTarget.slot === 'base' ? 'Base' : 'Exponente');
          }
        }
      }
    }

    this.updateDisplay();
  }

  /* ==========================================================================
     ENTRADA DE CARACTERES
     ========================================================================== */
  appendCharacter(char) {
    this.playKeySound('default');

    if (this.isEvaluated) {
      if (this.isOperator(char)) {
        this.items = [{ type: 'text', val: this.lastResult + ' ' + char + ' ' }];
      } else {
        this.items = [];
        if (char === '.') {
          this.items.push({ type: 'text', val: '0.' });
        } else {
          this.items.push({ type: 'text', val: char });
        }
      }
      this.activeTarget = null;
      this.isEvaluated = false;
      this.updateDisplay();
      return;
    }

    // Manejo de entrada cuando el cursor está en un espacio intermedio (gap)
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      const list = this.getActiveList();
      let gapIdx = typeof this.activeTarget.index === 'number' ? this.activeTarget.index : list.length;
      if (gapIdx > list.length) gapIdx = list.length;

      // 1. Operador aritmético (+, -, *, /)
      if (this.isOperator(char)) {
        if (gapIdx > 0 && list[gapIdx - 1].type === 'text') {
          const prevText = list[gapIdx - 1];
          const trimmed = prevText.val.trim();
          const lastChar = trimmed.slice(-1);
          if (this.isOperator(lastChar)) {
            prevText.val = trimmed.slice(0, -1) + ' ' + char + ' ';
            this.updateDisplay();
            return;
          } else {
            prevText.val += ' ' + char + ' ';
            this.updateDisplay();
            return;
          }
        } else {
          const opStr = (char === '-' && (gapIdx === 0 || (gapIdx > 0 && list[gapIdx - 1].type !== 'text'))) ? '-' : (' ' + char + ' ');
          list.splice(gapIdx, 0, { type: 'text', val: opStr });
          this.activeTarget.index = gapIdx + 1;
          this.updateDisplay();
          return;
        }
      }

      // 2. Punto decimal (.)
      if (char === '.') {
        if (gapIdx > 0 && list[gapIdx - 1].type === 'text') {
          const prevText = list[gapIdx - 1];
          if (!prevText.val.includes('.')) {
            prevText.val += '.';
            this.updateDisplay();
            return;
          }
        } else {
          list.splice(gapIdx, 0, { type: 'text', val: '0.' });
          this.activeTarget.index = gapIdx + 1;
          this.updateDisplay();
          return;
        }
      }

      // 3. Dígitos y otros símbolos (números, paréntesis)
      if (gapIdx > 0 && list[gapIdx - 1].type === 'text' && !this.isOperator(list[gapIdx - 1].val.trim().slice(-1))) {
        list[gapIdx - 1].val += char;
      } else {
        list.splice(gapIdx, 0, { type: 'text', val: char });
        this.activeTarget.index = gapIdx + 1;
      }
      this.updateDisplay();
      return;
    }

    const list = this.getActiveList();

    // 1. Punto decimal
    if (char === '.') {
      if (list.length === 0 || list[list.length - 1].type !== 'text') {
        list.push({ type: 'text', val: '0.' });
        this.updateDisplay();
        return;
      }
      const lastText = list[list.length - 1];
      const parts = lastText.val.split(/[\+\-\*\/]/);
      const curr = parts[parts.length - 1];
      if (curr.includes('.')) return;
      if (curr === '' || this.isOperator(lastText.val.slice(-1))) {
        lastText.val += '0.';
        this.updateDisplay();
        return;
      }
      lastText.val += '.';
      this.updateDisplay();
      return;
    }

    // 2. Operador aritmético (+, -, *, /)
    if (this.isOperator(char)) {
      if (list.length === 0 || list[list.length - 1].type !== 'text') {
        if (char === '-') {
          list.push({ type: 'text', val: '-' });
        } else {
          list.push({ type: 'text', val: ' ' + char + ' ' });
        }
        this.updateDisplay();
        return;
      }

      const lastText = list[list.length - 1];
      if (lastText.val === '' && char === '-') {
        lastText.val = '-';
        this.updateDisplay();
        return;
      }

      const trimmed = lastText.val.trim();
      const lastChar = trimmed.slice(-1);
      if (this.isOperator(lastChar)) {
        lastText.val = trimmed.slice(0, -1) + ' ' + char + ' ';
        this.updateDisplay();
        return;
      }

      lastText.val += ' ' + char + ' ';
      this.updateDisplay();
      return;
    }

    // 3. Dígitos y otros símbolos
    if (list.length === 0 || list[list.length - 1].type !== 'text') {
      list.push({ type: 'text', val: '' });
    }
    const lastNode = list[list.length - 1];
    lastNode.val += char;

    this.updateDisplay();
  }

  isOperator(char) {
    return ['+', '-', '*', '/'].includes(char);
  }

  /* ==========================================================================
     BORRADO INTELIGENTE (BACKSPACE)
     ========================================================================== */
  backspace() {
    this.playKeySound('clear');

    if (this.isEvaluated) {
      this.clearAll();
      return;
    }

    // Borrado inteligente cuando se está en un espacio intermedio (gap)
    if (this.activeTarget && this.activeTarget.type === 'gap') {
      const list = this.getActiveList();
      let gapIdx = typeof this.activeTarget.index === 'number' ? this.activeTarget.index : list.length;
      if (gapIdx > list.length) gapIdx = list.length;

      if (gapIdx > 0) {
        const itemToLeft = list[gapIdx - 1];
        if (itemToLeft.type === 'text') {
          const trimmed = itemToLeft.val.trimEnd();
          if (trimmed.length > 0) {
            itemToLeft.val = trimmed.slice(0, -1).trimEnd();
          } else {
            itemToLeft.val = '';
          }
          if (itemToLeft.val === '' || itemToLeft.val.trim() === '') {
            list.splice(gapIdx - 1, 1);
            this.activeTarget.index = Math.max(0, gapIdx - 1);
          }
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
        if (this.activeTarget.parentId) {
          this.activeTarget = { id: this.activeTarget.parentId, slot: this.activeTarget.slot };
          this.updateDisplay();
        }
        return;
      }
    }

    const list = this.getActiveList();

    if (list.length > 0) {
      const lastItem = list[list.length - 1];

      if (lastItem.type === 'text') {
        const trimmed = lastItem.val.trimEnd();
        if (trimmed.length > 0) {
          lastItem.val = trimmed.slice(0, -1).trimEnd();
        } else {
          lastItem.val = '';
        }
        if (lastItem.val === '' || lastItem.val.trim() === '') {
          list.pop();
        }
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

    // Si la casilla actual ya está vacía, moverse a la anterior o eliminar la plantilla
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
        return;
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
    if (this.dom.badgeFracMode) {
      this.dom.badgeFracMode.classList.add('hidden');
    }
    this.dom.displayResult.classList.remove('error-state');
    this.updateDisplay();
  }

  toggleSign() {
    this.playKeySound('default');
    const list = this.getActiveList();
    if (list.length > 0 && list[list.length - 1].type === 'text') {
      const lastText = list[list.length - 1];
      const match = lastText.val.match(/(-?\d+\.?\d*)$/);
      if (match) {
        const num = match[0];
        const toggled = num.startsWith('-') ? num.slice(1) : '-' + num;
        lastText.val = lastText.val.slice(0, -num.length) + toggled;
        this.updateDisplay();
      }
    }
  }

  applyPercent() {
    this.playKeySound('default');
    this.appendCharacter('%');
  }

  /* ==========================================================================
     EVALUACIÓN MATEMÁTICA Y FORMULACIÓN (RECURSIVA)
     ========================================================================== */
  toFormula(list = this.items) {
    let formula = list.map(item => {
      if (item.type === 'text') {
        return item.val.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      }
      if (item.type === 'fraction') {
        const numStr = this.toFormula(item.num).trim() || '0';
        const denStr = this.toFormula(item.den).trim() || '1';
        return `((${numStr}) / (${denStr}))`;
      }
      if (item.type === 'power') {
        const baseStr = this.toFormula(item.base).trim() || '0';
        const expStr = this.toFormula(item.exp).trim() || '1';
        return `(Math.pow((${baseStr}), (${expStr})))`;
      }
      if (item.type === 'radical') {
        const idxStr = this.toFormula(item.index).trim();
        const radStr = this.toFormula(item.radicand).trim() || '0';
        if (!idxStr || idxStr === '2') {
          return `(Math.sqrt(${radStr}))`;
        } else {
          return `(((${radStr}) < 0 && (${idxStr}) % 2 !== 0) ? -Math.pow(-(${radStr}), 1 / (${idxStr})) : Math.pow((${radStr}), 1 / (${idxStr})))`;
        }
      }
      return '';
    }).join('').trim();

    formula = formula.replace(/(\d+\.?\d*)%/g, '($1/100)');
    return formula;
  }

  evaluate() {
    this.playKeySound('enter');

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

  showError(message) {
    this.dom.displayResult.textContent = message;
    this.dom.displayResult.classList.add('error-state');
    this.dom.previewLabel.textContent = 'ERROR';
  }

  /* ==========================================================================
     ACTUALIZACIÓN VISUAL DE LA PANTALLA LCD (RENDER RECURSIVO)
     ========================================================================== */
  renderItemList(list, containerEl, parentId = null, slotName = null) {
    const isThisListGap = this.activeTarget &&
      this.activeTarget.type === 'gap' &&
      (this.activeTarget.parentId || null) === parentId &&
      (this.activeTarget.slot || null) === slotName;

    // Si el cursor gap está en el inicio de esta lista
    if (isThisListGap && this.activeTarget.index === 0) {
      const gapCursor = document.createElement('span');
      gapCursor.className = 'cursor-blink gap-cursor';
      containerEl.appendChild(gapCursor);
    }

    list.forEach((item, idx) => {
      if (item.type === 'text') {
        const span = document.createElement('span');
        span.className = 'math-text-token';
        span.textContent = this.formatExpression(item.val);
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          this.activeTarget = {
            type: 'gap',
            parentId,
            slot: slotName,
            index: idx + 1
          };
          this.showToast('Espacio de operador');
          this.updateDisplay();
        });
        containerEl.appendChild(span);
      } else if (item.type === 'fraction') {
        const fracBlock = document.createElement('div');
        const isFracFocused = this.activeTarget && this.activeTarget.id === item.id;
        fracBlock.className = `math-fraction-block ${isFracFocused ? 'has-focus' : ''}`;
        fracBlock.title = 'Fracción: clic en numerador o denominador para escribir';

        // Numerador
        const isNumActive = isFracFocused && this.activeTarget.slot === 'num';
        const numSlot = document.createElement('div');
        numSlot.className = `frac-slot frac-num ${isNumActive ? 'is-active' : ''} ${item.num.length === 0 ? 'is-empty' : ''}`;
        if (item.num.length === 0) {
          numSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.num, numSlot, item.id, 'num');
        }
        if (isNumActive) {
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
        const isDenActive = isFracFocused && this.activeTarget.slot === 'den';
        const denSlot = document.createElement('div');
        denSlot.className = `frac-slot frac-den ${isDenActive ? 'is-active' : ''} ${item.den.length === 0 ? 'is-empty' : ''}`;
        if (item.den.length === 0) {
          denSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.den, denSlot, item.id, 'den');
        }
        if (isDenActive) {
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
        const isPowerFocused = this.activeTarget && this.activeTarget.id === item.id;
        powerBlock.className = `math-power-block ${isPowerFocused ? 'has-focus' : ''}`;
        powerBlock.title = 'Potencia: clic en base o exponente para escribir';

        // Base
        const isBaseActive = isPowerFocused && this.activeTarget.slot === 'base';
        const baseSlot = document.createElement('div');
        baseSlot.className = `power-slot power-base ${isBaseActive ? 'is-active' : ''} ${item.base.length === 0 ? 'is-empty' : ''}`;
        if (item.base.length === 0) {
          baseSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.base, baseSlot, item.id, 'base');
        }
        if (isBaseActive) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          baseSlot.appendChild(cursor);
        }
        baseSlot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusSlot(item.id, 'base');
        });

        // Exponente
        const isExpActive = isPowerFocused && this.activeTarget.slot === 'exp';
        const expSlot = document.createElement('div');
        expSlot.className = `power-slot power-exp ${isExpActive ? 'is-active' : ''} ${item.exp.length === 0 ? 'is-empty' : ''}`;
        if (item.exp.length === 0) {
          expSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.exp, expSlot, item.id, 'exp');
        }
        if (isExpActive) {
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
        const isRadFocused = this.activeTarget && this.activeTarget.id === item.id;
        radBlock.className = `math-radical-block ${isRadFocused ? 'has-focus' : ''}`;
        radBlock.title = 'Raíz: clic en el índice o en el radicando para escribir';

        // Índice (arriba a la izquierda)
        const indexContainer = document.createElement('div');
        indexContainer.className = 'radical-index-container';

        const isIndexActive = isRadFocused && this.activeTarget.slot === 'index';
        const indexSlot = document.createElement('div');
        indexSlot.className = `radical-slot radical-index ${isIndexActive ? 'is-active' : ''} ${item.index.length === 0 ? 'is-empty' : ''}`;
        if (item.index.length === 0) {
          indexSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.index, indexSlot, item.id, 'index');
        }
        if (isIndexActive) {
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

        const isRadActive = isRadFocused && this.activeTarget.slot === 'radicand';
        const radicandSlot = document.createElement('div');
        radicandSlot.className = `radical-slot radical-radicand ${isRadActive ? 'is-active' : ''} ${item.radicand.length === 0 ? 'is-empty' : ''}`;
        if (item.radicand.length === 0) {
          radicandSlot.innerHTML = '<span class="box-prompt">□</span>';
        } else {
          this.renderItemList(item.radicand, radicandSlot, item.id, 'radicand');
        }
        if (isRadActive) {
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
        gapCursor.className = 'cursor-blink gap-cursor';
        containerEl.appendChild(gapCursor);
      }
    });
  }

  updateDisplay() {
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

    // Permitir clic en el área vacía del visor para volver a la línea principal
    this.dom.displayExpression.onclick = (e) => {
      if (e.target === this.dom.displayExpression || e.target.classList.contains('display-expression-wrapper')) {
        this.activeTarget = null;
        this.updateDisplay();
      }
    };

    // 2. Línea de Resultado / Vista Previa en tiempo real
    if (this.isEvaluated) {
      this.dom.displayResult.textContent = this.lastResult;
      this.dom.previewLabel.textContent = '=';
    } else {
      if (this.items.length > 0) {
        const formula = this.toFormula();
        if (formula) {
          const previewVal = this.evaluateMath(formula);
          if (previewVal !== null && !isNaN(previewVal) && isFinite(previewVal)) {
            this.dom.displayResult.textContent = this.formatNumber(previewVal);
            this.dom.previewLabel.textContent = '≈';
            return;
          }
        }
      }
      this.dom.displayResult.textContent = this.lastResult;
      this.dom.previewLabel.textContent = '=';
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

    this.renderHistory();
  }

  clearHistory() {
    this.playKeySound('clear');
    this.historyStack = [];
    this.renderHistory();
    this.showToast('Historial borrado');
  }

  renderHistory() {
    if (this.historyStack.length === 0) {
      this.dom.stackList.innerHTML = '';
      this.dom.stackList.appendChild(this.dom.stackEmptyNotice);
      return;
    }

    this.dom.stackList.innerHTML = '';
    this.historyStack.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'stack-row';
      row.title = 'Haz clic para reinsertar esta operación en pantalla';

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
    this.dom.toastMessage.textContent = message;
    this.dom.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.dom.toast.classList.remove('show');
    }, 2200);
  }

  /* ==========================================================================
     VINCULACIÓN DE EVENTOS (TECLADO FÍSICO Y BOTONERA)
     ========================================================================== */
  bindEvents() {
    // 1. Clics en la botonera física del chasis
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const key = target.getAttribute('data-key');
        const action = target.getAttribute('data-action');

        if (key !== null) {
          this.appendCharacter(key);
        } else if (action) {
          this.executeAction(action);
        }
      });
    });

    // 2. Barra de Estado e Iconos
    this.dom.btnToggleSound.addEventListener('click', () => this.toggleSound());
    this.dom.btnCopyResult.addEventListener('click', () => this.copyResultToClipboard());
    this.dom.btnToggleAngle.addEventListener('click', () => {
      this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
      this.dom.btnToggleAngle.textContent = this.angleMode;
      this.playKeySound('default');
      this.showToast(`Modo: ${this.angleMode}`);
    });

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
