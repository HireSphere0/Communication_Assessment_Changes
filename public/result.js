// Result Page Controller
class ResultController {
    constructor() {
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
        this.completedAssessments = [];

        this.initializeEventListeners();
        this.loadSavedState();
    }

    initializeEventListeners() {
        // End Assessment Button
        const endBtn = document.getElementById('end-assessment-btn');
        if (endBtn) {
            endBtn.addEventListener('click', () => {
                this.endAssessment();
            });
        }

        // Restart Button
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.restartAssessment();
            });
        }


        // View Results Button (from end of assessment section)
        const viewResultsBtn = document.getElementById('view-results-btn');
        if (viewResultsBtn) {
            viewResultsBtn.addEventListener('click', () => {
                this.showIndividualResults();
            });
        }

        // View Overall Button
        const viewOverallBtn = document.getElementById('view-overall-btn');
        if (viewOverallBtn) {
            viewOverallBtn.addEventListener('click', () => {
                this.showOverallResults();
            });
        }

        // Back to Home Button
        const backToHomeBtn = document.getElementById('back-to-home-btn');
        if (backToHomeBtn) {
            backToHomeBtn.addEventListener('click', () => {
                window.location.href = 'assessment.html';
            });
        }
    }

    loadSavedState() {
        try {
            const savedState = localStorage.getItem('assessmentProgress');
            if (savedState) {
                const state = JSON.parse(savedState);
                this.scores = { ...this.scores, ...(state.scores || {}) };
                this.completedAssessments = state.completedAssessments || [];
            }
        } catch (error) {
            console.error('Error loading saved state:', error);
        }
    }

    async showFinalResults() {
        try {
            // Show the end of assessment section first
            this.hideAllResultSections();
            document.getElementById('end-assessment-section').style.display = 'block';

        } catch (error) {
            console.error('Error showing final results:', error);
            this.showMessage('Error loading results. Please try again.', 'error');
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
            this.hideAllResultSections();
            document.getElementById('individual-results').style.display = 'block';

            // Scroll to top of the page to show results from the beginning
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Render individual section results
            this.renderIndividualSections(detailedData);

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

    hideAllResultSections() {
        document.getElementById('end-assessment-section').style.display = 'none';
        document.getElementById('individual-results').style.display = 'none';
        document.getElementById('final-results').style.display = 'none';
    }

    renderIndividualSections(detailedData) {
        const sectionsContainer = document.getElementById('individual-sections');
        sectionsContainer.innerHTML = '';

        // Define section order and names (match assessment flow)
        const sectionOrder = ['reading', 'listening', 'jumbled', 'story', 'personal', 'comprehension', 'fillblanks'];
        const sectionNames = {
            reading: 'Reading Ability Assessment',
            listening: 'Listening Ability Assessment',
            personal: 'Personal Questions Assessment',
            story: 'Story Summarization Assessment',
            jumbled: 'Jumbled Sentences Assessment',
            comprehension: 'Reading Comprehension Assessment',
            fillblanks: 'Fill in the Blanks Assessment'
        };

        // Show summary of completed vs total assessments
        const completedCount = this.completedAssessments.length;
        const totalCount = 7; // Total assessments

        if (completedCount < totalCount) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'assessment-completion-summary';
            summaryDiv.innerHTML = `
                <div class="completion-info">
                    <h3>Assessment Completion Summary</h3>
                    <p>You completed <strong>${completedCount} out of ${totalCount}</strong> assessments before submitting.</p>
                    <p>Below are the results for the assessments you completed:</p>
                </div>
            `;
            sectionsContainer.appendChild(summaryDiv);
        }

        // Render all sections; show results for completed, placeholder for not attempted
        sectionOrder.forEach(sectionType => {
            const sectionData = detailedData[sectionType];
            if (this.completedAssessments.includes(sectionType) && sectionData) {
                const sectionElement = this.createSectionResultElement(sectionType, sectionNames[sectionType], sectionData);
                sectionsContainer.appendChild(sectionElement);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'section-result section-result-placeholder';
                placeholder.innerHTML = `
                    <div class="section-result-header">
                        <h3>${sectionNames[sectionType]}</h3>
                        <div class="section-result-score">--</div>
                    </div>
                    <div class="section-result-body">
                        <div class="not-attempted">Not attempted in this session</div>
                    </div>
                `;
                sectionsContainer.appendChild(placeholder);
            }
        });

        // Show message if no assessments were completed
        if (completedCount === 0) {
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'no-results-message';
            noResultsDiv.innerHTML = `
                <div class="no-results-content">
                    <h3>⏰ Test Submitted</h3>
                    <p>Unfortunately, test was submitted before any assessments could be completed.</p>
                    <p>You can start a new assessment to try again.</p>
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
        const isSpeakingRound = (sectionType === 'reading' || sectionType === 'listening' || sectionType === 'personal' || sectionType === 'story');
        if (isSpeakingRound && sectionData.pronunciationData) {
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
            // Limit to current session's items (assume latest set up to 5 entries)
            const sentences = pronunciationData.sentences.slice(-5);
            const sentencesDiv = document.createElement('div');
            sentencesDiv.className = 'individual-sentences';
            sentencesDiv.innerHTML = '<h4>Individual Sentence Results</h4>';

            sentences.forEach((sentence, index) => {
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
            <h4>AI Evaluation Feedback</h4>
            <div class="ai-feedback">${aiEvaluation.feedback}</div>
        `;

        if (aiEvaluation.originalContent) {
            const originalDiv = document.createElement('div');
            originalDiv.className = 'original-content';
            originalDiv.innerHTML = `
                <h4>Original Question/Story</h4>
                <p>${aiEvaluation.originalContent}</p>
            `;
            container.appendChild(originalDiv);
        }

        if (aiEvaluation.userResponse) {
            const responseDiv = document.createElement('div');
            responseDiv.className = 'user-response';
            responseDiv.innerHTML = `
                <h4>Your Response</h4>
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

    async showOverallResults() {
        try {
            this.hideAllResultSections();
            document.getElementById('final-results').style.display = 'block';

            // Scroll to top of the page to show results from the beginning
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Recalculate overall score to ensure it's accurate
            this.calculateOverallScore();

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
                        <p><em>This analysis is based on your performance across all 7 assessment sections.</em></p>
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
        document.getElementById('reading-score-bar').style.width = `${this.scores.reading}%`;

        // Listening score
        document.getElementById('listening-final-score').textContent = Math.round(this.scores.listening);
        document.getElementById('listening-score-bar').style.width = `${this.scores.listening}%`;

        // Jumbled score
        document.getElementById('jumbled-final-score').textContent = Math.round(this.scores.jumbled);
        document.getElementById('jumbled-score-bar').style.width = `${this.scores.jumbled}%`;

        // Story score
        document.getElementById('story-final-score').textContent = Math.round(this.scores.story);
        document.getElementById('story-score-bar').style.width = `${this.scores.story}%`;

        // Personal score
        document.getElementById('personal-final-score').textContent = Math.round(this.scores.personal);
        document.getElementById('personal-score-bar').style.width = `${this.scores.personal}%`;

        // Comprehension score
        document.getElementById('comprehension-final-score').textContent = Math.round(this.scores.comprehension);
        document.getElementById('comprehension-score-bar').style.width = `${this.scores.comprehension}%`;

        // Fill Blanks score
        document.getElementById('fillblanks-final-score').textContent = Math.round(this.scores.fillblanks);
        document.getElementById('fillblanks-score-bar').style.width = `${this.scores.fillblanks}%`;
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
        localStorage.removeItem('assessmentProgress');

        // Clear server state
        fetch('/api/assessment/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(() => {
            window.location.href = 'assessment.html';
        }).catch(() => {
            // Even if server reset fails, redirect to assessment
            window.location.href = 'assessment.html';
        });
    }

    async endAssessment() {
        try {
            // Clear the assessment session on server
            await fetch('/api/assessment/clear-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            // Clear local state
            localStorage.removeItem('assessmentProgress');

            // Show success message
            this.showMessage('Assessment completed successfully! Redirecting to home...', 'success');

            // Return to assessment page after a short delay
            setTimeout(() => {
                window.location.href = 'assessment.html';
            }, 2000);

        } catch (error) {
            console.error('Error ending assessment:', error);
            this.showMessage('Error ending assessment. Returning to home page.', 'warning');

            // Still return to assessment even if clearing failed
            setTimeout(() => {
                window.location.href = 'assessment.html';
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
}