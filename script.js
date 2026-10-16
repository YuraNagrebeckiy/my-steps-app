// Состояние приложения с сохранением в localStorage
const defaultSlotsWork = [
    { id: 1, time: "08:30 — 09:30", title: "Подъем по будильнику, завтрак, чек-ин", load: "low", done: true },
    { id: 2, time: "10:00 — 13:00", title: "Свободное окно", load: "free", done: false },
    { id: 3, time: "13:00 — 14:00", title: "Обед и переключение", load: "low", done: false },
    { id: 4, time: "14:00 — 16:30", title: "Свободное окно", load: "free", done: false },
    { id: 5, time: "17:00 — 19:00", title: "Свободное окно", load: "free", done: false },
    { id: 6, time: "20:00 — 21:00", title: "Английский (Duolingo) и отдых", load: "low", done: false }
];

const defaultSlotsRest = [
    { id: 101, time: "09:30 — 10:30", title: "Спокойный подъем без спешки, завтрак", load: "low", done: false },
    { id: 102, time: "11:00 — 14:00", title: "Свободное окно (прогулка / семья / хобби)", load: "free", done: false },
    { id: 103, time: "14:30 — 17:30", title: "Свободное окно (отдых / игры / кино)", load: "free", done: false },
    { id: 104, time: "19:00 — 21:00", title: "Спокойный вечер, Duolingo", load: "low", done: false }
];

let state = {
    mode: localStorage.getItem("dayMode") || "work",
    energy: parseInt(localStorage.getItem("dayEnergy") || "85", 10),
    steps: parseInt(localStorage.getItem("daySteps") || "4250", 10),
    slots: JSON.parse(localStorage.getItem("daySlots")) || defaultSlotsWork,
    tomorrow: JSON.parse(localStorage.getItem("tomorrowTasks")) || [
        "Согласовать с Олегом лестницу и поручень",
        "Проверить спецификацию по лаку и диффузоры вентиляции с Антоном"
    ],
    activeFreeSlotId: null
};

function saveState() {
    localStorage.setItem("dayMode", state.mode);
    localStorage.setItem("dayEnergy", state.energy);
    localStorage.setItem("daySteps", state.steps);
    localStorage.setItem("daySlots", JSON.stringify(state.slots));
    localStorage.setItem("tomorrowTasks", JSON.stringify(state.tomorrow));
}

// Форматирование текущей даты
function updateDateHeader() {
    const now = new Date();
    const options = { weekday: "long", day: "numeric", month: "long" };
    const formatted = now.toLocaleDateString("ru-RU", options);
    document.getElementById("currentDate").textContent =
        formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

// Отрисовка всего интерфейса
function renderAll() {
    updateDateHeader();

    // Режим дня
    const modeIcon = document.getElementById("modeIcon");
    const modeText = document.getElementById("modeText");
    const btnWork = document.getElementById("btnWorkDay");
    const btnRest = document.getElementById("btnRestDay");

    if (state.mode === "work") {
        modeIcon.textContent = "🛠";
        modeText.textContent = "Рабочий";
        btnWork.classList.add("active-choice");
        btnRest.classList.remove("active-choice");
    } else {
        modeIcon.textContent = "☕";
        modeText.textContent = "Выходной";
        btnRest.classList.add("active-choice");
        btnWork.classList.remove("active-choice");
    }

    // Энергия и шаги
    document.getElementById("energyValue").textContent = state.energy + "%";
    document.getElementById("stepsValue").textContent = state.steps.toLocaleString("ru-RU");

    // Оценка энергии для подсказки ассистента
    const adviceTag = document.getElementById("energyAdviceTag");
    if (state.energy >= 75) {
        adviceTag.textContent = "🔥 Высокий ресурс";
        adviceTag.style.color = "#10b981";
    } else if (state.energy >= 45) {
        adviceTag.textContent = "⚡ Средний тонус";
        adviceTag.style.color = "#f59e0b";
    } else {
        adviceTag.textContent = "🛋 Бережем силы";
        adviceTag.style.color = "#f43f5e";
    }

    renderAssistantPrompt();
    renderCurrentFocus();
    renderTimeline();
    renderTomorrow();
}

// Поиск первого свободного окна для вопроса Ассистента
function renderAssistantPrompt() {
    const freeSlot = state.slots.find(s => s.load === "free" && !s.done);
    const msgEl = document.getElementById("assistantMessage");

    if (freeSlot) {
        state.activeFreeSlotId = freeSlot.id;
        let energyHint = "";
        if (state.energy < 45) {
            energyHint = " Сил сейчас немного — рекомендую поставить легкую рутину или отдых.";
        } else if (state.energy >= 80) {
            energyHint = " Отличный запас сил для выезда на объект или сложного проекта.";
        }
        msgEl.innerHTML = `У тебя свободно окно <strong>${freeSlot.time}</strong>. Какие пожелания? Чем займем это время?${energyHint}`;
    } else {
        state.activeFreeSlotId = null;
        msgEl.innerHTML = `Все окна на сегодня расписаны! Если планы изменились, нажми на любой слот ниже или добавь новый.`;
    }
}

// Текущая задача в фокусе
function renderCurrentFocus() {
    const activeSlot = state.slots.find(s => !s.done && s.load !== "free") || state.slots.find(s => !s.done);
    const timeEl = document.getElementById("focusTimeSlot");
    const titleEl = document.getElementById("focusTitle");
    const descEl = document.getElementById("focusDesc");

    if (activeSlot) {
        timeEl.textContent = activeSlot.time;
        titleEl.textContent = activeSlot.title;
        if (activeSlot.load === "high") {
            descEl.textContent = "Высокая концентрация / работа по объекту.";
        } else if (activeSlot.load === "medium") {
            descEl.textContent = "Рабочая координация, чертежи и согласования.";
        } else if (activeSlot.load === "free") {
            descEl.textContent = "Окно пока свободно — выбери задачу в диалоге выше.";
        } else {
            descEl.textContent = "Спокойный темп без перегруза.";
        }
    } else {
        timeEl.textContent = "День завершен";
        titleEl.textContent = "Все задачи на сегодня закрыты 🎉";
        descEl.textContent = "Отличная работа! Время отдыхать.";
    }
}

// Отрисовка списка слотов
function renderTimeline() {
    const list = document.getElementById("timelineList");
    list.innerHTML = "";

    const loadLabels = {
        high: { text: "🔥 Высокая нагрузка", cls: "tag-high" },
        medium: { text: "⚡ Координация", cls: "tag-medium" },
        low: { text: "🌿 Легкий темп", cls: "tag-low" },
        free: { text: "✨ Свободное окно — нажми, чтобы занять", cls: "tag-free" }
    };

    state.slots.forEach(slot => {
        const item = document.createElement("div");
        item.className = `slot-item ${slot.load === "free" ? "slot-free" : ""} ${slot.done ? "slot-done" : ""}`;

        const tagInfo = loadLabels[slot.load] || loadLabels.medium;

        item.innerHTML = `
            <div class="slot-left" onclick="selectSlotForEdit(${slot.id})">
                <span class="slot-time">${slot.time}</span>
                <span class="slot-title">${slot.title}</span>
                <span class="slot-tag ${tagInfo.cls}">${tagInfo.text}</span>
            </div>
            <div class="slot-controls">
                <button class="icon-btn" onclick="toggleSlotDone(${slot.id})" title="Отметить выполненным">
                    ${slot.done ? "↩" : "✓"}
                </button>
                <button class="icon-btn" onclick="clearOrDeleteSlot(${slot.id})" title="Освободить / Удалить">
                    ✕
                </button>
            </div>
        `;
        list.appendChild(item);
    });
}

// Заполнение свободного окна через быстрый чип
function quickFillSlot(title, loadType) {
    fillActiveFreeSlot(title, loadType === "rest" ? "low" : loadType);
}

// Заполнение свободного окна своим текстом
function submitCustomSlot() {
    const input = document.getElementById("customSlotInput");
    const text = input.value.trim();
    if (!text) return;

    const autoLoad = state.energy >= 75 ? "high" : (state.energy >= 45 ? "medium" : "low");
    fillActiveFreeSlot(text, autoLoad);
    input.value = "";
}

function fillActiveFreeSlot(title, load) {
    let target = state.slots.find(s => s.id === state.activeFreeSlotId);
    if (!target) {
        target = state.slots.find(s => s.load === "free" && !s.done);
    }

    if (target) {
        target.title = title;
        target.load = load;
    } else {
        state.slots.push({
            id: Date.now(),
            time: "Доп. слот",
            title: title,
            load: load,
            done: false
        });
    }
    saveState();
    renderAll();
}

// Управление слотами
function toggleSlotDone(id) {
    const slot = state.slots.find(s => s.id === id);
    if (slot) {
        slot.done = !slot.done;
        saveState();
        renderAll();
    }
}

function clearOrDeleteSlot(id) {
    const slot = state.slots.find(s => s.id === id);
    if (!slot) return;

    if (slot.load !== "free") {
        slot.title = "Свободное окно";
        slot.load = "free";
        slot.done = false;
    } else {
        state.slots = state.slots.filter(s => s.id !== id);
    }
    saveState();
    renderAll();
}

function selectSlotForEdit(id) {
    const slot = state.slots.find(s => s.id === id);
    if (!slot) return;
    state.activeFreeSlotId = slot.id;
    const msgEl = document.getElementById("assistantMessage");
    msgEl.innerHTML = `Выбран слот <strong>${slot.time}</strong> (${slot.title}). Нажми на кнопку ниже или напиши, чем его заменить:`;
    document.getElementById("customSlotInput").focus();
}

// Кнопки текущего фокуса
function completeCurrentFocus() {
    const activeSlot = state.slots.find(s => !s.done && s.load !== "free") || state.slots.find(s => !s.done);
    if (activeSlot) {
        activeSlot.done = true;
        saveState();
        renderAll();
    }
}

// Сдвиг расписания на +30 минут
function shiftSchedule(minutes) {
    state.slots.forEach(slot => {
        if (!slot.done) {
            slot.time = slot.time.replace(/(\d{2}):(\d{2})/g, (match, h, m) => {
                let totalMinutes = parseInt(h, 10) * 60 + parseInt(m, 10) + minutes;
                let newH = Math.floor(totalMinutes / 60) % 24;
                let newM = totalMinutes % 60;
                return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
            });
        }
    });
    saveState();
    renderAll();
}

// Режим "Нет сил / Не хочу ничего делать"
function activateLowEnergyMode() {
    state.energy = 35;
    state.slots.forEach(slot => {
        if (!slot.done && slot.load === "high") {
            state.tomorrow.push(slot.title);
            slot.title = "Свободное окно (перенесено на завтра для отдыха)";
            slot.load = "low";
        }
    });
    saveState();
    renderAll();
}

// Утренний чек-ин и переключение режима
function selectDayMode(mode) {
    state.mode = mode;
    if (mode === "work") {
        state.slots = JSON.parse(JSON.stringify(defaultSlotsWork));
    } else {
        state.slots = JSON.parse(JSON.stringify(defaultSlotsRest));
    }
    saveState();
    renderAll();
}

document.getElementById("modeToggleBtn").addEventListener("click", () => {
    selectDayMode(state.mode === "work" ? "rest" : "work");
});

function setMorningEnergy(val) {
    state.energy = val;
    saveState();
    renderAll();
}

function adjustEnergy(delta) {
    state.energy = Math.max(10, Math.min(100, state.energy + delta));
    saveState();
    renderAll();
}

function promptSteps() {
    const input = prompt("Введи текущее количество шагов (из Huawei Здоровье / Apple Здоровье):", state.steps);
    if (input !== null && !isNaN(parseInt(input, 10))) {
        state.steps = parseInt(input, 10);
        if (state.steps > 10000 && state.energy > 60) {
            // Высокая физическая активность учитывается в балансе сил
            state.energy = Math.max(40, state.energy - 10);
        }
        saveState();
        renderAll();
    }
}

function hideMorningCheckin() {
    document.getElementById("morningCheckinCard").classList.add("hidden");
}

// Голосовой ввод через браузер телефона (Web Speech API)
function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById("micBtn");

    if (!SpeechRecognition) {
        alert("Голосовой ввод поддерживается прямо с клавиатуры телефона (нажми на иконку микрофона на клавиатуре iPhone).");
        document.getElementById("customSlotInput").focus();
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;

    micBtn.classList.add("recording");
    recognition.start();

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById("customSlotInput").value = transcript;
        micBtn.classList.remove("recording");
    };

    recognition.onerror = () => {
        micBtn.classList.remove("recording");
    };

    recognition.onend = () => {
        micBtn.classList.remove("recording");
    };
}

// Блок задач на завтра
function renderTomorrow() {
    const list = document.getElementById("tomorrowList");
    list.innerHTML = "";
    state.tomorrow.forEach((task, idx) => {
        const li = document.createElement("li");
        li.className = "tomorrow-item";
        li.innerHTML = `
            <span>${task}</span>
            <button class="close-btn" onclick="removeTomorrowTask(${idx})">✕</button>
        `;
        list.appendChild(li);
    });
}

function addTomorrowTask() {
    const input = document.getElementById("tomorrowInput");
    const val = input.value.trim();
    if (!val) return;
    state.tomorrow.push(val);
    input.value = "";
    saveState();
    renderTomorrow();
}

function removeTomorrowTask(idx) {
    state.tomorrow.splice(idx, 1);
    saveState();
    renderTomorrow();
}

function transferTomorrowToToday() {
    if (state.tomorrow.length === 0) return;
    state.tomorrow.forEach(taskText => {
        const freeSlot = state.slots.find(s => s.load === "free" && !s.done);
        if (freeSlot) {
            freeSlot.title = taskText;
            freeSlot.load = "medium";
        } else {
            state.slots.push({
                id: Date.now() + Math.random(),
                time: "Гибкий слот",
                title: taskText,
                load: "medium",
                done: false
            });
        }
    });
    state.tomorrow = [];
    saveState();
    renderAll();
}

// Модальное окно добавления своего слота
function openAddModal() {
    document.getElementById("addSlotModal").classList.remove("hidden");
}

function closeAddModal() {
    document.getElementById("addSlotModal").classList.add("hidden");
}

function saveCustomModalSlot() {
    const time = document.getElementById("modalTimeInput").value.trim() || "Гибкое время";
    const title = document.getElementById("modalTitleInput").value.trim() || "Свободное окно";
    const load = document.getElementById("modalLoadInput").value;

    state.slots.push({
        id: Date.now(),
        time: time,
        title: title,
        load: load,
        done: false
    });

    document.getElementById("modalTimeInput").value = "";
    document.getElementById("modalTitleInput").value = "";
    closeAddModal();
    saveState();
    renderAll();
}

// Запуск при открытии
document.addEventListener("DOMContentLoaded", renderAll);