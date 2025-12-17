document.addEventListener('DOMContentLoaded', () => {
    // Force scroll to top on reload to avoid disorientation
    if (history.scrollRestoration) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // --- Authentication Logic ---
    const authOverlay = document.getElementById('auth-overlay');
    const authPasswordInput = document.getElementById('auth-password');
    const authSubmitBtn = document.getElementById('auth-submit');
    const authError = document.getElementById('auth-error');

    // Simple hardcoded password - CHANGE THIS
    const AUTH_PASSWORD = "independence";

    function checkAuth() {
        if (localStorage.getItem('isAuthenticated') === 'true') {
            authOverlay.classList.add('hidden');
        } else {
            authOverlay.classList.remove('hidden');
            authPasswordInput.focus();
        }
    }

    function doLogin() {
        const input = authPasswordInput.value;
        if (input === AUTH_PASSWORD) {
            localStorage.setItem('isAuthenticated', 'true');
            authOverlay.classList.add('hidden');
            authError.classList.add('hidden');
        } else {
            authError.classList.remove('hidden');
            authPasswordInput.value = '';
            authPasswordInput.focus();
        }
    }

    authSubmitBtn.addEventListener('click', doLogin);
    authPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // Initial Check
    checkAuth();

    // --- Tabs Logic ---
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const indicator = document.querySelector('.tab-indicator');

    function updateIndicator(activeTab) {
        if (!activeTab) return;
        // Use offsetLeft and offsetWidth for variable width tabs
        indicator.style.width = `${activeTab.offsetWidth}px`;
        indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            updateIndicator(tab);

            contents.forEach(content => content.classList.remove('active'));
            const targetId = `content-${tab.dataset.tab}`;
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Update on resize to fix positions
    window.addEventListener('resize', () => {
        const active = document.querySelector('.tab-button.active');
        if (active) updateIndicator(active);
    });

    const initialActive = document.querySelector('.tab-button.active');
    if (initialActive) {
        // verify clean layout before setting
        setTimeout(() => updateIndicator(initialActive), 0);
    }

    // --- Reveal Logic ---
    // --- Focus Mode Logic ---
    const focusOverlay = document.getElementById('focus-overlay');
    const focusText = document.getElementById('focus-text');
    const focusCloseBtn = document.getElementById('focus-close-btn');

    // --- Interference Mode Logic ---
    let isInterferenceEnabled = false;
    let interferenceFrequencyLevel = 0; // 0=Off, 1=Low, 2=Med, 3=High
    let wordsSinceLastInterference = 0;
    let nextInterferenceThreshold = 10;
    let isInterferenceActive = false;

    // Interference Toggles (Radio Behavior)
    const toggles = [
        document.getElementById('freq-1'),
        document.getElementById('freq-2'),
        document.getElementById('freq-3')
    ];

    toggles.forEach((toggle, index) => {
        toggle.addEventListener('change', (e) => {
            const level = index + 1;
            if (e.target.checked) {
                // Enabled this level. Disable others.
                setInterferenceLevel(level);
            } else {
                // Unchecked active level -> Turn Off
                setInterferenceLevel(0);
            }
        });
    });

    function setInterferenceLevel(level) {
        interferenceFrequencyLevel = level;
        isInterferenceEnabled = level > 0;

        // Update UI Checkboxes
        toggles.forEach((t, i) => {
            t.checked = (i + 1 === level);
        });

        // Reset Counters
        if (isInterferenceEnabled) {
            wordsSinceLastInterference = 0;
            nextInterferenceThreshold = getNextInterferenceThreshold();
        }
    }

    const interferenceModal = document.getElementById('interference-modal');
    const interferencePrompt = document.getElementById('interference-prompt');
    const interferenceOptions = document.getElementById('interference-options');

    function getNextInterferenceThreshold() {
        // Frequency Logic
        if (interferenceFrequencyLevel === 1) return Math.floor(Math.random() * 11) + 10; // 10-20
        if (interferenceFrequencyLevel === 2) return Math.floor(Math.random() * 5) + 3;   // 3-7
        if (interferenceFrequencyLevel === 3) return Math.floor(Math.random() * 15) + 1;   // 1-15 (Chaos)
        return 999; // Should not happen if disabled
    }

    // Store active options for keyboard handling
    let currentInterferenceOptions = []; // Array of { key: 'a', value: ..., isCorrect: bool }
    let currentCorrectAnswer = null; // Stored answer for validation
    let activeTaskType = null; // 'math', 'arrow', 'case', 'wait'

    function generateInterferenceTask() {
        const tasks = ['math', 'arrow', 'case', 'wait'];
        const type = tasks[Math.floor(Math.random() * tasks.length)];
        // const type = 'wait'; // Debug Force

        activeTaskType = type;
        currentInterferenceOptions = [];
        interferenceModal.classList.remove('penalty-mode'); // Reset styles
        interferenceOptions.classList.remove('hidden'); // Show buttons by default

        if (type === 'math') generateMathTask();
        else if (type === 'arrow') generateArrowTask();
        else if (type === 'case') generateCaseTask();
        else if (type === 'wait') generateWaitTask();

        interferenceModal.classList.remove('hidden');
        isInterferenceActive = true;
    }

    // --- Task Generators ---

    function generateMathTask() {
        const operations = ['+', '-'];
        const op = operations[Math.floor(Math.random() * operations.length)];
        let a, b, answer;

        if (op === '+') {
            a = Math.floor(Math.random() * 12) + 1;
            b = Math.floor(Math.random() * 12) + 1;
            answer = a + b;
        } else {
            a = Math.floor(Math.random() * 12) + 1;
            b = Math.floor(Math.random() * 12) + 1;
            if (a < b) [a, b] = [b, a];
            answer = a - b;
        }

        renderTask(`${a} ${op} ${b} = ?`, answer, generateNumberOptions(answer));
    }

    function generateArrowTask() {
        const arrows = [
            { symbol: '↑', word: 'UP' },
            { symbol: '↓', word: 'DOWN' },
            { symbol: '←', word: 'LEFT' },
            { symbol: '→', word: 'RIGHT' }
        ];
        const target = arrows[Math.floor(Math.random() * arrows.length)];

        // Options are fixed set of words
        const options = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        renderTask(target.symbol, target.word, options);
    }

    function generateCaseTask() {
        const letters = 'ABDEGQRT'; // Distinctive uppercase
        const char = letters[Math.floor(Math.random() * letters.length)];
        const correctLower = char.toLowerCase();

        // Generate distractors (random lowercase letters)
        let options = new Set([correctLower]);
        const allLower = 'abcdefghijklmnopqrstuvwxyz';
        while (options.size < 4) {
            const rand = allLower[Math.floor(Math.random() * allLower.length)];
            options.add(rand);
        }

        renderTask(char, correctLower, Array.from(options));
    }

    function generateWaitTask() {
        let timeLeft = Math.floor(Math.random() * 3) + 3; // 3-5 seconds
        interferencePrompt.textContent = `WAIT... ${timeLeft}`;
        interferenceOptions.classList.add('hidden'); // No buttons
        interferenceModal.classList.add('penalty-mode'); // Visual cue

        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                processCorrectAnswer(); // Auto-advance
            } else {
                interferencePrompt.textContent = `WAIT... ${timeLeft}`;
            }
        }, 1000);
    }

    // --- Helpers ---

    function generateNumberOptions(answer) {
        let options = new Set([answer]);
        while (options.size < 4) {
            let offset = Math.floor(Math.random() * 5) - 2;
            if (offset === 0) offset = 1;
            let distractor = answer + offset;
            if (distractor < 0) distractor = 0;
            options.add(distractor);
        }
        return Array.from(options);
    }

    function renderTask(promptText, correctAnswer, optionsArray) {
        interferencePrompt.textContent = promptText;
        interferenceOptions.innerHTML = '';
        currentCorrectAnswer = correctAnswer;

        // Shuffle options if not fixed order (Arrows are fixed, Numbers/Case are random)
        let displayOptions = optionsArray;
        if (activeTaskType !== 'arrow') {
            displayOptions = optionsArray.sort(() => Math.random() - 0.5);
        }

        const keys = ['A', 'B', 'C', 'D'];
        displayOptions.forEach((opt, index) => {
            const keyChar = keys[index];
            currentInterferenceOptions.push({ key: keyChar.toLowerCase(), value: opt });

            const btn = document.createElement('button');
            btn.className = 'interference-btn'; // Generic Class
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
        isInterferenceActive = false;
        wordsSinceLastInterference = 0;
        nextInterferenceThreshold = getNextInterferenceThreshold();
        updateFocusWord();
    }

    let currentFocusData = []; // Array of strings (innerHTMLs)
    let currentFocusIndex = 0;

    // Struggle Tracking State
    let currentCardId = null;
    let currentStruggleSet = new Set(); // Set of indices

    function getStruggleKey(cardId) {
        return `struggle_${cardId}`;
    }

    function loadStruggles(cardId) {
        const json = localStorage.getItem(getStruggleKey(cardId));
        if (json) {
            return new Set(JSON.parse(json));
        }
        return new Set();
    }

    function saveStruggles(cardId, set) {
        localStorage.setItem(getStruggleKey(cardId), JSON.stringify(Array.from(set)));
    }

    function updateFocusWord() {
        if (currentFocusIndex < 0) currentFocusIndex = 0;

        // EOS Logic
        if (currentFocusIndex === currentFocusData.length) {
            focusOverlay.classList.add('focus-eos');
            focusText.classList.remove('struggle'); // Ensure EOS is white
            focusText.innerHTML = "EOS";
            return;
        }

        if (currentFocusIndex > currentFocusData.length) {
            closeFocusMode();
            return;
        }

        // Interference Trigger Check
        // Show math problem BEFORE revealing the new word
        if (isInterferenceEnabled && !isInterferenceActive && currentFocusIndex > 0) {
            // Check if we hit the threshold
            // Note: We increment counter in the navigation handler
            if (wordsSinceLastInterference >= nextInterferenceThreshold) {
                generateInterferenceTask(); // Switch to generic factory
                return; // Stop. Do not render the new word yet.
            }
        }

        // Normal State
        focusOverlay.classList.remove('focus-eos');

        // Check struggle state
        if (currentStruggleSet.has(currentFocusIndex)) {
            focusText.classList.add('struggle');
        } else {
            focusText.classList.remove('struggle');
        }

        focusText.innerHTML = currentFocusData[currentFocusIndex];
    }

    function handleFocusKeydown(e) {
        if (focusOverlay.classList.contains('hidden')) return;

        // Block interaction if Interference is active
        if (isInterferenceActive) {
            // Wait Task blocks ALL input
            if (activeTaskType === 'wait') {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Check for A, B, C, D
            const key = e.key.toLowerCase();
            const option = currentInterferenceOptions.find(o => o.key === key);

            if (option) {
                e.preventDefault();
                e.stopPropagation();
                validateAnswer(option.value);
            } else {
                // Block EVERYTHING else (Space, Enter, Arrows)
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        if (e.key === 'Escape') {
            closeFocusMode();
            return;
        }

        // Navigation
        if (e.code === 'Space' || e.key === 'ArrowRight') {
            e.preventDefault();
            currentFocusIndex++;
            if (isInterferenceEnabled) wordsSinceLastInterference++;
            updateFocusWord();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (currentFocusIndex > 0) {
                currentFocusIndex--;
                // Don't reduce interference count on back navigation
                updateFocusWord();
            }
        }

        // Struggle Toggle (Down Arrow)
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            // Don't toggle on EOS
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

    function handleFocusClick(e) {
        if (e.target === focusCloseBtn) return;
        // Ignore clicks inside the toggle container
        if (e.target.closest('#interference-toggle-container')) return;

        currentFocusIndex++;
        updateFocusWord();
    }

    // Callback to refresh the main card view
    let onFocusExitCallback = null;

    function startFocusMode(cardId, data, onExit) {
        currentCardId = cardId;
        currentFocusData = data;
        onFocusExitCallback = onExit;

        // Load fresh data
        currentStruggleSet = loadStruggles(cardId);

        currentFocusIndex = 0;

        focusOverlay.classList.remove('hidden');
        focusOverlay.setAttribute('tabindex', '-1'); // Make focusable
        focusOverlay.focus(); // Capture focus to prevent button re-clicks
        updateFocusWord();

        document.addEventListener('keydown', handleFocusKeydown);
        focusOverlay.addEventListener('click', handleFocusClick);
    }

    function closeFocusMode() {
        focusOverlay.classList.add('hidden');
        document.removeEventListener('keydown', handleFocusKeydown);
        focusOverlay.removeEventListener('click', handleFocusClick);

        if (onFocusExitCallback) {
            onFocusExitCallback();
        }
    }

    focusCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFocusMode();
    });

    // --- Reveal Logic ---
    function setupReveal(elementId, text) {
        const card = document.getElementById(elementId);
        if (!card) return;

        const revealContainer = card.querySelector('.reveal-text');

        // Create Action Container
        const actionContainer = document.createElement('div');
        actionContainer.className = 'card-actions';

        // 1. Read Button (Mapped to Focus/RSVP)
        const focusButton = document.createElement('button');
        focusButton.textContent = '1. Read'; // Was "1) Focus"
        focusButton.className = 'card-action-btn focus-btn';
        actionContainer.appendChild(focusButton);

        // 2. Audit Button (Mapped to Reveal All)
        const revealAllButton = document.createElement('button');
        revealAllButton.textContent = '2. Audit'; // Was "2) Reveal"
        revealAllButton.className = 'card-action-btn reveal-btn';
        actionContainer.appendChild(revealAllButton);

        // 3. Test Button (New Placeholder)
        const testButton = document.createElement('button');
        testButton.textContent = '3. Test';
        testButton.className = 'card-action-btn test-btn'; // New class
        actionContainer.appendChild(testButton);

        // 4. Reinforce Button (Mapped to Chunk)
        const chunkButton = document.createElement('button');
        chunkButton.textContent = '4. Reinforce'; // Was "3) Chunk"
        chunkButton.className = 'card-action-btn chunk-btn';
        actionContainer.appendChild(chunkButton);

        // card.appendChild(actionContainer); <--- REMOVED, moving to footer later.



        // Utility to refocus card after button click
        function refocusCard() {
            setTimeout(() => card.focus(), 0);
        }

        // ... newline/bold processing ...

        // Chunking Logic
        let isChunked = false;
        // Helper to set Chunk State
        function setChunk(shouldChunk) {
            if (shouldChunk === isChunked) return; // No change

            if (!shouldChunk) {
                // Unchunk
                const breaks = revealContainer.querySelectorAll('.chunk-br');
                breaks.forEach(br => br.remove());
                chunkButton.textContent = '4. Reinforce'; // Default state text
                isChunked = false;
            } else {
                // Chunk
                const nodes = Array.from(revealContainer.childNodes);
                let wordCount = 0;
                nodes.forEach(node => {
                    if (node.tagName === 'BR') {
                        wordCount = 0;
                    } else if (node.tagName === 'SPAN') {
                        wordCount++;
                        if (wordCount === 7) {
                            const br = document.createElement('br');
                            br.className = 'chunk-br';
                            node.insertAdjacentElement('afterend', br);
                            wordCount = 0;
                        }
                    }
                });
                chunkButton.textContent = '4. Unchunk';
                isChunked = true;
            }
        }


        // Helper to set Reveal State
        function setReveal(shouldReveal) {
            if (shouldReveal) {
                meaningfulSpans.forEach(span => span.classList.add('visible'));
                revealAllButton.textContent = '2. Hide';
            } else {
                meaningfulSpans.forEach(span => span.classList.remove('visible'));
                revealAllButton.textContent = '2. Audit';
            }
            updateProgress();
        }

        /* --- 3. Test Mode (Performance) --- */
        testButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const contentArray = meaningfulSpans.map(span => span.innerHTML);
            // Pass elementId as the card ID, and refreshStruggleView as the exit callback
            startFocusMode(elementId, contentArray, refreshStruggleView);
        });

        /* --- 4. Reinforce Mode (Dropout Drill) --- */
        chunkButton.addEventListener('click', (e) => {
            e.stopPropagation();

            // Toggle Logic:
            // "Reinforcing" if we have mixed visibility (visible > 0 and visible < total).

            const total = meaningfulSpans.length;
            const visibleCount = meaningfulSpans.filter(s => s.classList.contains('visible')).length;
            const isReinforcing = visibleCount > 0 && visibleCount < total;

            // If ALREADY Reinforcing -> Revert to Show All.
            // Else -> Force Reinforce (Dropout Drill).

            if (isReinforcing) {
                setReveal(true); // Revert to Show All
                setChunk(false);
            } else {
                setReveal(false); // Hide all
                setChunk(false);  // Unchunk

                // Reveal ONLY struggle words
                meaningfulSpans.forEach(span => {
                    if (span.classList.contains('struggle-word')) {
                        span.classList.add('visible');
                    }
                });
                updateProgress();
            }
            refocusCard();
        });

        // Replace standard newlines with a generic marker surrounded by spaces to ensure clean splitting
        const marker = '___BR___';
        let processedText = text.replace(/\n/g, ` ${marker} `);

        // Pre-process bold sections: *phrase* -> <b>phrase</b> (word by word)
        // This allows sentences to be wrapped in *...* but still result in individual bold words
        processedText = processedText.replace(/\*([^*]+)\*/g, (match, p1) => {
            return p1.split(' ').map(w => {
                if (w === marker) return w; // Don't bold the newline marker
                if (w.trim() === '') return ''; // Handle extra spaces
                return `<b>${w}</b>`;
            }).join(' ');
        });

        const words = processedText.split(' ');

        revealContainer.innerHTML = '';
        const meaningfulSpans = [];

        words.forEach((word) => {
            if (word === marker) {
                const br = document.createElement('br');
                revealContainer.appendChild(br);
            } else if (word.trim() !== '') {
                const span = document.createElement('span');
                // Content is already wrapped in <b> if needed by pre-processing
                span.innerHTML = word;
                revealContainer.appendChild(span);
                meaningfulSpans.push(span);

                revealContainer.appendChild(document.createTextNode(' '));
            }
        });

        // Function to apply struggle classes to spans based on localStorage
        function refreshStruggleView() {
            const struggles = loadStruggles(elementId);
            meaningfulSpans.forEach((span, index) => {
                if (struggles.has(index)) {
                    span.classList.add('struggle-word');
                } else {
                    span.classList.remove('struggle-word');
                }
            });
        }

        // Initial load
        refreshStruggleView();

        // Inject Progress Bar logic
        const progressWrapper = document.createElement('div');
        progressWrapper.className = 'progress-wrapper';

        // ... (Progress bar existing logic) ...

        const progressContainer = document.createElement('div');
        progressContainer.className = 'card-progress-container';

        const progressBar = document.createElement('div');
        progressBar.className = 'card-progress-bar';
        progressContainer.appendChild(progressBar);

        const progressText = document.createElement('span');
        progressText.className = 'progress-text';
        progressText.textContent = '0%';

        progressWrapper.appendChild(progressContainer);
        progressWrapper.appendChild(progressText);

        // Find the title and insert the progress bar after it
        const title = card.querySelector('h2');
        if (title) {
            title.insertAdjacentElement('afterend', progressWrapper);
        } else {
            card.prepend(progressWrapper);
        }

        // ... (updateProgress existing logic) ...
        function updateProgress() {
            const revealedCount = meaningfulSpans.filter(s => s.classList.contains('visible')).length;
            const progress = (revealedCount / meaningfulSpans.length) * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            return revealedCount === meaningfulSpans.length;
        }

        /* --- 1. Read Mode (Acquisition) --- */
        focusButton.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        /* --- 2. Audit Mode (Verification) --- */
        revealAllButton.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        /* --- 3. Test Mode (Performance) --- */
        testButton.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        /* --- 4. Reinforce Mode (Dropout Drill) --- */
        chunkButton.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Make card focusable
        card.setAttribute('tabindex', '0');

        function goToNextCard() {
            // ...
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
            // ...
            const nextHidden = meaningfulSpans.find(s => !s.classList.contains('visible'));
            if (nextHidden) {
                nextHidden.classList.add('visible');
                updateProgress();
                nextHidden.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                goToNextCard();
            }
        }

        // Spacebar interaction
        card.addEventListener('keydown', (e) => {
            // ...
            if (e.code === 'Space') {
                e.preventDefault();
                revealNext();
            }
        });

        card.addEventListener('click', (e) => {
            // Focus the card on click so subsequent spacebars work
            card.focus();

            // Check if clicked target is a hidden span
            if (e.target.tagName === 'SPAN') {
                e.target.classList.toggle('visible');
                updateProgress();
                return; // Stop processing
            }

            // If clicked any action button (handled by own listeners, but safety check)
            if (e.target.classList.contains('card-action-btn')) return;

            // Ensure the card is nicely positioned at the top
            // Note: If we are clicking to advance, we might not want to scroll THIS card to top if we are about to leave it.
            // But if we are mid-reading, yes.
            // Let's check status first.
            const isFinished = updateProgress();

            if (isFinished) {
                // If all words are already visible, go to next card
                goToNextCard();
            } else {
                // Otherwise, reveal the next hidden word
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                revealNext();
            }
        });

        // --- Strategy Footer ---
        const strategyBtn = document.createElement('button');
        strategyBtn.className = 'card-action-btn strategy-toggle-btn';
        strategyBtn.textContent = 'Help ';

        const strategyGuide = document.createElement('div');
        strategyGuide.className = 'strategy-guide';
        strategyGuide.innerHTML = `
            <p>
                <strong>The Protocol:</strong> Start with "1) Focus" to imprint the sequence, using the down arrow to flag any words you struggle with (they'll turn red). Once you've marked your weak points, exit and use the now red words on the card to guide your recitation. Finally, use "2) Reveal" to test yourself cold, and only touch "3) Chunk" if you need emergency scaffolding.
            </p>
        `;

        strategyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = strategyGuide.classList.contains('visible');
            if (isVisible) {
                strategyGuide.classList.remove('visible');
            } else {
                strategyGuide.classList.add('visible');
            }
        });

        // --- Layout: Footer Container ---
        const footer = document.createElement('div');
        footer.className = 'card-footer';

        // Add Strategy Button (Left)
        footer.appendChild(strategyBtn);

        // Add Action Buttons (Right) - actionContainer was created earlier
        footer.appendChild(actionContainer);

        // Add Footer to Card
        card.appendChild(footer);

        // Guide goes AFTER the card (outside flow)
        card.insertAdjacentElement('afterend', strategyGuide);
    }

    const entry1Text = "Clearing Intersections\nWhether approaching, turning, going through, or starting up at intersections scan ahead, look left, right, then back to the left. Scan your driving scene getting the big picture and look left, right, first, looking for any pedestrians, bicycles, motorcycles, and vehicles to ensure they are obeying their traffic sign or signal, and looking for any obstructions that may block your visibility. Look left the second time because that's the first lane of traffic I'm going to enter. Prior to entering the intersection, I check my traffic side mirror looking for traffic in the lane next to my vehicle that may turn in front of me. As I proceed through the intersection I check my opposite traffic side mirror to ensure I cleared the intersection of any hazards.\n*Why? Keeps you alive at intersections.*";

    const entry2Text = "When stopped in traffic\nWhen stopped in traffic, I leave enough space between the front bumper of my vehicle and the rear bumper of the vehicle in front of me. If that vehicle stalls or becomes disabled, I can maneuver around that vehicle without having to back up in traffic. The space I leave in front of my vehice is proportionate to the size of my vehicle. The longer my vehicle, the more space required.\n*Why? Have escape.*";

    const entry3Text = "Count one, two, three after the vehicle ahead has started to move béfore placing my vehicle in motion. This will automatically establish a space cushion and allow me to bring my eyes up to the driving scene ahead.\n*Why?*\nKeeps you away from billboards. Four to six second following time for speeds";

    const entry4Text = "Four to six second following time for speeds up to 30 MPH, 6-8 seconds for speeds over 30 MPH\nTo calculate following distance- When the vehicle ahead passes a stationary item, start counting 1/1000 one, 1/1000 two, 1/1000 three until the front bumper of my vehicle reaches that item. This is my following distance in seconds and gives me time to act to any changes in the traffic scene ahead.\n*Why? Buys time.*";

    const entry5Text = "Eight to twelve seconds eye-lead time\nEight to twelve seconds of eye lead time is the depth of which my eyes should be most of the time while driving. To establish eye lead time while driving, I pick a stationary item in front of my vehicle and start counting 1/1000 one, 1/1000 two, 1/1000 three until the front of my vehicle reaches that item. That is my eye lead time in seconds. Remember that it is a maintained depth of vision.\n*Why? Centers car in traffic lane.*";

    const entry6Text = "Scan steering wheels\nAlways scan steering wheels of parked cars to see if the vehicle is occupied. An occupied vehicle presents two hazards, the person may either exit the vehicle, or pull away from the curb. Other ways to see if the vehicle is occupied is steering wheels turned out, tail or brake lights on, and exhaust coming from the tail pipe. If you can't determine if the vehicle is occupied, treat it as an occupied vehicle. A small tap or loud blast if necessary, close enough to be heard, yet far enough away to take evasive action.\n*Why? Take path of least resistance.*";

    const entry7Text = "Stale green lights\nA stale green light is a light that I did not see change, and I'm not sure when it may turn to yellow or red. A point of decision must be established between the front bumper of my vehicle and the stop line. If the light would change before reaching my decision point I will be able to bring the vehicle to a safe stop behind the stop line. If I reach my decision point and the light would change, I will continue through the intersection without hesitation or acceleration. Things that affect my point of decision are road, load, weather and speed. (Demo)\n*Why? Smooth stops and turns.*";

    const entry8Text = "Eye contact\nAlways establish eye to eye contact with pedestrians, bicycles, motorcycles, and vehicles to eliminate uncertainty. We use 3 tools to establish eye to eye contact, our horn, lights and signals. Our hom is the primary tool, usually a tap of the hor, sometimes a loud blast is necessary. Once I establish eye to eye contact I can expect the other person to act in a reasonable and predictable manner.\n*Why? Establishes eye to eye contact.*";

    const entry9Text = "Pulling from curb\nWhen pulling from a curb, I always indicate my intentions by turning on my traffic side turn signal. I check traffic by, looking at my traffic side flat and convex mirrors. I look over my traffic side shoulder to check my blind spot between the fuel tank and drive axle in the lane I'm about to occupy. When the lane is clear I can proceed with pulling from curb. I do not deactivate my turn signal until all of my equipment is completely in the lane I am occupying.\n*Why? Communicate in traffic, horn, lights, signals.*";

    const entry10Text = "Use of mirrors and gauges\nI check a mirror every 5 to 8 seconds looking for lane position, traffic conditions and mechanical problems. I substitute a mirror check, when traffic allows, with one of my primary gauges, oil or water looking for normal readings. When I check a mirror or gauge my next eye movement is back to the front. Never go mirror to mirror, gauge to gauge, mirror to gauge, gauge to mirror.\n*Why? Keeps eyes ahead of car.*.";

    const entry5s1Text = "AIM HIGH IN STEERING\nHow do you do it?\nImaginary target - baseball/dartboard\nWhat does it do for you?\nCenters car in traffic lane: Safe path on turns\nKey Phrase\nREMEMBER, \"FIND A SAFE PATH WELL AHEAD.\"";

    const entry5s2Text = "GET THE BIG PICTURE\nHow do you do it?\nHow wide and deep? What's in it? Objects and ground\nWhat does it do for you?\nKeeps you away from billboards Smooth stops and turns Buys time\nKey Phrase\nREMEMBER, \"STAY BACK AND SEE IT ALL\"";

    const entry5s3Text = "KEEP YOUR EYES MOVING\nHow do you do it?\nMove eyes. Front - 2 seconds, Rear - 5 to 8 seconds\nWhat's does it do for you?\nKeeps you alive at intersections, keeps eyes ahead of car\nKey Phrase\nREMEMBER, \"SCAN - DON'T STARE\"";

    const entry5s4Text = "LEAVE YOURSELF AN OUT\nHow do you do it?\nHave escape route, take path of least resistance\nWhat does it do for you?\nSpace on all four sides, but always in front\nKey Phrase\nREMEMBER, \"BE PREPARED, EXPECT THE UNEXPECTED\"";

    const entry5s5Text = "MAKE SURE THEY SEE YOU\nHow do you do it?\nCommunicate in traffic - horn, lights, signals\nWhat does it do for you?\nEstablishes eye-to-eye contact\nKey Phrase\nREMEMBER, \"DON'T GAMBLE - USE YOUR HORN, LIGHTS, AND SIGNALS\"";

    setupReveal('entry-5s-1', entry5s1Text); // Initialize 5s card
    setupReveal('entry-5s-2', entry5s2Text); // Initialize 5s card 2
    setupReveal('entry-5s-3', entry5s3Text); // Initialize 5s card 3
    setupReveal('entry-5s-4', entry5s4Text); // Initialize 5s card 4
    setupReveal('entry-5s-5', entry5s5Text); // Initialize 5s card 5
    setupReveal('entry-1', entry1Text);
    setupReveal('entry-2', entry2Text);
    setupReveal('entry-3', entry3Text);
    setupReveal('entry-4', entry4Text);
    setupReveal('entry-5', entry5Text);
    setupReveal('entry-6', entry6Text);
    setupReveal('entry-7', entry7Text);
    setupReveal('entry-8', entry8Text);
    setupReveal('entry-9', entry9Text);
    setupReveal('entry-10', entry10Text);
});
