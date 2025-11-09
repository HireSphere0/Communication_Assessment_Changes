// Reading Comprehension Assessment Module

class ComprehensionAssessment {
    constructor() {
        this.currentPassage = '';
        this.currentQuestions = [];
        this.userAnswers = [];
        this.currentQuestionIndex = 0;
        this.isInitialized = false;
        this.topic = 'technology';
        this.difficulty = 'intermediate';
        
        // Random selection arrays
        this.topics = [
            'science',
            'history',
            'technology',
            'literature',
            'geography',
            'psychology',
            'economics',
            'space exploration',
            'artificial intelligence'
        ];
        this.difficulties = ['beginner', 'intermediate', 'advanced'];
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('comprehension-loading'),
            setup: document.getElementById('comprehension-setup'),
            quiz: document.getElementById('comprehension-quiz'),
            passage: document.getElementById('comprehension-passage'),
            questionPrompt: document.getElementById('comprehension-question-prompt'),
            topicBadge: document.getElementById('comprehension-topic-badge'),
            difficultyBadge: document.getElementById('comprehension-difficulty-badge'),
            questionsSection: document.getElementById('comprehension-questions-section'),
            questionDisplay: document.getElementById('comprehension-question-display'),
            currentQ: document.getElementById('comprehension-current-q'),
            totalQ: document.getElementById('comprehension-total-q'),
            prevBtn: document.getElementById('comprehension-prev-btn'),
            nextBtn: document.getElementById('comprehension-next-btn'),
            submitBtn: document.getElementById('comprehension-submit-btn'),
            results: document.getElementById('comprehension-results'),
            score: document.getElementById('comprehension-score'),
            feedback: document.getElementById('comprehension-feedback')
        };
    }

    initializeEventListeners() {
        if (this.elements.prevBtn) {
            this.elements.prevBtn.addEventListener('click', () => this.previousQuestion());
        }
        
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', () => this.nextQuestion());
        }

        if (this.elements.submitBtn) {
            this.elements.submitBtn.addEventListener('click', () => this.submitQuiz());
        }
    }

    // Helper method to randomly select from array
    getRandomSelection(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        this.resetUI();
        this.showSetup();
        
        // Auto-generate content with random selection
        setTimeout(() => this.generateContent(), 500);
        
        this.isInitialized = true;
    }

    resetUI() {
        // Show loading initially
        this.elements.loading.style.display = 'block';
        this.elements.setup.style.display = 'none';
        this.elements.quiz.style.display = 'none';
        this.elements.results.style.display = 'none';
        
        // Reset state
        this.currentPassage = '';
        this.currentQuestions = [];
        this.userAnswers = [];
        this.currentQuestionIndex = 0;
    }

    showSetup() {
        this.elements.loading.style.display = 'none';
        this.elements.setup.style.display = 'block';
    }

    async generateContent() {
        try {
            this.elements.setup.style.display = 'none';
            this.elements.loading.style.display = 'block';

            // Use pre-generated questions instead of generating new ones
            if (window.assessmentController && window.assessmentController.preGeneratedQuestions.comprehension) {
                const data = window.assessmentController.preGeneratedQuestions.comprehension;
                console.log('Using pre-generated comprehension content');
                
                if (data.success && data.passage && data.questions) {
                    this.currentPassage = data.passage;
                    this.currentQuestions = data.questions;
                    this.userAnswers = new Array(data.questions.length).fill(null);
                    // Set topic and difficulty from pre-generated data or use defaults
                    this.topic = data.topic || 'Technology';
                    this.difficulty = data.difficulty || 'Intermediate';
                    
                    console.log(`Reading comprehension assessment selected topic: ${this.topic}, difficulty: ${this.difficulty}`);
                    this.displayContent();
                } else {
                    throw new Error('Failed to load pre-generated reading comprehension content');
                }
            } else {
                // Fallback to generating content if pre-generation failed
                // Randomly select topic and difficulty
                this.topic = this.getRandomSelection(this.topics);
                this.difficulty = this.getRandomSelection(this.difficulties);
                
                console.log(`Reading comprehension assessment selected topic: ${this.topic}, difficulty: ${this.difficulty}`);
                console.log('Generating reading comprehension content with random selection...', { topic: this.topic, difficulty: this.difficulty });

                const response = await fetch('/api/comprehension/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        topic: this.topic,
                        difficulty: this.difficulty
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.success && data.passage && data.questions) {
                    this.currentPassage = data.passage;
                    this.currentQuestions = data.questions;
                    this.userAnswers = new Array(data.questions.length).fill(null);
                    this.displayContent();
                } else {
                    throw new Error('Failed to generate reading comprehension content');
                }
            }
            
        } catch (error) {
            console.error('Error loading reading comprehension content:', error);
            this.showError('Failed to load reading comprehension content. Please try again.');
        }
    }

    displayContent() {
        this.elements.loading.style.display = 'none';
        this.elements.quiz.style.display = 'block';
        
        // Set topic and difficulty badges
        this.elements.topicBadge.textContent = this.topic;
        this.elements.difficultyBadge.textContent = this.difficulty;
        
        // Display passage
        this.elements.passage.textContent = this.currentPassage;
        
        // Setup questions
        this.elements.totalQ.textContent = this.currentQuestions.length;
        this.currentQuestionIndex = 0;
        
        this.displayQuestion();
        
        console.log('Reading comprehension content displayed');
        console.log('Passage length:', this.currentPassage.length, 'words');
        console.log('Number of questions:', this.currentQuestions.length);
    }

    displayQuestion() {
        if (!this.currentQuestions || this.currentQuestions.length === 0) return;

        const question = this.currentQuestions[this.currentQuestionIndex];
        this.elements.currentQ.textContent = this.currentQuestionIndex + 1;

        // Render the question prompt in the right column, above the options
        if (this.elements.questionPrompt) {
            this.elements.questionPrompt.textContent = question.question;
        }

        // Build only the options for the right column
        let optionsHtml = `<div class="options-container">`;

        // Display options
        Object.entries(question.options).forEach(([key, value]) => {
            const isSelected = this.userAnswers[this.currentQuestionIndex] === key;
            optionsHtml += `
                <label class="option-label ${isSelected ? 'selected' : ''}">
                    <input type="radio" name="comprehension-q${this.currentQuestionIndex}" 
                           value="${key}" ${isSelected ? 'checked' : ''}
                           onchange="window.ComprehensionAssessment.saveAnswer('${key}')">
                    <span class="option-key">${key}.</span>
                    <span class="option-text">${value}</span>
                </label>
            `;
        });

        optionsHtml += `</div>`;

        this.elements.questionDisplay.innerHTML = optionsHtml;
        this.updateNavigation();
        // Update global question indicator
        if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
            window.assessmentController.updateNavigation();
        }
    }

    saveAnswer(answer) {
        this.userAnswers[this.currentQuestionIndex] = answer;
        
        // Update visual selection
        const labels = this.elements.questionDisplay.querySelectorAll('.option-label');
        labels.forEach(label => {
            label.classList.remove('selected');
            const input = label.querySelector('input[type="radio"]');
            if (input.value === answer) {
                label.classList.add('selected');
            }
        });
        
        console.log(`Question ${this.currentQuestionIndex + 1} answered:`, answer);
    }

    updateNavigation() {
        // Update navigation buttons
        this.elements.prevBtn.disabled = this.currentQuestionIndex === 0;
        this.elements.nextBtn.style.display = this.currentQuestionIndex < this.currentQuestions.length - 1 ? 'inline-block' : 'none';
        this.elements.submitBtn.style.display = this.currentQuestionIndex === this.currentQuestions.length - 1 ? 'inline-block' : 'none';
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.displayQuestion();
        }
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.currentQuestions.length - 1) {
            this.currentQuestionIndex++;
            this.displayQuestion();
            if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
                window.assessmentController.updateNavigation();
            }
        }
    }

    async submitQuiz() {
        try {
            console.log('Submitting reading comprehension quiz...', this.userAnswers);
            
            // Check if all questions are answered
            const unanswered = this.userAnswers.filter(answer => answer === null).length;
            if (unanswered > 0) {
                const confirm = window.confirm(`You have ${unanswered} unanswered questions. Submit anyway?`);
                if (!confirm) return;
            }

            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.textContent = 'Evaluating...';

            const response = await fetch('/api/comprehension/evaluate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userAnswers: this.userAnswers
                })
            });

            if (!response.ok) {
                throw new Error(`Evaluation failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('Reading comprehension result:', result);
            
            this.displayResults(result);
            
        } catch (error) {
            console.error('Error submitting quiz:', error);
            this.showError('Failed to evaluate quiz. Please try again.');
        } finally {
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.textContent = 'Submit Quiz';
        }
    }

    displayResults(result) {
        // Hide quiz and clear content to avoid stops
        this.elements.quiz.style.display = 'none';
        
        // Store results for final display but don't show individual results
        // Results section remains hidden
        
        // Notify main controller that assessment is complete and auto-advance
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('comprehension', result.score);
            // Auto-advance to next section after a brief delay
            setTimeout(() => {
                window.assessmentController.nextStep();
            }, 500);
        }

        console.log('Comprehension assessment completed - results stored for final analysis');
    }

    colorCodeScore(score) {
        const scoreElement = this.elements.score;
        
        // Remove existing color classes
        scoreElement.classList.remove('score-excellent', 'score-good', 'score-fair', 'score-poor');
        
        // Add appropriate color class
        if (score >= 80) {
            scoreElement.classList.add('score-excellent');
            scoreElement.style.color = '#28a745';
        } else if (score >= 60) {
            scoreElement.classList.add('score-good');
            scoreElement.style.color = '#ffc107';
        } else if (score >= 40) {
            scoreElement.classList.add('score-fair');
            scoreElement.style.color = '#fd7e14';
        } else {
            scoreElement.classList.add('score-poor');
            scoreElement.style.color = '#dc3545';
        }
    }

    showError(message) {
        this.elements.loading.style.display = 'none';
        this.elements.setup.style.display = 'block';
        alert(`❌ ${message}`);
    }

    // Reset the assessment for retrying
    reset() {
        this.isInitialized = false;
        this.currentPassage = '';
        this.currentQuestions = [];
        this.userAnswers = [];
        this.currentQuestionIndex = 0;
    }
}

// Initialize the reading comprehension assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ComprehensionAssessment = new ComprehensionAssessment();
}); 