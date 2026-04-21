// script.js — SPAb510 Core Logic
// Consumes STUDY_DATA from data.js

document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // AUTH
    // ============================================================
    const authOverlay      = document.getElementById('auth-overlay');
    const authPasswordInput = document.getElementById('auth-password');
    const authSubmitBtn    = document.getElementById('auth-submit');
    const authError        = document.getElementById('auth-error');

    const AUTH_PASSWORD = "independence";

    const fabReveal        = document.getElementById('fab-reveal');

    function checkAuth() {
        const isAuthed = localStorage.getItem('spa_auth') === 'true'
                      || localStorage.getItem('isAuthenticated') === 'true';
        if (isAuthed) {
            localStorage.setItem('spa_auth', 'true'); // migrate
            authOverlay.classList.add('hidden');
            fabReveal.classList.remove('hidden');
            initApp();
        } else {
            authOverlay.classList.remove('hidden');
            fabReveal.classList.add('hidden');
            authPasswordInput.focus();
        }
    }

    function doLogin() {
        const input = authPasswordInput.value.trim().toLowerCase();
        if (input === AUTH_PASSWORD) {
            localStorage.setItem('spa_auth', 'true');
            authOverlay.classList.add('hidden');
            fabReveal.classList.remove('hidden');
            authError.classList.add('hidden');
            initApp();
        } else {
            authError.classList.remove('hidden');
            authPasswordInput.value = '';
            authPasswordInput.focus();
            // Shake effect on auth box
            const box = authOverlay.querySelector('.auth-box');
            box.style.animation = 'none';
            void box.offsetWidth;
            box.style.animation = '';
        }
    }

    authSubmitBtn.addEventListener('click', doLogin);
    authPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // ============================================================
    // CONSTANTS (must be before boot sequence)
    // ============================================================
    const GRID_MAP = {
        '5s':          'grid-5s',
        '10s':         'grid-10s',
        'pre-trip':    'grid-pre-trip',
        'start-stop':  'grid-start-stop',
        'timms':       'grid-timms',
        'driver-drill':'grid-driver-drill',
    };

    // ============================================================
    // BOOT SEQUENCE — tabs and nav first, then auth
    // ============================================================
    initTabs();
    initNavbarHide();
    checkAuth();

    function initApp() {
        try {
            buildAllGrids();
            initAudioSystem();
            // Initialize premium icons
            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (e) {
            console.error('[SPAb510] buildAllGrids failed:', e);
        }
    }


    // ============================================================
    // NAVBAR HIDE ON SCROLL
    // ============================================================
    function initNavbarHide() {
        // Dock is fixed — no hide on scroll. Just reset scroll position.
        if (history.scrollRestoration) history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);
    }


    // ============================================================
    // TABS
    // ============================================================
    function initTabs() {
        const tabs     = document.querySelectorAll('.tab-button');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                contents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');

                const target = document.getElementById(`content-${tab.dataset.tab}`);
                if (target) target.classList.add('active');
            });
        });
    }


    // ============================================================
    // MASTERY TRACKING
    // ============================================================
    function getMasteryKey(cardId)  { return `mastery_${cardId}`; }
    function getStruggleKey(cardId) { return `struggle_${cardId}`; }

    function getMasteryCount(cardId) {
        return parseInt(localStorage.getItem(getMasteryKey(cardId)) || '0', 10);
    }

    function incrementMastery(cardId) {
        const current = getMasteryCount(cardId);
        localStorage.setItem(getMasteryKey(cardId), String(current + 1));
        return current + 1;
    }

    function loadStruggles(cardId) {
        const json = localStorage.getItem(getStruggleKey(cardId));
        return json ? new Set(JSON.parse(json)) : new Set();
    }

    function saveStruggles(cardId, set) {
        localStorage.setItem(getStruggleKey(cardId), JSON.stringify(Array.from(set)));
    }


    // ============================================================
    // RECALL SCHEDULER LOGIC
    // ============================================================
    const RECALL_INTERVALS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800]; // in seconds

    function getRecallKey(cardId, type) { return `recall_${type}_${cardId}`; }

    function getRecallState(cardId) {
        return {
            level: parseInt(localStorage.getItem(getRecallKey(cardId, 'level')) || '-1', 10),
            nextAt: parseInt(localStorage.getItem(getRecallKey(cardId, 'nextAt')) || '0', 10)
        };
    }

    function advanceRecallSchedule(cardId) {
        const state = getRecallState(cardId);
        const nextLevel = Math.min(state.level + 1, RECALL_INTERVALS.length - 1);
        const nextAt    = Date.now() + (RECALL_INTERVALS[nextLevel] * 1000);

        localStorage.setItem(getRecallKey(cardId, 'level'), String(nextLevel));
        localStorage.setItem(getRecallKey(cardId, 'nextAt'), String(nextAt));
        
        if (recallRuntimeState[cardId]) {
            recallRuntimeState[cardId].hasAlarmed = false;
        }

        updateCardRecallUI(cardId);
    }

    function resetRecallSchedule(cardId) {
        // Reset to first interval (1s)
        const nextAt = Date.now() + (RECALL_INTERVALS[0] * 1000);
        localStorage.setItem(getRecallKey(cardId, 'level'), '0');
        localStorage.setItem(getRecallKey(cardId, 'nextAt'), String(nextAt));
        
        if (recallRuntimeState[cardId]) {
            recallRuntimeState[cardId].hasAlarmed = false;
        }

        updateCardRecallUI(cardId);
    }

    function formatTimeRemaining(ms) {
        if (ms <= 0) return "READY";
        const totalSec = Math.ceil(ms / 1000);
        if (totalSec < 60) return `${totalSec}s`;
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function updateCardRecallUI(cardId) {
        const badge = document.getElementById(`recall-status-${cardId}`);
        if (!badge) return;

        const state = getRecallState(cardId);
        if (state.level === -1) {
            badge.classList.add('hidden');
            return;
        }

        badge.classList.remove('hidden');
        const now = Date.now();
        const diff = state.nextAt - now;

        if (diff <= 0) {
            badge.textContent = "READY";
            badge.className   = "recall-status ready";
            
            // Audio Alarm Trigger
            if (!recallRuntimeState[cardId]) recallRuntimeState[cardId] = { hasAlarmed: false };
            if (!recallRuntimeState[cardId].hasAlarmed) {
                playRecallAlarm();
                recallRuntimeState[cardId].hasAlarmed = true;
            }
        } else {
            badge.textContent = `Recall in ${formatTimeRemaining(diff)}`;
            badge.className   = "recall-status waiting";
        }
    }

    function startGlobalRecallTick() {
        setInterval(() => {
            const badges = document.querySelectorAll('.recall-status:not(.hidden)');
            badges.forEach(badge => {
                const cardId = badge.id.replace('recall-status-', '');
                updateCardRecallUI(cardId);
            });
        }, 1000);
    }

    startGlobalRecallTick();

    // ============================================================
    // AUDIO ALARM SYSTEM
    // ============================================================
    let audioCtx = null;
    let lastAlarmTime = 0;
    let isMuted = localStorage.getItem('spa_audio_muted') === 'true';
    const recallRuntimeState = {}; // cardId -> { hasAlarmed: bool }

    function initAudioSystem() {
        const toggleBtn = document.getElementById('audio-toggle');
        if (!toggleBtn) return;

        function updateToggleUI() {
            toggleBtn.className = isMuted ? 'muted' : '';
            toggleBtn.innerHTML = isMuted ? '<i data-lucide="volume-x"></i>' : '<i data-lucide="volume-2"></i>';
            if (window.lucide) window.lucide.createIcons();
        }

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isMuted = !isMuted;
            localStorage.setItem('spa_audio_muted', String(isMuted));
            updateToggleUI();
            
            // Resume context on user gesture
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        });

        updateToggleUI();
    }

    function playRecallAlarm() {
        if (isMuted) return;

        // Throttling: Max one alarm every 2 seconds
        const now = Date.now();
        if (now - lastAlarmTime < 2000) return;
        lastAlarmTime = now;

        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const playTone = (freq, start, duration) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(start);
                osc.stop(start + duration);
            };

            const startTime = audioCtx.currentTime;
            playTone(880, startTime, 0.1);
            playTone(1100, startTime + 0.08, 0.15);
        } catch (e) {
            console.warn('[SPAb510] Audio synthesis failed:', e);
        }
    }


    // ============================================================
    // BUILD ALL GRIDS FROM data.js
    // ============================================================

    function buildAllGrids() {
        Object.entries(GRID_MAP).forEach(([key, gridId]) => {
            const grid    = document.getElementById(gridId);
            const entries = STUDY_DATA[key];
            if (!grid || !entries) return;

            entries.forEach((entry, idx) => {
                const card = document.createElement('div');
                card.className = 'card interactive-card';
                card.id        = entry.id;

                const titleRow = document.createElement('div');
                titleRow.className = 'card-title-row';

                const num = document.createElement('span');
                num.className   = 'card-number';
                num.textContent = String(idx + 1);

                const h2 = document.createElement('h2');
                h2.textContent = entry.title;

                const masteryBadge = document.createElement('span');
                masteryBadge.className = 'mastery-badge';
                masteryBadge.id        = `mastery-badge-${entry.id}`;
                const count = getMasteryCount(entry.id);
                if (count > 0) {
                    masteryBadge.textContent = `${count}× clean`;
                    masteryBadge.classList.add('visible');
                }

                const recallStatus = document.createElement('span');
                recallStatus.className = 'recall-status hidden';
                recallStatus.id        = `recall-status-${entry.id}`;

                titleRow.appendChild(num);
                titleRow.appendChild(h2);
                titleRow.appendChild(masteryBadge);
                titleRow.appendChild(recallStatus);
                card.appendChild(titleRow);

                const revealText = document.createElement('p');
                revealText.className = 'reveal-text';
                card.appendChild(revealText);

                grid.appendChild(card);

                setupReveal(entry.id, entry.text);
            });
        });
    }


    // ============================================================
    // FOCUS (DRILL) MODE
    // ============================================================
    const focusOverlay  = document.getElementById('focus-overlay');
    const focusText     = document.getElementById('focus-text');
    const focusCloseBtn = document.getElementById('focus-close-btn');
    const focusCounter  = document.getElementById('focus-counter');

    let currentFocusData     = [];
    let currentFocusIndex    = 0;
    let currentCardId        = null;
    let currentStruggleSet   = new Set();
    let onFocusExitCallback  = null;

    // Interference state
    let isInterferenceEnabled        = false;
    let interferenceFrequencyLevel   = 0;
    let wordsSinceLastInterference   = 0;
    let nextInterferenceThreshold    = 10;
    let isInterferenceActive         = false;

    const toggles = [
        document.getElementById('freq-1'),
        document.getElementById('freq-2'),
        document.getElementById('freq-3'),
    ];

    toggles.forEach((toggle, index) => {
        toggle.addEventListener('change', (e) => {
            const level = index + 1;
            setInterferenceLevel(e.target.checked ? level : 0);
        });
    });

    function setInterferenceLevel(level) {
        interferenceFrequencyLevel = level;
        isInterferenceEnabled      = level > 0;
        toggles.forEach((t, i) => { t.checked = (i + 1 === level); });
        if (isInterferenceEnabled) {
            wordsSinceLastInterference = 0;
            nextInterferenceThreshold  = getNextInterferenceThreshold();
        }
    }

    const interferenceModal   = document.getElementById('interference-modal');
    const interferencePrompt  = document.getElementById('interference-prompt');
    const interferenceOptions = document.getElementById('interference-options');

    function getNextInterferenceThreshold() {
        if (interferenceFrequencyLevel === 1) return Math.floor(Math.random() * 11) + 10;
        if (interferenceFrequencyLevel === 2) return Math.floor(Math.random() * 5)  + 3;
        if (interferenceFrequencyLevel === 3) return Math.floor(Math.random() * 15) + 1;
        return 999;
    }

    let currentInterferenceOptions = [];
    let currentCorrectAnswer       = null;
    let activeTaskType             = null;

    function generateInterferenceTask() {
        const tasks = ['math', 'arrow', 'case', 'wait'];
        const type  = tasks[Math.floor(Math.random() * tasks.length)];
        activeTaskType = type;
        currentInterferenceOptions = [];
        interferenceModal.classList.remove('penalty-mode');
        interferenceOptions.classList.remove('hidden');

        if (type === 'math')  generateMathTask();
        else if (type === 'arrow') generateArrowTask();
        else if (type === 'case')  generateCaseTask();
        else if (type === 'wait')  generateWaitTask();

        interferenceModal.classList.remove('hidden');
        isInterferenceActive = true;
    }

    function generateMathTask() {
        const ops = ['+', '-'];
        const op  = ops[Math.floor(Math.random() * ops.length)];
        let a = Math.floor(Math.random() * 12) + 1;
        let b = Math.floor(Math.random() * 12) + 1;
        let answer;
        if (op === '+') {
            answer = a + b;
        } else {
            if (a < b) [a, b] = [b, a];
            answer = a - b;
        }
        renderTask(`${a} ${op} ${b} = ?`, answer, generateNumberOptions(answer));
    }

    function generateArrowTask() {
        const arrows = [
            { symbol: '↑', word: 'UP'    },
            { symbol: '↓', word: 'DOWN'  },
            { symbol: '←', word: 'LEFT'  },
            { symbol: '→', word: 'RIGHT' },
        ];
        const target = arrows[Math.floor(Math.random() * arrows.length)];
        renderTask(target.symbol, target.word, ['UP', 'DOWN', 'LEFT', 'RIGHT']);
    }

    function generateCaseTask() {
        const letters     = 'ABDEGQRT';
        const char        = letters[Math.floor(Math.random() * letters.length)];
        const correctLower = char.toLowerCase();
        let options = new Set([correctLower]);
        const allLower = 'abcdefghijklmnopqrstuvwxyz';
        while (options.size < 4) {
            const rand = allLower[Math.floor(Math.random() * allLower.length)];
            options.add(rand);
        }
        renderTask(char, correctLower, Array.from(options));
    }

    function generateWaitTask() {
        let timeLeft = Math.floor(Math.random() * 3) + 3;
        interferencePrompt.textContent = `WAIT… ${timeLeft}`;
        interferenceOptions.classList.add('hidden');
        interferenceModal.classList.add('penalty-mode');

        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                processCorrectAnswer();
            } else {
                interferencePrompt.textContent = `WAIT… ${timeLeft}`;
            }
        }, 1000);
    }

    function generateNumberOptions(answer) {
        let options = new Set([answer]);
        while (options.size < 4) {
            let offset = Math.floor(Math.random() * 5) - 2;
            if (offset === 0) offset = 1;
            let d = answer + offset;
            if (d < 0) d = 0;
            options.add(d);
        }
        return Array.from(options);
    }

    function renderTask(promptText, correctAnswer, optionsArray) {
        interferencePrompt.textContent = promptText;
        interferenceOptions.innerHTML  = '';
        currentCorrectAnswer           = correctAnswer;

        let displayOptions = optionsArray;
        if (activeTaskType !== 'arrow') {
            displayOptions = [...optionsArray].sort(() => Math.random() - 0.5);
        }

        const keys = ['A', 'B', 'C', 'D'];
        displayOptions.forEach((opt, index) => {
            const keyChar = keys[index];
            currentInterferenceOptions.push({ key: keyChar.toLowerCase(), value: opt });

            const btn = document.createElement('button');
            btn.className   = 'interference-btn';
            btn.textContent = `(${keyChar})  ${opt}`;
            btn.onclick = (e) => {
                e.stopPropagation();
                validateAnswer(opt);
            };
            interferenceOptions.appendChild(btn);
        });
    }

    function validateAnswer(selected) {
        if (selected === currentCorrectAnswer) {
            processCorrectAnswer();
        } else {
            interferenceModal.classList.remove('shake');
            void interferenceModal.offsetWidth;
            interferenceModal.classList.add('shake');
            setTimeout(() => interferenceModal.classList.remove('shake'), 400);
        }
    }

    function processCorrectAnswer() {
        interferenceModal.classList.add('hidden');
        isInterferenceActive           = false;
        wordsSinceLastInterference     = 0;
        nextInterferenceThreshold      = getNextInterferenceThreshold();
        updateFocusWord();
    }

    function updateFocusCounter() {
        if (!focusCounter) return;
        const total = currentFocusData.length;
        const index = Math.min(currentFocusIndex, total);
        focusCounter.textContent = `${index} / ${total}`;
    }

    function updateFocusWord() {
        if (currentFocusIndex < 0) currentFocusIndex = 0;

        updateFocusCounter();

        // EOS
        if (currentFocusIndex === currentFocusData.length) {
            focusOverlay.classList.add('focus-eos');
            focusText.classList.remove('struggle');
            focusText.innerHTML = 'EOS';

            // Check mastery: if no struggle words, increment mastery count
            if (currentStruggleSet.size === 0) {
                const newCount = incrementMastery(currentCardId);
                const badge    = document.getElementById(`mastery-badge-${currentCardId}`);
                if (badge) {
                    badge.textContent = `${newCount}× clean`;
                    badge.classList.add('visible');
                }
                advanceRecallSchedule(currentCardId);
            } else {
                // If there were struggle words, reset the schedule to the start
                resetRecallSchedule(currentCardId);
            }
            return;
        }

        if (currentFocusIndex > currentFocusData.length) {
            closeFocusMode();
            return;
        }

        // Interference check
        if (isInterferenceEnabled && !isInterferenceActive && currentFocusIndex > 0) {
            if (wordsSinceLastInterference >= nextInterferenceThreshold) {
                generateInterferenceTask();
                return;
            }
        }

        focusOverlay.classList.remove('focus-eos');

        if (currentStruggleSet.has(currentFocusIndex)) {
            focusText.classList.add('struggle');
        } else {
            focusText.classList.remove('struggle');
        }

        focusText.innerHTML = currentFocusData[currentFocusIndex];
    }

    function handleFocusKeydown(e) {
        if (focusOverlay.classList.contains('hidden')) return;

        if (isInterferenceActive) {
            if (activeTaskType === 'wait') {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const key    = e.key.toLowerCase();
            const option = currentInterferenceOptions.find(o => o.key === key);
            if (option) {
                e.preventDefault();
                e.stopPropagation();
                validateAnswer(option.value);
            } else {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        if (e.key === 'Escape') {
            closeFocusMode();
            return;
        }

        if (e.code === 'Space' || e.key === 'ArrowRight') {
            e.preventDefault();
            nextFocusWord();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (currentFocusIndex > 0) {
                currentFocusIndex--;
                updateFocusWord();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentFocusIndex >= currentFocusData.length) return;
            if (currentStruggleSet.has(currentFocusIndex)) {
                currentStruggleSet.delete(currentFocusIndex);
            } else {
                currentStruggleSet.add(currentFocusIndex);
            }
            saveStruggles(currentCardId, currentStruggleSet);
            updateFocusWord();
        }
    }

    function nextFocusWord() {
        if (isInterferenceActive) return; // Don't advance during interference
        currentFocusIndex++;
        if (isInterferenceEnabled) wordsSinceLastInterference++;
        updateFocusWord();
    }

    function handleFocusClick(e) {
        if (e.target === focusCloseBtn) return;
        if (e.target.closest('#interference-toggle-container')) return;
        if (e.target.closest('#interference-modal')) return;
        nextFocusWord();
    }

    function startFocusMode(cardId, data, onExit) {
        currentCardId           = cardId;
        currentFocusData        = data;
        onFocusExitCallback     = onExit;
        currentStruggleSet      = loadStruggles(cardId);
        currentFocusIndex       = 0;
        wordsSinceLastInterference = 0;

        focusOverlay.classList.remove('hidden', 'focus-eos');
        focusOverlay.focus();
        updateFocusWord();

        document.addEventListener('keydown', handleFocusKeydown);
        focusOverlay.addEventListener('click', handleFocusClick);
    }

    function closeFocusMode() {
        focusOverlay.classList.add('hidden');
        focusOverlay.classList.remove('focus-eos');
        document.removeEventListener('keydown', handleFocusKeydown);
        focusOverlay.removeEventListener('click', handleFocusClick);
        if (onFocusExitCallback) onFocusExitCallback();
    }

    focusCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFocusMode();
    });


    // ============================================================
    // REVEAL CARDS
    // ============================================================
    function setupReveal(elementId, text) {
        const card = document.getElementById(elementId);
        if (!card) return;

        const revealContainer = card.querySelector('.reveal-text');

        // Parse text: newlines → <br>, *bold* → <b>
        const marker      = '___BR___';
        let processedText = text.replace(/\n/g, ` ${marker} `);

        processedText = processedText.replace(/\*([^*]+)\*/g, (match, p1) => {
            return p1.split(' ').map(w => {
                if (w === marker || w.trim() === '') return w;
                return `<b>${w}</b>`;
            }).join(' ');
        });

        const words         = processedText.split(' ');
        revealContainer.innerHTML = '';
        const meaningfulSpans    = [];

        words.forEach((word) => {
            if (word === marker) {
                revealContainer.appendChild(document.createElement('br'));
            } else if (word.trim() !== '') {
                const span = document.createElement('span');
                span.innerHTML = word;
                revealContainer.appendChild(span);
                meaningfulSpans.push(span);
                revealContainer.appendChild(document.createTextNode(' '));
            }
        });

        // Refresh struggle underline state
        function refreshStruggleView() {
            const struggles = loadStruggles(elementId);
            meaningfulSpans.forEach((span, index) => {
                span.classList.toggle('struggle-word', struggles.has(index));
            });
        }
        refreshStruggleView();

        // Progress bar
        const progressWrapper   = document.createElement('div');
        progressWrapper.className = 'progress-wrapper';

        const progressContainer = document.createElement('div');
        progressContainer.className = 'card-progress-container';

        const progressBar = document.createElement('div');
        progressBar.className = 'card-progress-bar';
        progressContainer.appendChild(progressBar);

        const progressText = document.createElement('span');
        progressText.className   = 'progress-text';
        progressText.textContent = '0%';

        progressWrapper.appendChild(progressContainer);
        progressWrapper.appendChild(progressText);

        // Insert after title row
        const titleRow = card.querySelector('.card-title-row');
        if (titleRow) {
            titleRow.insertAdjacentElement('afterend', progressWrapper);
        } else {
            card.prepend(progressWrapper);
        }

        progressWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            revealNext();
            refocusCard();
        });

        function updateProgress() {
            const revealedCount = meaningfulSpans.filter(s => s.classList.contains('visible')).length;
            const progress      = (revealedCount / meaningfulSpans.length) * 100;
            progressBar.style.width  = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            return revealedCount === meaningfulSpans.length;
        }

        function setReveal(shouldReveal) {
            meaningfulSpans.forEach(span => span.classList.toggle('visible', shouldReveal));
            revealAllButton.textContent = shouldReveal ? 'Hide' : 'Show';
            updateProgress();
        }

        function refocusCard() {
            setTimeout(() => card.focus(), 0);
        }

        function goToNextCard() {
            let next = card.nextElementSibling;
            while (next && !next.classList.contains('interactive-card')) {
                next = next.nextElementSibling;
            }
            if (next) {
                next.focus();
                next.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function revealNext() {
            const nextHidden = meaningfulSpans.find(s => !s.classList.contains('visible'));
            if (nextHidden) {
                nextHidden.classList.add('visible');
                updateProgress();
                nextHidden.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                goToNextCard();
            }
        }

        // Action buttons
        const actionContainer = document.createElement('div');
        actionContainer.className = 'card-actions';

        const revealAllButton = document.createElement('button');
        revealAllButton.textContent = 'Show';
        revealAllButton.className   = 'card-action-btn reveal-btn';
        actionContainer.appendChild(revealAllButton);

        const testButton = document.createElement('button');
        testButton.textContent = 'Drill';
        testButton.className   = 'card-action-btn test-btn';
        actionContainer.appendChild(testButton);

        revealAllButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAnyHidden = meaningfulSpans.some(s => !s.classList.contains('visible'));
            setReveal(isAnyHidden);
        });

        testButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const textArray = meaningfulSpans.map(s => s.innerHTML);
            startFocusMode(elementId, textArray, () => {
                refreshStruggleView();
                updateProgress();
                refocusCard();
            });
        });

        // Strategy/Help button + guide
        const strategyBtn = document.createElement('button');
        strategyBtn.className   = 'card-action-btn strategy-toggle-btn';
        strategyBtn.textContent = 'Help';

        const strategyGuide = document.createElement('div');
        strategyGuide.className = 'strategy-guide';
        strategyGuide.innerHTML = `<p><strong>Show</strong> reveals all text for quick audit. <strong>Drill</strong> launches RSVP focus mode — advance with Space/→, go back with ←, flag struggle words with ↓. Tap the progress bar to reveal one word at a time.</p>`;

        strategyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            strategyGuide.classList.toggle('visible');
        });

        // Footer
        const footer = document.createElement('div');
        footer.className = 'card-footer';
        footer.appendChild(strategyBtn);
        footer.appendChild(actionContainer);
        card.appendChild(footer);
        card.insertAdjacentElement('afterend', strategyGuide);

        // Card keyboard / click interactions
        card.setAttribute('tabindex', '0');

        card.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                revealNext();
            }
        });

        card.addEventListener('click', (e) => {
            card.focus();
            if (e.target.tagName === 'SPAN') {
                e.target.classList.toggle('visible');
                updateProgress();
                return;
            }
            if (e.target.classList.contains('card-action-btn')) return;

            const isFinished = updateProgress();
            if (isFinished) {
                goToNextCard();
            } else {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                revealNext();
            }
        });
    }

    // ============================================================
    // GLOBAL ADVANCE (FAB / Global Space)
    // ============================================================
    function triggerGlobalAdvance() {
        // If in Drill mode, advance that
        if (!focusOverlay.classList.contains('hidden')) {
            nextFocusWord();
            return;
        }

        // If not in Drill mode, find the focused card or first card and reveal next word
        let activeCard = document.activeElement.closest('.interactive-card');
        
        if (!activeCard) {
            // Find first card in active tab
            const activeTabContent = document.querySelector('.tab-content.active');
            if (activeTabContent) {
                activeCard = activeTabContent.querySelector('.interactive-card');
            }
        }

        if (activeCard) {
            activeCard.focus();
            // Dispatch a Space keydown to the card to trigger its local revealNext()
            const spaceEvent = new KeyboardEvent('keydown', {
                code: 'Space',
                key: ' ',
                bubbles: true
            });
            activeCard.dispatchEvent(spaceEvent);
        }
    }

    fabReveal.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerGlobalAdvance();
    });

}); // end DOMContentLoaded
