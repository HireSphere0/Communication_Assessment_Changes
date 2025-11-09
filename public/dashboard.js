// Dashboard Controller
class DashboardController {
    constructor() {
        this.userInfo = null;
        this.initializeEventListeners();
        this.loadUserData();
    }

    initializeEventListeners() {
        // Logout functionality
        document.getElementById('logout-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });
    }

    async loadUserData() {
        try {
            // Load user information
            await this.loadUserInfo();

            // Load assessment scores
            await this.loadAssessmentScores();

            // Load activity metrics
            await this.loadActivityMetrics();

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showMessage('Error loading dashboard data. Please refresh the page.', 'error');
        }
    }

    async loadUserInfo() {
        let retryCount = 0;
        const maxRetries = 3;

        const attemptLoad = async () => {
            try {
                const response = await fetch('/api/auth/me', {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });

                if (response.status === 401) {
                    // Authentication failed, redirect to login
                    window.location.href = '/login?message=Session%20expired.%20Please%20log%20in%20again&type=warning';
                    return;
                }

                if (response.status === 429) {
                    // Rate limited, retry
                    console.log('Rate limited, will retry');
                    throw new Error('Rate limited');
                }

                if (response.status === 503) {
                    // Service unavailable, retry
                    console.log('Service unavailable, will retry');
                    throw new Error('Service temporarily unavailable');
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`HTTP error: ${response.status} - ${errorText}`);
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const userData = await response.json();
                this.userInfo = userData;

                // Hide loading and show user info
                document.getElementById('user-info-loading').style.display = 'none';
                document.getElementById('user-info').style.display = 'block';

                // Populate user information
                document.getElementById('user-email').textContent = userData.email;
                document.getElementById('user-username').textContent = userData.username;
                document.getElementById('user-created').textContent = this.formatDate(userData.createdAt);
                document.getElementById('user-last-login').textContent = userData.lastLoginAt ? this.formatDate(userData.lastLoginAt) : 'Never';

                // Update test count
                this.updateTestCount(userData.number_of_tests);

            } catch (error) {
                console.error(`Error loading user info (attempt ${retryCount + 1}):`, error);

                if (retryCount < maxRetries && (error.message.includes('Service temporarily unavailable') || error.message.includes('Failed to fetch') || error.message.includes('Rate limited'))) {
                    retryCount++;
                    console.log(`Retrying in ${retryCount * 1000}ms...`);
                    setTimeout(attemptLoad, retryCount * 1000);
                    return;
                }

                // Final failure
                document.getElementById('user-info-loading').innerHTML = `
                    <div class="error-message">
                        <p>⚠️ Failed to load user information</p>
                        <button onclick="location.reload()" class="btn btn-secondary" style="margin-top: 10px;">
                            Retry
                        </button>
                    </div>
                `;
            }
        };

        await attemptLoad();
    }

    async loadAssessmentScores() {
        try {
            const response = await fetch('/api/assessment/scores');
            if (!response.ok) {
                throw new Error('Failed to load assessment scores');
            }

            const scoresData = await response.json();

            // Hide loading and show scores
            document.getElementById('scores-loading').style.display = 'none';
            document.getElementById('scores-display').style.display = 'block';

            // Update score displays
            this.updateScoreDisplay('overall', scoresData.overallScore || 0);
            this.updateScoreDisplay('reading', scoresData.readingAbility || 0);
            this.updateScoreDisplay('listening', scoresData.listeningAbility || 0);
            this.updateScoreDisplay('jumbled', scoresData.jumbledSentences || 0);
            this.updateScoreDisplay('story', scoresData.storySummarization || 0);
            this.updateScoreDisplay('personal', scoresData.personalQuestions || 0);
            this.updateScoreDisplay('comprehension', scoresData.readingComprehension || 0);
            this.updateScoreDisplay('fillblanks', scoresData.fillInTheBlanks || 0);

        } catch (error) {
            console.error('Error loading assessment scores:', error);
            document.getElementById('scores-loading').innerHTML = `
                <div class="error-message">
                    <p>⚠️ Failed to load assessment scores</p>
                </div>
            `;
        }
    }

    async loadActivityMetrics() {
        try {
            // Use the user data we already have from loadUserInfo
            if (!this.userInfo) {
                throw new Error('User data not available');
            }

            // Load test completion history
            this.loadTestHistory(this.userInfo.tests_timestamps || []);

        } catch (error) {
            console.error('Error loading activity metrics:', error);
            document.getElementById('tests-loading').innerHTML = `
                <div class="error-message">
                    <p>⚠️ Failed to load test history</p>
                </div>
            `;
        }
    }

    loadTestHistory(testsTimestamps) {
        // Hide loading and show content
        document.getElementById('tests-loading').style.display = 'none';
        document.getElementById('tests-history').style.display = 'block';

        // Update summary
        const testsCount = testsTimestamps.length;
        document.getElementById('tests-summary').innerHTML = `
            <span class="metric-count">${testsCount}</span>
            <span class="metric-label">Tests Completed</span>
        `;

        // Update test list
        const testsList = document.getElementById('tests-list');
        if (testsCount === 0) {
            testsList.innerHTML = `
                <div class="metric-item empty">
                    <p>No tests completed yet</p>
                </div>
            `;
        } else {
            // Sort by timestamp (most recent first)
            const sortedTests = [...testsTimestamps].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            testsList.innerHTML = sortedTests.map(test => `
                <div class="metric-item">
                    <div class="metric-item-content">
                        <span class="metric-item-title">Test #${test.testNumber}</span>
                        <span class="metric-item-date">${this.formatDate(test.timestamp)}</span>
                    </div>
                </div>
            `).join('');
        }
    }


    updateTestCount(testCount) {
        const testCountElement = document.getElementById('test-count');
        const testStatusMessage = document.getElementById('test-status-message');
        const testActions = document.getElementById('test-actions');
        const takeTestBtn = document.getElementById('take-test-btn');

        if (testCountElement) {
            testCountElement.textContent = testCount;
        }

        if (testStatusMessage) {
            if (testCount > 0) {
                testStatusMessage.textContent = `You have ${testCount} assessment${testCount === 1 ? '' : 's'} available`;
                testStatusMessage.style.color = 'var(--brand-ink)';

                if (testActions) {
                    testActions.style.display = 'block';
                }

                if (takeTestBtn) {
                    takeTestBtn.classList.remove('btn-disabled');
                    takeTestBtn.style.pointerEvents = 'auto';
                }
            } else {
                testStatusMessage.textContent = 'You currently have no assessments available. Please contact your administrator to request additional tests.';
                testStatusMessage.style.color = '#c62828';

                if (testActions) {
                    testActions.style.display = 'none';
                }
            }
        }
    }

    updateScoreDisplay(type, score) {
        const scoreElement = document.getElementById(`${type}-score`);
        const scoreBarElement = document.getElementById(`${type}-score-bar`);

        if (scoreElement) {
            scoreElement.textContent = Math.round(score);
        }

        if (scoreBarElement) {
            // Animate the score bar
            setTimeout(() => {
                scoreBarElement.style.width = `${score}%`;
            }, 100);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Clear any local storage
                localStorage.removeItem('assessmentProgress');

                // Redirect to home page
                window.location.href = '/';
            } else {
                throw new Error('Logout failed');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showMessage('Logout failed. Please try again.', 'error');
        }
    }

    showMessage(message, type) {
        const messageContainer = document.getElementById('message-container');
        const messageElement = document.getElementById('message');

        if (messageContainer && messageElement) {
            messageElement.textContent = message;
            messageElement.className = `message ${type}`;
            messageContainer.style.display = 'block';

            // Auto-hide after 5 seconds
            setTimeout(() => {
                messageContainer.style.display = 'none';
            }, 5000);
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
});