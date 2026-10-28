/**
 * Ритм Дня v4.5 (облако) — Биометрическая система управления энергией, Календарём и Задачами
 * Оптимизировано для iPhone 16 Pro Max (iOS 27.0.1)
 * Ключевое отличие v4.3:
 *  - При первом запуске (и до синхронизации) приложение находится в состоянии ПУСТОГО ШАБЛОНА (isSynced: false):
 *    батарея 0% (--%), карточки Здоровья показывают прочерки (--), расписание Календаря и список Задач пусты.
 *  - После синхронизации (через URL-параметры команды «Планировщик» или кнопку «🔄 Синхронизировать»)
 *    подгружаются актуальные показатели состояния, задачи и слоты календаря, и включается цветовой градиент (80-100%, 50-79%, <=49%).
 */

const STORAGE_KEY = 'ritm_dnya_state_v4_3'; // ключ не меняем — данные v4.3 сохраняются
const todayStr = () => {
    // Локальная дата (а не UTC): toISOString() после 00:00 по местному времени давал «вчера»
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Значения по умолчанию, если с часов пришла только часть данных. Помечаются как «оценочные».
const HEALTH_DEFAULTS = { sleepHours: 7.4, deepSleepHours: 2.3, bedtime: '23:20', activeCalories: 480, steps: 6400, restingHR: 55 };
const numOr = (v, fallback) => (Number.isFinite(v) ? v : fallback); // в отличие от «||» не заменяет 0
const safeDecode = (str) => { try { return decodeURIComponent(str); } catch (_) { return str; } };

const TASK_ENERGY_RATES = {
    high: -5.0,    // Категория А: сложные узлы, конструктив, высокий риск
    medium: -2.8,  // Категория Б: координация, проверка стоп-точек по чек-листу
    low: -1.2,     // Категория В: легкая рутина, языки, фиксация итогов
    rest: +6.0,    // Активное восстановление: обед без экрана, прогулка, дневной сон
    free: -0.5     // Свободное окно
};

// Шаблоны расписания и задач, которые подгружаются ТОЛЬКО ПОСЛЕ СИНХРОНИЗАЦИИ
const SYNCED_TEMPLATE_SCHEDULE = [
    { id: 'slot-1', start: '08:30', end: '09:30', title: 'Подъём по будильнику, завтрак, синк Планировщик → HealthKit', type: 'routine', energy: 'low', done: true },
    { id: 'slot-2', start: '09:30', end: '10:30', title: 'Защищённый блок: Главная стратегическая задача (Категория А)', type: 'focus', energy: 'high', done: false },
    { id: 'slot-3', start: '10:30', end: '13:00', title: 'Свободное окно', type: 'free', energy: 'high', done: false },
    { id: 'slot-4', start: '13:00', end: '14:00', title: 'Обед и восстановление ресурса (без рабочих чатов)', type: 'break', energy: 'rest', done: false },
    { id: 'slot-5', start: '14:00', end: '16:30', title: 'Свободное окно', type: 'free', energy: 'medium', done: false },
    { id: 'slot-6', start: '17:00', end: '19:00', title: 'Свободное окно', type: 'free', energy: 'low', done: false },
    { id: 'slot-7', start: '20:00', end: '21:00', title: 'Английский (Duolingo 15 мин) и вечерняя разгрузка', type: 'routine', energy: 'low', done: false }
];

const SYNCED_TEMPLATE_TASKS = [
    { id: 'task-1', title: 'Согласовать с Олегом конструктив лестницы, узлы и поручень', category: 'A', complexity: 'high', done: false },
    { id: 'task-2', title: 'Падел-клуб / ЖК Lucky — аудит критических узлов и стоп-точек приёмки', category: 'A', complexity: 'high', done: false },
    { id: 'task-3', title: 'Проверить спецификацию по лаку и диффузоры вентиляции с Антоном', category: 'B', complexity: 'medium', done: false },
    { id: 'task-4', title: 'Отправить подрядчику чек-лист приёмки вместо ручной переделки чертежей', category: 'B', complexity: 'medium', done: false },
    { id: 'task-5', title: 'Зафиксировать 3 главных результата недели и предотвращённые риски', category: 'C', complexity: 'low', done: false }
];

// Состояние ПУСТОГО ШАБЛОНА при первом запуске (isSynced: false)
const emptyInitialState = {
    isSynced: false,
    dayType: 'work',
    morningMood: 'high',
    manualOffset: 0,
    showDetailedRecs: true,
    shortcutName: 'Планировщик',
    selectedTaskId: null,
    health: {
        sleepHours: null,
        deepSleepHours: null,
        bedtime: '--:--',
        activeCalories: null,
        steps: null,
        stepsGoal: 10000,
        restingHR: null,
        lastSync: 'Шаблон пуст • Ожидание синхронизации',
        lastSyncDate: null
    },
    syncMeta: {
        lastCalendarSync: 'Ожидание синхронизации расписания',
        importedEventsCount: 0
    },
    holdPoints: [
        { id: 'hp-1', title: 'Защищён первый утренний блок (60 мин на Категорию А без телефона)', done: false },
        { id: 'hp-2', title: 'Стоп-точка 1 (Качество): узел выполнен по проекту без отступлений', done: false },
        { id: 'hp-3', title: 'Стоп-точка 2 (Объём): фактические замеры сходятся со сметой', done: false },
        { id: 'hp-4', title: 'Стоп-точка 3 (Документация): исполнительная схема и акты получены', done: false },
        { id: 'hp-5', title: 'Отказ от «спасательства»: вместо переделки за смежника выдан чек-лист', done: false }
    ],
    schedule: [], // Пусто до синхронизации!
    tasks: [],    // Пусто до синхронизации!
    activeTaskFilter: 'all',
    currentPage: 'home',
    lastActiveDate: null,
    updatedAt: 0,
    lastInboxId: null,
    estimatedFields: []
};

let state = loadState();
const serializeForCompare = (st) => { const { updatedAt, ...rest } = st; return JSON.stringify(rest); };
let lastSerialized = serializeForCompare(state);
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
    }, 2400);
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
   2. ЗАГРУЗКА СОСТОЯНИЯ И СБРОС В ПУСТОЙ ШАБЛОН
   ========================================================= */
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(emptyInitialState));
        return normalizeState(JSON.parse(raw));
    } catch (e) {
        return JSON.parse(JSON.stringify(emptyInitialState));
    }
}

// Приводит любой сохранённый/облачный снимок к актуальной структуре
function normalizeState(parsed) {
    parsed = parsed && typeof parsed === 'object' ? parsed : {};
    return {
        ...JSON.parse(JSON.stringify(emptyInitialState)),
        ...parsed,
        health: { ...emptyInitialState.health, ...(parsed.health || {}) },
        syncMeta: { ...emptyInitialState.syncMeta, ...(parsed.syncMeta || {}) },
        schedule: Array.isArray(parsed.schedule) ? deduplicateScheduleArray(parsed.schedule) : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        holdPoints: Array.isArray(parsed.holdPoints) ? parsed.holdPoints : JSON.parse(JSON.stringify(emptyInitialState.holdPoints))
    };
}

// Новый день: сбрасываем отметки «выполнено», внешние события вчерашнего дня и ручную коррекцию.
// Без этого встречи из Календаря копились бы бесконечно, а вчерашние галочки влияли на заряд сегодня.
function rolloverIfNewDay() {
    const today = todayStr();
    if (state.lastActiveDate === today) return false;
    if (state.lastActiveDate) {
        state.schedule = state.schedule.filter(s => !s.source);
        state.schedule.forEach(s => { s.done = false; });
        state.tasks = state.tasks.filter(t => !t.done);
        state.holdPoints.forEach(h => { h.done = false; });
        state.manualOffset = 0;
        state.selectedTaskId = null;
    }
    state.lastActiveDate = today;
    return true;
}

function isHealthStale() {
    return state.isSynced && state.health.lastSyncDate && state.health.lastSyncDate !== todayStr();
}

function saveState() {
    try {
        // updatedAt меняется только при реальных изменениях — иначе «старое» устройство
        // перетирало бы свежие данные облака обычной перерисовкой экрана
        const ser = serializeForCompare(state);
        if (ser !== lastSerialized) {
            lastSerialized = ser;
            state.updatedAt = Date.now();
            scheduleCloudPush();
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Ошибка сохранения localStorage:', e);
    }
}

// Сброс в чистый пустой шаблон (как при самом первом запуске)
function resetToEmptyTemplate() {
    const keepInbox = state.lastInboxId; // чтобы уже применённое сообщение из облака не вернуло данные обратно
    state = JSON.parse(JSON.stringify(emptyInitialState));
    state.lastInboxId = keepInbox;
    saveState();
    renderAll();
    showToast('Включён чистый пустой шаблон (ожидание синхронизации)', '🧹');
}

function deduplicateScheduleArray(scheduleArr) {
    if (!Array.isArray(scheduleArr)) return [];
    const seenKeys = new Set();
    const cleaned = [];

    for (const slot of scheduleArr) {
        if (!slot || !slot.title) continue;
        // Ключ = время + название: одинаковые задачи в РАЗНОЕ время больше не склеиваются
        const uniqueKey = `${slot.start}-${slot.end}|${slot.title.trim().toLowerCase()}`;
        if (seenKeys.has(uniqueKey)) continue;
        seenKeys.add(uniqueKey);
        cleaned.push(slot);
    }

    return cleaned.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

/* =========================================================
   3. СИНХРОНИЗАЦИЯ И ЗАПОЛНЕНИЕ ПУСТОГО ШАБЛОНА ДАННЫМИ
   ========================================================= */
function openLiveSyncModal() {
    const modal = document.getElementById('live-sync-modal');
    if (!modal) return;

    // Если данные уже были синхронизированы, подставляем их в поля окна
    if (state.isSynced && state.health.sleepHours !== null) {
        document.getElementById('sync-input-sleep').value = state.health.sleepHours;
        document.getElementById('sync-input-deep').value = state.health.deepSleepHours;
        document.getElementById('sync-input-bedtime').value = state.health.bedtime !== '--:--' ? state.health.bedtime : '23:15';
        document.getElementById('sync-input-steps').value = state.health.steps;
        document.getElementById('sync-input-calories').value = state.health.activeCalories;
        document.getElementById('sync-input-hr').value = state.health.restingHR;
    }

    const shortcutInput = document.getElementById('shortcut-name-input');
    if (shortcutInput) shortcutInput.value = state.shortcutName || 'Планировщик';

    const cfg = getCloudCfg();
    const urlIn = document.getElementById('cloud-url-input');
    const tokIn = document.getElementById('cloud-token-input');
    if (urlIn && cfg) urlIn.value = cfg.url;
    if (tokIn && cfg) tokIn.value = cfg.token;
    setCloudStatus(cloudStatus);

    modal.classList.remove('hidden');
}

// Пошаговая синхронизация, которая заполняет пустой шаблон данными состояния, календаря и задач
let syncInProgress = false;
function executeLiveTemplateSync() {
    if (syncInProgress) return; // защита от двойного нажатия
    syncInProgress = true;
    const progressBox = document.getElementById('sync-progress-box');
    const stepText = document.getElementById('sync-step-text');
    const progressBar = document.getElementById('sync-progress-bar');

    if (progressBox) progressBox.classList.remove('hidden');
    if (stepText) stepText.textContent = '1/3 • Чтение показателей состояния (HUAWEI Health / HealthKit)...';
    if (progressBar) progressBar.style.width = '35%';

    const estimated = [];
    const readNum = (id, key, parser) => {
        const raw = document.getElementById(id)?.value;
        const v = parser(String(raw ?? '').replace(',', '.'));
        if (Number.isFinite(v)) return v;
        estimated.push(key);
        return HEALTH_DEFAULTS[key];
    };
    const sleepVal = readNum('sync-input-sleep', 'sleepHours', parseFloat);
    const deepVal = readNum('sync-input-deep', 'deepSleepHours', parseFloat);
    const stepsVal = readNum('sync-input-steps', 'steps', v => parseInt(v, 10));
    const calVal = readNum('sync-input-calories', 'activeCalories', v => parseInt(v, 10));
    const hrVal = readNum('sync-input-hr', 'restingHR', v => parseInt(v, 10));
    let bedtimeVal = document.getElementById('sync-input-bedtime')?.value;
    if (!bedtimeVal) { bedtimeVal = HEALTH_DEFAULTS.bedtime; estimated.push('bedtime'); }

    setTimeout(() => {
        if (stepText) stepText.textContent = '2/3 • Подгрузка расписания Календаря и свободных окон...';
        if (progressBar) progressBar.style.width = '70%';
    }, 280);

    setTimeout(() => {
        if (stepText) stepText.textContent = '3/3 • Загрузка Банка задач (Категории А, Б, В)...';
        if (progressBar) progressBar.style.width = '100%';
    }, 560);

    setTimeout(() => {
        // Записываем синхронизированные данные состояния
        state.isSynced = true;
        state.health.sleepHours = sleepVal;
        state.health.deepSleepHours = deepVal;
        state.health.bedtime = bedtimeVal;
        state.health.steps = stepsVal;
        state.health.activeCalories = calVal;
        state.health.restingHR = hrVal;

        const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        state.estimatedFields = estimated;
        state.health.lastSync = `Синхронизировано в ${nowTime}` + (estimated.length ? ` • оценочно: ${estimated.length} из 6 показателей` : '');
        state.health.lastSyncDate = todayStr();
        rolloverIfNewDay();

        // Если шаблон расписания пуст — подгружаем расписание дня
        if (!state.schedule || state.schedule.length === 0) {
            state.schedule = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_SCHEDULE));
        }

        // Если шаблон задач пуст — подгружаем Банк задач
        if (!state.tasks || state.tasks.length === 0) {
            state.tasks = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_TASKS));
        }

        state.syncMeta.lastCalendarSync = `Синхронизировано сегодня в ${nowTime} • Активно слотов: ${state.schedule.length}`;

        syncInProgress = false;
        if (progressBox) progressBox.classList.add('hidden');
        closeAllModals();
        playTactileClick(true);
        renderAll();
        showToast(`Данные подгружены! Заряд: ${getBatteryScore()}%`, '✅');
    }, 850);
}

// Автоматическая синхронизация при переходе по ссылке из команды «Планировщик» (?sleep=...&steps=...)
function parseUrlHealthTelemetry() {
    return applyTelemetryParams(new URLSearchParams(window.location.search), true);
}

// Общий разбор параметров: приходят либо из адресной строки, либо из облачного «inbox» команды iPhone
function applyTelemetryParams(params, fromUrl) {
    try {
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

        if (params.has('autoSync')) {
            updated = true;
        }
        const estimated = [];

        // Если пришли данные из URL — активируем синхронизированный режим и заполняем пустой шаблон!
        if (updated) {
            state.isSynced = true;
            rolloverIfNewDay(); // новый день → чистые отметки, потом применяем свежие события
            Object.keys(HEALTH_DEFAULTS).forEach(k => {
                const missing = state.health[k] === null || state.health[k] === undefined || state.health[k] === '--:--';
                if (missing) { state.health[k] = HEALTH_DEFAULTS[k]; estimated.push(k); }
            });
            state.estimatedFields = estimated;

            if (!state.schedule || state.schedule.length === 0) {
                state.schedule = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_SCHEDULE));
            }
            if (!state.tasks || state.tasks.length === 0) {
                state.tasks = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_TASKS));
            }

            if (params.has('cal')) {
                const parsedEvents = parseCalendarStringPayload(params.get('cal'));
                if (parsedEvents.length > 0) {
                    mergeExternalEventsIntoSchedule(parsedEvents, 'Календарь iOS');
                }
            }

            if (params.has('tasks')) {
                importExternalTasksList(params.get('tasks'), 'Напоминания');
            }

            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            state.health.lastSync = `Синхронизировано из «Планировщика» в ${timeStr}` + (estimated.length ? ` • оценочно: ${estimated.length} из 6` : '');
            state.health.lastSyncDate = todayStr();
            state.syncMeta.lastCalendarSync = `Подгружено из команды «Планировщик» (${timeStr})`;
            if (fromUrl) window.history.replaceState({}, document.title, window.location.pathname);
            saveState();
            setTimeout(() => showToast(`Синхронизировано! Заряд: ${getBatteryScore()}%`, '📲'), 200);
        }
        return updated;
    } catch (e) {
        console.warn('Ошибка чтения URL-параметров:', e);
        return false;
    }
}

function runPlannerShortcut() {
    const input = document.getElementById('shortcut-name-input');
    const name = (input && input.value.trim()) ? input.value.trim() : (state.shortcutName || 'Планировщик');
    state.shortcutName = name;
    saveState();

    showToast(`Запуск команды «${name}»...`, '⌚');
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
}

/* =========================================================
   4. МАТЕМАТИЧЕСКОЕ ЯДРО И ЦВЕТОВОЙ ГРАДИЕНТ (80-100, 50-79, <=49)
   ========================================================= */
function parseBedtimePoints(bedtimeStr) {
    if (!bedtimeStr || typeof bedtimeStr !== 'string' || bedtimeStr === '--:--') return 0;
    const [h, m] = bedtimeStr.split(':').map(Number);
    if (isNaN(h)) return 0;
    let dec = h + (m || 0) / 60;
    if (dec < 6) dec += 24;               // 00:30 → 24.5, чтобы ночь шла непрерывно после 23:59
    if (dec <= 23) return 5;              // отбой до 23:00 — полный бонус (как в правиле «батарейки»)
    if (dec < 24) return Math.round(5 * (24 - dec)); // 23:00–24:00 — плавно 5 → 0
    if (dec <= 30) return -Math.min(12, Math.round((dec - 24) * 3.5)); // после полуночи — штраф до −12
    return 0;                             // дневное время (6:00–20:00) — не считается отбоем
}

function getSlotDurationHours(slot) {
    if (!slot || !slot.start || !slot.end) return 1.0;
    const diff = (timeToMinutes(slot.end) - timeToMinutes(slot.start)) / 60;
    return Math.max(0.25, Math.min(6, diff > 0 ? diff : 1.0));
}

function calculateEnergyBreakdown() {
    if (!state.isSynced) {
        return {
            total: 0,
            baseHealthTotal: 0,
            sleepPoints: 0,
            deepPoints: 0,
            bedtimePoints: 0,
            loadPenalty: 0,
            tasksNetDelta: 0,
            moodAdjustment: 0,
            manualOffset: 0,
            overloadRisk: 0
        };
    }

    const sleepHours = Number(state.health.sleepHours) || 0;
    const deepSleepHours = Number(state.health.deepSleepHours) || 0;
    const bedtime = state.health.bedtime;
    const activeCalories = Number(state.health.activeCalories) || 0;
    const steps = Number(state.health.steps) || 0;
    const restingHR = Number(state.health.restingHR) || 58;

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

function getEnergyVisualProfile(score) {
    if (!state.isSynced) {
        return {
            level: 'uninitialized',
            bodyClass: 'theme-uninitialized',
            themeColorHex: '#070d14',
            zoneCaption: 'Шаблон пуст • Нажмите «Синхронизировать» для загрузки данных',
            mainTag: 'ПУСТОЙ ШАБЛОН',
            subTag: 'ОЖИДАНИЕ СИНХРОНИЗАЦИИ',
            badge: '⏳ Ожидание синхронизации',
            liquidGradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)',
            ringColor: '#38bdf8'
        };
    }
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
    if (!state.isSynced) {
        // Если ещё не синхронизировано — сначала подгружаем шаблон
        state.isSynced = true;
        Object.assign(state.health, HEALTH_DEFAULTS);
        state.estimatedFields = Object.keys(HEALTH_DEFAULTS);
        if (!state.schedule.length) state.schedule = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_SCHEDULE));
        if (!state.tasks.length) state.tasks = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_TASKS));
    }
    state.manualOffset = 0;
    const currentWithoutOffset = calculateEnergyBreakdown().total;
    state.manualOffset = Math.max(-90, Math.min(90, targetScore - currentWithoutOffset));
    renderAll();
    showToast(`Включён цветовой режим: ${targetScore}%`, '🎨');
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
    // Приоритет: защищённый фокус-блок → свободное окно. Рутину и перерывы не затираем.
    let focusSlot = state.schedule.find(s => !s.done && s.type === 'focus')
        || state.schedule.find(s => !s.done && s.type === 'free');
    if (focusSlot) {
        focusSlot.title = task.title;
        focusSlot.type = task.complexity === 'rest' ? 'break' : 'focus';
        focusSlot.energy = task.complexity || 'high';
        focusSlot.done = false;
    } else {
        state.schedule.push({
            id: 'slot-' + Date.now(),
            start: '10:00',
            end: '12:00',
            title: task.title,
            type: 'focus',
            energy: task.complexity || 'high',
            done: false
        });
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
}

let pendingSlotId = null; // окно, по которому нажали в календаре
function openTaskPickerModal(slotId = null) {
    pendingSlotId = typeof slotId === 'string' ? slotId : null;
    if (!state.isSynced || state.tasks.length === 0) {
        openLiveSyncModal();
        return;
    }
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
                <button class="btn-primary-neon" style="flex:1; padding:7px;" onclick="pickTaskForSlot('${t.id}', event)">${pendingSlotId ? '📅 В это окно' : '🎯 В фокус сейчас'}</button>
                <button class="perm-btn" onclick="toggleTaskCompleted('${t.id}', event); closeAllModals();">${t.done ? '↩ Вернуть' : '✓ Выполнено'}</button>
            </div>
        </div>
    `).join('');

    modal.classList.remove('hidden');
}

function pickTaskForSlot(taskId, event) {
    if (event) event.stopPropagation();
    const task = state.tasks.find(t => t.id === taskId);
    const slotId = pendingSlotId;
    closeAllModals();
    if (!task) return;
    if (slotId && state.schedule.some(s => s.id === slotId)) {
        task.done = false;
        fillNearestFreeWindow(task.title, task.complexity || 'medium', slotId);
    } else {
        setTaskToFocusNow(taskId, null);
    }
    pendingSlotId = null;
}

/* =========================================================
   6. ОТРИСОВКА ИНТЕРФЕЙСА (ПУСТОЙ ШАБЛОН VS СИНХРОНИЗИРОВАННЫЙ)
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
    const pillText = document.getElementById('sync-pill-text');
    if (pillText) {
        pillText.textContent = !state.isSynced ? '🔄 Синхронизировать'
            : isHealthStale() ? '⚠ Данные за вчера — обновить' : '✓ Синхр. (Обновить)';
    }
}

function renderBatteryAndThemeAura() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const profile = getEnergyVisualProfile(score);

    document.body.classList.remove('theme-uninitialized', 'theme-high-green', 'theme-mid-yellow', 'theme-low-red-yellow');
    document.body.classList.add(profile.bodyClass);

    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', profile.themeColorHex);

    const banner = document.getElementById('empty-template-banner');
    if (banner) banner.classList.toggle('hidden', state.isSynced);

    const particlesBox = document.getElementById('energy-particles-box');
    if (particlesBox) particlesBox.style.opacity = state.isSynced ? '1' : '0';

    const zoneCaption = document.getElementById('aura-zone-caption');
    if (zoneCaption) zoneCaption.textContent = profile.zoneCaption;

    const scoreEl = document.getElementById('sleep-score');
    if (scoreEl) scoreEl.textContent = state.isSynced ? `${score}%` : '--%';

    const mainTagEl = document.getElementById('battery-state-tag');
    if (mainTagEl) mainTagEl.textContent = profile.mainTag;

    const subTagEl = document.getElementById('battery-sub-tag');
    if (subTagEl) subTagEl.textContent = profile.subTag;

    const liquidFill = document.getElementById('battery-bar-fill');
    if (liquidFill) {
        liquidFill.style.height = state.isSynced ? `${score}%` : '0%';
        liquidFill.style.background = profile.liquidGradient;
    }

    const ringProgress = document.getElementById('hud-ring-progress');
    if (ringProgress) {
        const circumference = 854;
        const dash = state.isSynced ? Math.round((score / 100) * 680) : 0;
        ringProgress.style.strokeDasharray = `${dash} ${circumference}`;
        ringProgress.style.stroke = profile.ringColor;
    }

    const drainBadge = document.getElementById('drain-rate-badge');
    if (drainBadge) {
        if (!state.isSynced) {
            drainBadge.textContent = '⏳ Ожидание синхронизации...';
        } else {
            const currentSlot = state.schedule.find(s => !s.done) || state.schedule[0];
            const currentRate = currentSlot ? (TASK_ENERGY_RATES[currentSlot.energy] ?? -2.0) : -1.2;
            const sign = currentRate > 0 ? '+' : '';
            drainBadge.textContent = currentRate > 0
                ? `🔋 Восстановление: ${sign}${currentRate}% / ч`
                : `⚡ Расход: ${currentRate}% / ч`;
        }
    }

    const offsetEl = document.getElementById('manual-offset');
    if (offsetEl) {
        offsetEl.textContent = state.manualOffset === 0
            ? 'Авто'
            : `${state.manualOffset > 0 ? '+' : ''}${state.manualOffset}%`;
    }
}

function renderBentoGrid() {
    const sleepEl = document.getElementById('metric-sleep-hours');
    if (sleepEl) {
        sleepEl.innerHTML = state.isSynced && state.health.sleepHours !== null
            ? `${Number(state.health.sleepHours).toFixed(1)} <small>ч</small>`
            : `-- <small>ч</small>`;
    }

    const deepEl = document.getElementById('metric-deep-sleep');
    if (deepEl) {
        deepEl.textContent = state.isSynced && state.health.deepSleepHours !== null
            ? Number(state.health.deepSleepHours).toFixed(1)
            : '--';
    }

    const calEl = document.getElementById('metric-calories');
    if (calEl) {
        calEl.textContent = state.isSynced && state.health.activeCalories !== null
            ? state.health.activeCalories
            : '--';
    }

    const stepsEl = document.getElementById('steps-count');
    if (stepsEl) {
        stepsEl.textContent = state.isSynced && state.health.steps !== null
            ? Number(state.health.steps).toLocaleString('ru-RU')
            : '--';
    }
}

function renderHomeQuickTasks() {
    const container = document.getElementById('home-quick-tasks');
    if (!container) return;

    if (!state.isSynced || state.tasks.length === 0) {
        container.innerHTML = `
            <li class="empty-state-placeholder">
                <p>Список задач пока пуст. Подгрузите задачи и расписание через синхронизацию или добавьте вручную.</p>
                <button class="btn-primary-neon" onclick="openLiveSyncModal()">🔄 Подгрузить задачи и состояние</button>
            </li>
        `;
        return;
    }

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
    const marker = document.getElementById('overload-marker');
    const riskText = document.getElementById('overload-status-text');
    const grid = document.getElementById('recommendations-grid');

    const btnWork0 = document.getElementById('btn-mode-workday');
    const btnWeek0 = document.getElementById('btn-mode-weekend');
    if (btnWork0) btnWork0.classList.toggle('active', state.dayType === 'work');
    if (btnWeek0) btnWeek0.classList.toggle('active', state.dayType === 'weekend');
    document.querySelectorAll('.mood-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mood === state.morningMood);
    });

    if (!state.isSynced) {
        if (prefixEl) prefixEl.textContent = '⏳ ШАБЛОН ОЖИДАЕТ СИНХРОНИЗАЦИИ:';
        if (bodyEl) bodyEl.textContent = 'После подгрузки данных с часов и календаря ИИ-координатор рассчитает ваш заряд и сформирует 4 персональные рекомендации.';
        if (marker) marker.style.left = '0%';
        if (riskText) {
            riskText.textContent = '--% (Ожидание данных)';
            riskText.className = 'risk-low';
        }
        if (grid) grid.innerHTML = '';
        return;
    }

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

    if (marker) marker.style.left = `${risk}%`;

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

    if (grid) {
        grid.style.display = state.showDetailedRecs ? 'grid' : 'none';
        const recs = generateFourRecommendations();
        grid.innerHTML = recs.map((r, idx) => `
            <div class="rec-item">
                <div>
                    <div class="rec-num">${escapeHtml(r.num)}</div>
                    <div class="rec-title">${escapeHtml(r.title)}</div>
                    <p class="rec-text">${escapeHtml(r.text)}</p>
                </div>
                <button class="rec-action-btn" onclick="handleRecommendationAction(${idx})">${escapeHtml(r.actionLabel)}</button>
            </div>
        `).join('');
    }
}

function generateFourRecommendations() {
    const score = getBatteryScore();
    const isHigh = score >= 80; // тот же порог, что у зелёной зоны
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

function renderFocusAndCoordinator() {
    const score = getBatteryScore();
    const profile = getEnergyVisualProfile(score);

    if (!state.isSynced || state.schedule.length === 0) {
        document.getElementById('focus-time').textContent = '--:-- — --:--';
        document.getElementById('focus-title').textContent = 'Шаблон пуст — нажмите «Синхронизировать»';
        document.getElementById('focus-desc').textContent = 'После синхронизации здесь появится текущая приоритетная задача и расчёт её влияния на батарею.';
        document.getElementById('focus-cost-label').textContent = '--%';
        document.getElementById('evening-forecast-label').textContent = '--%';
        document.getElementById('coordinator-energy-tag').textContent = '⏳ Шаблон';
        document.getElementById('assistant-text').textContent = 'Выполните синхронизацию, чтобы загрузить свободные окна календаря.';
        return;
    }

    const currentSlot = state.schedule.find(s => !s.done && s.type !== 'free')
        || state.schedule.find(s => !s.done)
        || state.schedule[state.schedule.length - 1];

    if (currentSlot) {
        const hrs = getSlotDurationHours(currentSlot);
        const rate = TASK_ENERGY_RATES[currentSlot.energy] ?? -2.0;
        const slotDelta = Math.round(rate * hrs);

        document.getElementById('focus-time').textContent = `${currentSlot.start} — ${currentSlot.end}`;
        document.getElementById('focus-title').textContent = currentSlot.title;
        document.getElementById('focus-desc').textContent = `Расход энергии слота: ${rate}%/ч • Нажми «✓ Выполнено» при завершении.`;

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
        const eveningForecast = Math.max(10, Math.min(100, Math.round(score + remainingDelta)));
        const forecastEl = document.getElementById('evening-forecast-label');
        if (forecastEl) forecastEl.textContent = `${eveningForecast}%`;
    }

    const coordTag = document.getElementById('coordinator-energy-tag');
    if (coordTag) coordTag.textContent = profile.badge;

    const freeSlot = state.schedule.find(s => s.type === 'free' && !s.done);
    const coordText = document.getElementById('assistant-text');
    if (coordText) {
        if (freeSlot) {
            coordText.innerHTML = `Свободно окно <strong>${freeSlot.start} — ${freeSlot.end}</strong>. Заряд <strong>${score}%</strong> — выбери задачу ниже:`;
        } else {
            coordText.textContent = `Все свободные окна на сегодня распределены! Текущий заряд: ${score}%.`;
        }
    }
}

function renderTimeline() {
    const container = document.getElementById('timeline-list');
    if (!container) return;

    const calSyncText = document.getElementById('calendar-sync-status-text');
    if (calSyncText) {
        calSyncText.textContent = state.syncMeta?.lastCalendarSync || 'Ожидание синхронизации';
    }

    if (!state.isSynced || state.schedule.length === 0) {
        const drainSummary = document.getElementById('timeline-drain-summary');
        if (drainSummary) drainSummary.textContent = 'Шаблон пуст';
        container.innerHTML = `
            <div class="empty-state-placeholder">
                <p>В шаблоне календаря пока нет событий. Нажмите кнопку синхронизации, чтобы подгрузить слоты дня и свободные окна.</p>
                <button class="btn-primary-neon" onclick="openLiveSyncModal()">🔄 Синхронизировать Календарь</button>
            </div>
        `;
        return;
    }

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
                 onclick="openTaskPickerModal('${slot.id}')">
                <div class="slot-info">
                    <div class="slot-time">${slot.start} — ${slot.end} (${hrs.toFixed(1)} ч)</div>
                    <div class="slot-title">${escapeHtml(slot.title)}</div>
                    <span class="slot-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="slot-controls" onclick="event.stopPropagation()">
                    <button class="slot-btn ${slot.done ? 'btn-slot-done-active' : ''}" onclick="toggleSlotDone('${slot.id}')" title="Отметить выполненным">✓</button>
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

    const list = document.getElementById('tomorrow-list');
    if (list) {
        if (!state.isSynced && state.tasks.length === 0) {
            list.innerHTML = `
                <li class="empty-state-placeholder">
                    <p>Банк задач пуст (режим чистого шаблона). Нажмите «Синхронизировать», чтобы подгрузить задачи, или добавьте новую задачу выше.</p>
                    <button class="btn-primary-neon" onclick="openLiveSyncModal()">🔄 Подгрузить список задач</button>
                </li>
            `;
        } else {
            const filtered = state.tasks.filter(t => {
                if (state.activeTaskFilter === 'all') return true;
                if (state.activeTaskFilter === 'DONE') return t.done === true;
                return t.category === state.activeTaskFilter;
            });
            list.innerHTML = filtered.length
                ? filtered.map(task => renderInteractiveTaskItemHtml(task)).join('')
                : '<li class="task-card-item"><span>В этой категории пока нет задач ✨</span></li>';
        }
    }

    const hpList = document.getElementById('hold-points-list');
    if (hpList) {
        hpList.innerHTML = state.holdPoints.map(hp => `
            <div class="hold-point-item" role="checkbox" aria-checked="${hp.done ? 'true' : 'false'}" tabindex="0" onclick="toggleHoldPoint('${hp.id}')">
                <input type="checkbox" ${hp.done ? 'checked' : ''} tabindex="-1" style="pointer-events:none;" aria-hidden="true" />
                <span style="${hp.done ? 'text-decoration:line-through; opacity:0.55;' : ''}">${escapeHtml(hp.title)}</span>
            </div>
        `).join('');
    }
}

function renderHealthPageBreakdown() {
    const b = calculateEnergyBreakdown();
    const statusBadge = document.getElementById('healthkit-sync-status');
    if (statusBadge) statusBadge.textContent = state.isSynced ? 'Синхронизировано ✓' : 'Пустой шаблон';

    const syncLabel = document.getElementById('last-sync-label');
    if (syncLabel) syncLabel.textContent = state.health.lastSync;

    if (!state.isSynced) {
        document.getElementById('val-sleep-hours').textContent = '-- ч';
        document.getElementById('val-deep-sleep').textContent = '-- ч';
        document.getElementById('val-calories').textContent = '-- ккал';
        document.getElementById('val-steps').textContent = '-- шагов';
        document.getElementById('val-hr').textContent = '-- уд/мин';

        const formulaBox = document.getElementById('formula-breakdown');
        if (formulaBox) {
            formulaBox.innerHTML = `
                <div class="empty-state-placeholder">
                    <p>Данные здоровья ещё не синхронизированы. Нажмите кнопку ниже, чтобы загрузить показатели с часов или HealthKit.</p>
                    <button class="btn-primary-neon" onclick="openLiveSyncModal()">🔄 Синхронизировать Здоровье</button>
                </div>
            `;
        }
    } else {
        syncSlider('slider-sleep', 'val-sleep-hours', state.health.sleepHours, v => `${Number(v).toFixed(1)} ч`);
        syncSlider('slider-deep', 'val-deep-sleep', state.health.deepSleepHours, v => `${Number(v).toFixed(1)} ч`);
        syncSlider('slider-calories', 'val-calories', state.health.activeCalories, v => `${v} ккал`);
        syncSlider('slider-steps', 'val-steps', state.health.steps, v => `${Number(v).toLocaleString('ru-RU')} шагов`);
        syncSlider('slider-hr', 'val-hr', state.health.restingHR, v => `${v} уд/мин`);

        const bedInput = document.getElementById('input-bedtime');
        if (bedInput && bedInput.value !== state.health.bedtime) bedInput.value = state.health.bedtime;

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
    }

    const base = window.location.origin + window.location.pathname;
    const urlBox = document.getElementById('healthkit-shortcut-url');
    if (urlBox) {
        const sl = state.health.sleepHours ?? 7.4;
        const dp = state.health.deepSleepHours ?? 2.3;
        const bt = state.health.bedtime !== '--:--' ? state.health.bedtime : '23:20';
        const cal = state.health.activeCalories ?? 480;
        const st = state.health.steps ?? 6400;
        const hr = state.health.restingHR ?? 55;
        const cfg = getCloudCfg();
        urlBox.textContent = cfg
            ? `${cfg.url}?action=ingest&token=${encodeURIComponent(cfg.token)}&sleep=${sl}&deep=${dp}&bedtime=${bt}&calories=${cal}&steps=${st}&hr=${hr}`
            : `${base}?sleep=${sl}&deep=${dp}&bedtime=${bt}&calories=${cal}&steps=${st}&hr=${hr}&autoSync=1`;
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

    if (!state.isSynced) {
        state.isSynced = true;
        if (state.health.sleepHours === null) {
            Object.assign(state.health, HEALTH_DEFAULTS);
            state.estimatedFields = Object.keys(HEALTH_DEFAULTS);
        }
    }

    let slot = slotId
        ? state.schedule.find(s => s.id === slotId)
        : state.schedule.find(s => s.type === 'free' && !s.done);
    // Если свободных окон нет — НЕ затираем чужой слот, а добавляем новый ниже.

    if (slot) {
        slot.title = cleanTitle;
        slot.type = energy === 'rest' ? 'break' : 'work';
        slot.energy = energy;
        slot.done = false;
    } else {
        const sorted = [...state.schedule].sort((a, b) => timeToMinutes(a.end) - timeToMinutes(b.end));
        const lastEndMin = sorted.length ? timeToMinutes(sorted[sorted.length - 1].end) : 10 * 60;
        const newStartMin = Math.max(9 * 60, lastEndMin);
        if (newStartMin >= 22 * 60) {
            showToast('Нет свободного времени сегодня — освободите слот вручную', '⚠️');
            return;
        }
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
    if (!state.isSynced || state.schedule.length === 0) {
        openLiveSyncModal();
        return;
    }
    const current = state.schedule.find(s => !s.done && s.type !== 'free') || state.schedule.find(s => !s.done);
    if (current) {
        current.done = true;
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
    if (!state.isSynced) {
        openLiveSyncModal();
        return;
    }
    const score = getBatteryScore();
    // Числовой приоритет вместо «-1/1» (такой компаратор нарушал контракт sort и давал случайный порядок)
    const rank = (t) => score >= 80
        ? ({ A: 0, B: 1, C: 2, REST: 3 }[t.category] ?? 2)
        : ({ C: 0, REST: 1, B: 2, A: 3 }[t.category] ?? 2);
    const alreadyPlanned = new Set(state.schedule.map(s => s.title.trim().toLowerCase()));
    const sorted = state.tasks
        .filter(t => !t.done && !alreadyPlanned.has(t.title.trim().toLowerCase()))
        .sort((a, b) => rank(a) - rank(b));

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

function syncFilterChips() {
    document.querySelectorAll('.task-filter-row .chip').forEach(btn => {
        const m = (btn.getAttribute('onclick') || '').match(/filterTasks\('([^']*)'\)/);
        btn.classList.toggle('active', !!m && m[1] === state.activeTaskFilter);
    });
}

function filterTasks(cat) {
    state.activeTaskFilter = cat;
    syncFilterChips();
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
    if (!state.isSynced) {
        openLiveSyncModal();
        return;
    }
    state.manualOffset = Math.max(-45, Math.min(45, (state.manualOffset || 0) + Number(delta)));
    renderAll();
    showToast(`Заряд батареи: ${getBatteryScore()}%`, '🔋');
}

function updateHealthMetric(key, val) {
    state.isSynced = true;
    if (state.health.sleepHours === null) {
        Object.assign(state.health, HEALTH_DEFAULTS);
        state.estimatedFields = Object.keys(HEALTH_DEFAULTS);
    }
    state.health[key] = key === 'bedtime' ? val : Number(val);
    state.estimatedFields = (state.estimatedFields || []).filter(k => k !== key);
    state.health.lastSync = 'Откалибровано вручную • только что';
    state.health.lastSyncDate = todayStr();
    if (!state.schedule.length) state.schedule = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_SCHEDULE));
    if (!state.tasks.length) state.tasks = JSON.parse(JSON.stringify(SYNCED_TEMPLATE_TASKS));
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
    if (!state.isSynced) {
        openLiveSyncModal();
        return;
    }
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
    if (!state.isSynced) {
        openLiveSyncModal();
        return;
    }
    moveTomorrowToToday();
    switchPage('calendar');
}

function protectMorningBlock() {
    if (!state.isSynced) {
        openLiveSyncModal();
        return;
    }
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
    const decoded = safeDecode(rawStr.trim());
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
    state.isSynced = true;
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
    const titles = safeDecode(String(rawTasksInput || ''))
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

function icsDateTimeToLocal(raw) {
    // 20261027T093000 или 20261027T063000Z (UTC → переводим в местное время)
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, sec = '00', z] = m;
    const date = z
        ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec))
        : new Date(+y, +mo - 1, +d, +h, +mi, +sec);
    return {
        dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    };
}

function importIcsCalendar(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        // «Разворачиваем» перенесённые строки ICS (строка, начинающаяся с пробела, продолжает предыдущую)
        const content = String(e.target.result || '').replace(/\r?\n[ \t]/g, '');
        const blocks = content.split('BEGIN:VEVENT').slice(1);
        const today = todayStr();
        const events = [];
        blocks.forEach(block => {
            const summaryMatch = block.match(/SUMMARY[^:\r\n]*:(.+)/i);
            const dtStartMatch = block.match(/DTSTART[^:\r\n]*:(\d{8}T\d{4,6}Z?)/i);
            const dtEndMatch = block.match(/DTEND[^:\r\n]*:(\d{8}T\d{4,6}Z?)/i);
            if (!summaryMatch || !dtStartMatch) return; // события «на весь день» (без времени) пропускаем
            const st = icsDateTimeToLocal(dtStartMatch[1]);
            if (!st || st.dateStr !== today) return;     // берём ТОЛЬКО сегодняшние события
            const en = dtEndMatch ? icsDateTimeToLocal(dtEndMatch[1]) : null;
            const end = en && en.dateStr === today && timeToMinutes(en.time) > timeToMinutes(st.time)
                ? en.time : addMinutes(st.time, 60);
            events.push({ start: st.time, end, title: summaryMatch[1].trim().replace(/\\,/g, ',') });
        });
        const limited = events.slice(0, 12);
        if (limited.length > 0) {
            mergeExternalEventsIntoSchedule(limited, 'Импорт .ics');
            closeAllModals();
            showToast(`Импортировано событий на сегодня: ${limited.length}`, '📅');
        } else {
            showToast('В файле нет событий на сегодня', 'ℹ️');
        }
        input.value = ''; // позволяет выбрать тот же файл повторно
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

function openAddSlotModal() {
    document.getElementById('add-slot-modal')?.classList.remove('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function saveNewSlot() {
    const start = document.getElementById('new-slot-start')?.value || '14:00';
    const end = document.getElementById('new-slot-end')?.value || '15:30';
    const title = document.getElementById('new-slot-title')?.value.trim() || 'Свободное окно';
    const energy = document.getElementById('new-slot-energy')?.value || 'medium';

    if (timeToMinutes(end) <= timeToMinutes(start)) {
        showToast('Конец слота должен быть позже начала', '⚠️');
        return;
    }
    state.isSynced = true;
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

function copyShortcutUrl() {
    const box = document.getElementById('healthkit-shortcut-url');
    if (!box) return;
    const text = box.textContent.trim();
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (_) {}
        ta.remove();
        showToast(ok ? 'Ссылка скопирована!' : 'Не удалось скопировать — выделите ссылку вручную', ok ? '📋' : '⚠️');
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showToast('Ссылка скопирована в буфер обмена!', '📋'))
            .catch(fallback);
    } else {
        fallback();
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
    rec.onerror = () => showToast('Микрофон недоступен — введите текст вручную', '🎤');
    rec.onend = () => {
        if (btn) btn.style.borderColor = '';
    };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* =========================================================
   7b. ОБЛАКО: GOOGLE APPS SCRIPT (общее хранилище для Safari и иконки на рабочем столе)
   ========================================================= */
const CLOUD_KEY = 'ritm_dnya_cloud_v1'; // url + токен хранятся отдельно и НЕ уходят в облако вместе с состоянием
let cloudReady = false;
let applyingRemote = false;
let pushTimer = null;
let cloudStatus = 'Облако не подключено';

function getCloudCfg() {
    try {
        const c = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null');
        return c && c.url && c.token ? c : null;
    } catch (_) { return null; }
}

function setCloudStatus(text) {
    cloudStatus = text;
    const el = document.getElementById('cloud-status-text');
    if (el) el.textContent = text;
}

const nowHM = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const localDateOf = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function cloudCall(cfg, action, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
        const res = body
            // text/plain — «простой» запрос без preflight (Apps Script не отвечает на OPTIONS)
            ? await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, action, token: cfg.token }), signal: ctrl.signal })
            : await fetch(`${cfg.url}?action=${action}&token=${encodeURIComponent(cfg.token)}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'server_error');
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function adoptRemoteState(remoteState, remoteUpdatedAt) {
    applyingRemote = true;
    state = normalizeState(remoteState);
    state.updatedAt = remoteUpdatedAt;
    lastSerialized = serializeForCompare(state);
    applyingRemote = false;
    rolloverIfNewDay();
}

async function cloudPull() {
    const cfg = getCloudCfg();
    if (!cfg) { cloudReady = true; return false; }
    setCloudStatus('⏳ Облако: загрузка…');
    try {
        const data = await cloudCall(cfg, 'pull');
        let changed = false;

        if (data.state && (data.updatedAt || 0) > (state.updatedAt || 0)) {
            adoptRemoteState(data.state, data.updatedAt);
            changed = true;
        }

        // Новые данные от команды iPhone: применяем один раз и только если они сегодняшние
        if (data.inbox && data.inbox.id && data.inbox.id !== state.lastInboxId) {
            state.lastInboxId = data.inbox.id;
            if (localDateOf(data.inbox.ts) === todayStr()) {
                applyTelemetryParams(new URLSearchParams(data.inbox.qs), false);
            }
            changed = true;
        }

        cloudReady = true;
        setCloudStatus(`☁ Облако подключено • ${nowHM()}`);
        if (changed) renderAll();
        if ((state.updatedAt || 0) > (data.updatedAt || 0)) scheduleCloudPush();
        return changed;
    } catch (e) {
        cloudReady = true;
        setCloudStatus('⚠ Облако недоступно — работаю локально');
        return false;
    }
}

function scheduleCloudPush() {
    if (applyingRemote || !getCloudCfg()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(cloudPush, 1500);
}

async function cloudPush() {
    const cfg = getCloudCfg();
    if (!cfg) return;
    if (!cloudReady) { pushTimer = setTimeout(cloudPush, 1500); return; }
    try {
        const data = await cloudCall(cfg, 'push', { state, updatedAt: state.updatedAt || Date.now() });
        if (data.conflict && data.state) {
            adoptRemoteState(data.state, data.updatedAt);
            renderAll();
            setCloudStatus(`☁ Загружена более новая версия • ${nowHM()}`);
        } else {
            setCloudStatus(`☁ Сохранено в облако • ${nowHM()}`);
        }
    } catch (e) {
        setCloudStatus('⚠ Не удалось сохранить в облако — повторю');
        pushTimer = setTimeout(cloudPush, 15000);
    }
}

async function saveCloudSettings() {
    const url = (document.getElementById('cloud-url-input')?.value || '').trim();
    const token = (document.getElementById('cloud-token-input')?.value || '').trim();
    if (/\/dev$/.test(url)) {
        showToast('Это тестовая ссылка (/dev). Нужна ссылка развёртывания, заканчивается на /exec', '⚠️');
        return;
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/\s]+\/exec$/.test(url)) {
        showToast('Нужна ссылка вида https://script.google.com/macros/s/…/exec', '⚠️');
        return;
    }
    if (token.length < 12) {
        showToast('Токен слишком короткий (нужно 12+ символов)', '⚠️');
        return;
    }
    setCloudStatus('⏳ Проверяю подключение…');
    try {
        await cloudCall({ url, token }, 'ping');
    } catch (e) {
        const reason = e.message === 'auth' ? 'токен не совпадает с серверным (запустите showToken() в скрипте и сверьте)'
            : e.message === 'server_not_configured' ? 'на сервере нет токена: запустите setup() в скрипте и сделайте «Новую версию» развёртывания'
            : e.name === 'AbortError' ? 'сервер не ответил за 15 с, попробуйте ещё раз'
            : 'проверьте ссылку (/exec) и доступ «Все»';
        setCloudStatus(`⚠ Не подключено: ${reason}`);
        showToast(`Не удалось подключиться: ${reason}`, '⚠️');
        return;
    }
    localStorage.setItem(CLOUD_KEY, JSON.stringify({ url, token }));
    cloudReady = false;
    await cloudPull();
    renderAll();
    showToast('Облако подключено', '☁');
}

function disconnectCloud() {
    localStorage.removeItem(CLOUD_KEY);
    clearTimeout(pushTimer);
    setCloudStatus('Облако не подключено');
    renderAll();
    showToast('Облако отключено (данные на устройстве сохранены)', '☁');
}

async function cloudSyncNow() {
    if (!getCloudCfg()) { showToast('Сначала подключите облако ниже', '☁'); return; }
    const changed = await cloudPull();
    if (getCloudCfg()) await cloudPush();
    closeAllModals();
    showToast(changed ? `Данные из облака загружены. Заряд: ${getBatteryScore()}%` : 'Новых данных в облаке нет', changed ? '☁' : 'ℹ️');
}

/* =========================================================
   8. ИНИЦИАЛИЗАЦИЯ ПРИ ОТКРЫТИИ ПРИЛОЖЕНИЯ
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    attachGlobalButtonRipple();
    rolloverIfNewDay();
    parseUrlHealthTelemetry();
    syncFilterChips();
    renderAll();
    cloudPull(); // тянем данные из облака (в т.ч. то, что прислала команда iPhone)

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            rolloverIfNewDay(); // приложение могло проспать полночь в фоне
            parseUrlHealthTelemetry();
            renderAll();
            cloudPull();
        }
    });

    // Регистрация service worker (раньше sw.js лежал в репозитории, но нигде не подключался)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW не зарегистрирован:', err));
    }
});
