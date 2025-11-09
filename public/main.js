// Communication Assessment Suite - Main Controller

class AssessmentController {
    constructor() {
        this.currentStep = 0;
        this.totalSteps = 7; // Reading, Listening, Jumbled Sentences, Story, Personal, Comprehension, Fill Blanks
        this.assessmentSections = ['reading', 'listening', 'jumbled', 'story', 'personal', 'comprehension', 'fillblanks'];
        this.completedAssessments = [];
        this.scores = {
            reading: 0,
            listening: 0,
            jumbled: 0,
            story: 0,
            personal: 0,
            comprehension: 0,
            fillblanks: 0,
            overall: 0
        };

        // Store pre-generated questions for all assessments
        this.preGeneratedQuestions = {
            reading: null,
            listening: null,
            jumbled: null,
            story: null,
            personal: null,
            comprehension: null,
            fillblanks: null
        };

        // Timer properties
        this.timerDuration = 20 * 60; // 30 minutes in seconds
        this.timeRemaining = this.timerDuration;
        this.timerInterval = null;
        this.timerElement = document.getElementById('timer-value');

        // Flag to prevent double assessment generation
        this.isGeneratingAssessment = false;

        // Load saved state from localStorage
        this.loadSavedState();

        this.initializeEventListeners();
        this.showWelcomeSection();

        // Make this instance globally available
        window.assessmentController = this;
    }

    initializeEventListeners() {
        // Start Assessment Button - now shows setup screen first
        document.getElementById('start-assessment').addEventListener('click', () => {
            this.showSetupScreen();
        });

        // Navigation buttons removed for linear assessment flow

        // Result page buttons functionality moved to result.html
    }

    loadSavedState() {
        try {
            const savedState = localStorage.getItem('assessmentProgress');
            if (savedState) {
                const state = JSON.parse(savedState);
                this.currentStep = state.currentStep || 0;
                this.completedAssessments = state.completedAssessments || [];
                this.scores = { ...this.scores, ...(state.scores || {}) };

                // Restore timer state if available
                if (state.timeRemaining && state.timeRemaining > 0) {
                    this.timeRemaining = state.timeRemaining;
                    // If assessment was in progress, resume timer
                    if (this.currentStep > 0 && this.currentStep < this.totalSteps) {
                        this.updateTimerDisplay();
                    }
                }
            }
        } catch (error) {
            console.error('Error loading saved state:', error);
            // Clear corrupted data
            localStorage.removeItem('assessmentProgress');
        }
    }

    saveState() {
        try {
            const state = {
                currentStep: this.currentStep,
                completedAssessments: this.completedAssessments,
                scores: this.scores,
                timeRemaining: this.timeRemaining,
                timestamp: Date.now()
            };
            localStorage.setItem('assessmentProgress', JSON.stringify(state));
        } catch (error) {
            console.error('Error saving state:', error);
        }
    }

    clearSavedState() {
        try {
            localStorage.removeItem('assessmentProgress');
        } catch (error) {
            console.error('Error clearing saved state:', error);
        }
    }

    // Timer Methods
    startTimer() {
        // Reset timer if starting fresh
        if (this.currentStep === 0) {
            this.timeRemaining = this.timerDuration;
        }

        this.updateTimerDisplay();

        // Clear any existing timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Start countdown
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerDisplay();

            // Save state periodically
            if (this.timeRemaining % 10 === 0) {
                this.saveState();
            }

            // Check if time is up
            if (this.timeRemaining <= 0) {
                this.handleTimeUp();
            }

            // Warning at 5 minutes remaining
            if (this.timeRemaining === 300) {
                this.showMessage('⚠️ 5 minutes remaining!', 'warning');
            }

            // Warning at 1 minute remaining
            if (this.timeRemaining === 60) {
                this.showMessage('⚠️ 1 minute remaining!', 'warning');
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerDisplay() {
        if (!this.timerElement) {
            this.timerElement = document.getElementById('timer-value');
        }

        if (this.timerElement) {
            const minutes = Math.floor(this.timeRemaining / 60);
            const seconds = this.timeRemaining % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            this.timerElement.textContent = timeString;

            // Add visual warnings when time is running low
            const timerContainer = document.getElementById('timer-container');
            if (timerContainer) {
                timerContainer.classList.remove('timer-warning', 'timer-critical');

                if (this.timeRemaining <= 60) {
                    timerContainer.classList.add('timer-critical');
                } else if (this.timeRemaining <= 300) {
                    timerContainer.classList.add('timer-warning');
                }
            }
        }
    }

    handleTimeUp() {
        this.stopTimer();

        // Show timeout message
        this.showMessage('⏰ Time\'s up! Assessment ending automatically...', 'warning');

        // Save current state
        this.saveState();

        // Redirect to results after a brief delay
        setTimeout(() => {
            console.log('Timer expired - forcing assessment completion');
            this.showFinalResults();
        }, 2000);
    }

    showWelcomeSection() {
        this.hideAllSections();
        document.getElementById('welcome-section').style.display = 'block';
        document.getElementById('assessment-nav').style.display = 'none';

        // Hide submit button and show dashboard link
        if (window.hideSubmitButton) {
            window.hideSubmitButton();
        }
        if (window.setAssessmentInProgress) {
            window.setAssessmentInProgress(false);
        }

        this.loadUserInfo();
    }

    async loadUserInfo() {
        try {
            const response = await fetch('/api/auth/me');
            if (response.ok) {
                const userData = await response.json();
                this.displayTestCount(userData.number_of_tests);
            } else {
                console.error('Failed to load user info');
                this.displayTestCount(0);
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            this.displayTestCount(0);
        }
    }

    displayTestCount(testCount) {
        const loadingElement = document.getElementById('test-info-loading');
        const displayElement = document.getElementById('test-count-display');
        const countElement = document.getElementById('test-count');
        const startButton = document.getElementById('start-assessment');

        if (loadingElement) loadingElement.style.display = 'none';
        if (displayElement) displayElement.style.display = 'block';
        if (countElement) countElement.textContent = testCount;

        // Enable/disable start button based on test availability
        if (startButton) {
            startButton.disabled = testCount <= 0;
            if (testCount <= 0) {
                startButton.textContent = 'No Tests Available';
                startButton.classList.add('btn-disabled');
            } else {
                startButton.textContent = 'Start Assessment';
                startButton.classList.remove('btn-disabled');
            }
        }
    }

    async startAssessment() {
        // Prevent double generation
        if (this.isGeneratingAssessment) {
            console.log('Assessment generation already in progress, ignoring duplicate call');
            return;
        }

        this.isGeneratingAssessment = true;

        // Show global loading screen for question pre-generation
        this.showGlobalLoading();

        try {
            // Pre-generate all questions first
            await this.preloadAllQuestions();

            this.currentStep = 0;
            this.completedAssessments = [];
            this.scores = { reading: 0, listening: 0, jumbled: 0, story: 0, personal: 0, comprehension: 0, fillblanks: 0, overall: 0 };

            // Reset and start timer
            this.timeRemaining = this.timerDuration;
            this.startTimer();

            // Create new assessment session on server
            await this.createAssessmentSession();

            // Save initial state
            this.saveState();

            // Hide loading and show first assessment
            this.hideGlobalLoading();
            this.hideAllSections();
            this.showCurrentAssessment();
            this.updateNavigation();

            // Show submit button and set assessment in progress
            if (window.showSubmitButton) {
                window.showSubmitButton();
            }
            if (window.setAssessmentInProgress) {
                window.setAssessmentInProgress(true);
            }

        } catch (error) {
            console.error('Error starting assessment:', error);
            this.hideGlobalLoading();
            this.showMessage(error.message || 'Failed to prepare assessment questions. Please try again.', 'error');
        } finally {
            // Reset the flag regardless of success or failure
            this.isGeneratingAssessment = false;
        }
    }

    async createAssessmentSession() {
        try {
            const response = await fetch('/api/assessment/create-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.code === 'NO_TESTS_AVAILABLE') {
                    throw new Error('You have no tests available. Please contact the administrator to get more tests.');
                }
                throw new Error(data.error || 'Failed to create assessment session');
            }

            console.log('Assessment session created successfully');
            if (data.testsRemaining !== undefined) {
                console.log(`Tests remaining: ${data.testsRemaining}`);
            }
        } catch (error) {
            console.error('Failed to create assessment session:', error);
            throw error; // Re-throw to be handled by startAssessment
        }
    }

    async resetServerState() {
        try {
            await fetch('/api/assessment/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Failed to reset server state:', error);
        }
    }

    async clearAssessmentSession() {
        try {
            await fetch('/api/assessment/clear-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            console.log('Assessment session cleared successfully');
        } catch (error) {
            console.error('Failed to clear assessment session:', error);
        }
    }

    async preloadAllQuestions() {
        console.log('Starting pre-generation of all assessment questions...');

        const loadingStatus = document.getElementById('global-loading-status');

        try {
            // Pre-generate reading questions with random topic and difficulty
            loadingStatus.textContent = 'Generating reading assessment questions...';

            // Select random topic and difficulty for reading assessment
            const readingTopics = [
                'Daily conversations',
                'Business communication',
                'Academic presentations',
                'News and current events',
                'Travel and culture',
                'Health and wellness',
                'Technology and innovation',
                'Environmental topics'
            ];
            const difficulties = ['beginner', 'intermediate', 'advanced'];
            const selectedTopic = readingTopics[Math.floor(Math.random() * readingTopics.length)];
            const selectedDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

            const readingResponse = await fetch('/api/reading/generate-sentence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: selectedTopic,
                    difficulty: selectedDifficulty
                })
            });
            this.preGeneratedQuestions.reading = await readingResponse.json();

            // Pre-generate listening questions with random topic and difficulty
            loadingStatus.textContent = 'Generating listening assessment questions...';

            // Select random topic and difficulty for listening assessment
            const listeningTopics = [
                'Interviews and dialogues',
                'News broadcasts',
                'Educational lectures',
                'Travel announcements',
                'Business meetings',
                'Cultural discussions',
                'Scientific explanations',
                'Entertainment content'
            ];
            const listeningSelectedTopic = listeningTopics[Math.floor(Math.random() * listeningTopics.length)];
            const listeningSelectedDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

            const listeningResponse = await fetch('/api/listening/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: listeningSelectedTopic,
                    difficulty: listeningSelectedDifficulty
                })
            });
            this.preGeneratedQuestions.listening = await listeningResponse.json();

            // Pre-generate jumbled sentences with random topic and difficulty
            loadingStatus.textContent = 'Generating jumbled sentences...';

            // Select random topic and difficulty for jumbled sentences assessment
            const jumbledTopics = [
                'Everyday activities',
                'Work and career',
                'Education and learning',
                'Family and relationships',
                'Hobbies and interests',
                'Food and cooking',
                'Transportation',
                'Social situations'
            ];
            const jumbledSelectedTopic = jumbledTopics[Math.floor(Math.random() * jumbledTopics.length)];
            const jumbledSelectedDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

            const jumbledResponse = await fetch('/api/jumbled/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: jumbledSelectedTopic,
                    difficulty: jumbledSelectedDifficulty
                })
            });
            this.preGeneratedQuestions.jumbled = await jumbledResponse.json();

            // Pre-generate story with random topic and difficulty
            loadingStatus.textContent = 'Generating story assessment...';

            // Select random topic and difficulty for story assessment
            const storyTopics = [
                'Adventure stories',
                'Historical tales',
                'Science fiction',
                'Mystery and detective',
                'Biographical stories',
                'Folklore and legends',
                'Contemporary fiction',
                'Educational narratives'
            ];
            const storySelectedTopic = storyTopics[Math.floor(Math.random() * storyTopics.length)];
            const storySelectedDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

            const storyResponse = await fetch('/api/story/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: storySelectedTopic,
                    difficulty: storySelectedDifficulty
                })
            });
            this.preGeneratedQuestions.story = await storyResponse.json();

            // Pre-generate personal question with random selection
            loadingStatus.textContent = 'Generating personal interview question...';

            // Random selection arrays for personal questions
            const personalDifficulties = ['Easy', 'Medium', 'Hard'];
            const personalCategories = [
                'General',
                'Technical Communication',
                'Problem Solving',
                'Teamwork',
                'Leadership',
                'Failure/Learning',
                'Innovation'
            ];

            // Randomly select difficulty and category for personal questions
            const personalSelectedDifficulty = personalDifficulties[Math.floor(Math.random() * personalDifficulties.length)];
            const personalSelectedCategory = personalCategories[Math.floor(Math.random() * personalCategories.length)];

            console.log(`Personal assessment pre-generation: ${personalSelectedDifficulty} difficulty, ${personalSelectedCategory} category`);

            const personalResponse = await fetch('/api/personal/generate-question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    difficulty: personalSelectedDifficulty,
                    category: personalSelectedCategory
                })
            });
            this.preGeneratedQuestions.personal = await personalResponse.json();

            // Pre-generate comprehension questions
            loadingStatus.textContent = 'Generating reading comprehension content...';
            const comprehensionResponse = await fetch('/api/comprehension/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: 'Technology',
                    difficulty: 'Intermediate'
                })
            });
            this.preGeneratedQuestions.comprehension = await comprehensionResponse.json();

            // Pre-generate fill-in-the-blanks questions
            loadingStatus.textContent = 'Generating fill-in-the-blanks questions...';

            // Select random topic and difficulty for fill-in-the-blanks assessment
            const fillblanksTopics = [
                'Grammar patterns',
                'Vocabulary building',
                'Idiomatic expressions',
                'Academic writing',
                'Business correspondence',
                'Conversational English',
                'Technical terminology',
                'Cultural contexts'
            ];
            const fillblanksSelectedTopic = fillblanksTopics[Math.floor(Math.random() * fillblanksTopics.length)];
            const fillblanksSelectedDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

            console.log(`Fill-in-the-blanks pre-generation: Selected topic "${fillblanksSelectedTopic}" with difficulty "${fillblanksSelectedDifficulty}"`);

            const fillblanksResponse = await fetch('/api/fillblanks/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: fillblanksSelectedTopic,
                    difficulty: fillblanksSelectedDifficulty
                })
            });
            this.preGeneratedQuestions.fillblanks = await fillblanksResponse.json();

            console.log(`✅ Fill-in-the-blanks pre-generation completed: Received ${this.preGeneratedQuestions.fillblanks.questions?.length || 0} questions`);

            loadingStatus.textContent = 'All questions generated successfully! Starting assessment...';

            console.log('All questions pre-generated successfully');

        } catch (error) {
            console.error('Error pre-generating questions:', error);
            throw new Error('Failed to generate assessment questions');
        }
    }

    showGlobalLoading() {
        // Create global loading overlay if it doesn't exist
        let loadingOverlay = document.getElementById('global-loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'global-loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="global-loading-content">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                    </div>
                    <h2>Preparing Your Assessment</h2>
                    <p>Generating all questions and preparing your personalized test experience...</p>
                    <div class="loading-status" id="global-loading-status">Initializing...</div>
                    <div class="loading-progress-bar">
                        <div class="loading-progress-fill" id="global-loading-progress"></div>
                    </div>
                </div>
            `;
            loadingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                backdrop-filter: blur(5px);
            `;
            document.body.appendChild(loadingOverlay);
        }

        loadingOverlay.style.display = 'flex';

        // Animate progress bar
        this.animateLoadingProgress();
    }

    hideGlobalLoading() {
        const loadingOverlay = document.getElementById('global-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    animateLoadingProgress() {
        const progressBar = document.getElementById('global-loading-progress');
        if (progressBar) {
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                }
                progressBar.style.width = `${progress}%`;
            }, 500);
        }
    }

    showSetupScreen() {
        if (window.SetupAssessment) {
            window.SetupAssessment.showSetup();
        }
    }

    hideAllSections() {
        document.getElementById('welcome-section').style.display = 'none';
        document.getElementById('setup-section').style.display = 'none';
        document.getElementById('reading-assessment').style.display = 'none';
        document.getElementById('listening-assessment').style.display = 'none';
        document.getElementById('jumbled-assessment').style.display = 'none';
        document.getElementById('story-assessment').style.display = 'none';
        document.getElementById('personal-assessment').style.display = 'none';
        document.getElementById('comprehension-assessment').style.display = 'none';
        document.getElementById('fillblanks-assessment').style.display = 'none';
    }

    showCurrentAssessment() {
        if (this.currentStep >= this.totalSteps) {
            this.showFinalResults();
            return;
        }

        const currentAssessment = this.assessmentSections[this.currentStep];
        document.getElementById(`${currentAssessment}-assessment`).style.display = 'block';
        document.getElementById('assessment-nav').style.display = 'flex';

        // Resume timer if assessment is in progress and timer isn't running
        if (this.currentStep > 0 && !this.timerInterval && this.timeRemaining > 0) {
            this.startTimer();
        }

        // Initialize the current assessment
        this.initializeCurrentAssessment(currentAssessment);
    }

    initializeCurrentAssessment(assessmentType) {
        switch (assessmentType) {
            case 'reading':
                if (window.ReadingAssessment) {
                    window.ReadingAssessment.initialize();
                }
                break;
            case 'listening':
                if (window.ListeningAssessment) {
                    window.ListeningAssessment.initialize();
                }
                break;
            case 'jumbled':
                if (window.JumbledAssessment) {
                    window.JumbledAssessment.initialize();
                }
                break;
            case 'story':
                if (window.StoryAssessment) {
                    window.StoryAssessment.initialize();
                }
                break;
            case 'personal':
                if (window.PersonalAssessment) {
                    window.PersonalAssessment.initialize();
                }
                break;
            case 'comprehension':
                if (window.ComprehensionAssessment) {
                    window.ComprehensionAssessment.initialize();
                }
                break;
            case 'fillblanks':
                if (window.FillBlanksAssessment) {
                    window.FillBlanksAssessment.initialize();
                }
                break;
        }
    }

    updateNavigation() {
        // Update question indicator strip (replace textual progress)
        const indicator = document.getElementById('question-indicator');
        if (indicator) {
            indicator.innerHTML = '';
            // Determine per-round total questions
            // Always target full 32 dots from the start; fall back to defaults if data not yet loaded
            const comprehensionCount = (window.ComprehensionAssessment
                && Array.isArray(window.ComprehensionAssessment.currentQuestions)
                && window.ComprehensionAssessment.currentQuestions.length > 0)
                ? window.ComprehensionAssessment.currentQuestions.length
                : 5;
            const fillBlanksCount = (window.FillBlanksAssessment
                && Array.isArray(window.FillBlanksAssessment.questions)
                && window.FillBlanksAssessment.questions.length > 0)
                ? window.FillBlanksAssessment.questions.length
                : 10;

            const perRoundTotals = [
                (window.ReadingAssessment ? (window.ReadingAssessment.totalSentences || 5) : 5),
                (window.ListeningAssessment ? (window.ListeningAssessment.totalSentences || 5) : 5),
                5,
                1,
                1,
                comprehensionCount,
                fillBlanksCount
            ];
            const totalQuestions = perRoundTotals.reduce((a, b) => a + b, 0);
            // Compute absolute index
            let offset = 0;
            for (let i = 0; i < this.currentStep; i++) offset += perRoundTotals[i] || 0;
            // In-round index
            let inRoundIndex = 0;
            try {
                const type = this.getCurrentAssessmentType();
                if (type === 'reading' && window.ReadingAssessment) inRoundIndex = Math.max(0, (window.ReadingAssessment.currentIndex || 1) - 1);
                if (type === 'listening' && window.ListeningAssessment) inRoundIndex = Math.max(0, (window.ListeningAssessment.currentIndex || 1) - 1);
                if (type === 'jumbled' && window.JumbledAssessment) inRoundIndex = Math.max(0, (window.JumbledAssessment.currentQuestionIndex || 0));
                if (type === 'comprehension' && window.ComprehensionAssessment) inRoundIndex = Math.max(0, (window.ComprehensionAssessment.currentQuestionIndex || 0));
                if (type === 'fillblanks' && window.FillBlanksAssessment) inRoundIndex = Math.max(0, (window.FillBlanksAssessment.currentQuestionIndex || 0));
            } catch (_) { }
            const currentQuestionIndex = Math.min(offset + inRoundIndex, totalQuestions - 1);
            // Build dots and highlight current
            for (let i = 0; i < totalQuestions; i++) {
                const dot = document.createElement('div');
                dot.className = 'q-dot' + (i === currentQuestionIndex ? ' active' : '') + (i < currentQuestionIndex ? ' done' : '');
                dot.textContent = i + 1;
                indicator.appendChild(dot);
            }
        }

        // No navigation buttons - linear flow only
    }

    // Navigation methods removed - assessment flow is now completely linear and automatic

    nextStep() {
        // Only used internally for automatic progression
        if (this.currentStep < this.totalSteps - 1) {
            this.currentStep++;
            this.saveState();
            this.hideAllSections();
            this.showCurrentAssessment();
            this.updateNavigation();
        }
    }

    markAssessmentComplete(assessmentType, score) {
        console.log(`Assessment ${assessmentType} completed with score: ${score}`);

        if (!this.completedAssessments.includes(assessmentType)) {
            this.completedAssessments.push(assessmentType);
        }

        this.scores[assessmentType] = score;
        this.saveState(); // Save progress after completion
        this.updateNavigation();

        // No completion messages to keep flow continuous
        console.log(`${this.formatAssessmentName(assessmentType)} completed - continuing to next section`);
    }

    formatAssessmentName(assessmentType) {
        const names = {
            'reading': 'Reading Ability',
            'listening': 'Listening Ability',
            'jumbled': 'Jumbled Sentences',
            'story': 'Story Summarization',
            'personal': 'Personal Questions',
            'comprehension': 'Reading Comprehension',
            'fillblanks': 'Fill in the Blanks'
        };
        return names[assessmentType] || assessmentType;
    }

    async showFinalResults() {
        try {
            // Stop the timer
            this.stopTimer();

            // Set assessment as no longer in progress
            if (window.setAssessmentInProgress) {
                window.setAssessmentInProgress(false);
            }

            // Save current state before redirecting
            this.saveState();

            // Show a brief loading message before redirect
            this.showMessage('Assessment completed! Redirecting to results...', 'success');

            // Redirect to result.html after a short delay
            setTimeout(() => {
                window.location.href = 'result.html';
            }, 1500);

        } catch (error) {
            console.error('Error redirecting to final results:', error);
            this.showMessage('Error redirecting to results. Please try again.', 'error');
        }
    }

    async showIndividualResults() {
        try {
            // Get both scores and detailed results
            const [scoresResponse, detailedResponse] = await Promise.all([
                fetch('/api/assessment/scores'),
                fetch('/api/assessment/detailed-results')
            ]);

            const scoresData = await scoresResponse.json();
            const detailedData = await detailedResponse.json();

            // Only use server scores for completed assessments, otherwise set to 0
            this.scores.reading = this.completedAssessments.includes('reading') ? (scoresData.readingAbility || 0) : 0;
            this.scores.listening = this.completedAssessments.includes('listening') ? (scoresData.listeningAbility || 0) : 0;
            this.scores.jumbled = this.completedAssessments.includes('jumbled') ? (scoresData.jumbledSentences || 0) : 0;
            this.scores.story = this.completedAssessments.includes('story') ? (scoresData.storySummarization || 0) : 0;
            this.scores.personal = this.completedAssessments.includes('personal') ? (scoresData.personalQuestions || 0) : 0;
            this.scores.comprehension = this.completedAssessments.includes('comprehension') ? (scoresData.readingComprehension || 0) : 0;
            this.scores.fillblanks = this.completedAssessments.includes('fillblanks') ? (scoresData.fillInTheBlanks || 0) : 0;

            // Calculate overall score based only on completed assessments
            this.calculateOverallScore();

            // Hide all sections and show individual results
            this.hideAllSections();
            document.getElementById('individual-results').style.display = 'block';
            document.getElementById('assessment-nav').style.display = 'none';

            // Render individual section results
            this.renderIndividualSections(detailedData);

            // Set up the transition to overall results
            this.setupTransitionToOverall();

        } catch (error) {
            console.error('Error fetching individual results:', error);
            this.showMessage('Error loading individual results. Please try again.', 'error');
        }
    }

    calculateOverallScore() {
        // Calculate overall score including unattempted sections as 0
        let totalScore = 0;
        let completedCount = 0;
        const totalAssessments = 7; // Total number of assessment types

        const assessmentScores = {
            reading: this.scores.reading || 0,
            listening: this.scores.listening || 0,
            jumbled: this.scores.jumbled || 0,
            story: this.scores.story || 0,
            personal: this.scores.personal || 0,
            comprehension: this.scores.comprehension || 0,
            fillblanks: this.scores.fillblanks || 0
        };

        // Include all assessment scores, treating unattempted as 0
        for (const [assessmentType, score] of Object.entries(assessmentScores)) {
            totalScore += score;
            if (this.completedAssessments.includes(assessmentType) && score > 0) {
                completedCount++;
            }
        }

        // Calculate average score including unattempted sections as 0
        this.scores.overall = Math.round(totalScore / totalAssessments);

        console.log(`Overall score calculated: ${this.scores.overall} (including ${totalAssessments - completedCount} unattempted sections as 0, ${completedCount} completed assessments)`);
    }

    renderIndividualSections(detailedData) {
        const sectionsContainer = document.getElementById('individual-sections');
        sectionsContainer.innerHTML = '';

        // Define section order and names
        const sectionOrder = ['reading', 'listening', 'personal', 'story', 'jumbled', 'comprehension', 'fillblanks'];
        const sectionNames = {
            reading: '📖 Reading Ability Assessment',
            listening: '👂 Listening Ability Assessment',
            personal: '🤔 Personal Questions Assessment',
            story: '📚 Story Summarization Assessment',
            jumbled: '🔤 Jumbled Sentences Assessment',
            comprehension: '📝 Reading Comprehension Assessment',
            fillblanks: '⚫ Fill in the Blanks Assessment'
        };

        // Show summary of completed vs total assessments
        const completedCount = this.completedAssessments.length;
        const totalCount = this.totalSteps;

        if (completedCount < totalCount) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'assessment-completion-summary';
            summaryDiv.innerHTML = `
                <div class="completion-info">
                    <h3>📊 Assessment Completion Summary</h3>
                    <p>You completed <strong>${completedCount} out of ${totalCount}</strong> assessments before time ran out.</p>
                    <p>Below are the results for the assessments you completed:</p>
                </div>
            `;
            sectionsContainer.appendChild(summaryDiv);
        }

        // Only render sections for completed assessments
        sectionOrder.forEach(sectionType => {
            if (this.completedAssessments.includes(sectionType)) {
                const sectionData = detailedData[sectionType];
                if (sectionData) {
                    const sectionElement = this.createSectionResultElement(sectionType, sectionNames[sectionType], sectionData);
                    sectionsContainer.appendChild(sectionElement);
                }
            }
        });

        // Show message if no assessments were completed
        if (completedCount === 0) {
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'no-results-message';
            noResultsDiv.innerHTML = `
                <div class="no-results-content">
                    <h3>⏰ Time Expired</h3>
                    <p>Unfortunately, time ran out before any assessments could be completed.</p>
                    <p>You can start a new assessment to try again with more time.</p>
                </div>
            `;
            sectionsContainer.appendChild(noResultsDiv);
        }
    }

    createSectionResultElement(sectionType, sectionName, sectionData) {
        const section = document.createElement('div');
        section.className = 'section-result';

        // Header with name and score
        const header = document.createElement('div');
        header.className = 'section-result-header';
        header.innerHTML = `
            <h3>${sectionName}</h3>
            <div class="section-result-score">${Math.round(sectionData.score)}</div>
        `;

        // Body with detailed content
        const body = document.createElement('div');
        body.className = 'section-result-body';

        // Add appropriate content based on section type
        if (sectionData.pronunciationData) {
            body.appendChild(this.createPronunciationDisplay(sectionData.pronunciationData));
        }

        if (sectionData.aiEvaluation) {
            body.appendChild(this.createAIEvaluationDisplay(sectionData.aiEvaluation));
        }

        if (sectionData.answerComparison) {
            body.appendChild(this.createAnswerComparisonDisplay(sectionData.answerComparison));
        }

        section.appendChild(header);
        section.appendChild(body);

        return section;
    }

    createPronunciationDisplay(pronunciationData) {
        const container = document.createElement('div');

        // Overall average scores
        container.innerHTML = `
            <div class="pronunciation-metrics-individual">
                <h4>📊 Overall Average Scores</h4>
                <div class="metric-item">
                    <div class="metric-label">Pronunciation</div>
                    <div class="metric-value ${this.getScoreClass(pronunciationData.pronunciationScore)}">${pronunciationData.pronunciationScore || 0}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Accuracy</div>
                    <div class="metric-value ${this.getScoreClass(pronunciationData.accuracyScore)}">${pronunciationData.accuracyScore || 0}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Fluency</div>
                    <div class="metric-value ${this.getScoreClass(pronunciationData.fluencyScore)}">${pronunciationData.fluencyScore || 0}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Completeness</div>
                    <div class="metric-value ${this.getScoreClass(pronunciationData.completenessScore)}">${pronunciationData.completenessScore || 0}</div>
                </div>
                ${pronunciationData.prosodyScore ? `
                <div class="metric-item">
                    <div class="metric-label">Prosody</div>
                    <div class="metric-value ${this.getScoreClass(pronunciationData.prosodyScore)}">${pronunciationData.prosodyScore}</div>
                </div>
                ` : ''}
            </div>
        `;

        // Individual sentence results
        if (pronunciationData.sentences && pronunciationData.sentences.length > 0) {
            const sentencesDiv = document.createElement('div');
            sentencesDiv.className = 'individual-sentences';
            sentencesDiv.innerHTML = '<h4>📝 Individual Sentence Results</h4>';

            pronunciationData.sentences.forEach((sentence, index) => {
                const sentenceDiv = document.createElement('div');
                sentenceDiv.className = 'sentence-result';
                sentenceDiv.innerHTML = `
                    <div class="sentence-header">
                        <h5>Sentence ${sentence.sentenceIndex || index + 1}</h5>
                        <span class="sentence-score ${this.getScoreClass(sentence.pronunciationScore)}">${sentence.pronunciationScore || 0}</span>
                    </div>
                    <div class="sentence-content">
                        <div class="sentence-reference">
                            <strong>Reference:</strong> "${sentence.referenceText}"
                        </div>
                        <div class="sentence-recognized">
                            <strong>You said:</strong> "${sentence.recognizedText}"
                        </div>
                        <div class="sentence-metrics">
                            <span class="mini-metric">Accuracy: ${sentence.accuracyScore || 0}</span>
                            <span class="mini-metric">Fluency: ${sentence.fluencyScore || 0}</span>
                            <span class="mini-metric">Completeness: ${sentence.completenessScore || 0}</span>
                            ${sentence.prosodyScore ? `<span class="mini-metric">Prosody: ${sentence.prosodyScore}</span>` : ''}
                        </div>
                    </div>
                `;
                sentencesDiv.appendChild(sentenceDiv);
            });

            container.appendChild(sentencesDiv);
        } else {
            // Fallback for old format or single sentence
            if (pronunciationData.recognizedText) {
                const recognizedDiv = document.createElement('div');
                recognizedDiv.className = 'recognized-text';
                recognizedDiv.innerHTML = `
                    <h4>What You Said:</h4>
                    <p>"${pronunciationData.recognizedText}"</p>
                `;
                container.appendChild(recognizedDiv);
            }

            if (pronunciationData.referenceText) {
                const referenceDiv = document.createElement('div');
                referenceDiv.className = 'original-content';
                referenceDiv.innerHTML = `
                    <h4>Reference Text:</h4>
                    <p>"${pronunciationData.referenceText}"</p>
                `;
                container.appendChild(referenceDiv);
            }
        }

        return container;
    }

    createAIEvaluationDisplay(aiEvaluation) {
        const container = document.createElement('div');
        container.className = 'ai-evaluation';

        container.innerHTML = `
            <h4>🤖 AI Evaluation Feedback</h4>
            <div class="ai-feedback">${aiEvaluation.feedback}</div>
        `;

        if (aiEvaluation.originalContent) {
            const originalDiv = document.createElement('div');
            originalDiv.className = 'original-content';
            originalDiv.innerHTML = `
                <h4>Original Question/Story:</h4>
                <p>${aiEvaluation.originalContent}</p>
            `;
            container.appendChild(originalDiv);
        }

        if (aiEvaluation.userResponse) {
            const responseDiv = document.createElement('div');
            responseDiv.className = 'user-response';
            responseDiv.innerHTML = `
                <h4>Your Response:</h4>
                <p>${aiEvaluation.userResponse}</p>
            `;
            container.appendChild(responseDiv);
        }

        return container;
    }

    createAnswerComparisonDisplay(answerComparison) {
        const container = document.createElement('div');
        container.className = 'answer-comparison';

        // Add passage text if available (for comprehension)
        if (answerComparison.passageText) {
            const passageDiv = document.createElement('div');
            passageDiv.className = 'passage-text';
            passageDiv.innerHTML = `
                <h4>Reading Passage</h4>
                <p>${answerComparison.passageText}</p>
            `;
            container.appendChild(passageDiv);
        }

        // Add questions and answers
        answerComparison.questions.forEach(question => {
            const questionDiv = document.createElement('div');
            questionDiv.className = `question-result ${question.isCorrect ? 'correct' : 'incorrect'}`;

            // Build options display if available
            let optionsHtml = '';
            if (question.options && Array.isArray(question.options) && question.options.length > 0) {
                optionsHtml = `
                    <div class="question-options">
                        <h5>Answer Choices:</h5>
                        <ul>
                            ${question.options.map((option, index) =>
                    `<li><strong>${String.fromCharCode(65 + index)}:</strong> ${option}</li>`
                ).join('')}
                        </ul>
                    </div>
                `;
            }

            questionDiv.innerHTML = `
                <div class="question-text">Question ${question.questionIndex}: ${question.question}</div>
                ${optionsHtml}
                <div class="answer-comparison-row">
                    <div class="user-answer">
                        <div class="answer-label">Your Answer</div>
                        <div class="answer-text">${question.userAnswer || 'No answer provided'}</div>
                    </div>
                    <div class="correct-answer">
                        <div class="answer-label">Correct Answer</div>
                        <div class="answer-text">${question.correctAnswer}</div>
                    </div>
                </div>
            `;

            container.appendChild(questionDiv);
        });

        return container;
    }

    getScoreClass(score) {
        if (score >= 80) return 'excellent';
        if (score >= 70) return 'good';
        if (score >= 60) return 'fair';
        return 'poor';
    }

    setupTransitionToOverall() {
        const viewOverallBtn = document.getElementById('view-overall-btn');
        viewOverallBtn.addEventListener('click', () => {
            this.showOverallResults();
        });
    }

    async showOverallResults() {
        try {
            this.hideAllSections();
            document.getElementById('final-results').style.display = 'block';

            // Update overall score
            document.getElementById('overall-score').textContent = Math.round(this.scores.overall);

            // Update detailed scores
            this.updateDetailedScores();

            // Animate score bars
            setTimeout(() => {
                this.animateScoreBars();
            }, 500);

            // Show consolidated feedback section and start loading feedback
            setTimeout(() => {
                this.showConsolidatedFeedback();
            }, 1000);

        } catch (error) {
            console.error('Error showing overall results:', error);
            this.showMessage('Error loading overall results. Please try again.', 'error');
        }
    }

    async showConsolidatedFeedback() {
        const feedbackSection = document.getElementById('consolidated-feedback');
        const feedbackContent = document.getElementById('consolidated-feedback-content');

        // Show the feedback section
        feedbackSection.style.display = 'block';

        try {
            // Get consolidated critical feedback from server
            const response = await fetch('/api/assessment/consolidated-feedback');

            if (!response.ok) {
                throw new Error(`Failed to fetch feedback: ${response.status}`);
            }

            const feedbackData = await response.json();

            // Display the critical feedback
            feedbackContent.innerHTML = `
                <div class="critical-feedback">
                    <div class="feedback-text">${feedbackData.feedback.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
                    <div class="feedback-footer">
                        <p><em>This analysis is based on your performance across all ${this.totalSteps} assessment sections.</em></p>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error fetching consolidated feedback:', error);
            feedbackContent.innerHTML = `
                <div class="feedback-error">
                    <p>⚠️ Unable to load consolidated feedback at this time.</p>
                    <p>Your scores have been recorded and are displayed above.</p>
                </div>
            `;
        }
    }

    updateDetailedScores() {
        // Reading score
        document.getElementById('reading-final-score').textContent = Math.round(this.scores.reading);
        document.getElementById('reading-score-bar').style.width = '0%';

        // Listening score
        document.getElementById('listening-final-score').textContent = Math.round(this.scores.listening);
        document.getElementById('listening-score-bar').style.width = '0%';

        // Jumbled score
        document.getElementById('jumbled-final-score').textContent = Math.round(this.scores.jumbled);
        document.getElementById('jumbled-score-bar').style.width = '0%';

        // Story score
        document.getElementById('story-final-score').textContent = Math.round(this.scores.story);
        document.getElementById('story-score-bar').style.width = '0%';

        // Personal score
        document.getElementById('personal-final-score').textContent = Math.round(this.scores.personal);
        document.getElementById('personal-score-bar').style.width = '0%';

        // Comprehension score
        document.getElementById('comprehension-final-score').textContent = Math.round(this.scores.comprehension);
        document.getElementById('comprehension-score-bar').style.width = '0%';

        // Fill Blanks score
        document.getElementById('fillblanks-final-score').textContent = Math.round(this.scores.fillblanks);
        document.getElementById('fillblanks-score-bar').style.width = '0%';
    }

    animateScoreBars() {
        // Animate score bars with delays
        setTimeout(() => {
            document.getElementById('reading-score-bar').style.width = `${this.scores.reading}%`;
        }, 200);

        setTimeout(() => {
            document.getElementById('listening-score-bar').style.width = `${this.scores.listening}%`;
        }, 400);

        setTimeout(() => {
            document.getElementById('jumbled-score-bar').style.width = `${this.scores.jumbled}%`;
        }, 600);

        setTimeout(() => {
            document.getElementById('story-score-bar').style.width = `${this.scores.story}%`;
        }, 800);

        setTimeout(() => {
            document.getElementById('personal-score-bar').style.width = `${this.scores.personal}%`;
        }, 1000);

        setTimeout(() => {
            document.getElementById('comprehension-score-bar').style.width = `${this.scores.comprehension}%`;
        }, 1200);

        setTimeout(() => {
            document.getElementById('fillblanks-score-bar').style.width = `${this.scores.fillblanks}%`;
        }, 1400);
    }

    restartAssessment() {
        // Stop current timer
        this.stopTimer();

        this.currentStep = 0;
        this.completedAssessments = [];
        this.scores = { reading: 0, listening: 0, jumbled: 0, story: 0, personal: 0, comprehension: 0, fillblanks: 0, overall: 0 };

        // Reset timer
        this.timeRemaining = this.timerDuration;

        this.clearSavedState(); // Clear localStorage
        this.resetServerState();
        this.showWelcomeSection();
    }

    async endAssessment() {
        try {
            // Stop timer
            this.stopTimer();

            // Clear the assessment session on server
            await this.clearAssessmentSession();

            // Clear local state
            this.clearSavedState();

            // Show success message
            this.showMessage('Assessment completed successfully! You can start a new assessment anytime.', 'success');

            // Return to welcome section after a short delay
            setTimeout(() => {
                this.showWelcomeSection();
            }, 2000);

        } catch (error) {
            console.error('Error ending assessment:', error);
            this.showMessage('Error ending assessment. Returning to home page.', 'warning');

            // Still return to welcome section even if clearing failed
            setTimeout(() => {
                this.showWelcomeSection();
            }, 2000);
        }
    }

    showMessage(message, type = 'info') {
        // Create message element if it doesn't exist
        let messageDiv = document.getElementById('global-message');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.id = 'global-message';
            messageDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 5px;
                font-weight: 500;
                z-index: 1000;
                min-width: 300px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transition: all 0.3s ease;
            `;
            document.body.appendChild(messageDiv);
        }

        // Set message content and styling based on type
        messageDiv.textContent = message;
        messageDiv.className = `message-${type}`;

        const colors = {
            success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
            warning: { bg: '#fff3cd', border: '#ffeaa7', text: '#856404' },
            error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
            info: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' }
        };

        const color = colors[type] || colors.info;
        messageDiv.style.backgroundColor = color.bg;
        messageDiv.style.borderLeft = `4px solid ${color.border}`;
        messageDiv.style.color = color.text;
        messageDiv.style.display = 'block';
        messageDiv.style.opacity = '1';

        // Auto-hide message after 4 seconds
        setTimeout(() => {
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 300);
        }, 4000);
    }

    // Public method for assessment modules to report completion
    onAssessmentComplete(assessmentType, score) {
        this.markAssessmentComplete(assessmentType, score);
    }

    // Show end of assessment - now redirects to result.html
    showEndOfAssessment() {
        console.log('Assessment completed - redirecting to results page');
        this.showFinalResults();
    }

    // Utility method to get current assessment type
    getCurrentAssessmentType() {
        if (this.currentStep >= this.assessmentSections.length) {
            return null;
        }
        return this.assessmentSections[this.currentStep];
    }

    // Method to check if assessment is completed
    isAssessmentCompleted(assessmentType) {
        return this.completedAssessments.includes(assessmentType);
    }

    // Global cleanup method
    cleanup() {
        // Stop timer first
        this.stopTimer();

        // Cleanup individual assessment modules
        const assessmentModules = [
            'ReadingAssessment',
            'ListeningAssessment',
            'PersonalAssessment',
            'StoryAssessment',
            'JumbledAssessment',
            'ComprehensionAssessment',
            'FillBlanksAssessment'
        ];

        assessmentModules.forEach(moduleName => {
            if (window[moduleName] && typeof window[moduleName].cleanup === 'function') {
                try {
                    window[moduleName].cleanup();
                } catch (error) {
                    console.error(`Error cleaning up ${moduleName}:`, error);
                }
            }
        });

        // Save final state
        this.saveState();
    }

    // Setup page unload handlers
    setupUnloadHandlers() {
        // Save state on page unload
        window.addEventListener('beforeunload', (event) => {
            this.saveState();
            this.cleanup();
        });

        // Save state periodically (every 30 seconds)
        setInterval(() => {
            this.saveState();
        }, 30000);

        // Save state on visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.saveState();
            }
        });
    }
}

// Initialize the assessment controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.assessmentController = new AssessmentController();
    window.assessmentController.setupUnloadHandlers();

    // Initialize submit button and page reload warning
    initializeSubmitButton();
    initializePageReloadWarning();
});

// Submit button functionality
function initializeSubmitButton() {
    const submitBtn = document.getElementById('submit-assessment-btn');
    const dashboardLink = document.getElementById('dashboard-link');

    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showSubmitConfirmation();
        });
    }

    // Show submit button when assessment starts, hide dashboard and purchase links
    window.showSubmitButton = function () {
        const purchaseLink = document.getElementById('purchase-link');
        if (submitBtn && dashboardLink) {
            dashboardLink.style.display = 'none';
            submitBtn.style.display = 'inline-block';
        }
        // Hide purchase link during assessment
        if (purchaseLink) {
            purchaseLink.style.display = 'none';
        }
    };

    // Hide submit button and show dashboard and purchase links (for welcome/setup screens)
    window.hideSubmitButton = function () {
        const purchaseLink = document.getElementById('purchase-link');
        if (submitBtn && dashboardLink) {
            submitBtn.style.display = 'none';
            dashboardLink.style.display = 'inline-block';
        }
        // Show purchase link when not in assessment
        if (purchaseLink) {
            purchaseLink.style.display = 'inline-block';
        }
    };
}

// Submit confirmation dialog
function showSubmitConfirmation() {
    createCustomModal({
        title: 'Submit Assessment',
        message: `
            <div class="modal-warning-content">
                <p><strong>Are you sure you want to submit your assessment?</strong></p>
                <ul class="warning-list">
                    <li>This will end your current assessment immediately</li>
                    <li>You cannot continue or modify your answers after submission</li>
                    <li>Your current progress will be saved and scored</li>
                </ul>
                <p class="modal-note">This action cannot be undone.</p>
            </div>
        `,
        confirmText: 'Submit Assessment',
        cancelText: 'Continue Assessment',
        onConfirm: () => {
            submitAssessment();
        },
        type: 'warning'
    });
}

// Custom modal dialog function
function createCustomModal({ title, message, confirmText, cancelText, onConfirm, onCancel, type = 'info' }) {
    // Remove any existing modal
    const existingModal = document.getElementById('custom-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-modal';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(3px);
        animation: modalFadeIn 0.3s ease;
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 0;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        animation: modalSlideIn 0.3s ease;
        overflow: hidden;
    `;

    // Determine colors based on type (use on-brand palette)
    const typeColors = {
        warning: { bg: 'var(--brand-primary)', text: '#ffffff' },
        info: { bg: 'var(--brand-primary)', text: '#ffffff' },
        error: { bg: 'var(--brand-primary-dark)', text: '#ffffff' }
    };
    const colors = typeColors[type] || typeColors.info;

    modalContent.innerHTML = `
        <div class="modal-header" style="
            background: ${colors.bg};
            color: ${colors.text};
            padding: 20px 24px;
            font-weight: 600;
            font-size: 1.1rem;
        ">
            ${title}
        </div>
        <div class="modal-body" style="
            padding: 24px;
            color: #333;
            line-height: 1.6;
        ">
            ${message}
        </div>
        <div class="modal-footer" style="
            padding: 20px 24px;
            background: #f8f9fa;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        ">
            <button id="modal-cancel" style="
                padding: 10px 20px;
                border: 1px solid #6c757d;
                background: white;
                color: #6c757d;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s ease;
            ">${cancelText}</button>
            <button id="modal-confirm" style="
                padding: 10px 20px;
                border: 1px solid ${colors.bg};
                background: ${colors.bg};
                color: white;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s ease;
            ">${confirmText}</button>
        </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes modalSlideIn {
            from { transform: translateY(-50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .modal-warning-content .warning-list {
            margin: 16px 0;
            padding-left: 20px;
        }
        .modal-warning-content .warning-list li {
            margin: 8px 0;
            color: #555;
        }
        .modal-warning-content .modal-note {
            margin-top: 16px;
            font-style: italic;
            color: #666;
            font-size: 0.9rem;
        }
        #modal-cancel:hover {
            background: #f8f9fa;
            border-color: #5a6268;
        }
        #modal-confirm:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }
    `;
    document.head.appendChild(style);

    // Event listeners
    document.getElementById('modal-cancel').addEventListener('click', () => {
        modalOverlay.remove();
        if (onCancel) onCancel();
    });

    document.getElementById('modal-confirm').addEventListener('click', () => {
        modalOverlay.remove();
        if (onConfirm) onConfirm();
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.remove();
            if (onCancel) onCancel();
        }
    });

    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modalOverlay.remove();
            document.removeEventListener('keydown', handleEscape);
            if (onCancel) onCancel();
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Submit assessment function
async function submitAssessment() {
    try {
        // Show loading message
        if (window.assessmentController && window.assessmentController.showMessage) {
            window.assessmentController.showMessage('Submitting assessment...', 'info');
        }

        // Stop the timer
        if (window.assessmentController && window.assessmentController.stopTimer) {
            window.assessmentController.stopTimer();
        }

        // Save current state
        if (window.assessmentController && window.assessmentController.saveState) {
            window.assessmentController.saveState();
        }

        // Reset unattempted sections to 0 in database
        try {
            const response = await fetch('/api/assessment/force-submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reason: 'manual_submit',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                console.warn('Failed to reset unattempted sections:', response.statusText);
            } else {
                const result = await response.json();
                console.log('Assessment submitted and unattempted sections reset:', result.message);
            }
        } catch (error) {
            console.warn('Error resetting unattempted sections:', error);
            // Continue with submission even if reset fails
        }

        // Redirect to results
        setTimeout(() => {
            window.location.href = 'result.html';
        }, 1000);

    } catch (error) {
        console.error('Error submitting assessment:', error);
        alert('Error submitting assessment. Please try again.');
    }
}

// Page reload warning functionality
function initializePageReloadWarning() {
    let assessmentInProgress = false;

    // Track when assessment starts
    window.setAssessmentInProgress = function (inProgress) {
        assessmentInProgress = inProgress;
    };

    // Handle page reload/navigation attempts with simple browser warning
    window.addEventListener('beforeunload', (e) => {
        if (assessmentInProgress) {
            // Use browser's default warning dialog
            const message = 'Are you sure you want to leave? Changes may not be saved.';
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    });

    // Handle actual page unload (when user confirms reload/navigation)
    window.addEventListener('unload', () => {
        if (assessmentInProgress) {
            // Force submit the assessment when user actually leaves
            navigator.sendBeacon('/api/assessment/force-submit', JSON.stringify({
                reason: 'page_reload_or_navigation',
                timestamp: Date.now()
            }));
        }
    });
} 