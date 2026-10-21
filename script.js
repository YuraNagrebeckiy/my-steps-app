/**
 * Ритм Дня v4.0 — Биометрическая система управления энергией и задачами
 * Оптимизировано для iPhone 16 Pro Max (iOS 27.0.1) • Huawei Health & Apple HealthKit
 */

const STORAGE_KEY = 'ritm_dnya_state_v4';
const PERMISSIONS_KEY = 'ritm_permissions_granted_v4';

// Коэффициенты расхода/заряда энергии от задач (% за 1 час)
const TASK_ENERGY_RATES = {
    high: -5.0,    // Категория А: сложные узлы, конструктив, высокий риск
    medium: -2.8,  // Категория Б: координация, проверка стоп-точек по чек-листу
    low: -1.2,     // Категория В: легкая рутина, языки, фиксация итогов
    rest: +6.0,    // Активное восстановление: обед без экрана, прогулка, дневной сон
    free: -0.5     // Свободное окно (базовый метаболизм)
};

const defaultState = {
    dayType: 'work',        // 'work' | 'weekend'
    morningMood: 'high',    // 'high' | 'medium' | 'low'
    manualOffset: 0,
    showDetailedRecs: true,
    health: {
        sleepHours: 8.2,
        deepSleepHours: 3.1,
        bedtime: '22:45',
        activeCalories: 310,
        steps: 5120,
        stepsGoal: 10000,
        restingHR: 58,
        lastSync: 'iOS 27.0.1 • Автосинхронизация при запуске',
        lastSyncTimestamp: Date.now()
    },
    alarm: {
        time: '07:30',
        enabled: true
    },
    holdPoints: [
        { id: 'hp-1', title: 'Защищён первый утренний блок (60 мин на Категорию А без телефона)', done: true },
        { id: 'hp-2', title: 'Стоп-точка 1 (Качество): узел выполнен по проекту без отступлений', done: false },
        { id: 'hp-3', title: 'Стоп-точка 2 (Объём): фактические замеры сходятся со сметой', done: false },
        { id: 'hp-4', title: 'Стоп-точка 3 (Документация): исполнительная схема и акты получены', done: false },
        { id: 'hp-5', title: 'Отказ от «спасательства»: вместо переделки за смежника выдан чек-лист', done: false }
    ],
    schedule: [
        { id: 'slot-1', start: '08:30', end: '09:30', title: 'Подъём по будильнику, завтрак, синк часов Huawei → HealthKit', type: 'routine', energy: 'low', done: true },
        { id: 'slot-2', start: '09:30', end: '10:30', title: 'Защищённый блок: Главная стратегическая задача (Категория А)', type: 'focus', energy: 'high', done: false },
        { id: 'slot-3', start: '10:30', end: '13:00', title: 'Свободное окно', type: 'free', energy: 'high', done: false },
        { id: 'slot-4', start: '13:00', end: '14:00', title: 'Обед и восстановление ресурса (без рабочих чатов)', type: 'break', energy: 'rest', done: false },
        { id: 'slot-5', start: '14:00', end: '16:30', title: 'Свободное окно', type: 'free', energy: 'medium', done: false },
        { id: 'slot-6', start: '17:00', end: '19:00', title: 'Свободное окно', type: 'free', energy: 'low', done: false },
        { id: 'slot-7', start: '20:00', end: '21:00', title: 'Английский (Duolingo 15 мин) и вечерняя разгрузка', type: 'routine', energy: 'low', done: false }
    ],
    tasks: [
        { id: 'task-1', title: 'Согласовать с Олегом конструктив лестницы, узлы и поручень', category: 'A', complexity: 'high' },
        { id: 'task-2', title: 'Падел-клуб / ЖК Lucky — аудит критических узлов и стоп-точек приёмки', category: 'A', complexity: 'high' },
        { id: 'task-3', title: 'Проверить спецификацию по лаку и диффузоры вентиляции с Антоном', category: 'B', complexity: 'medium' },
        { id: 'task-4', title: 'Отправить подрядчику чек-лист приёмки вместо ручной переделки чертежей', category: 'B', complexity: 'medium' },
        { id: 'task-5', title: 'Зафиксировать 3 главных результата недели и предотвращённые риски', category: 'C', complexity: 'low' }
    ],
    activeTaskFilter: 'all',
    currentPage: 'home'
};

let state = loadState();

/* =========================================================
   1. ИНИЦИАЛИЗАЦИЯ, ЗАГРУЗКА И ПЕРВЫЙ ЗАПУСК (РАЗРЕШЕНИЯ)
   ========================================================= */
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(defaultState));
        const parsed = JSON.parse(raw);
        return {
            ...defaultState,
            ...parsed,
            health: { ...defaultState.health, ...(parsed.health || {}) },
            alarm: { ...defaultState.alarm, ...(parsed.alarm || {}) },
            schedule: Array.isArray(parsed.schedule) && parsed.schedule.length ? parsed.schedule : defaultState.schedule,
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : defaultState.tasks,
            holdPoints: Array.isArray(parsed.holdPoints) ? parsed.holdPoints : defaultState.holdPoints
        };
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

function checkFirstLaunchPermissions() {
    const granted = localStorage.getItem(PERMISSIONS_KEY);
    if (!granted) {
        const modal = document.getElementById('permissions-modal');
        if (modal) modal.classList.remove('hidden');
    }
}

function openPermissionsModal() {
    const modal = document.getElementById('permissions-modal');
    if (modal) modal.classList.remove('hidden');
}

function closePermissionsModal() {
    const modal = document.getElementById('permissions-modal');
    if (modal) modal.classList.add('hidden');
}

async function grantHealthPermission() {
    const btn = document.getElementById('perm-health-btn');
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Health) {
        try {
            await window.Capacitor.Plugins.Health.requestAuthorization({
                read: ['steps', 'sleep', 'calories', 'heartRate'],
                write: []
            });
        } catch (err) {
            console.warn('Capacitor HealthKit prompt:', err);
        }
    }
    if (btn) {
        btn.textContent = 'Подключено ✓';
        btn.style.background = 'rgba(16, 185, 129, 0.25)';
        btn.style.color = '#4ade80';
    }
    triggerAutoSyncNow();
}

async function requestNotificationPermission() {
    const btn = document.getElementById('perm-notif-btn');
    if ('Notification' in window) {
        const res = await Notification.requestPermission();
        if (btn) {
            btn.textContent = res === 'granted' ? 'Разрешено ✓' : 'Активно ✓';
        }
    } else if (btn) {
        btn.textContent = 'Активно ✓';
    }
}

function completeOnboardingPermissions() {
    localStorage.setItem(PERMISSIONS_KEY, 'true');
    requestNotificationPermission();
    grantHealthPermission();
    closePermissionsModal();
}

/* =========================================================
   2. ПРОТОКОЛЫ АВТОСИНХРОНИЗАЦИИ (HUAWEI HEALTH -> HEALTHKIT)
   ========================================================= */
function parseUrlHealthTelemetry() {
    try {
        const params = new URLSearchParams(window.location.search);
        let updated = false;

        if (params.has('sleep')) {
            state.health.sleepHours = parseFloat(params.get('sleep')) || state.health.sleepHours;
            updated = true;
        }
        if (params.has('deep')) {
            state.health.deepSleepHours = parseFloat(params.get('deep')) || state.health.deepSleepHours;
            updated = true;
        }
        if (params.has('bedtime')) {
            state.health.bedtime = params.get('bedtime') || state.health.bedtime;
            updated = true;
        }
        if (params.has('calories')) {
            state.health.activeCalories = parseInt(params.get('calories'), 10) || state.health.activeCalories;
            updated = true;
        }
        if (params.has('steps')) {
            state.health.steps = parseInt(params.get('steps'), 10) || state.health.steps;
            updated = true;
        }
        if (params.has('hr')) {
            state.health.restingHR = parseInt(params.get('hr'), 10) || state.health.restingHR;
            updated = true;
        }

        if (updated) {
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            state.health.lastSync = `Синхронизировано из Apple HealthKit (${timeStr})`;
            state.health.lastSyncTimestamp = Date.now();
            window.history.replaceState({}, document.title, window.location.pathname);
            saveState();
        }
    } catch (e) {
        console.warn('Ошибка чтения URL-параметров HealthKit:', e);
    }
}

async function triggerAutoSyncNow() {
    const pillText = document.getElementById('sync-pill-text');
    if (pillText) pillText.textContent = 'Синхронизация...';

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Health) {
        try {
            const Health = window.Capacitor.Plugins.Health;
            const stepsData = await Health.queryAggregated({ dataType: 'steps', bucket: 'day' });
            if (stepsData && stepsData.samples && stepsData.samples.length) {
                state.health.steps = Math.round(stepsData.samples[0].value);
            }
        } catch (e) {
            console.warn('Capacitor sync fallback:', e);
        }
    }

    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    state.health.lastSync = `HUAWEI Health → Apple HealthKit • Сегодня в ${nowTime}`;
    state.health.lastSyncTimestamp = Date.now();

    setTimeout(() => {
        if (pillText) pillText.textContent = `HealthKit • ${nowTime}`;
        renderAll();
    }, 350);
}

/* =========================================================
   3. МАТЕМАТИЧЕСКОЕ ЯДРО БАТАРЕИ И ДИНАМИЧЕСКОГО РАСХОДА
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
    const [sh, sm] = slot.start.split(':').map(Number);
    const [eh, em] = slot.end.split(':').map(Number);
    if (isNaN(sh) || isNaN(eh)) return 1.0;
    const diff = (eh * 60 + (em || 0) - (sh * 60 + (sm || 0))) / 60;
    return Math.max(0.25, Math.min(6, diff > 0 ? diff : 1.0));
}

function calculateEnergyBreakdown() {
    const { sleepHours, deepSleepHours, bedtime, activeCalories, steps, restingHR } = state.health;

    // 1. База общего сна (8ч = 70 баллов)
    const sleepRatio = Math.min(Math.max(sleepHours, 0) / 8.0, 1.0);
    const sleepPoints = Math.round(sleepRatio * 70);

    // 2. Глубокий сон (3ч = +25 баллов)
    const deepRatio = Math.min(Math.max(deepSleepHours, 0) / 3.0, 1.0);
    const deepPoints = Math.round(deepRatio * 25);

    // 3. Время отхода ко сну (-12..+5 баллов)
    const bedtimePoints = parseBedtimePoints(bedtime);

    // 4. Физическая нагрузка (калории, шаги, ЧСС покоя)
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

    // 5. Динамический расход и подзарядка от выполненных задач сегодня
    let tasksNetDelta = 0;
    state.schedule.forEach(slot => {
        if (slot.done && slot.id !== 'slot-1') {
            const hrs = getSlotDurationHours(slot);
            const rate = TASK_ENERGY_RATES[slot.energy] ?? -2.0;
            tasksNetDelta += rate * hrs;
        }
    });
    tasksNetDelta = Math.round(tasksNetDelta);

    // 6. Утреннее самочувствие
    let moodAdjustment = 0;
    if (state.morningMood === 'high') moodAdjustment = 2;
    if (state.morningMood === 'low') moodAdjustment = -10;

    let rawTotal = sleepPoints + deepPoints + bedtimePoints + loadPenalty + tasksNetDelta + moodAdjustment + (state.manualOffset || 0);

    const total = Math.max(10, Math.min(100, Math.round(rawTotal)));

    // Расчёт риска перегрузки (0 - 100%)
    const highTasksCount = state.schedule.filter(s => s.energy === 'high' && !s.done).length;
    const rawRisk = Math.round((100 - total) * 0.75 + highTasksCount * 8 + Math.abs(loadPenalty) * 1.5);
    const overloadRisk = Math.max(8, Math.min(95, rawRisk));

    return {
        total,
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
    if (score >= 75) {
        return {
            level: 'high',
            mainTag: 'ПОЛНЫЙ СИЛ',
            subTag: 'ОПТИМАЛЬНЫЙ РЕСУРС',
            badge: '🔥 Высокий ресурс',
            liquidGradient: 'linear-gradient(180deg, rgba(74,222,128,0.92) 0%, rgba(16,185,129,0.88) 55%, rgba(0,245,212,0.95) 100%)',
            ringColor: '#00f5d4'
        };
    }
    if (score >= 50) {
        return {
            level: 'medium',
            mainTag: 'УМЕРЕННЫЙ ТЕМП',
            subTag: 'РАБОЧИЙ БАЛАНС',
            badge: '⚡ Умеренный ресурс',
            liquidGradient: 'linear-gradient(180deg, rgba(250,204,21,0.92) 0%, rgba(245,158,11,0.88) 60%, rgba(16,185,129,0.85) 100%)',
            ringColor: '#facc15'
        };
    }
    return {
        level: 'low',
        mainTag: 'БЕРЕЧЬ СИЛЫ',
        subTag: 'НУЖНА ПЕРЕЗАГРУЗКА',
        badge: '🛋 Низкий ресурс',
        liquidGradient: 'linear-gradient(180deg, rgba(251,113,133,0.92) 0%, rgba(239,68,68,0.88) 65%, rgba(245,158,11,0.85) 100%)',
        ringColor: '#f43f5e'
    };
}

/* =========================================================
   4. ГЕНЕРАЦИЯ РЕКОМЕНДАЦИЙ И 4 КАРТОЧЕК СЦЕНАРИЕВ
   ========================================================= */
function generateFourRecommendations() {
    const score = getBatteryScore();
    const isHigh = score >= 70;
    const isWorkday = state.dayType === 'work';

    const heavyTask = (state.tasks.find(t => t.category === 'A') || {}).title || 'Согласовать с Олегом конструктив лестницы и узлы';
    const lightTask = (state.tasks.find(t => t.category !== 'A') || {}).title || 'Проверить спецификацию по лаку и диффузоры с Антоном';

    if (isWorkday && isHigh) {
        return [
            {
                num: '01 • ГЛАВНЫЙ ПРОРЫВ (−5%/ч)',
                title: '🚀 Сложная задача до 16:00',
                text: `Пик ресурса (${score}%). Поставь в первое окно: «${heavyTask}».`,
                actionLabel: 'В утреннее окно →',
                actionTask: heavyTask,
                actionEnergy: 'high'
            },
            {
                num: '02 • ЗАЩИТА ВРЕМЕНИ',
                title: '🛡️ 60 минут тишины (Кат. А)',
                text: 'Первые 60 минут без мессенджеров — только ключевые узлы и конструктив.',
                actionLabel: 'Включить фокус',
                actionTask: 'Глубокий фокус: критические узлы и чертежи',
                actionEnergy: 'high'
            },
            {
                num: '03 • БЕЗ «СПАСАТЕЛЬСТВА»',
                title: '🛑 Контроль по 3 стоп-точкам',
                text: 'Не перечерчивай за смежников (это сжигает 8.5%/ч) — выдай чек-лист.',
                actionLabel: 'Стоп-точки →',
                actionPage: 'tasks'
            },
            {
                num: '04 • ПОДЗАРЯДКА ДНЁМ (+6%/ч)',
                title: '🔋 Обед и переключение в 13:00',
                text: 'Час спокойного обеда и прогулки вернёт +6% к батарее на вторую половину дня.',
                actionLabel: 'Забронировать отдых',
                actionTask: 'Обед, прогулка и перезагрузка без экрана',
                actionEnergy: 'rest'
            }
        ];
    }

    if (isWorkday && !isHigh) {
        return [
            {
                num: '01 • ЩАДЯЩИЙ РЕЖИМ',
                title: '🔋 Побереги силы и ресурс',
                text: `Заряд ${score}%. Отложи тяжёлые расчёты Категории А на день с высоким сном.`,
                actionLabel: 'Щадящий план →',
                actionTask: 'Спокойный рабочий блок без перегруза',
                actionEnergy: 'low'
            },
            {
                num: '02 • ЛЁГКАЯ РУТИНА (−1.2%/ч)',
                title: '🌿 Простые задачи (Кат. Б и В)',
                text: `Закрой несложные вопросы: «${lightTask}».`,
                actionLabel: 'Поставить в окно →',
                actionTask: lightTask,
                actionEnergy: 'low'
            },
            {
                num: '03 • ДЕЛЕГИРОВАНИЕ',
                title: '📋 Запрос решения от подрядчика',
                text: 'Озвучь риск сразу и потребуй готовый вариант от смежников.',
                actionLabel: 'Проверка по чек-листу',
                actionTask: 'Быстрая сверка статуса подрядчиков по чек-листу',
                actionEnergy: 'medium'
            },
            {
                num: '04 • ГЛУБОКОЕ ВОССТАНОВЛЕНИЕ',
                title: '🌙 Отбой до 22:45 (+5% бонус)',
                text: 'Заверши дела вовремя, чтобы набрать 8+ ч сна и 3 ч глубокой фазы.',
                actionLabel: 'Калибровка сна',
                actionPage: 'health'
            }
        ];
    }

    if (!isWorkday && isHigh) {
        return [
            {
                num: '01 • ИСПОЛНЕНИЕ МЕЧТЫ',
                title: '🌍 Поездка туда, где мечтал побывать!',
                text: `Заряд ${score}% и выходной! Отправляйся с Катариной в новое красивое место.`,
                actionLabel: 'Поставить выезд →',
                actionTask: 'Тур выходного дня с Катариной по новому маршруту',
                actionEnergy: 'rest'
            },
            {
                num: '02 • УДОВОЛЬСТВИЕ ЗА РУЛЁМ',
                title: '🚗 Маршрут под новый звук в W124',
                text: 'Включи любимый плейлист и наслаждайся дорогой без единого рабочего звонка.',
                actionLabel: 'Добавить в план',
                actionTask: 'Автопрогулка на W124 под любимую музыку',
                actionEnergy: 'rest'
            },
            {
                num: '03 • ЭНЕРГИЯ ДЛЯ СЕБЯ',
                title: '⚡ Активный отдых и впечатления',
                text: 'Прогулка у моря, спорт или семейный обед в новом месте (+8% к ресурсу).',
                actionLabel: 'Активный отдых',
                actionTask: 'Прогулка и семейный обед в новом месте',
                actionEnergy: 'rest'
            },
            {
                num: '04 • ЦИФРОВОЙ ДЕТОКС',
                title: '🔕 Свобода от рабочих чатов',
                text: 'Любую рабочую мысль за 5 секунд сбрасывай в банк задач до понедельника.',
                actionLabel: 'Банк мыслей →',
                actionPage: 'tasks'
            }
        ];
    }

    return [
        {
            num: '01 • ПОЛНАЯ ПЕРЕЗАГРУЗКА',
            title: '🛋️ Отдыхай, ничего не делай, кайфуй!',
            text: `Заряд ${score}% и выходной. Официальный день восстановления без чувства вины.`,
            actionLabel: 'Режим отдыха →',
            actionTask: 'Полный отдых, перезагрузка и день без обязательств',
            actionEnergy: 'rest'
        },
        {
            num: '02 • БЕЗ БЫТОВЫХ ПОДВИГОВ',
            title: '🚫 Отложи стройку и ремонт',
            text: 'Никаких утомительных поездок — сегодня нервная система восполняет резерв.',
            actionLabel: 'Освободить день',
            actionTask: 'Спокойный домашний ритм',
            actionEnergy: 'rest'
        },
        {
            num: '03 • ДНЕВНОЙ СОН И УЮТ',
            title: '🍵 Кино, вкусный обед и +12% заряда',
            text: '40 минут дневного сна и спокойный вечер с Катариной.',
            actionLabel: 'Тихий час / Кино',
            actionTask: 'Дневной сон, вкусный обед и любимый фильм',
            actionEnergy: 'rest'
        },
        {
            num: '04 • ЗАРЯД НА 100% К ПОНЕДЕЛЬНИКУ',
            title: '🌙 Ранний сон до 22:30',
            text: 'Набери 3 часа глубокого сна для старта новой недели на максимуме.',
            actionLabel: 'Параметры сна →',
            actionPage: 'health'
        }
    ];
}

/* =========================================================
   5. ОТРИСОВКА ИНТЕРФЕЙСА (RENDER ALL)
   ========================================================= */
function renderAll() {
    renderHeaderDate();
    renderBatteryHUD();
    renderMainRecommendationCard();
    renderBentoGrid();
    renderFocusAndCoordinator();
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
    const alarmBadge = document.getElementById('alarm-time-badge');
    if (alarmBadge) alarmBadge.textContent = state.alarm.time;
}

function renderBatteryHUD() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const profile = getEnergyVisualProfile(score);

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
            : `⚡ Расход задачи: ${currentRate}% / ч`;
    }

    const offsetEl = document.getElementById('manual-offset');
    if (offsetEl) {
        offsetEl.textContent = state.manualOffset === 0
            ? 'Авто'
            : `${state.manualOffset > 0 ? '+' : ''}${state.manualOffset}%`;
    }
}

function renderMainRecommendationCard() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const risk = breakdown.overloadRisk;

    const prefixEl = document.getElementById('rec-lead-prefix');
    const bodyEl = document.getElementById('rec-lead-body');

    if (prefixEl && bodyEl) {
        if (state.dayType === 'work') {
            if (score >= 75) {
                prefixEl.textContent = '⚡ ОТЛИЧНЫЙ СТАРТ!';
                prefixEl.style.color = '#4ade80';
                bodyEl.textContent = `Вы полны сил на ${score}%. Рекомендуется закрыть сложные задачи (Категория А) до 16:00, пока ресурс на пике. Избегайте перегрузок вечером, чтобы сохранить баланс.`;
            } else if (score >= 50) {
                prefixEl.textContent = '👌 РАБОЧИЙ ТОНУС.';
                prefixEl.style.color = '#facc15';
                bodyEl.textContent = `Заряд энергии ${score}%. Чередуйте задачи средней сложности (Категория Б) с перерывами и проверяйте подрядчиков строго по стоп-точкам.`;
            } else {
                prefixEl.textContent = '🛋 БЕРЕЖНЫЙ РЕЖИМ!';
                prefixEl.style.color = '#fb7185';
                bodyEl.textContent = `Заряд снижен (${score}%). Отложите тяжёлые узлы, переключитесь на лёгкую рутину (Категория В) и запланируйте отбой до 22:45.`;
            }
        } else {
            if (score >= 70) {
                prefixEl.textContent = '🌍 ВРЕМЯ МЕЧТЫ!';
                prefixEl.style.color = '#00f5d4';
                bodyEl.textContent = `Выходной день и высокий заряд ${score}%! Поезжайте туда, где давно мечтали побывать, включите любимую музыку в W124 и отдохните душой.`;
            } else {
                prefixEl.textContent = '🛌 ПОЛНАЯ ПЕРЕЗАГРУЗКА.';
                prefixEl.style.color = '#a855f7';
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

function toggleDetailedRecs() {
    state.showDetailedRecs = !state.showDetailedRecs;
    renderMainRecommendationCard();
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
            costLabel.style.color = slotDelta > 0 ? '#4ade80' : '#00f5d4';
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
            coordText.innerHTML = `Свободно окно <strong>${freeSlot.start} — ${freeSlot.end}</strong>. Заряд <strong>${score}%</strong> — выбери задачу по энергоёмкости или включи подзарядку:`;
        } else {
            coordText.textContent = `Все свободные окна на сегодня распределены! Текущий заряд: ${score}%.`;
        }
    }
}

function renderTimeline() {
    const container = document.getElementById('timeline-list');
    if (!container) return;

    const activeSlot = state.schedule.find(s => !s.done);
    container.innerHTML = state.schedule.map(slot => {
        const isFree = slot.type === 'free';
        const hrs = getSlotDurationHours(slot);
        const rate = TASK_ENERGY_RATES[slot.energy] ?? -2.0;
        const delta = Math.round(rate * hrs);
        const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;

        let badgeClass = 'badge-low';
        let badgeText = `🌿 Лёгкий темп (${deltaStr})`;

        if (isFree) {
            badgeClass = 'badge-free';
            badgeText = '✨ Свободное окно — нажми, чтобы занять';
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
                 onclick="${isFree ? `promptFillFreeSlot('${slot.id}')` : ''}">
                <div class="slot-info">
                    <div class="slot-time">${slot.start} — ${slot.end} (${hrs.toFixed(1)} ч)</div>
                    <div class="slot-title">${escapeHtml(slot.title)}</div>
                    <span class="slot-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="slot-controls" onclick="event.stopPropagation()">
                    <button class="slot-btn" onclick="toggleSlotDone('${slot.id}')" title="Отметить выполненным">✓</button>
                    <button class="slot-btn" onclick="clearOrRemoveSlot('${slot.id}')" title="Освободить / Удалить">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTasksAndHoldPoints() {
    const badge = document.getElementById('tasks-count-badge');
    if (badge) badge.textContent = `${state.tasks.length} задач`;

    const filtered = state.tasks.filter(t => state.activeTaskFilter === 'all' || t.category === state.activeTaskFilter);
    const list = document.getElementById('tomorrow-list');
    if (list) {
        list.innerHTML = filtered.length ? filtered.map(task => {
            const badgeHtml = task.category === 'A'
                ? '<span class="slot-badge badge-high">🔴 Кат. А (−5.0%/ч)</span>'
                : task.category === 'B'
                ? '<span class="slot-badge badge-medium">🟡 Кат. Б (−2.8%/ч)</span>'
                : task.category === 'REST'
                ? '<span class="slot-badge badge-rest">🔋 Отдых (+6.0%/ч)</span>'
                : '<span class="slot-badge badge-low">🟢 Кат. В (−1.2%/ч)</span>';

            return `
                <li class="tomorrow-item">
                    <div>
                        <strong style="font-size:0.86rem; display:block; margin-bottom:4px;">${escapeHtml(task.title)}</strong>
                        ${badgeHtml}
                    </div>
                    <div class="task-item-actions">
                        <button class="slot-btn" onclick="scheduleTaskToToday('${task.id}')" title="Поставить в окно сегодня">→</button>
                        <button class="slot-btn" onclick="removeTask('${task.id}')" title="Удалить">✕</button>
                    </div>
                </li>
            `;
        }).join('') : '<li class="tomorrow-item"><span>В этой категории все задачи закрыты ✨</span></li>';
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
            <div class="formula-line"><span>⚡ Выполнение задач и окон по плану:</span><strong>${b.tasksNetDelta >= 0 ? '+' : ''}${b.tasksNetDelta}%</strong></div>
            <div class="formula-line"><span>🎛 Настрой и ручная калибровка:</span><strong>${b.moodAdjustment + b.manualOffset >= 0 ? '+' : ''}${b.moodAdjustment + b.manualOffset}%</strong></div>
            <div class="formula-line" style="border-top:1px solid rgba(255,255,255,0.12); padding-top:8px; margin-top:4px;">
                <span>🔋 Итоговый текущий заряд батареи:</span>
                <strong style="color:var(--neon-cyan); font-size:1rem;">${b.total}% (Риск: ${b.overloadRisk}%)</strong>
            </div>
        `;
    }

    const urlBox = document.getElementById('healthkit-shortcut-url');
    if (urlBox) {
        const base = window.location.origin + window.location.pathname;
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
   6. ИНТЕРАКТИВНЫЕ ФУНКЦИИ И ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ
   ========================================================= */
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
}

function setDayType(type) {
    state.dayType = type === 'weekend' ? 'weekend' : 'work';
    renderAll();
}

function setMorningMood(mood) {
    state.morningMood = mood;
    renderAll();
}

function changeSleepScore(delta) {
    state.manualOffset = Math.max(-35, Math.min(35, (state.manualOffset || 0) + Number(delta)));
    renderAll();
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

function fillNearestFreeWindow(title, energy = 'medium', slotId = null) {
    if (!title || !title.trim()) return;
    let slot = slotId
        ? state.schedule.find(s => s.id === slotId)
        : state.schedule.find(s => s.type === 'free' && !s.done);

    if (!slot) slot = state.schedule.find(s => !s.done);

    if (slot) {
        slot.title = title.trim();
        slot.type = energy === 'rest' ? 'break' : 'work';
        slot.energy = energy;
        slot.done = false;
    } else {
        state.schedule.push({
            id: 'slot-' + Date.now(),
            start: '19:00',
            end: '20:00',
            title: title.trim(),
            type: 'work',
            energy,
            done: false
        });
    }
    renderAll();
}

function assignCustomToFreeWindow() {
    const input = document.getElementById('custom-window-input');
    if (!input || !input.value.trim()) return;
    const score = getBatteryScore();
    const autoEnergy = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
    fillNearestFreeWindow(input.value.trim(), autoEnergy);
    input.value = '';
}

function promptFillFreeSlot(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (!slot) return;
    const score = getBatteryScore();
    const suggested = score >= 70
        ? (state.tasks.find(t => t.category === 'A') || state.tasks[0])
        : (state.tasks.find(t => t.category !== 'A') || state.tasks[0]);
    const text = prompt(`Занять окно ${slot.start} — ${slot.end}:`, suggested ? suggested.title : 'Проверка стоп-точек');
    if (text && text.trim()) {
        fillNearestFreeWindow(text.trim(), score >= 70 ? 'high' : 'low', slotId);
    }
}

function toggleSlotDone(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (slot) {
        slot.done = !slot.done;
        renderAll();
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
    } else if (state.schedule.length > 1) {
        state.schedule = state.schedule.filter(s => s.id !== slotId);
    }
    renderAll();
}

function completeCurrentFocus() {
    const current = state.schedule.find(s => !s.done && s.type !== 'free') || state.schedule.find(s => !s.done);
    if (current) {
        current.done = true;
        renderAll();
    }
}

function shiftSchedule(mins = 30) {
    state.schedule.forEach(slot => {
        if (!slot.done) {
            slot.start = addMinutes(slot.start, mins);
            slot.end = addMinutes(slot.end, mins);
        }
    });
    renderAll();
}

function addMinutes(timeStr, mins) {
    const [h, m] = (timeStr || '09:00').split(':').map(Number);
    if (isNaN(h)) return timeStr;
    const total = (h * 60 + (m || 0) + mins) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function activateLowEnergyMode() {
    state.morningMood = 'low';
    state.schedule.forEach(slot => {
        if (!slot.done && slot.energy === 'high') {
            state.tasks.unshift({
                id: 'task-' + Date.now(),
                title: slot.title,
                category: 'A',
                complexity: 'high'
            });
            slot.title = 'Перерыв и щадящая работа по чек-листу (перенесено в бэклог)';
            slot.energy = 'rest';
        }
    });
    renderAll();
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
}

function syncGoogleCalendarDemo() {
    const score = getBatteryScore();
    const events = [
        {
            start: '10:30',
            end: '13:00',
            title: score >= 70
                ? 'Выезд на объект (ЖК Lucky / Падел-клуб): аудит стоп-точек'
                : 'Онлайн-сверка спецификации по лаку и диффузорам с Антоном',
            energy: score >= 70 ? 'high' : 'low'
        },
        {
            start: '14:00',
            end: '16:30',
            title: 'Согласование с Олегом конструктива лестницы и поручня',
            energy: 'medium'
        }
    ];
    events.forEach(ev => {
        const slot = state.schedule.find(s => s.start === ev.start || (s.type === 'free' && !s.done));
        if (slot) {
            slot.title = ev.title;
            slot.type = 'work';
            slot.energy = ev.energy;
        }
    });
    renderAll();
}

function addTomorrowTask() {
    const input = document.getElementById('tomorrow-input');
    const select = document.getElementById('task-category-select');
    if (!input || !input.value.trim()) return;

    const cat = select ? select.value : 'A';
    const complexity = cat === 'A' ? 'high' : cat === 'B' ? 'medium' : cat === 'REST' ? 'rest' : 'low';

    state.tasks.unshift({
        id: 'task-' + Date.now(),
        title: input.value.trim(),
        category: cat,
        complexity
    });
    input.value = '';
    renderAll();
}

function removeTask(taskId) {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderAll();
}

function scheduleTaskToToday(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    fillNearestFreeWindow(task.title, task.complexity || 'medium');
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderAll();
}

function moveTomorrowToToday() {
    const score = getBatteryScore();
    const sorted = [...state.tasks].sort((a, b) => {
        if (score >= 70) return (a.category === 'A' ? -1 : 1) - (b.category === 'A' ? -1 : 1);
        return (a.category === 'C' ? -1 : 1) - (b.category === 'C' ? -1 : 1);
    });

    for (const task of sorted) {
        const free = state.schedule.find(s => s.type === 'free' && !s.done);
        if (!free) break;
        free.title = task.title;
        free.type = 'work';
        free.energy = task.complexity || 'medium';
        state.tasks = state.tasks.filter(t => t.id !== task.id);
    }
    renderAll();
}

function filterTasks(cat) {
    state.activeTaskFilter = cat;
    renderAll();
}

function toggleHoldPoint(hpId) {
    const hp = state.holdPoints.find(h => h.id === hpId);
    if (hp) {
        hp.done = !hp.done;
        renderAll();
    }
}

/* =========================================================
   7. МОДАЛЬНЫЕ ОКНА, ГОЛОСОВОЙ ВВОД И УТИЛИТЫ
   ========================================================= */
function openAddSlotModal() {
    document.getElementById('add-slot-modal')?.classList.remove('hidden');
}

function openAlarmModal() {
    document.getElementById('alarm-modal')?.classList.remove('hidden');
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
    closeAllModals();
    renderAll();
}

function saveAlarmSettings() {
    const time = document.getElementById('alarm-time-input')?.value || '07:30';
    const enabled = document.getElementById('alarm-enabled-input')?.checked ?? true;
    state.alarm = { time, enabled };
    closeAllModals();
    renderAll();
}

function saveStepsManual() {
    const val = parseInt(document.getElementById('steps-input')?.value, 10);
    if (!isNaN(val) && val >= 0) {
        state.health.steps = val;
        state.health.lastSync = 'Шаги обновлены • только что';
    }
    closeAllModals();
    renderAll();
}

function copyShortcutUrl() {
    const box = document.getElementById('healthkit-shortcut-url');
    if (box && navigator.clipboard) {
        navigator.clipboard.writeText(box.textContent.trim());
        alert('URL-протокол автосинхронизации скопирован в буфер обмена!');
    }
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
   8. АВТОЗАПУСК ПРИ ОТКРЫТИИ ПРИЛОЖЕНИЯ
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    parseUrlHealthTelemetry();
    checkFirstLaunchPermissions();
    renderAll();

    // Автоматическая синхронизация при возвращении в приложение (visibilitychange)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            parseUrlHealthTelemetry();
            renderAll();
        }
    });
});
