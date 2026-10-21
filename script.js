/**
 * Ритм Дня v4.2 — Биометрическая система управления энергией, Календарём и Задачами
 * Оптимизировано для iPhone 16 Pro Max (iOS 27.0.1)
 * Новое в v4.2:
 *  - Автоматическая утренняя синхронизация при запуске и кнопка «Принудительное обновление»
 *  - Исправлено имя быстрой команды iOS на «Планировщик» (устранена ошибка RitmSync)
 *  - Крупные кнопки «✓ Выполнено» и «🎯 В фокус» для каждой задачи
 *  - Тактильный и визуальный отклик (ripple + звук + пружина + тост) на каждое нажатие
 *  - Цветовые градиенты интерфейса от батареи: 80-100% светло-зелёный, 50-79% светло-жёлтый, <=49% красно-жёлтый
 */

const STORAGE_KEY = 'ritm_dnya_state_v4_2';

const TASK_ENERGY_RATES = {
    high: -5.0,    // Категория А: сложные узлы, конструктив, высокий риск
    medium: -2.8,  // Категория Б: координация, проверка стоп-точек по чек-листу
    low: -1.2,     // Категория В: легкая рутина, языки, фиксация итогов
    rest: +6.0,    // Активное восстановление: обед без экрана, прогулка, дневной сон
    free: -0.5     // Свободное окно
};

const DEFAULT_SCHEDULE = [
    { id: 'slot-1', start: '08:30', end: '09:30', title: 'Подъём по будильнику, завтрак, автосинк Планировщик → HealthKit', type: 'routine', energy: 'low', done: true },
    { id: 'slot-2', start: '09:30', end: '10:30', title: 'Защищённый блок: Главная стратегическая задача (Категория А)', type: 'focus', energy: 'high', done: false },
    { id: 'slot-3', start: '10:30', end: '13:00', title: 'Свободное окно', type: 'free', energy: 'high', done: false },
    { id: 'slot-4', start: '13:00', end: '14:00', title: 'Обед и восстановление ресурса (без рабочих чатов)', type: 'break', energy: 'rest', done: false },
    { id: 'slot-5', start: '14:00', end: '16:30', title: 'Свободное окно', type: 'free', energy: 'medium', done: false },
    { id: 'slot-6', start: '17:00', end: '19:00', title: 'Свободное окно', type: 'free', energy: 'low', done: false },
    { id: 'slot-7', start: '20:00', end: '21:00', title: 'Английский (Duolingo 15 мин) и вечерняя разгрузка', type: 'routine', energy: 'low', done: false }
];

const defaultState = {
    dayType: 'work',
    morningMood: 'high',
    manualOffset: 0,
    showDetailedRecs: true,
    shortcutName: 'Планировщик',
    selectedTaskId: null,
    health: {
        sleepHours: 8.2,
        deepSleepHours: 3.1,
        bedtime: '22:45',
        activeCalories: 310,
        steps: 5120,
        stepsGoal: 10000,
        restingHR: 58,
        lastSync: 'Сегодня утром • Автосинхронизация активна',
        lastSyncDate: new Date().toISOString().slice(0, 10)
    },
    syncMeta: {
        lastCalendarSync: 'Синхронизировано при запуске',
        importedEventsCount: 0
    },
    holdPoints: [
        { id: 'hp-1', title: 'Защищён первый утренний блок (60 мин на Категорию А без телефона)', done: true },
        { id: 'hp-2', title: 'Стоп-точка 1 (Качество): узел выполнен по проекту без отступлений', done: false },
        { id: 'hp-3', title: 'Стоп-точка 2 (Объём): фактические замеры сходятся со сметой', done: false },
        { id: 'hp-4', title: 'Стоп-точка 3 (Документация): исполнительная схема и акты получены', done: false },
        { id: 'hp-5', title: 'Отказ от «спасательства»: вместо переделки за смежника выдан чек-лист', done: false }
    ],
    schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
    tasks: [
        { id: 'task-1', title: 'Согласовать с Олегом конструктив лестницы, узлы и поручень', category: 'A', complexity: 'high', done: false },
        { id: 'task-2', title: 'Падел-клуб / ЖК Lucky — аудит критических узлов и стоп-точек приёмки', category: 'A', complexity: 'high', done: false },
        { id: 'task-3', title: 'Проверить спецификацию по лаку и диффузоры вентиляции с Антоном', category: 'B', complexity: 'medium', done: false },
        { id: 'task-4', title: 'Отправить подрядчику чек-лист приёмки вместо ручной переделки чертежей', category: 'B', complexity: 'medium', done: false },
        { id: 'task-5', title: 'Зафиксировать 3 главных результата недели и предотвращённые риски', category: 'C', complexity: 'low', done: false }
    ],
    activeTaskFilter: 'all',
    currentPage: 'home'
};

let state = loadState();
let audioCtx = null;
let toastTimeout = null;

/* =========================================================
   1. ТАКТИЛЬНЫЙ И ВИЗУАЛЬНЫЙ ОТКЛИК НА НАЖАТИЕ КЛАВИШ
   ========================================================= */
function playTactileClick(isSuccess = false) {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = isSuccess ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(isSuccess ? 580 : 320, audioCtx.currentTime);
        if (isSuccess) {
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.09);
        } else {
            osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.04);
        }

        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (isSuccess ? 0.11 : 0.045));

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + (isSuccess ? 0.12 : 0.05));
    } catch (_) {}
}

function showToast(message, icon = '⚡') {
    const toast = document.getElementById('toast-notification');
    const textEl = document.getElementById('toast-text');
    const iconEl = document.getElementById('toast-icon');
    if (!toast || !textEl) return;

    iconEl.textContent = icon;
    textEl.textContent = message;
    toast.classList.remove('hidden');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 2200);
}

function attachGlobalButtonRipple() {
    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button, .chip, .mode-pill, .mood-pill, .nav-tab, .bento-card, .slot-btn, .task-check-btn, .task-action-pill, .rec-action-btn');
        if (!btn) return;

        playTactileClick(btn.classList.contains('btn-done') || btn.classList.contains('task-check-btn'));

        btn.classList.add('btn-tapped-anim');
        setTimeout(() => btn.classList.remove('btn-tapped-anim'), 180);

        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height);
        ripple.className = 'ripple-wave';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 560);
    }, { passive: true });
}

/* =========================================================
   2. ЗАГРУЗКА СОСТОЯНИЯ И ЗАЩИТА ОТ ДУБЛИКАТОВ
   ========================================================= */
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('ritm_dnya_state_v4');
        if (!raw) return JSON.parse(JSON.stringify(defaultState));
        const parsed = JSON.parse(raw);
        const merged = {
            ...defaultState,
            ...parsed,
            health: { ...defaultState.health, ...(parsed.health || {}) },
            syncMeta: { ...defaultState.syncMeta, ...(parsed.syncMeta || {}) },
            schedule: Array.isArray(parsed.schedule) && parsed.schedule.length ? parsed.schedule : JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
            tasks: Array.isArray(parsed.tasks) && parsed.tasks.length ? parsed.tasks.map(t => ({ done: false, ...t })) : defaultState.tasks,
            holdPoints: Array.isArray(parsed.holdPoints) ? parsed.holdPoints : defaultState.holdPoints
        };
        merged.schedule = deduplicateScheduleArray(merged.schedule);
        return merged;
    } catch (e) {
        return JSON.parse(JSON.stringify(defaultState));
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Ошибка сохранения localStorage:', e);
    }
}

function deduplicateScheduleArray(scheduleArr) {
    if (!Array.isArray(scheduleArr)) return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
    const seenKeys = new Set();
    let count1900 = 0;
    const cleaned = [];

    for (const slot of scheduleArr) {
        if (!slot || !slot.title) continue;
        const normTitle = slot.title.trim().toLowerCase();
        const timeKey = `${slot.start}-${slot.end}`;

        if (timeKey === '19:00-20:00') {
            count1900++;
            if (count1900 > 1) continue;
        }

        const uniqueKey = normTitle === 'свободное окно' ? `${timeKey}|free` : normTitle;
        if (seenKeys.has(uniqueKey)) continue;
        seenKeys.add(uniqueKey);
        cleaned.push(slot);
    }

    return cleaned.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

function resetScheduleToDefault() {
    state.schedule = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
    state.manualOffset = 0;
    renderAll();
    showToast('Расписание дня сброшено к базовому', '🔄');
}

/* =========================================================
   3. УТРЕННЯЯ АВТОСИНХРОНИЗАЦИЯ И ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ
   ========================================================= */
function checkMorningAutoSync() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams(window.location.search);
    const hasUrlSync = params.has('autoSync') || params.has('sleep') || params.has('steps');

    // Если наступило новое утро — обновляем день автоматически
    if (state.health.lastSyncDate !== todayStr) {
        state.health.lastSyncDate = todayStr;
        state.manualOffset = 0;
        // Сбрасываем выполненные вчера слоты (кроме утреннего подъема)
        state.schedule.forEach(s => {
            if (s.id !== 'slot-1') s.done = false;
        });
        // Очищаем выполненные вчера разовые задачи
        state.tasks = state.tasks.filter(t => !t.done);
        const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        state.health.lastSync = `Утренняя автосинхронизация • ${nowTime}`;
        saveState();
        showToast('Доброе утро! Приложение синхронизировано на новый день', '☀️');
    } else if (hasUrlSync) {
        showToast('Данные из команды «Планировщик» загружены!', '📲');
    }
}

// Кнопка «🔄 Принудительное обновление» в шапке и вкладках
function forceFullSync(showNotification = true) {
    const pillText = document.getElementById('sync-pill-text');
    if (pillText) pillText.textContent = '⏳ Синхр...';

    // 1. Читаем возможные URL-параметры
    parseUrlHealthTelemetry();

    // 2. Очищаем любые дубликаты в расписании
    state.schedule = deduplicateScheduleArray(state.schedule);

    // 3. Если есть свободные окна и нераспределённые задачи — подбираем оптимальную задачу в фокус
    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    state.health.lastSync = `Принудительное обновление • Сегодня в ${nowTime}`;
    state.syncMeta.lastCalendarSync = `Обновлено в ${nowTime} • Энергобаланс пересчитан`;

    setTimeout(() => {
        if (pillText) pillText.textContent = `✓ ${nowTime}`;
        renderAll();
        if (showNotification) {
            playTactileClick(true);
            showToast(`Синхронизировано в ${nowTime}! Заряд: ${getBatteryScore()}%`, '🔄');
        }
    }, 260);
}

// Вызов твоей быстрой команды «Планировщик» на iPhone (без ошибки RitmSync!)
function runPlannerShortcut() {
    const input = document.getElementById('shortcut-name-input');
    const name = (input && input.value.trim()) ? input.value.trim() : (state.shortcutName || 'Планировщик');
    state.shortcutName = name;
    saveState();

    showToast(`Запуск команды «${name}»...`, '📲');
    const encodedName = encodeURIComponent(name);
    window.location.href = `shortcuts://run-shortcut?name=${encodedName}`;
}

function parseUrlHealthTelemetry() {
    try {
        const params = new URLSearchParams(window.location.search);
        let updated = false;

        if (params.has('sleep')) {
            const val = parseFloat(String(params.get('sleep')).replace(',', '.'));
            if (!isNaN(val) && val > 0) { state.health.sleepHours = val; updated = true; }
        }
        if (params.has('deep')) {
            const val = parseFloat(String(params.get('deep')).replace(',', '.'));
            if (!isNaN(val) && val >= 0) { state.health.deepSleepHours = val; updated = true; }
        }
        if (params.has('bedtime')) {
            const bt = params.get('bedtime');
            if (bt && /^\d{1,2}:\d{2}$/.test(bt.trim())) {
                state.health.bedtime = bt.trim().padStart(5, '0');
                updated = true;
            }
        }
        if (params.has('calories')) {
            const val = parseInt(params.get('calories'), 10);
            if (!isNaN(val) && val >= 0) { state.health.activeCalories = val; updated = true; }
        }
        if (params.has('steps')) {
            const val = parseInt(params.get('steps'), 10);
            if (!isNaN(val) && val >= 0) { state.health.steps = val; updated = true; }
        }
        if (params.has('hr')) {
            const val = parseInt(params.get('hr'), 10);
            if (!isNaN(val) && val > 30) { state.health.restingHR = val; updated = true; }
        }

        if (params.has('cal')) {
            const parsedEvents = parseCalendarStringPayload(params.get('cal'));
            if (parsedEvents.length > 0) {
                mergeExternalEventsIntoSchedule(parsedEvents, 'Календарь iOS');
                updated = true;
            }
        }

        if (params.has('tasks')) {
            const count = importExternalTasksList(params.get('tasks'), 'Напоминания');
            if (count > 0) updated = true;
        }

        if (updated) {
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            state.health.lastSync = `Синхронизировано из «Планировщика» (${timeStr})`;
            state.health.lastSyncDate = new Date().toISOString().slice(0, 10);
            window.history.replaceState({}, document.title, window.location.pathname);
            saveState();
        }
    } catch (e) {
        console.warn('Ошибка чтения URL-параметров:', e);
    }
}

/* =========================================================
   4. МАТЕМАТИЧЕСКОЕ ЯДРО И ЦВЕТОВОЙ ГРАДИЕНТ (80-100, 50-79, <=49)
   ========================================================= */
function parseBedtimePoints(bedtimeStr) {
    if (!bedtimeStr || typeof bedtimeStr !== 'string') return 0;
    const [h, m] = bedtimeStr.split(':').map(Number);
    if (isNaN(h)) return 0;
    const dec = h + (m || 0) / 60;

    if (dec >= 20 && dec <= 23.5) return 5;
    if (dec > 23.5 || dec < 0.5) return 0;
    if (dec >= 0.5 && dec <= 6) return -Math.min(12, Math.round(dec * 3.5));
    return 0;
}

function getSlotDurationHours(slot) {
    if (!slot || !slot.start || !slot.end) return 1.0;
    const diff = (timeToMinutes(slot.end) - timeToMinutes(slot.start)) / 60;
    return Math.max(0.25, Math.min(6, diff > 0 ? diff : 1.0));
}

function calculateEnergyBreakdown() {
    const { sleepHours, deepSleepHours, bedtime, activeCalories, steps, restingHR } = state.health;

    const sleepRatio = Math.min(Math.max(sleepHours, 0) / 8.0, 1.0);
    const sleepPoints = Math.round(sleepRatio * 70);

    const deepRatio = Math.min(Math.max(deepSleepHours, 0) / 3.0, 1.0);
    const deepPoints = Math.round(deepRatio * 25);

    const bedtimePoints = parseBedtimePoints(bedtime);

    let loadPenalty = 0;
    if (activeCalories > 550) {
        loadPenalty -= Math.min(15, Math.round((activeCalories - 550) / 60));
    }
    if (steps > 10000) {
        loadPenalty -= Math.min(8, Math.round((steps - 10000) / 2000));
    }
    if (restingHR > 68) {
        loadPenalty -= Math.min(7, Math.round((restingHR - 68) * 0.7));
    }

    let moodAdjustment = 0;
    if (state.morningMood === 'high') moodAdjustment = 2;
    if (state.morningMood === 'low') moodAdjustment = -10;

    const baseHealthTotal = Math.max(10, Math.min(100, Math.round(
        sleepPoints + deepPoints + bedtimePoints + loadPenalty + moodAdjustment + (state.manualOffset || 0)
    )));

    // Динамический расход от выполненных слотов И выполненных задач в Банке задач
    let tasksNetDelta = 0;
    const countedTitles = new Set();

    state.schedule.forEach(slot => {
        if (slot.done && slot.id !== 'slot-1') {
            const key = slot.title.trim().toLowerCase();
            if (countedTitles.has(key)) return;
            countedTitles.add(key);
            const hrs = getSlotDurationHours(slot);
            const rate = TASK_ENERGY_RATES[slot.energy] ?? -2.0;
            tasksNetDelta += rate * hrs;
        }
    });

    state.tasks.forEach(task => {
        if (task.done) {
            const key = task.title.trim().toLowerCase();
            if (countedTitles.has(key)) return;
            countedTitles.add(key);
            const delta = task.category === 'A' ? -5 : task.category === 'B' ? -3 : task.category === 'REST' ? +6 : -1.5;
            tasksNetDelta += delta;
        }
    });

    tasksNetDelta = Math.round(tasksNetDelta);

    const rawTotal = baseHealthTotal + tasksNetDelta;
    const total = Math.max(10, Math.min(100, Math.round(rawTotal)));

    const highTasksCount = state.schedule.filter(s => s.energy === 'high' && !s.done).length;
    const rawRisk = Math.round((100 - total) * 0.75 + highTasksCount * 8 + Math.abs(loadPenalty) * 1.5);
    const overloadRisk = Math.max(8, Math.min(95, rawRisk));

    return {
        total,
        baseHealthTotal,
        sleepPoints,
        deepPoints,
        bedtimePoints,
        loadPenalty,
        tasksNetDelta,
        moodAdjustment,
        manualOffset: state.manualOffset || 0,
        overloadRisk
    };
}

function getBatteryScore() {
    return calculateEnergyBreakdown().total;
}

/**
 * Точное распределение цветовых тем по требованию пользователя:
 *  - 80–100%: Светло-зелёный градиент от батареи (theme-high-green)
 *  - 50–79%:  Светло-жёлтый градиент от батареи (theme-mid-yellow)
 *  - <= 49%:  Красно-жёлтый градиент от батареи (theme-low-red-yellow)
 */
function getEnergyVisualProfile(score) {
    if (score >= 80) {
        return {
            level: 'high',
            bodyClass: 'theme-high-green',
            themeColorHex: '#062318',
            zoneCaption: `Заряд ${score}% (80–100%): Светло-зелёный градиент энергии`,
            mainTag: 'ПОЛНЫЙ СИЛ',
            subTag: 'ОПТИМАЛЬНЫЙ РЕСУРС',
            badge: '🟢 Высокий ресурс (80–100%)',
            liquidGradient: 'linear-gradient(180deg, #bbf7d0 0%, #4ade80 50%, #10b981 100%)',
            ringColor: '#86efac'
        };
    }
    if (score >= 50) {
        return {
            level: 'medium',
            bodyClass: 'theme-mid-yellow',
            themeColorHex: '#241d05',
            zoneCaption: `Заряд ${score}% (50–79%): Светло-жёлтый градиент баланса`,
            mainTag: 'УМЕРЕННЫЙ ТЕМП',
            subTag: 'РАБОЧИЙ БАЛАНС',
            badge: '🟡 Средний ресурс (50–79%)',
            liquidGradient: 'linear-gradient(180deg, #fef9c3 0%, #fde047 52%, #eab308 100%)',
            ringColor: '#fde047'
        };
    }
    return {
        level: 'low',
        bodyClass: 'theme-low-red-yellow',
        themeColorHex: '#2b0b05',
        zoneCaption: `Заряд ${score}% (≤49%): Красно-жёлтый градиент защиты сил`,
        mainTag: 'БЕРЕЧЬ СИЛЫ',
        subTag: 'НУЖНА ПЕРЕЗАГРУЗКА',
        badge: '🔴 Низкий ресурс (≤49%)',
        liquidGradient: 'linear-gradient(180deg, #fde047 0%, #f97316 48%, #ef4444 100%)',
        ringColor: '#f97316'
    };
}

function applyTestBatteryLevel(targetScore) {
    const currentWithoutOffset = calculateEnergyBreakdown().total - (state.manualOffset || 0);
    state.manualOffset = targetScore - currentWithoutOffset;
    renderAll();
    showToast(`Включён тест цветовой зоны: ${targetScore}%`, '🎨');
}

function resetManualOffset() {
    state.manualOffset = 0;
    renderAll();
    showToast('Включён автоматический расчёт заряда', '⚡');
}

/* =========================================================
   5. УПРАВЛЕНИЕ ЗАДАЧАМИ: ВЫБОР И ОТМЕТКА «✓ ВЫПОЛНЕНО»
   ========================================================= */
function toggleTaskCompleted(taskId, event) {
    if (event) event.stopPropagation();
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.done = !task.done;

    // Также синхронизируем со слотом расписания, если задача стоит в расписании
    const matchingSlot = state.schedule.find(s => s.title.trim().toLowerCase() === task.title.trim().toLowerCase());
    if (matchingSlot) {
        matchingSlot.done = task.done;
    }

    playTactileClick(task.done);
    renderAll();
    showToast(task.done ? `✓ Выполнено: ${task.title.slice(0, 32)}...` : 'Задача возвращена в активные', task.done ? '✅' : '↩️');
}

function selectTaskCard(taskId) {
    state.selectedTaskId = state.selectedTaskId === taskId ? null : taskId;
    renderAll();
}

function setTaskToFocusNow(taskId, event) {
    if (event) event.stopPropagation();
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.done = false;
    // Ставим задачу в текущий активный слот фокуса
    let focusSlot = state.schedule.find(s => !s.done && s.type !== 'routine') || state.schedule[1] || state.schedule[0];
    if (focusSlot) {
        focusSlot.title = task.title;
        focusSlot.type = task.complexity === 'rest' ? 'break' : 'focus';
        focusSlot.energy = task.complexity || 'high';
        focusSlot.done = false;
    }

    renderAll();
    switchPage('home');
    showToast(`🎯 В фокусе: ${task.title.slice(0, 34)}...`, '🎯');
}

function scheduleTaskToToday(taskId, event) {
    if (event) event.stopPropagation();
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    fillNearestFreeWindow(task.title, task.complexity || 'medium');
    showToast(`📅 Поставлено в план: ${task.title.slice(0, 30)}...`, '📅');
}

function openTaskPickerModal() {
    const modal = document.getElementById('task-picker-modal');
    const list = document.getElementById('modal-task-picker-list');
    if (!modal || !list) return;

    list.innerHTML = state.tasks.map(t => `
        <div class="perm-item" style="flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <strong style="${t.done ? 'text-decoration:line-through; opacity:0.6;' : ''}">${escapeHtml(t.title)}</strong>
                <span class="slot-badge ${t.category === 'A' ? 'badge-high' : t.category === 'B' ? 'badge-medium' : 'badge-low'}">Кат. ${t.category}</span>
            </div>
            <div style="display:flex; gap:6px;">
                <button class="btn-primary-neon" style="flex:1; padding:7px;" onclick="setTaskToFocusNow('${t.id}', event); closeAllModals();">🎯 В фокус сейчас</button>
                <button class="perm-btn" onclick="toggleTaskCompleted('${t.id}', event); closeAllModals();">${t.done ? '↩ Вернуть' : '✓ Выполнено'}</button>
            </div>
        </div>
    `).join('');

    modal.classList.remove('hidden');
}

/* =========================================================
   6. ОТРИСОВКА ИНТЕРФЕЙСА (RENDER ALL)
   ========================================================= */
function renderAll() {
    renderHeaderDate();
    renderBatteryAndThemeAura();
    renderMainRecommendationCard();
    renderBentoGrid();
    renderFocusAndCoordinator();
    renderHomeQuickTasks();
    renderTimeline();
    renderTasksAndHoldPoints();
    renderHealthPageBreakdown();
    saveState();
}

function renderHeaderDate() {
    const el = document.getElementById('current-date');
    if (el) {
        const now = new Date();
        el.textContent = now.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }).toUpperCase();
    }
    const dayLabel = document.getElementById('day-type-label');
    if (dayLabel) {
        dayLabel.textContent = state.dayType === 'work' ? 'Рабочий' : 'Выходной';
    }
}

function renderBatteryAndThemeAura() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const profile = getEnergyVisualProfile(score);

    // Переключаем класс градиента на body (80-100% светло-зеленый, 50-79% светло-желтый, <=49% красно-желтый)
    document.body.classList.remove('theme-high-green', 'theme-mid-yellow', 'theme-low-red-yellow');
    document.body.classList.add(profile.bodyClass);

    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', profile.themeColorHex);

    const zoneCaption = document.getElementById('aura-zone-caption');
    if (zoneCaption) zoneCaption.textContent = profile.zoneCaption;

    const scoreEl = document.getElementById('sleep-score');
    if (scoreEl) scoreEl.textContent = `${score}%`;

    const mainTagEl = document.getElementById('battery-state-tag');
    if (mainTagEl) mainTagEl.textContent = profile.mainTag;

    const subTagEl = document.getElementById('battery-sub-tag');
    if (subTagEl) subTagEl.textContent = profile.subTag;

    const liquidFill = document.getElementById('battery-bar-fill');
    if (liquidFill) {
        liquidFill.style.height = `${score}%`;
        liquidFill.style.background = profile.liquidGradient;
    }

    const ringProgress = document.getElementById('hud-ring-progress');
    if (ringProgress) {
        const circumference = 854;
        const dash = Math.round((score / 100) * 680);
        ringProgress.style.strokeDasharray = `${dash} ${circumference}`;
        ringProgress.style.stroke = profile.ringColor;
    }

    const currentSlot = state.schedule.find(s => !s.done) || state.schedule[0];
    const currentRate = currentSlot ? (TASK_ENERGY_RATES[currentSlot.energy] ?? -2.0) : -1.2;
    const drainBadge = document.getElementById('drain-rate-badge');
    if (drainBadge) {
        const sign = currentRate > 0 ? '+' : '';
        drainBadge.textContent = currentRate > 0
            ? `🔋 Восстановление: ${sign}${currentRate}% / ч`
            : `⚡ Расход: ${currentRate}% / ч`;
    }

    const offsetEl = document.getElementById('manual-offset');
    if (offsetEl) {
        offsetEl.textContent = state.manualOffset === 0
            ? 'Авто'
            : `${state.manualOffset > 0 ? '+' : ''}${state.manualOffset}%`;
    }
}

function renderHomeQuickTasks() {
    const container = document.getElementById('home-quick-tasks');
    if (!container) return;

    const topTasks = state.tasks.slice(0, 4);
    container.innerHTML = topTasks.map(task => renderInteractiveTaskItemHtml(task)).join('');
}

function renderInteractiveTaskItemHtml(task) {
    const isSelected = state.selectedTaskId === task.id;
    const badgeHtml = task.category === 'A'
        ? '<span class="slot-badge badge-high">🔴 Кат. А (−5%/ч)</span>'
        : task.category === 'B'
        ? '<span class="slot-badge badge-medium">🟡 Кат. Б (−2.8%/ч)</span>'
        : task.category === 'REST'
        ? '<span class="slot-badge badge-rest">🔋 Отдых (+6%/ч)</span>'
        : '<span class="slot-badge badge-low">🟢 Кат. В (−1.2%/ч)</span>';

    const doneBadge = task.done ? '<span class="slot-badge badge-rest" style="margin-left:6px;">✓ Выполнено</span>' : '';

    return `
        <li class="task-card-item ${isSelected ? 'selected-task' : ''} ${task.done ? 'task-completed' : ''}" onclick="selectTaskCard('${task.id}')">
            <div class="task-card-top">
                <button class="task-check-btn ${task.done ? 'checked' : ''}" onclick="toggleTaskCompleted('${task.id}', event)" title="Отметить как выполненное">
                    ${task.done ? '✓' : ''}
                </button>
                <div class="task-main-info">
                    <span class="task-title-text">${escapeHtml(task.title)}</span>
                    <div>${badgeHtml}${doneBadge}</div>
                </div>
            </div>
            <div class="task-action-bar" onclick="event.stopPropagation()">
                <button class="task-action-pill pill-focus" onclick="setTaskToFocusNow('${task.id}', event)">🎯 В фокус</button>
                <button class="task-action-pill" onclick="scheduleTaskToToday('${task.id}', event)">📅 В окно</button>
                <button class="task-action-pill" onclick="toggleTaskCompleted('${task.id}', event)">${task.done ? '↩ Вернуть' : '✓ Готово'}</button>
                <button class="task-action-pill pill-delete" onclick="removeTask('${task.id}', event)">✕</button>
            </div>
        </li>
    `;
}

function renderMainRecommendationCard() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const risk = breakdown.overloadRisk;

    const prefixEl = document.getElementById('rec-lead-prefix');
    const bodyEl = document.getElementById('rec-lead-body');

    if (prefixEl && bodyEl) {
        if (state.dayType === 'work') {
            if (score >= 80) {
                prefixEl.textContent = '🟢 ВЫСОКИЙ ЗАРЯД (80–100%)!';
                bodyEl.textContent = `Вы полны сил на ${score}%. Светло-зелёный режим: закройте самые тяжёлые задачи (Категория А) до 16:00, пока ресурс на пике.`;
            } else if (score >= 50) {
                prefixEl.textContent = '🟡 СРЕДНИЙ ДИАПАЗОН (50–79%).';
                bodyEl.textContent = `Заряд энергии ${score}%. Светло-жёлтый режим: работайте в умеренном темпе (Категория Б), проверяйте подрядчиков по стоп-точкам без перегрузок.`;
            } else {
                prefixEl.textContent = '🔴 НИЗКИЙ ЗАРЯД (≤49%)!';
                bodyEl.textContent = `Заряд снижен (${score}%). Красно-жёлтый режим защиты сил: отложите сложные узлы, выполняйте только лёгкую рутину и передохните.`;
            }
        } else {
            if (score >= 80) {
                prefixEl.textContent = '🌍 ВРЕМЯ МЕЧТЫ (80–100%)!';
                bodyEl.textContent = `Выходной день и высокий заряд ${score}%! Поезжайте туда, где давно мечтали побывать, включите любимую музыку в W124 и наслаждайтесь днём.`;
            } else {
                prefixEl.textContent = '🛌 ПЕРЕЗАГРУЗКА И ОТДЫХ.';
                bodyEl.textContent = `Выходной и ${score}% ресурса. Главная задача — отдыхать без чувства вины, вкусно поесть, выспаться и набрать 100% к новой неделе.`;
            }
        }
    }

    const marker = document.getElementById('overload-marker');
    if (marker) marker.style.left = `${risk}%`;

    const riskText = document.getElementById('overload-status-text');
    if (riskText) {
        let riskLabel = 'Низкий';
        riskText.className = 'risk-low';
        if (risk >= 65) {
            riskLabel = 'Высокий';
            riskText.className = 'risk-high';
        } else if (risk >= 38) {
            riskLabel = 'Средний';
            riskText.className = 'risk-med';
        }
        riskText.textContent = `${riskLabel} (${risk}%)`;
    }

    const btnWork = document.getElementById('btn-mode-workday');
    const btnWeek = document.getElementById('btn-mode-weekend');
    if (btnWork) btnWork.classList.toggle('active', state.dayType === 'work');
    if (btnWeek) btnWeek.classList.toggle('active', state.dayType === 'weekend');

    document.querySelectorAll('.mood-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mood === state.morningMood);
    });

    const grid = document.getElementById('recommendations-grid');
    if (grid) {
        grid.style.display = state.showDetailedRecs ? 'grid' : 'none';
        const recs = generateFourRecommendations();
        grid.innerHTML = recs.map((r, idx) => `
            <div class="rec-item">
                <div>
                    <div class="rec-num">${r.num}</div>
                    <div class="rec-title">${r.title}</div>
                    <p class="rec-text">${r.text}</p>
                </div>
                <button class="rec-action-btn" onclick="handleRecommendationAction(${idx})">${r.actionLabel}</button>
            </div>
        `).join('');
    }
}

function generateFourRecommendations() {
    const score = getBatteryScore();
    const isHigh = score >= 75;
    const isWorkday = state.dayType === 'work';

    const heavyTask = (state.tasks.find(t => t.category === 'A' && !t.done) || {}).title || 'Согласовать с Олегом конструктив лестницы и узлы';
    const lightTask = (state.tasks.find(t => t.category !== 'A' && !t.done) || {}).title || 'Проверить спецификацию по лаку и диффузоры с Антоном';

    if (isWorkday && isHigh) {
        return [
            { num: '01 • ГЛАВНЫЙ ПРОРЫВ', title: '🚀 Сложная задача до 16:00', text: `Пик ресурса (${score}%). Поставь в фокус: «${heavyTask}».`, actionLabel: '🎯 В фокус →', actionTask: heavyTask, actionEnergy: 'high' },
            { num: '02 • ЗАЩИТА ВРЕМЕНИ', title: '🛡️ 60 минут тишины (Кат. А)', text: 'Первые 60 минут без мессенджеров — только ключевые узлы.', actionLabel: 'Включить фокус', actionTask: 'Глубокий фокус: критические узлы и чертежи', actionEnergy: 'high' },
            { num: '03 • БЕЗ «СПАСАТЕЛЬСТВА»', title: '🛑 Контроль по 3 стоп-точкам', text: 'Не перечерчивай за смежников — выдай чек-лист.', actionLabel: 'Стоп-точки →', actionPage: 'tasks' },
            { num: '04 • ПОДЗАРЯДКА (+6%/ч)', title: '🔋 Обед и переключение в 13:00', text: 'Час спокойного обеда вернёт +6% к батарее.', actionLabel: 'Забронировать отдых', actionTask: 'Обед, прогулка и перезагрузка без экрана', actionEnergy: 'rest' }
        ];
    }
    if (isWorkday && !isHigh) {
        return [
            { num: '01 • ЩАДЯЩИЙ РЕЖИМ', title: '🔋 Побереги силы и ресурс', text: `Заряд ${score}%. Отложи тяжёлые расчёты Категории А.`, actionLabel: 'Щадящий план →', actionTask: 'Спокойный рабочий блок без перегруза', actionEnergy: 'low' },
            { num: '02 • ЛЁГКАЯ РУТИНА', title: '🌿 Простые задачи (Кат. Б и В)', text: `Закрой несложные вопросы: «${lightTask}».`, actionLabel: 'Поставить в окно →', actionTask: lightTask, actionEnergy: 'low' },
            { num: '03 • ДЕЛЕГИРОВАНИЕ', title: '📋 Запрос решения от подрядчика', text: 'Озвучь риск сразу и потребуй готовый вариант от смежников.', actionLabel: 'Проверка по чек-листу', actionTask: 'Быстрая сверка статуса подрядчиков по чек-листу', actionEnergy: 'medium' },
            { num: '04 • ВОССТАНОВЛЕНИЕ', title: '🌙 Отбой до 22:45 (+5% бонус)', text: 'Заверши дела вовремя, чтобы набрать 8+ ч сна.', actionLabel: 'Калибровка сна', actionPage: 'health' }
        ];
    }
    return [
        { num: '01 • ВЫХОДНОЙ ДЕНЬ', title: '🌍 Отдых и впечатления!', text: `Заряд ${score}%. Проведи день в своё удовольствие с Катариной.`, actionLabel: 'В план отдыха →', actionTask: 'Отдых, прогулка и время с Катариной', actionEnergy: 'rest' },
        { num: '02 • ЗА РУЛЁМ W124', title: '🚗 Маршрут под любимую музыку', text: 'Поездка без звонков и рабочих чатов.', actionLabel: 'Добавить выезд', actionTask: 'Автопрогулка на W124 под любимую музыку', actionEnergy: 'rest' },
        { num: '03 • ПЕРЕЗАГРУЗКА (+6%/ч)', title: '🍵 Вкусный обед и кино', text: 'Восстановление нервной системы на 100%.', actionLabel: 'Запланировать', actionTask: 'Вкусный обед и спокойный отдых', actionEnergy: 'rest' },
        { num: '04 • ДЕТОКС ОТ СТРОЙКИ', title: '🔕 Свобода от рабочих задач', text: 'Все мысли по объектам сбрасывай в список на понедельник.', actionLabel: 'Банк задач →', actionPage: 'tasks' }
    ];
}

function renderBentoGrid() {
    const sleepEl = document.getElementById('metric-sleep-hours');
    if (sleepEl) sleepEl.innerHTML = `${Number(state.health.sleepHours).toFixed(1)} <small>ч</small>`;

    const deepEl = document.getElementById('metric-deep-sleep');
    if (deepEl) deepEl.textContent = Number(state.health.deepSleepHours).toFixed(1);

    const calEl = document.getElementById('metric-calories');
    if (calEl) calEl.textContent = state.health.activeCalories;

    const stepsEl = document.getElementById('steps-count');
    if (stepsEl) stepsEl.textContent = Number(state.health.steps).toLocaleString('ru-RU');

    const goalEl = document.getElementById('steps-goal');
    if (goalEl) goalEl.textContent = `/ ${Number(state.health.stepsGoal || 10000).toLocaleString('ru-RU')}`;
}

function renderFocusAndCoordinator() {
    const score = getBatteryScore();
    const profile = getEnergyVisualProfile(score);

    const currentSlot = state.schedule.find(s => !s.done && s.type !== 'free')
        || state.schedule.find(s => !s.done)
        || state.schedule[state.schedule.length - 1];

    if (currentSlot) {
        const hrs = getSlotDurationHours(currentSlot);
        const rate = TASK_ENERGY_RATES[currentSlot.energy] ?? -2.0;
        const slotDelta = Math.round(rate * hrs);

        document.getElementById('focus-time').textContent = `${currentSlot.start} — ${currentSlot.end}`;
        document.getElementById('focus-title').textContent = currentSlot.title;

        const costLabel = document.getElementById('focus-cost-label');
        if (costLabel) {
            costLabel.textContent = slotDelta > 0 ? `+${slotDelta}% (Заряд)` : `${slotDelta}% заряда`;
        }

        let remainingDelta = 0;
        state.schedule.forEach(s => {
            if (!s.done) {
                remainingDelta += (TASK_ENERGY_RATES[s.energy] ?? -1.5) * getSlotDurationHours(s);
            }
        });
        const eveningForecast = Math.max(15, Math.min(100, Math.round(score + remainingDelta)));
        const forecastEl = document.getElementById('evening-forecast-label');
        if (forecastEl) forecastEl.textContent = `${eveningForecast}%`;
    }

    const coordTag = document.getElementById('coordinator-energy-tag');
    if (coordTag) coordTag.textContent = profile.badge;

    const freeSlot = state.schedule.find(s => s.type === 'free' && !s.done);
    const coordText = document.getElementById('assistant-text');
    if (coordText) {
        if (freeSlot) {
            coordText.innerHTML = `Свободно окно <strong>${freeSlot.start} — ${freeSlot.end}</strong>. Заряд <strong>${score}%</strong> — нажми на кнопку ниже, чтобы занять окно:`;
        } else {
            coordText.textContent = `Все свободные окна на сегодня распределены! Текущий заряд: ${score}%.`;
        }
    }
}

function renderTimeline() {
    const container = document.getElementById('timeline-list');
    if (!container) return;

    const b = calculateEnergyBreakdown();
    const drainSummary = document.getElementById('timeline-drain-summary');
    if (drainSummary) {
        drainSummary.textContent = `База: ${b.baseHealthTotal}% | Задачи: ${b.tasksNetDelta >= 0 ? '+' : ''}${b.tasksNetDelta}%`;
    }

    const activeSlot = state.schedule.find(s => !s.done);
    container.innerHTML = state.schedule.map(slot => {
        const isFree = slot.type === 'free';
        const hrs = getSlotDurationHours(slot);
        const rate = TASK_ENERGY_RATES[slot.energy] ?? -2.0;
        const delta = Math.round(rate * hrs);
        const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;

        let badgeClass = 'badge-low';
        let badgeText = `🌿 Кат. В • Лёгкий темп (${deltaStr})`;

        if (isFree) {
            badgeClass = 'badge-free';
            badgeText = '✨ Свободное окно — нажми, чтобы выбрать задачу';
        } else if (slot.energy === 'high') {
            badgeClass = 'badge-high';
            badgeText = `🔥 Кат. А • Высокий фокус (${deltaStr})`;
        } else if (slot.energy === 'medium') {
            badgeClass = 'badge-medium';
            badgeText = `⚡ Кат. Б • Координация (${deltaStr})`;
        } else if (slot.energy === 'rest') {
            badgeClass = 'badge-rest';
            badgeText = `🔋 Подзарядка и отдых (${deltaStr})`;
        }

        return `
            <div class="slot-item ${slot.id === activeSlot?.id ? 'current' : ''} ${isFree ? 'free-window' : ''} ${slot.done ? 'done' : ''}"
                 onclick="openTaskPickerModal()">
                <div class="slot-info">
                    <div class="slot-time">${slot.start} — ${slot.end} (${hrs.toFixed(1)} ч)</div>
                    <div class="slot-title">${escapeHtml(slot.title)}</div>
                    <span class="slot-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="slot-controls" onclick="event.stopPropagation()">
                    <button class="slot-btn ${slot.done ? 'btn-slot-done-active' : ''}" onclick="toggleSlotDone('${slot.id}')" title="Отметить выполненным">
                        ${slot.done ? '✓' : '✓'}
                    </button>
                    <button class="slot-btn" onclick="clearOrRemoveSlot('${slot.id}')" title="Освободить / Удалить">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTasksAndHoldPoints() {
    const activeCount = state.tasks.filter(t => !t.done).length;
    const badge = document.getElementById('tasks-count-badge');
    if (badge) badge.textContent = `${activeCount} активных`;

    const filtered = state.tasks.filter(t => {
        if (state.activeTaskFilter === 'all') return true;
        if (state.activeTaskFilter === 'DONE') return t.done === true;
        return t.category === state.activeTaskFilter;
    });

    const list = document.getElementById('tomorrow-list');
    if (list) {
        list.innerHTML = filtered.length
            ? filtered.map(task => renderInteractiveTaskItemHtml(task)).join('')
            : '<li class="task-card-item"><span>В этой категории пока нет задач ✨</span></li>';
    }

    const hpList = document.getElementById('hold-points-list');
    if (hpList) {
        hpList.innerHTML = state.holdPoints.map(hp => `
            <label class="hold-point-item" onclick="toggleHoldPoint('${hp.id}')">
                <input type="checkbox" ${hp.done ? 'checked' : ''} onchange="event.stopPropagation(); toggleHoldPoint('${hp.id}')" />
                <span style="${hp.done ? 'text-decoration:line-through; opacity:0.55;' : ''}">${escapeHtml(hp.title)}</span>
            </label>
        `).join('');
    }
}

function renderHealthPageBreakdown() {
    const b = calculateEnergyBreakdown();

    syncSlider('slider-sleep', 'val-sleep-hours', state.health.sleepHours, v => `${Number(v).toFixed(1)} ч`);
    syncSlider('slider-deep', 'val-deep-sleep', state.health.deepSleepHours, v => `${Number(v).toFixed(1)} ч`);
    syncSlider('slider-calories', 'val-calories', state.health.activeCalories, v => `${v} ккал`);
    syncSlider('slider-steps', 'val-steps', state.health.steps, v => `${Number(v).toLocaleString('ru-RU')} шагов`);
    syncSlider('slider-hr', 'val-hr', state.health.restingHR, v => `${v} уд/мин`);

    const bedInput = document.getElementById('input-bedtime');
    if (bedInput && bedInput.value !== state.health.bedtime) bedInput.value = state.health.bedtime;

    const syncLabel = document.getElementById('last-sync-label');
    if (syncLabel) syncLabel.textContent = state.health.lastSync;

    const formulaBox = document.getElementById('formula-breakdown');
    if (formulaBox) {
        formulaBox.innerHTML = `
            <div class="formula-line"><span>🌙 База общего сна (${state.health.sleepHours} ч из 8.0 ч):</span><strong>+${b.sleepPoints}%</strong></div>
            <div class="formula-line"><span>🟣 Бонус глубокого сна (${state.health.deepSleepHours} ч из 3.0 ч):</span><strong>+${b.deepPoints}%</strong></div>
            <div class="formula-line"><span>🕘 Режим отхода ко сну (${state.health.bedtime}):</span><strong>${b.bedtimePoints >= 0 ? '+' : ''}${b.bedtimePoints}%</strong></div>
            <div class="formula-line"><span>🔥 Физическая нагрузка (${state.health.activeCalories} ккал, ${state.health.steps} шагов):</span><strong>${b.loadPenalty}%</strong></div>
            <div class="formula-line"><span>🎛 Настрой и ручная коррекция:</span><strong>${b.moodAdjustment + b.manualOffset >= 0 ? '+' : ''}${b.moodAdjustment + b.manualOffset}%</strong></div>
            <div class="formula-line" style="border-top:1px dashed rgba(255,255,255,0.2); padding-top:6px;">
                <span>❤️ База HealthKit:</span>
                <strong>${b.baseHealthTotal}%</strong>
            </div>
            <div class="formula-line"><span>✅ Вычет / заряд выполненных задач:</span><strong>${b.tasksNetDelta >= 0 ? '+' : ''}${b.tasksNetDelta}%</strong></div>
            <div class="formula-line" style="border-top:1px solid rgba(255,255,255,0.25); padding-top:8px; margin-top:4px;">
                <span>🔋 Итоговый заряд батареи:</span>
                <strong style="color:var(--aura-bright); font-size:1.05rem;">${b.total}% (Риск: ${b.overloadRisk}%)</strong>
            </div>
        `;
    }

    const base = window.location.origin + window.location.pathname;
    const urlBox = document.getElementById('healthkit-shortcut-url');
    if (urlBox) {
        urlBox.textContent = `${base}?sleep=${state.health.sleepHours}&deep=${state.health.deepSleepHours}&bedtime=${state.health.bedtime}&calories=${state.health.activeCalories}&steps=${state.health.steps}&hr=${state.health.restingHR}&autoSync=1`;
    }
}

function syncSlider(sliderId, labelId, val, fmt) {
    const s = document.getElementById(sliderId);
    if (s && String(s.value) !== String(val)) s.value = val;
    const l = document.getElementById(labelId);
    if (l) l.textContent = fmt(val);
}

/* =========================================================
   7. ВСПОМОГАТЕЛЬНЫЕ ДЕЙСТВИЯ И ИМПОРТ
   ========================================================= */
function classifyEnergyByText(title) {
    const t = String(title || '').toLowerCase();
    if (t.includes('обед') || t.includes('отдых') || t.includes('прогулк') || t.includes('сон') || t.includes('w124') || t.includes('катар') || t.includes('перерыв')) {
        return { category: 'REST', energy: 'rest' };
    }
    if (t.includes('объект') || t.includes('узл') || t.includes('конструктив') || t.includes('лестниц') || t.includes('lucky') || t.includes('падел') || t.includes('аудит')) {
        return { category: 'A', energy: 'high' };
    }
    if (t.includes('duolingo') || t.includes('английск') || t.includes('язык') || t.includes('рутин') || t.includes('итог') || t.includes('результат')) {
        return { category: 'C', energy: 'low' };
    }
    return { category: 'B', energy: 'medium' };
}

function fillNearestFreeWindow(title, energy = 'medium', slotId = null) {
    if (!title || !title.trim()) return;
    const cleanTitle = title.trim();

    let slot = slotId
        ? state.schedule.find(s => s.id === slotId)
        : state.schedule.find(s => s.type === 'free' && !s.done);

    if (!slot) {
        slot = state.schedule.find(s => !s.done && s.type !== 'routine');
    }

    if (slot) {
        slot.title = cleanTitle;
        slot.type = energy === 'rest' ? 'break' : 'work';
        slot.energy = energy;
        slot.done = false;
    } else {
        const sorted = [...state.schedule].sort((a, b) => timeToMinutes(a.end) - timeToMinutes(b.end));
        const lastEndMin = sorted.length ? timeToMinutes(sorted[sorted.length - 1].end) : 18 * 60;
        const newStartMin = Math.min(21 * 60, Math.max(9 * 60, lastEndMin));
        const newEndMin = Math.min(22 * 60 + 30, newStartMin + 60);

        state.schedule.push({
            id: 'slot-' + Date.now(),
            start: minutesToTime(newStartMin),
            end: minutesToTime(newEndMin),
            title: cleanTitle,
            type: energy === 'rest' ? 'break' : 'work',
            energy,
            done: false
        });
    }

    state.schedule = deduplicateScheduleArray(state.schedule);
    renderAll();
    showToast(`Поставлено в план: ${cleanTitle.slice(0, 28)}...`, '📅');
}

function assignCustomToFreeWindow() {
    const input = document.getElementById('custom-window-input');
    if (!input || !input.value.trim()) return;
    const cls = classifyEnergyByText(input.value.trim());
    fillNearestFreeWindow(input.value.trim(), cls.energy);
    input.value = '';
}

function toggleSlotDone(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (slot) {
        slot.done = !slot.done;
        playTactileClick(slot.done);
        renderAll();
        showToast(slot.done ? `✓ Слот выполнен: ${slot.title.slice(0, 28)}...` : 'Слот возвращён в работу', slot.done ? '✅' : '↩️');
    }
}

function clearOrRemoveSlot(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (!slot) return;
    if (slot.type !== 'free') {
        slot.title = 'Свободное окно';
        slot.type = 'free';
        slot.energy = 'medium';
        slot.done = false;
        showToast('Окно освобождено', '✨');
    } else if (state.schedule.length > 1) {
        state.schedule = state.schedule.filter(s => s.id !== slotId);
        showToast('Слот удалён', '🗑️');
    }
    renderAll();
}

function completeCurrentFocus() {
    const current = state.schedule.find(s => !s.done && s.type !== 'free') || state.schedule.find(s => !s.done);
    if (current) {
        current.done = true;
        // Если задача есть в Банке задач — тоже отмечаем выполненной
        const matchTask = state.tasks.find(t => t.title.trim().toLowerCase() === current.title.trim().toLowerCase());
        if (matchTask) matchTask.done = true;

        playTactileClick(true);
        renderAll();
        showToast(`✓ Задача в фокусе выполнена!`, '🎉');
    }
}

function addTomorrowTask() {
    const input = document.getElementById('tomorrow-input');
    const select = document.getElementById('task-category-select');
    if (!input || !input.value.trim()) return;

    const title = input.value.trim();
    const selVal = select ? select.value : 'AUTO';

    let cat = 'B';
    let complexity = 'medium';

    if (selVal === 'AUTO') {
        const autoCls = classifyEnergyByText(title);
        cat = autoCls.category;
        complexity = autoCls.energy;
    } else {
        cat = selVal;
        complexity = cat === 'A' ? 'high' : cat === 'B' ? 'medium' : cat === 'REST' ? 'rest' : 'low';
    }

    state.tasks.unshift({
        id: 'task-' + Date.now(),
        title,
        category: cat,
        complexity,
        done: false
    });
    input.value = '';
    renderAll();
    showToast(`Добавлена задача (Кат. ${cat})`, '📋');
}

function removeTask(taskId, event) {
    if (event) event.stopPropagation();
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderAll();
    showToast('Задача удалена', '🗑️');
}

function moveTomorrowToToday() {
    const score = getBatteryScore();
    const activeTasks = state.tasks.filter(t => !t.done);
    const sorted = [...activeTasks].sort((a, b) => {
        if (score >= 80) return (a.category === 'A' ? -1 : 1) - (b.category === 'A' ? -1 : 1);
        return (a.category === 'C' ? -1 : 1) - (b.category === 'C' ? -1 : 1);
    });

    let count = 0;
    for (const task of sorted) {
        const free = state.schedule.find(s => s.type === 'free' && !s.done);
        if (!free) break;
        free.title = task.title;
        free.type = task.complexity === 'rest' ? 'break' : 'work';
        free.energy = task.complexity || 'medium';
        count++;
    }
    renderAll();
    showToast(count > 0 ? `Распределено задач по окнам: ${count}` : 'Нет свободных окон для распределения', '✨');
}

function filterTasks(cat) {
    state.activeTaskFilter = cat;
    document.querySelectorAll('.task-filter-row .chip').forEach(btn => {
        const onClickStr = btn.getAttribute('onclick') || '';
        btn.classList.toggle('active', onClickStr.includes(`'${cat}'`));
    });
    renderAll();
}

function toggleHoldPoint(hpId) {
    const hp = state.holdPoints.find(h => h.id === hpId);
    if (hp) {
        hp.done = !hp.done;
        playTactileClick(hp.done);
        renderAll();
        showToast(hp.done ? '✓ Стоп-точка подтверждена!' : 'Стоп-точка снята', '🛑');
    }
}

function switchPage(pageId) {
    state.currentPage = pageId;
    document.querySelectorAll('.page-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `page-${pageId}`);
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.id === `nav-${pageId}`);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveState();
}

function toggleDayType() {
    state.dayType = state.dayType === 'work' ? 'weekend' : 'work';
    renderAll();
    showToast(state.dayType === 'work' ? '🛠 Включён рабочий режим' : '☕ Включён режим выходного дня', '🔄');
}

function setDayType(type) {
    state.dayType = type === 'weekend' ? 'weekend' : 'work';
    renderAll();
    showToast(state.dayType === 'work' ? '🛠 Будний режим' : '☕ Выходной режим', '⚡');
}

function setMorningMood(mood) {
    state.morningMood = mood;
    renderAll();
    showToast('Самочувствие учтено в расчёте батареи', '🔋');
}

function changeSleepScore(delta) {
    state.manualOffset = Math.max(-45, Math.min(45, (state.manualOffset || 0) + Number(delta)));
    renderAll();
    showToast(`Заряд батареи: ${getBatteryScore()}%`, '🔋');
}

function updateHealthMetric(key, val) {
    state.health[key] = key === 'bedtime' ? val : Number(val);
    state.health.lastSync = 'Откалибровано вручную • только что';
    renderAll();
}

function handleRecommendationAction(idx) {
    const rec = generateFourRecommendations()[idx];
    if (!rec) return;
    if (rec.actionPage) {
        switchPage(rec.actionPage);
    } else if (rec.actionTask) {
        fillNearestFreeWindow(rec.actionTask, rec.actionEnergy || 'high');
    }
}

function toggleDetailedRecs() {
    state.showDetailedRecs = !state.showDetailedRecs;
    renderMainRecommendationCard();
}

function activateLowEnergyMode() {
    state.morningMood = 'low';
    state.schedule.forEach(slot => {
        if (!slot.done && slot.energy === 'high') {
            slot.title = 'Перерыв и щадящая работа по чек-листу';
            slot.energy = 'rest';
        }
    });
    renderAll();
    showToast('🛋 Включён бережный режим сохранения энергии', '🛋');
}

function autoFillScheduleByEnergy() {
    moveTomorrowToToday();
    switchPage('calendar');
}

function protectMorningBlock() {
    const morning = state.schedule.find(s => s.start.startsWith('09') || s.start.startsWith('10')) || state.schedule[0];
    if (morning) {
        morning.title = '🛡️ Защищённый блок Кат. А: Главная задача без телефона';
        morning.type = 'focus';
        morning.energy = 'high';
        morning.done = false;
    }
    renderAll();
    showToast('🛡️ Утренний час защищён под Категорию А', '🛡️');
}

function parseCalendarStringPayload(rawStr) {
    if (!rawStr || !rawStr.trim()) return [];
    const decoded = decodeURIComponent(rawStr.trim());
    const events = [];
    const chunks = decoded.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
    chunks.forEach(chunk => {
        const match = chunk.match(/(\d{1,2}:\d{2})\s*[-—–]\s*(\d{1,2}:\d{2})\s*[|:]?\s*(.+)/);
        if (match) {
            events.push({ start: match[1].padStart(5, '0'), end: match[2].padStart(5, '0'), title: match[3].trim() });
        }
    });
    return events;
}

function mergeExternalEventsIntoSchedule(externalEvents, sourceLabel = 'Календарь') {
    if (!Array.isArray(externalEvents) || !externalEvents.length) return;
    externalEvents.forEach((ev, idx) => {
        const cls = classifyEnergyByText(ev.title);
        state.schedule.push({
            id: `ext-${Date.now()}-${idx}`,
            start: ev.start || '10:30',
            end: ev.end || '12:00',
            title: ev.title,
            type: cls.energy === 'rest' ? 'break' : 'work',
            energy: cls.energy,
            source: sourceLabel,
            done: false
        });
    });
    state.schedule = deduplicateScheduleArray(state.schedule);
    renderAll();
}

function importExternalTasksList(rawTasksInput, sourceLabel = 'Напоминания') {
    const titles = decodeURIComponent(String(rawTasksInput || ''))
        .split(/[;\n|]+/)
        .map(s => s.trim())
        .filter(s => s.length > 2);
    let added = 0;
    titles.forEach((clean, idx) => {
        if (!state.tasks.some(t => t.title.toLowerCase() === clean.toLowerCase())) {
            const cls = classifyEnergyByText(clean);
            state.tasks.unshift({ id: `ext-t-${Date.now()}-${idx}`, title: clean, category: cls.category, complexity: cls.energy, done: false, source: sourceLabel });
            added++;
        }
    });
    if (added > 0) renderAll();
    return added;
}

function importIcsCalendar(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const content = String(e.target.result || '');
        const blocks = content.split('BEGIN:VEVENT').slice(1);
        const events = [];
        blocks.forEach(block => {
            const summaryMatch = block.match(/SUMMARY[^:]*:(.+)/i);
            const dtStartMatch = block.match(/DTSTART[^:]*:(\d{8}T\d{4,6})/i);
            const dtEndMatch = block.match(/DTEND[^:]*:(\d{8}T\d{4,6})/i);
            if (summaryMatch) {
                const title = summaryMatch[1].trim();
                const start = dtStartMatch ? `${dtStartMatch[1].slice(9, 11)}:${dtStartMatch[1].slice(11, 13)}` : '11:00';
                const end = dtEndMatch ? `${dtEndMatch[1].slice(9, 11)}:${dtEndMatch[1].slice(11, 13)}` : addMinutes(start, 60);
                events.push({ start, end, title });
            }
        });
        if (events.length > 0) {
            mergeExternalEventsIntoSchedule(events.slice(0, 8), 'Импорт .ics');
            closeAllModals();
            showToast(`Импортировано событий: ${events.length}`, '📅');
        }
    };
    reader.readAsText(file);
}

function importQuickPastedEvents() {
    const input = document.getElementById('quick-cal-paste-input');
    if (!input || !input.value.trim()) return;
    const events = parseCalendarStringPayload(input.value.trim());
    if (events.length > 0) {
        mergeExternalEventsIntoSchedule(events, 'Быстрый импорт');
        input.value = '';
        closeAllModals();
        showToast(`Добавлено встреч: ${events.length}`, '📅');
    }
}

function openSyncHubModal() {
    const input = document.getElementById('shortcut-name-input');
    if (input) input.value = state.shortcutName || 'Планировщик';
    document.getElementById('sync-hub-modal')?.classList.remove('hidden');
}

function openAddSlotModal() {
    document.getElementById('add-slot-modal')?.classList.remove('hidden');
}

function openStepsModal() {
    const modal = document.getElementById('steps-modal');
    const input = document.getElementById('steps-input');
    if (input) input.value = state.health.steps;
    if (modal) modal.classList.remove('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function saveNewSlot() {
    const start = document.getElementById('new-slot-start')?.value || '14:00';
    const end = document.getElementById('new-slot-end')?.value || '15:30';
    const title = document.getElementById('new-slot-title')?.value.trim() || 'Свободное окно';
    const energy = document.getElementById('new-slot-energy')?.value || 'medium';

    state.schedule.push({
        id: 'slot-' + Date.now(),
        start,
        end,
        title,
        type: energy === 'free' ? 'free' : energy === 'rest' ? 'break' : 'work',
        energy,
        done: false
    });
    state.schedule = deduplicateScheduleArray(state.schedule);
    closeAllModals();
    renderAll();
    showToast('Новый слот добавлен в план', '📅');
}

function saveStepsManual() {
    const val = parseInt(document.getElementById('steps-input')?.value, 10);
    if (!isNaN(val) && val >= 0) {
        state.health.steps = val;
        state.health.lastSync = 'Шаги обновлены • только что';
        showToast(`Шаги обновлены: ${val}`, '👟');
    }
    closeAllModals();
    renderAll();
}

function copyShortcutUrl() {
    const box = document.getElementById('healthkit-shortcut-url');
    if (box && navigator.clipboard) {
        navigator.clipboard.writeText(box.textContent.trim());
        showToast('Ссылка скопирована в буфер обмена!', '📋');
    }
}

function timeToMinutes(timeStr) {
    const [h, m] = String(timeStr || '09:00').split(':').map(Number);
    if (isNaN(h)) return 540;
    return h * 60 + (m || 0);
}

function minutesToTime(totalMins) {
    const clamped = ((totalMins % 1440) + 1440) % 1440;
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function addMinutes(timeStr, mins) {
    return minutesToTime(timeToMinutes(timeStr) + mins);
}

function startVoiceInput(inputId, btnId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!SpeechRecognition) {
        if (input) input.focus();
        return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    if (btn) btn.style.borderColor = '#f43f5e';
    rec.start();
    rec.onresult = (e) => {
        if (input) input.value = e.results[0][0].transcript;
    };
    rec.onend = () => {
        if (btn) btn.style.borderColor = '';
    };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* =========================================================
   8. АВТОЗАПУСК И АВТОСИНХРОНИЗАЦИЯ ПРИ ОТКРЫТИИ
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    attachGlobalButtonRipple();
    parseUrlHealthTelemetry();
    checkMorningAutoSync();
    renderAll();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            parseUrlHealthTelemetry();
            checkMorningAutoSync();
            renderAll();
        }
    });
});
