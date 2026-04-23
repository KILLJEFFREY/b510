// script.js — SPAb510 Core Logic
// Consumes STUDY_DATA from data.js

(() => {
'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const GRID_MAP = {
    '5s':           'grid-5s',
    '10s':          'grid-10s',
    'pre-trip':     'grid-pre-trip',
    'start-stop':   'grid-start-stop',
    'timms':        'grid-timms',
    'driver-drill': 'grid-driver-drill',
};

// Graduated recall intervals, in seconds.
// Short end drives same-session drilling; long tail drives day-scale spacing.
const RECALL_INTERVALS = [
    1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800,    // 1s → 30m (session)
    3600, 14400,                                     // 1h, 4h (same-day audit)
    86400, 259200, 604800, 2592000,                  // 1d, 3d, 7d, 30d (consolidation)
];

// Klaxon only for session-scale intervals. Hour+ uses visual + tab title.
const ALARM_AUDIO_THRESHOLD_SEC = 3600;

const INTERFERENCE_TYPES = ['math', 'arrow', 'case', 'wait'];
const CASE_LETTERS       = 'ABDEGQRT';
const ALPHA_LOWER        = 'abcdefghijklmnopqrstuvwxyz';

const ALARM_THROTTLE_MS  = 2000;

// Chronic threshold: word flagged in at least N of the last M sessions.
const CHRONIC_MIN_HITS   = 3;
const CHRONIC_WINDOW     = 5;
const SESSION_HISTORY_CAP = 20;

const TITLE_BASE = 'SPAb510 — B510 Precision Recall Trainer';

// Pull auth hash out of a meta tag so it isn't embedded in logic.
const AUTH_HASH = (() => {
    const m = document.querySelector('meta[name="spab510-auth-hash"]');
    return m ? m.getAttribute('content') : '';
})();

// ============================================================
// TEXT TOKENIZATION
// ============================================================
function tokenize(raw) {
    const tokens = [];
    const lines = raw.split('\n');
    lines.forEach((line, lineIdx) => {
        if (lineIdx > 0) tokens.push({ kind: 'br' });
        let bold = false;
        let buf = '';
        const flush = () => {
            if (!buf) return;
            buf.split(/\s+/).forEach(w => {
                if (w) tokens.push({ kind: 'word', text: w, bold });
            });
            buf = '';
        };
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '*') { flush(); bold = !bold; continue; }
            buf += ch;
        }
        flush();
    });
    return tokens;
}

function wordNode(tok) {
    const span = document.createElement('span');
    if (tok.bold) {
        const b = document.createElement('b');
        b.textContent = tok.text;
        span.appendChild(b);
    } else {
        span.textContent = tok.text;
    }
    return span;
}

// Strip punctuation & lowercase for verify matching.
function normalizeWord(s) {
    return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// Check if an element is already in (or near) the viewport — if so, avoid
// calling focus() without preventScroll to stop mobile jitter.
function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight);
}
function focusNoScroll(el) {
    if (!el) return;
    if (isInViewport(el)) {
        try { el.focus({ preventScroll: true }); return; } catch (_) {}
    }
    el.focus();
}

document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // DOM REFS
    // ============================================================
    const authOverlay       = document.getElementById('auth-overlay');
    const authPasswordInput = document.getElementById('auth-password');
    const authSubmitBtn     = document.getElementById('auth-submit');
    const authError         = document.getElementById('auth-error');
    const contentArea       = document.querySelector('.content-area');
    const dueRollup         = document.getElementById('due-rollup');

    // Dock refs
    const dock             = document.getElementById('dock');
    const dockLabel        = document.getElementById('dock-label');
    const dockActionsEl    = document.getElementById('dock-actions');
    const dockReveal       = document.getElementById('dock-reveal');
    const dockReverseBtn   = document.getElementById('dock-reverse');
    const dockMuteBtn      = document.getElementById('dock-mute');
    const dockSettingsBtn  = document.getElementById('dock-settings');
    const dockDueBtn       = document.getElementById('dock-due');
    const dockDueCount     = document.getElementById('dock-due-count');

    const focusOverlay  = document.getElementById('focus-overlay');
    const focusText     = document.getElementById('focus-text');
    const focusSummary  = document.getElementById('focus-summary');
    const focusVerify   = document.getElementById('focus-verify');
    const focusVerifyPrev  = document.getElementById('focus-verify-prev');
    const focusVerifyInput = document.getElementById('focus-verify-input');
    const focusVerifyHint  = document.getElementById('focus-verify-hint');
    const focusCloseBtn = document.getElementById('focus-close-btn');
    const focusMuteBtn  = document.getElementById('focus-mute-btn');
    const focusCounter  = document.getElementById('focus-counter');
    // Back-compat alias used widely below; the FAB was deleted, dock REVEAL took over.
    const fabReveal     = dockReveal;

    const interferenceModal   = document.getElementById('interference-modal');
    const interferencePrompt  = document.getElementById('interference-prompt');
    const interferenceOptions = document.getElementById('interference-options');
    const freqToggles = [
        document.getElementById('freq-1'),
        document.getElementById('freq-2'),
        document.getElementById('freq-3'),
    ];

    const settingsBtn   = dockSettingsBtn; // dock owns the gear now
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-close');
    const settingsAlarms       = document.getElementById('settings-alarms');
    const settingsInterference = document.getElementById('settings-interference');
    const settingsExport = document.getElementById('settings-export');
    const settingsImport = document.getElementById('settings-import');
    const settingsImportFile = document.getElementById('settings-import-file');
    const settingsReset  = document.getElementById('settings-reset');
    const settingsLogout = document.getElementById('settings-logout');

    // ============================================================
    // AUTH
    // ============================================================
    async function sha256Hex(str) {
        const buf = new TextEncoder().encode(str);
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function checkAuth() {
        const isAuthed = localStorage.getItem('spa_auth') === 'true'
                      || localStorage.getItem('isAuthenticated') === 'true';
        if (isAuthed) {
            localStorage.setItem('spa_auth', 'true');
            authOverlay.classList.add('hidden');
            dock.classList.remove('hidden');
            document.body.classList.add('dock-ready');
            initApp();
        } else {
            authOverlay.classList.remove('hidden');
            dock.classList.add('hidden');
            document.body.classList.remove('dock-ready');
            authPasswordInput.focus();
        }
    }

    async function doLogin() {
        const input = authPasswordInput.value.trim().toLowerCase();
        const hash = await sha256Hex(input);
        if (hash === AUTH_HASH && AUTH_HASH) {
            localStorage.setItem('spa_auth', 'true');
            authOverlay.classList.add('hidden');
            dock.classList.remove('hidden');
            document.body.classList.add('dock-ready');
            authError.classList.add('hidden');
            initApp();
        } else {
            authError.classList.remove('hidden');
            authPasswordInput.value = '';
            authPasswordInput.focus();
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

    function initApp() {
        try {
            buildAllGrids();
            initMuteToggle();
            initSettings();
            initDock();
            restoreActiveCard();
            renderDueRollup();
            updateDockReadyPulse();
            if (window.lucide) window.lucide.createIcons();
        } catch (e) {
            console.error('[SPAb510] init failed:', e);
            showFatalError(e);
        }
    }

    function showFatalError(err) {
        const banner = document.createElement('div');
        banner.className = 'fatal-banner';
        banner.setAttribute('role', 'alert');
        banner.textContent = `Failed to initialize: ${err && err.message ? err.message : 'unknown error'}. Reload to retry.`;
        banner.style.cssText = 'background:#ef4444;color:#fff;padding:12px 20px;text-align:center;font-weight:600;';
        contentArea.prepend(banner);
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

    function switchToTab(tabKey) {
        const tab = document.querySelector(`.tab-button[data-tab="${tabKey}"]`);
        if (tab && !tab.disabled) tab.click();
    }

    // ============================================================
    // STORAGE
    // ============================================================
    const masteryKey   = (id) => `mastery_${id}`;
    const struggleKey  = (id) => `struggle_${id}`;
    const historyKey   = (id) => `session_history_${id}`;
    const recallKey    = (id, type) => `recall_${type}_${id}`;

    function getMasteryCount(id) {
        return parseInt(localStorage.getItem(masteryKey(id)) || '0', 10);
    }
    function incrementMastery(id) {
        const n = getMasteryCount(id) + 1;
        localStorage.setItem(masteryKey(id), String(n));
        return n;
    }
    function loadStruggles(id) {
        const json = localStorage.getItem(struggleKey(id));
        return json ? new Set(JSON.parse(json)) : new Set();
    }
    function saveStruggles(id, set) {
        localStorage.setItem(struggleKey(id), JSON.stringify(Array.from(set)));
    }
    function loadHistory(id) {
        const json = localStorage.getItem(historyKey(id));
        return json ? JSON.parse(json) : [];
    }
    function appendHistory(id, entry) {
        const hist = loadHistory(id);
        hist.push(entry);
        if (hist.length > SESSION_HISTORY_CAP) hist.splice(0, hist.length - SESSION_HISTORY_CAP);
        localStorage.setItem(historyKey(id), JSON.stringify(hist));
    }

    // ============================================================
    // RECALL SCHEDULER
    // ============================================================
    const activeRecallIds = new Set();
    let tickHandle = null;

    function getRecallState(id) {
        return {
            level:   parseInt(localStorage.getItem(recallKey(id, 'level'))   || '-1', 10),
            nextAt:  parseInt(localStorage.getItem(recallKey(id, 'nextAt'))  || '0',  10),
            alarmed: parseInt(localStorage.getItem(recallKey(id, 'alarmed')) || '-1', 10),
        };
    }

    function setRecallSchedule(id, level) {
        const nextAt = Date.now() + RECALL_INTERVALS[level] * 1000;
        localStorage.setItem(recallKey(id, 'level'),  String(level));
        localStorage.setItem(recallKey(id, 'nextAt'), String(nextAt));
        localStorage.setItem(recallKey(id, 'alarmed'), '-1');
        activeRecallIds.add(id);
        ensureTickRunning();
        updateCardRecallUI(id);
        renderDueRollup();
        updateTabTitle();
    }

    function advanceRecallSchedule(id) {
        const { level } = getRecallState(id);
        const next = Math.min(level + 1, RECALL_INTERVALS.length - 1);
        setRecallSchedule(id, next);
    }
    function resetRecallSchedule(id) { setRecallSchedule(id, 0); }

    function formatTimeRemaining(ms) {
        if (ms <= 0) return 'READY';
        const totalSec = Math.ceil(ms / 1000);
        if (totalSec < 60)     return `${totalSec}s`;
        if (totalSec < 3600)   return `${Math.floor(totalSec/60)}:${String(totalSec%60).padStart(2,'0')}`;
        if (totalSec < 86400)  {
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            return `${h}h ${m}m`;
        }
        const d = Math.floor(totalSec / 86400);
        const h = Math.floor((totalSec % 86400) / 3600);
        return `${d}d ${h}h`;
    }

    function updateCardRecallUI(id) {
        const badge = document.getElementById(`recall-status-${id}`);
        if (!badge) return;

        const state = getRecallState(id);
        if (state.level === -1) {
            badge.classList.add('hidden');
            return;
        }

        badge.classList.remove('hidden');
        const diff = state.nextAt - Date.now();

        if (diff <= 0) {
            badge.textContent = 'READY';
            badge.className   = 'recall-status ready';
            if (state.alarmed !== state.level) {
                const silent = RECALL_INTERVALS[state.level] >= ALARM_AUDIO_THRESHOLD_SEC;
                if (!silent) playRecallAlarm();
                localStorage.setItem(recallKey(id, 'alarmed'), String(state.level));
            }
        } else {
            badge.textContent = `Recall in ${formatTimeRemaining(diff)}`;
            badge.className   = 'recall-status waiting';
        }
    }

    function ensureTickRunning() {
        if (tickHandle !== null) return;
        if (activeRecallIds.size === 0) return;
        tickHandle = setInterval(() => {
            if (activeRecallIds.size === 0) {
                clearInterval(tickHandle);
                tickHandle = null;
                return;
            }
            activeRecallIds.forEach(updateCardRecallUI);
            updateTabTitle();
            updateDockReadyPulse();
            // Re-render rollup every ~15s to keep "Due" list accurate.
            if (!tickHandle._lastRollup || Date.now() - tickHandle._lastRollup > 15000) {
                renderDueRollup();
                tickHandle._lastRollup = Date.now();
            }
        }, 1000);
    }

    // ============================================================
    // DUE-TODAY ROLLUP
    // ============================================================
    function getAllScheduledIds() {
        const ids = [];
        Object.values(STUDY_DATA).forEach(list => {
            (list || []).forEach(entry => {
                const st = getRecallState(entry.id);
                if (st.level >= 0) ids.push({ id: entry.id, title: entry.title, state: st });
            });
        });
        return ids;
    }

    function renderDueRollup() {
        if (!dueRollup) return;
        const now = Date.now();
        const due = getAllScheduledIds()
            .filter(x => x.state.nextAt <= now)
            .sort((a, b) => a.state.nextAt - b.state.nextAt);

        // Update Due pill in dock
        if (dockDueBtn && dockDueCount) {
            if (due.length > 0) {
                dockDueBtn.classList.remove('hidden');
                dockDueCount.textContent = String(due.length);
            } else {
                dockDueBtn.classList.add('hidden');
            }
        }

        updateDockReadyPulse();

        if (due.length === 0) {
            dueRollup.classList.add('hidden');
            dueRollup.replaceChildren();
            return;
        }

        const h3 = document.createElement('h3');
        h3.textContent = `Due now (${due.length})`;

        const ul = document.createElement('ul');
        due.forEach(({ id, title }) => {
            const li  = document.createElement('li');
            const btn = document.createElement('button');
            btn.textContent = title;
            btn.setAttribute('aria-label', `Jump to ${title}`);
            btn.addEventListener('click', () => jumpToCard(id));
            li.appendChild(btn);
            ul.appendChild(li);
        });

        dueRollup.replaceChildren(h3, ul);
        dueRollup.classList.remove('hidden');
    }

    function jumpToCard(cardId) {
        for (const [key] of Object.entries(GRID_MAP)) {
            const entries = STUDY_DATA[key] || [];
            if (entries.some(e => e.id === cardId)) {
                switchToTab(key);
                const card = document.getElementById(cardId);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => { focusNoScroll(card); setActiveCard(cardId); }, 300);
                }
                return;
            }
        }
    }

    function updateTabTitle() {
        const dueCount = getAllScheduledIds()
            .filter(x => x.state.nextAt <= Date.now()).length;
        document.title = dueCount > 0 ? `(${dueCount}) READY — ${TITLE_BASE}` : TITLE_BASE;
    }

    // ============================================================
    // AUDIO
    // ============================================================
    let audioCtx = null;
    let lastAlarmTime = 0;
    let isMuted = localStorage.getItem('spa_audio_muted') === 'true';

    function ensureAudioCtx() {
        if (!audioCtx) {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            audioCtx = new Ctor();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function initMuteToggle() {
        if (!focusMuteBtn) return;
        focusMuteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isMuted = !isMuted;
            localStorage.setItem('spa_audio_muted', String(isMuted));
            if (settingsAlarms) settingsAlarms.checked = !isMuted;
            renderMute();
            ensureAudioCtx();
        });
    }

    function playRecallAlarm() {
        if (isMuted) return;
        const now = Date.now();
        if (now - lastAlarmTime < ALARM_THROTTLE_MS) return;
        lastAlarmTime = now;

        try {
            const ctx = ensureAudioCtx();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const t0 = ctx.currentTime;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(250, t0);
            osc.frequency.exponentialRampToValueAtTime(450, t0 + 0.5);
            osc.frequency.exponentialRampToValueAtTime(250, t0 + 1.0);
            osc.frequency.exponentialRampToValueAtTime(450, t0 + 1.5);
            osc.frequency.exponentialRampToValueAtTime(250, t0 + 2.0);
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(0.3, t0 + 0.1);
            gain.gain.linearRampToValueAtTime(0.3, t0 + 1.9);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 2.0);
        } catch (e) {
            console.warn('[SPAb510] Klaxon synthesis failed:', e);
        }
    }

    // ============================================================
    // ACTIVE CARD + DOCK STATE
    // ============================================================
    let activeCardId = null;
    let reverseMode  = sessionStorage.getItem('spa_reverse_mode') === 'true';

    function setActiveCard(id) {
        if (!id || activeCardId === id) {
            if (id) updateDockForActive();
            return;
        }
        activeCardId = id;
        sessionStorage.setItem('spa_active_card', id);
        updateDockForActive();
    }

    function restoreActiveCard() {
        const id = sessionStorage.getItem('spa_active_card');
        if (id && document.getElementById(id)) {
            activeCardId = id;
        }
        updateDockForActive();
    }

    function updateDockForActive() {
        const hasActive = !!(activeCardId && document.getElementById(activeCardId));
        document.body.dataset.dockActive = hasActive ? 'true' : 'false';

        if (!hasActive) {
            dockLabel.textContent = 'Tap a card to begin';
            dockActionsEl.querySelectorAll('.dock-action').forEach(b => b.disabled = true);
            dockReveal.disabled = true;
            return;
        }

        const card  = document.getElementById(activeCardId);
        const state = cardStates.get(card);
        if (!state) return;

        dockLabel.textContent = `Acting on: ${state.title}`;
        dockLabel.title = state.title;

        const showBtn      = dockActionsEl.querySelector('[data-action="show"]');
        const drillBtn     = dockActionsEl.querySelector('[data-action="drill"]');
        const strugglesBtn = dockActionsEl.querySelector('[data-action="struggles"]');
        const verifyBtn    = dockActionsEl.querySelector('[data-action="verify"]');

        if (showBtn)      { showBtn.disabled = false; showBtn.textContent = state.isAllRevealed() ? 'Hide' : 'Show'; }
        if (drillBtn)     { drillBtn.disabled = false; drillBtn.textContent = 'Drill'; }
        if (strugglesBtn) { strugglesBtn.disabled = state.struggleCount() === 0; }
        if (verifyBtn)    { verifyBtn.disabled = false; }
        dockReveal.disabled = false;
    }

    function initDock() {
        dockReverseBtn.setAttribute('aria-pressed', String(reverseMode));
        dockReverseBtn.addEventListener('click', () => {
            reverseMode = !reverseMode;
            sessionStorage.setItem('spa_reverse_mode', String(reverseMode));
            dockReverseBtn.setAttribute('aria-pressed', String(reverseMode));
            updateDockForActive();
        });

        // Action pills → route to active card's controller.
        dockActionsEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.dock-action');
            if (!btn || btn.disabled) return;
            const card = activeCardId && document.getElementById(activeCardId);
            const state = card && cardStates.get(card);
            if (!state) return;
            const action = btn.dataset.action;
            // If the target card is in a different tab, switch there first.
            const tabPanel = card.closest('.tab-content');
            if (tabPanel && !tabPanel.classList.contains('active')) {
                const key = tabPanel.id.replace(/^content-/, '');
                switchToTab(key);
            }
            if (action === 'show')           state.revealAll();
            else if (action === 'drill')     state.startDrill(reverseMode);
            else if (action === 'struggles') state.startStruggles();
            else if (action === 'verify')    state.startVerify();
            updateDockForActive();
        });

        // REVEAL button — keep focus off the button, advance active card.
        dockReveal.addEventListener('mousedown', (e) => e.preventDefault());
        dockReveal.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerGlobalAdvance();
        });

        // Mute chip.
        dockMuteBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            localStorage.setItem('spa_audio_muted', String(isMuted));
            renderMute();
            if (settingsAlarms) settingsAlarms.checked = !isMuted;
            ensureAudioCtx();
        });
        renderMute();

        // Due pill → scroll to rollup (and build it if empty).
        dockDueBtn.addEventListener('click', () => {
            renderDueRollup();
            if (dueRollup && !dueRollup.classList.contains('hidden')) {
                dueRollup.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // Swap a lucide icon inside a button by replacing the child <i data-lucide>
    // element and re-running createIcons on the next tick.
    function setLucideIcon(host, name) {
        if (!host) return;
        const i = document.createElement('i');
        i.setAttribute('data-lucide', name);
        host.replaceChildren(i);
        if (window.lucide) window.lucide.createIcons();
    }

    function renderMute() {
        const label = isMuted ? 'Unmute audio alarms' : 'Mute audio alarms';
        const icon  = isMuted ? 'volume-x' : 'volume-2';
        [dockMuteBtn, focusMuteBtn].forEach(btn => {
            if (!btn) return;
            btn.setAttribute('aria-pressed', String(isMuted));
            btn.setAttribute('aria-label', label);
            setLucideIcon(btn, icon);
        });
    }

    function updateDockReadyPulse() {
        // Pulse REVEAL when the active card is READY.
        const card = activeCardId && document.getElementById(activeCardId);
        let ready = false;
        if (card) {
            const st = getRecallState(activeCardId);
            ready = st.level >= 0 && st.nextAt <= Date.now();
        }
        document.body.dataset.dockReady = ready ? 'true' : 'false';
    }

    // ============================================================
    // CARD STATE
    // ============================================================
    const cardStates = new Map();

    // ============================================================
    // BUILD GRIDS
    // ============================================================
    function buildAllGrids() {
        Object.entries(GRID_MAP).forEach(([key, gridId]) => {
            const grid    = document.getElementById(gridId);
            const entries = STUDY_DATA[key];
            if (!grid) return;

            if (!entries || entries.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'grid-empty';
                empty.textContent = 'No cards in this section yet.';
                grid.appendChild(empty);
                return;
            }

            const frag = document.createDocumentFragment();
            entries.forEach((entry, idx) => {
                const { card } = buildCard(entry, idx);
                frag.appendChild(card);
            });
            grid.appendChild(frag);

            entries.forEach(entry => {
                const st = getRecallState(entry.id);
                if (st.level >= 0) {
                    activeRecallIds.add(entry.id);
                    updateCardRecallUI(entry.id);
                }
            });

            wireGridDelegation(grid);
        });

        ensureTickRunning();
        updateTabTitle();
    }

    function buildCard(entry, idx) {
        const card = document.createElement('div');
        card.className = 'card interactive-card';
        card.id = entry.id;
        card.setAttribute('tabindex', '0');

        const titleRow = document.createElement('div');
        titleRow.className = 'card-title-row';

        const num = document.createElement('span');
        num.className = 'card-number';
        num.textContent = String(idx + 1);

        const h2 = document.createElement('h2');
        h2.textContent = entry.title;

        const masteryBadge = document.createElement('span');
        masteryBadge.className = 'mastery-badge';
        masteryBadge.id = `mastery-badge-${entry.id}`;
        const count = getMasteryCount(entry.id);
        if (count > 0) {
            masteryBadge.textContent = `${count}× clean`;
            masteryBadge.classList.add('visible');
        }

        const recallStatus = document.createElement('span');
        recallStatus.className = 'recall-status hidden';
        recallStatus.id = `recall-status-${entry.id}`;
        recallStatus.setAttribute('role', 'status');
        recallStatus.setAttribute('aria-live', 'polite');

        titleRow.append(num, h2, masteryBadge, recallStatus);
        card.appendChild(titleRow);

        const tokens = tokenize(entry.text);
        const wordTokens = tokens.filter(t => t.kind === 'word');

        const revealContainer = document.createElement('p');
        revealContainer.className = 'reveal-text';
        const meaningfulSpans = [];
        tokens.forEach(tok => {
            if (tok.kind === 'br') {
                revealContainer.appendChild(document.createElement('br'));
            } else {
                const span = wordNode(tok);
                revealContainer.appendChild(span);
                revealContainer.appendChild(document.createTextNode(' '));
                meaningfulSpans.push(span);
            }
        });
        card.appendChild(revealContainer);

        const progressWrapper = document.createElement('div');
        progressWrapper.className = 'progress-wrapper';
        const progressContainer = document.createElement('div');
        progressContainer.className = 'card-progress-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'card-progress-bar';
        progressContainer.appendChild(progressBar);
        const progressText = document.createElement('span');
        progressText.className = 'progress-text';
        progressText.textContent = '0%';
        progressWrapper.append(progressContainer, progressText);
        titleRow.insertAdjacentElement('afterend', progressWrapper);

        // Per-card action row / help / footer removed — dock owns these.

        const refreshStruggleView = () => {
            const struggles = loadStruggles(entry.id);
            meaningfulSpans.forEach((span, i) => {
                span.classList.toggle('struggle-word', struggles.has(i));
            });
            // Dock button disabled-state is refreshed via updateDockForActive().
            if (activeCardId === entry.id) updateDockForActive();
        };
        refreshStruggleView();

        const updateProgress = () => {
            const revealed = meaningfulSpans.filter(s => s.classList.contains('visible')).length;
            const pct = (revealed / meaningfulSpans.length) * 100;
            progressBar.style.width = `${pct}%`;
            progressText.textContent = `${Math.round(pct)}%`;
            return revealed === meaningfulSpans.length;
        };

        const setReveal = (shouldReveal) => {
            meaningfulSpans.forEach(s => s.classList.toggle('visible', shouldReveal));
            updateProgress();
            if (activeCardId === entry.id) updateDockForActive();
        };
        const isAllRevealed = () => meaningfulSpans.every(s => s.classList.contains('visible'));

        const goToNextCard = () => {
            let next = card.nextElementSibling;
            while (next && !next.classList.contains('interactive-card')) {
                next = next.nextElementSibling;
            }
            if (next) {
                focusNoScroll(next);
                next.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setActiveCard(next.id);
            }
        };

        const revealNext = () => {
            const hidden = meaningfulSpans.find(s => !s.classList.contains('visible'));
            if (hidden) {
                hidden.classList.add('visible');
                updateProgress();
                hidden.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                goToNextCard();
            }
        };

        const refocusCard = () => setTimeout(() => focusNoScroll(card), 0);

        const startDrill = (opts = {}) => {
            const onExit = () => {
                refreshStruggleView();
                updateProgress();
                refocusCard();
            };
            startFocusMode({
                cardId: entry.id,
                title: entry.title,
                allWordTokens: wordTokens,
                mode: opts.mode || 'full',
                reverse: !!opts.reverse,
                onExit,
            });
        };

        cardStates.set(card, {
            title: entry.title,
            revealNext,
            revealAll: () => {
                const anyHidden = meaningfulSpans.some(s => !s.classList.contains('visible'));
                setReveal(anyHidden);
            },
            isAllRevealed,
            startDrill: (shift) => startDrill({ reverse: !!shift }),
            startStruggles: () => startDrill({ mode: 'struggles' }),
            startVerify: () => startDrill({ mode: 'verify' }),
            struggleCount: () => loadStruggles(entry.id).size,
            clickProgress: () => { revealNext(); refocusCard(); },
            refreshStruggleView,
            handleCardClick: (target) => {
                let span = target;
                if (span && span.tagName === 'B') span = span.parentElement;
                if (span && span.tagName === 'SPAN' && meaningfulSpans.includes(span)) {
                    span.classList.toggle('visible');
                    updateProgress();
                    return;
                }
                const finished = updateProgress();
                if (finished) {
                    goToNextCard();
                } else {
                    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    revealNext();
                }
            },
        });

        return { card };
    }

    // ============================================================
    // GRID DELEGATION
    // ============================================================
    const wiredGrids = new WeakSet();
    function wireGridDelegation(grid) {
        if (wiredGrids.has(grid)) return;
        wiredGrids.add(grid);

        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.interactive-card');
            if (!card) return;
            const state = cardStates.get(card);
            if (!state) return;

            if (e.target.closest('.progress-wrapper')) {
                e.stopPropagation();
                setActiveCard(card.id);
                state.clickProgress();
                return;
            }

            focusNoScroll(card);
            setActiveCard(card.id);
            state.handleCardClick(e.target);
        });

        grid.addEventListener('keydown', (e) => {
            if (e.code !== 'Space') return;
            const card = e.target.closest('.interactive-card');
            if (!card || card !== e.target) return;
            const state = cardStates.get(card);
            if (!state) return;
            e.preventDefault();
            setActiveCard(card.id);
            state.revealNext();
        });

        grid.addEventListener('focusin', (e) => {
            const card = e.target.closest('.interactive-card');
            if (card && cardStates.has(card)) setActiveCard(card.id);
        });
    }

    // ============================================================
    // DRILL MODE
    // ============================================================
    const drill = {
        mode: 'full',              // 'full' | 'struggles' | 'verify'
        tokens: [],                // tokens being drilled (full word tokens in display order)
        indexMap: null,            // for 'struggles': tokens[i] corresponds to full index indexMap[i]
        index: 0,
        cardId: null,
        cardTitle: '',
        struggles: new Set(),      // original-index struggle set (persisted)
        sessionStruggles: new Set(),// original indices flagged during this session
        onExit: null,
        // interference
        enabled: false,
        level: 0,
        wordsSince: 0,
        nextThreshold: 10,
        active: false,
        taskType: null,
        taskOptions: [],
        correctAnswer: null,
    };

    freqToggles.forEach((toggle, idx) => {
        toggle.addEventListener('change', (e) => {
            setInterferenceLevel(e.target.checked ? idx + 1 : 0);
            localStorage.setItem('spa_interference_level', String(drill.level));
            if (settingsInterference) settingsInterference.value = String(drill.level);
        });
    });

    function setInterferenceLevel(level) {
        drill.level = level;
        drill.enabled = level > 0;
        freqToggles.forEach((t, i) => { t.checked = (i + 1 === level); });
        if (drill.enabled) {
            drill.wordsSince = 0;
            drill.nextThreshold = getNextInterferenceThreshold();
        }
    }

    function getNextInterferenceThreshold() {
        if (drill.level === 1) return Math.floor(Math.random() * 11) + 10;
        if (drill.level === 2) return Math.floor(Math.random() * 5)  + 3;
        if (drill.level === 3) return Math.floor(Math.random() * 15) + 1;
        return 999;
    }

    function generateInterferenceTask() {
        const type = INTERFERENCE_TYPES[Math.floor(Math.random() * INTERFERENCE_TYPES.length)];
        drill.taskType = type;
        drill.taskOptions = [];
        interferenceModal.classList.remove('penalty-mode');
        interferenceOptions.classList.remove('hidden');
        if      (type === 'math')  generateMathTask();
        else if (type === 'arrow') generateArrowTask();
        else if (type === 'case')  generateCaseTask();
        else if (type === 'wait')  generateWaitTask();
        interferenceModal.classList.remove('hidden');
        drill.active = true;
    }

    function generateMathTask() {
        const op = Math.random() < 0.5 ? '+' : '-';
        let a = Math.floor(Math.random() * 12) + 1;
        let b = Math.floor(Math.random() * 12) + 1;
        let answer;
        if (op === '+') { answer = a + b; }
        else { if (a < b) [a, b] = [b, a]; answer = a - b; }
        renderTask(`${a} ${op} ${b} = ?`, answer, generateNumberOptions(answer));
    }
    function generateArrowTask() {
        const arrows = [
            { symbol: '↑', word: 'UP' }, { symbol: '↓', word: 'DOWN' },
            { symbol: '←', word: 'LEFT' }, { symbol: '→', word: 'RIGHT' },
        ];
        const target = arrows[Math.floor(Math.random() * arrows.length)];
        renderTask(target.symbol, target.word, ['UP', 'DOWN', 'LEFT', 'RIGHT']);
    }
    function generateCaseTask() {
        const char = CASE_LETTERS[Math.floor(Math.random() * CASE_LETTERS.length)];
        const correct = char.toLowerCase();
        const options = new Set([correct]);
        let guard = 0;
        while (options.size < 4 && guard++ < 100) {
            options.add(ALPHA_LOWER[Math.floor(Math.random() * ALPHA_LOWER.length)]);
        }
        renderTask(char, correct, Array.from(options));
    }
    function generateWaitTask() {
        let timeLeft = Math.floor(Math.random() * 3) + 3;
        interferencePrompt.textContent = `WAIT… ${timeLeft}`;
        interferenceOptions.classList.add('hidden');
        interferenceModal.classList.add('penalty-mode');
        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) { clearInterval(timer); processCorrectAnswer(); }
            else { interferencePrompt.textContent = `WAIT… ${timeLeft}`; }
        }, 1000);
    }
    function generateNumberOptions(answer) {
        const options = new Set([answer]);
        let guard = 0;
        while (options.size < 4 && guard++ < 100) {
            let offset = Math.floor(Math.random() * 5) - 2;
            if (offset === 0) offset = 1;
            options.add(Math.max(0, answer + offset));
        }
        let pad = 1;
        while (options.size < 4) { options.add(answer + pad); pad++; }
        return Array.from(options);
    }
    function renderTask(promptText, correctAnswer, optionsArray) {
        interferencePrompt.textContent = promptText;
        interferenceOptions.replaceChildren();
        drill.correctAnswer = correctAnswer;
        let displayOptions = optionsArray;
        if (drill.taskType !== 'arrow') {
            displayOptions = [...optionsArray].sort(() => Math.random() - 0.5);
        }
        const keys = ['A', 'B', 'C', 'D'];
        displayOptions.forEach((opt, i) => {
            const keyChar = keys[i];
            drill.taskOptions.push({ key: keyChar.toLowerCase(), value: opt });
            const btn = document.createElement('button');
            btn.className = 'interference-btn';
            btn.textContent = `(${keyChar})  ${opt}`;
            btn.addEventListener('click', (e) => { e.stopPropagation(); validateAnswer(opt); });
            interferenceOptions.appendChild(btn);
        });
    }
    function validateAnswer(selected) {
        if (selected === drill.correctAnswer) {
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
        drill.active = false;
        drill.wordsSince = 0;
        drill.nextThreshold = getNextInterferenceThreshold();
        updateFocusWord();
    }

    function updateFocusCounter() {
        if (!focusCounter) return;
        const total = drill.tokens.length;
        const index = Math.min(drill.index, total);
        focusCounter.textContent = `${index} / ${total}`;
    }

    function renderFocusWord(tok) {
        if (tok.bold) {
            const b = document.createElement('b');
            b.textContent = tok.text;
            focusText.replaceChildren(b);
        } else {
            focusText.replaceChildren(document.createTextNode(tok.text));
        }
    }

    // Translate current drill index → original token index (for struggle ops).
    function originalIndex(i) {
        return drill.indexMap ? drill.indexMap[i] : i;
    }

    function updateFocusWord() {
        if (drill.mode === 'verify') return updateVerifyWord();

        if (drill.index < 0) drill.index = 0;
        updateFocusCounter();

        if (drill.index === drill.tokens.length) {
            completeSession();
            return;
        }
        if (drill.index > drill.tokens.length) { closeFocusMode(); return; }

        if (drill.enabled && !drill.active && drill.index > 0
            && drill.wordsSince >= drill.nextThreshold) {
            generateInterferenceTask();
            return;
        }

        focusOverlay.classList.remove('focus-eos');
        const origIdx = originalIndex(drill.index);
        focusText.classList.toggle('struggle', drill.struggles.has(origIdx));
        renderFocusWord(drill.tokens[drill.index]);
    }

    function updateVerifyWord() {
        updateFocusCounter();
        if (drill.index === drill.tokens.length) {
            completeSession();
            return;
        }
        focusText.classList.add('hidden');
        focusVerify.classList.remove('hidden');

        // Show last up-to-3 previous words as context; then a blank for current.
        const ctx = [];
        for (let i = Math.max(0, drill.index - 3); i < drill.index; i++) {
            ctx.push(drill.tokens[i].text);
        }
        focusVerifyPrev.textContent = ctx.length ? `… ${ctx.join(' ')}` : '(type the first word)';
        focusVerifyInput.value = '';
        focusVerifyInput.classList.remove('correct', 'wrong');
        focusVerifyHint.classList.remove('wrong');
        focusVerifyHint.textContent = '';
        focusVerifyInput.focus();
    }

    function completeSession() {
        focusOverlay.classList.add('focus-eos');
        focusText.classList.remove('struggle', 'hidden');
        focusVerify.classList.add('hidden');

        // Schedule updates only for full-sequence (non-struggle, non-verify-subset) runs,
        // or for verify runs that cover the full sequence. Struggle-only runs do NOT
        // advance the schedule — they're targeted practice, not a recall audit.
        const isFullRun = (drill.mode === 'full' || drill.mode === 'verify');
        if (isFullRun) {
            if (drill.sessionStruggles.size === 0) {
                const n = incrementMastery(drill.cardId);
                const badge = document.getElementById(`mastery-badge-${drill.cardId}`);
                if (badge) {
                    badge.textContent = `${n}× clean`;
                    badge.classList.add('visible');
                }
                advanceRecallSchedule(drill.cardId);
            } else {
                resetRecallSchedule(drill.cardId);
            }
            appendHistory(drill.cardId, {
                t: Date.now(),
                mode: drill.mode,
                struggles: Array.from(drill.sessionStruggles),
            });
        }

        renderSummary();
    }

    function renderSummary() {
        focusText.replaceChildren();
        focusText.classList.add('hidden');
        focusSummary.classList.remove('hidden');

        const mastery = getMasteryCount(drill.cardId);
        const state = getRecallState(drill.cardId);
        const nextText = state.level === -1
            ? 'Not scheduled'
            : (state.nextAt <= Date.now()
                ? 'READY'
                : `in ${formatTimeRemaining(state.nextAt - Date.now())}`);

        const history = loadHistory(drill.cardId);
        const window_ = history.slice(-CHRONIC_WINDOW);
        const counts = new Map();
        window_.forEach(h => (h.struggles || []).forEach(i => counts.set(i, (counts.get(i) || 0) + 1)));
        const chronicIndices = Array.from(counts.entries())
            .filter(([, n]) => n >= CHRONIC_MIN_HITS)
            .map(([i]) => i);

        // Resolve chronic indices to words using the current card's token list.
        let chronicWords = [];
        for (const [key] of Object.entries(GRID_MAP)) {
            const entry = (STUDY_DATA[key] || []).find(e => e.id === drill.cardId);
            if (entry) {
                const allWords = tokenize(entry.text).filter(t => t.kind === 'word');
                chronicWords = chronicIndices.map(i => allWords[i] && allWords[i].text).filter(Boolean);
                break;
            }
        }

        focusSummary.replaceChildren();
        const h = document.createElement('h2');
        h.textContent = drill.cardTitle ? `${drill.cardTitle} — Session Summary` : 'Session Summary';
        focusSummary.appendChild(h);

        const rows = [
            ['Mode',              drill.mode === 'full' ? 'Drill' : drill.mode === 'struggles' ? 'Struggles' : 'Verify'],
            ['Flagged this run',  String(drill.sessionStruggles.size)],
            ['Clean drills',      String(mastery)],
            ['Next recall',       nextText],
        ];
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'summary-row';
            const l = document.createElement('span'); l.className = 'summary-label'; l.textContent = label;
            const v = document.createElement('span'); v.textContent = value;
            row.append(l, v);
            focusSummary.appendChild(row);
        });

        if (chronicWords.length > 0) {
            const row = document.createElement('div');
            row.className = 'summary-row';
            const l = document.createElement('span');
            l.className = 'summary-label';
            l.textContent = `Chronic (≥${CHRONIC_MIN_HITS}/${CHRONIC_WINDOW})`;
            const list = document.createElement('div');
            list.className = 'chronic-list';
            chronicWords.forEach(w => {
                const chip = document.createElement('span');
                chip.className = 'chronic-word';
                chip.textContent = w;
                list.appendChild(chip);
            });
            row.append(l, list);
            focusSummary.appendChild(row);
        }

        const hint = document.createElement('p');
        hint.style.cssText = 'margin-top:12px;color:var(--text-muted);font-size:13px;';
        hint.textContent = 'Press Esc or tap Close to return.';
        focusSummary.appendChild(hint);
    }

    function handleVerifyKey(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const attempt = normalizeWord(focusVerifyInput.value);
        const expected = normalizeWord(drill.tokens[drill.index].text);
        if (attempt === expected) {
            focusVerifyInput.classList.add('correct');
            setTimeout(() => {
                drill.index++;
                updateFocusWord();
            }, 120);
        } else {
            focusVerifyInput.classList.add('wrong');
            focusVerifyHint.classList.add('wrong');
            focusVerifyHint.textContent = `Expected: ${drill.tokens[drill.index].text}`;
            // Auto-flag this word.
            const origIdx = originalIndex(drill.index);
            drill.struggles.add(origIdx);
            drill.sessionStruggles.add(origIdx);
            saveStruggles(drill.cardId, drill.struggles);
        }
    }

    function handleFocusKeydown(e) {
        if (focusOverlay.classList.contains('hidden')) return;

        // Summary screen — any keypress on Esc closes, others ignored.
        if (!focusSummary.classList.contains('hidden')) {
            if (e.key === 'Escape') { e.preventDefault(); closeFocusMode(); }
            return;
        }

        if (drill.active) {
            if (drill.taskType === 'wait') { e.preventDefault(); e.stopPropagation(); return; }
            const key = e.key.toLowerCase();
            const option = drill.taskOptions.find(o => o.key === key);
            e.preventDefault();
            e.stopPropagation();
            if (option) validateAnswer(option.value);
            return;
        }

        if (drill.mode === 'verify') {
            if (e.key === 'Escape') { closeFocusMode(); return; }
            handleVerifyKey(e);
            return;
        }

        if (e.key === 'Escape') { closeFocusMode(); return; }

        if (e.code === 'Space' || e.key === 'ArrowRight') {
            e.preventDefault();
            nextFocusWord();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (drill.index > 0) { drill.index--; updateFocusWord(); }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (drill.index >= drill.tokens.length) return;
            const origIdx = originalIndex(drill.index);
            if (drill.struggles.has(origIdx)) {
                drill.struggles.delete(origIdx);
                drill.sessionStruggles.delete(origIdx);
            } else {
                drill.struggles.add(origIdx);
                drill.sessionStruggles.add(origIdx);
            }
            saveStruggles(drill.cardId, drill.struggles);
            updateFocusWord();
        }
    }

    function nextFocusWord() {
        if (drill.active) return;
        drill.index++;
        if (drill.enabled) drill.wordsSince++;
        updateFocusWord();
    }

    function handleFocusClick(e) {
        if (e.target === focusCloseBtn || e.target === focusMuteBtn) return;
        if (e.target.closest('#interference-toggle-container')) return;
        if (e.target.closest('#interference-modal')) return;
        if (e.target.closest('#focus-verify')) return;
        if (e.target.closest('#focus-summary')) return;
        if (drill.mode === 'verify') return;
        if (!focusSummary.classList.contains('hidden')) return;
        nextFocusWord();
    }

    function startFocusMode({ cardId, title, allWordTokens, mode, reverse, onExit }) {
        drill.cardId = cardId;
        drill.cardTitle = title || '';
        drill.mode = mode;
        drill.onExit = onExit;
        drill.struggles = loadStruggles(cardId);
        drill.sessionStruggles = new Set();
        drill.index = 0;
        drill.wordsSince = 0;
        drill.indexMap = null;

        let tokens = allWordTokens;

        if (mode === 'struggles') {
            const sArr = Array.from(drill.struggles).sort((a, b) => a - b);
            if (sArr.length === 0) {
                // Shouldn't happen — button disables — but guard anyway.
                if (onExit) onExit();
                return;
            }
            drill.indexMap = sArr;
            tokens = sArr.map(i => allWordTokens[i]).filter(Boolean);
        }

        if (reverse) {
            tokens = [...tokens].reverse();
            if (drill.indexMap) drill.indexMap = [...drill.indexMap].reverse();
        }

        drill.tokens = tokens;

        focusOverlay.classList.remove('hidden', 'focus-eos');
        focusSummary.classList.add('hidden');
        focusVerify.classList.add('hidden');
        focusText.classList.remove('hidden');
        document.body.classList.add('focus-mode-open');
        focusNoScroll(focusOverlay);

        updateFocusWord();

        document.addEventListener('keydown', handleFocusKeydown);
        focusOverlay.addEventListener('click', handleFocusClick);
    }

    function closeFocusMode() {
        focusOverlay.classList.add('hidden');
        focusOverlay.classList.remove('focus-eos');
        focusSummary.classList.add('hidden');
        focusVerify.classList.add('hidden');
        focusText.classList.remove('hidden');
        document.body.classList.remove('focus-mode-open');
        document.removeEventListener('keydown', handleFocusKeydown);
        focusOverlay.removeEventListener('click', handleFocusClick);
        updateDockReadyPulse();
        if (drill.onExit) drill.onExit();
        // Refresh the source card's struggle view in case it changed.
        const src = document.getElementById(drill.cardId);
        if (src) {
            const st = cardStates.get(src);
            if (st && st.refreshStruggleView) st.refreshStruggleView();
        }
    }

    focusCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFocusMode();
    });

    // ============================================================
    // SETTINGS MODAL
    // ============================================================
    function initSettings() {
        // Restore persisted interference default into drill + UI.
        const storedLvl = parseInt(localStorage.getItem('spa_interference_level') || '0', 10);
        if (storedLvl >= 0 && storedLvl <= 3) setInterferenceLevel(storedLvl);
        if (settingsInterference) settingsInterference.value = String(drill.level);
        if (settingsAlarms) settingsAlarms.checked = !isMuted;

        settingsBtn.addEventListener('click', () => openSettings());
        settingsClose.addEventListener('click', closeSettings);
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeSettings();
        });

        settingsAlarms.addEventListener('change', (e) => {
            isMuted = !e.target.checked;
            localStorage.setItem('spa_audio_muted', String(isMuted));
            renderMute();
        });

        settingsInterference.addEventListener('change', (e) => {
            const lvl = parseInt(e.target.value, 10);
            setInterferenceLevel(lvl);
            localStorage.setItem('spa_interference_level', String(lvl));
        });

        settingsExport.addEventListener('click', exportProgress);
        settingsImport.addEventListener('click', () => settingsImportFile.click());
        settingsImportFile.addEventListener('change', importProgress);
        settingsReset.addEventListener('click', resetAllProgress);
        settingsLogout.addEventListener('click', logout);
    }

    function openSettings() {
        settingsModal.classList.remove('hidden');
        settingsClose.focus();
    }
    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    // Collect progress keys for export/reset (keep auth + mute out of reset).
    function progressKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith('mastery_') || k.startsWith('struggle_')
                || k.startsWith('session_history_') || k.startsWith('recall_')) {
                keys.push(k);
            }
        }
        return keys;
    }

    function exportProgress() {
        const out = {};
        progressKeys().forEach(k => { out[k] = localStorage.getItem(k); });
        const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spab510-progress-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    function importProgress(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data || typeof data !== 'object') throw new Error('Invalid file');
                if (!confirm('Import will overwrite matching progress keys. Continue?')) return;
                Object.entries(data).forEach(([k, v]) => {
                    if (typeof k === 'string' && typeof v === 'string'
                        && (k.startsWith('mastery_') || k.startsWith('struggle_')
                            || k.startsWith('session_history_') || k.startsWith('recall_'))) {
                        localStorage.setItem(k, v);
                    }
                });
                closeSettings();
                location.reload();
            } catch (err) {
                alert('Import failed: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function resetAllProgress() {
        if (!confirm('Reset ALL progress (mastery, struggles, schedules, history)? This cannot be undone.')) return;
        progressKeys().forEach(k => localStorage.removeItem(k));
        closeSettings();
        location.reload();
    }

    function logout() {
        localStorage.removeItem('spa_auth');
        localStorage.removeItem('isAuthenticated');
        location.reload();
    }

    // ============================================================
    // GLOBAL ADVANCE (FAB)
    // ============================================================
    let lastAdvancedCard = null;

    function triggerGlobalAdvance() {
        if (!focusOverlay.classList.contains('hidden')) {
            if (drill.mode === 'verify') return;
            if (!focusSummary.classList.contains('hidden')) return;
            nextFocusWord();
            return;
        }

        // Prefer the dock's tracked active card; fall back as before.
        let activeCard = activeCardId && document.getElementById(activeCardId);

        if (!activeCard) {
            activeCard = document.activeElement
                && document.activeElement.closest
                && document.activeElement.closest('.interactive-card');
        }
        if (!activeCard && lastAdvancedCard && lastAdvancedCard.isConnected
            && lastAdvancedCard.closest('.tab-content.active')) {
            activeCard = lastAdvancedCard;
        }
        if (!activeCard) {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) activeCard = activeTab.querySelector('.interactive-card');
        }
        if (!activeCard) return;

        // If active card is in a non-active tab, switch there so the user sees it.
        const panel = activeCard.closest('.tab-content');
        if (panel && !panel.classList.contains('active')) {
            const key = panel.id.replace(/^content-/, '');
            switchToTab(key);
        }

        focusNoScroll(activeCard);
        setActiveCard(activeCard.id);
        const state = cardStates.get(activeCard);
        if (!state) return;
        state.revealNext();

        const focusedCard = document.activeElement
            && document.activeElement.closest
            && document.activeElement.closest('.interactive-card');
        lastAdvancedCard = focusedCard || activeCard;
    }

    // FAB listeners are now attached inside initDock() to dockReveal.

    // ============================================================
    // BOOT
    // ============================================================
    initTabs();
    if (history.scrollRestoration) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    checkAuth();
});
})();
