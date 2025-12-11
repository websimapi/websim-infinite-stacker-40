export class UIManager {
    constructor() {
        this.scoreElement = document.getElementById('score');
        this.instructionsElement = document.getElementById('instructions');
        this.gameOverElement = document.getElementById('game-over');
        this.finalScoreElement = document.getElementById('final-score');
        this.restartButton = document.getElementById('restart-button');
        this.replayButton = document.getElementById('replay-button');
        this.replayViewer = document.getElementById('replay-viewer');
        this.replayVideo = document.getElementById('replay-video');
        this.closeReplayButton = document.getElementById('close-replay');
        this.downloadReplayButton = document.getElementById('download-replay');
        this.replayControlsElement = document.getElementById('replay-controls');
        this.submitStatusElement = document.getElementById('submit-status');
        this.leaderboardButton = document.getElementById('leaderboard-button');
        this.leaderboardElement = document.getElementById('leaderboard');
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.closeLeaderboardButton = document.getElementById('close-leaderboard');
        this.perfectStreakElement = document.getElementById('perfect-streak');
        this.perfectStreakSpan = this.perfectStreakElement.querySelector('span');
        this.prevPageButton = document.getElementById('prev-page');
        this.nextPageButton = document.getElementById('next-page');
        this.pageInfoElement = document.getElementById('page-info');

        this.currentReplayBlob = null;
        this.streakTimeout = null;
        this.submitStatusInterval = null;
        this.currentPage = 0;
        this.itemsPerPage = 10;
        this.allScores = [];
        this.onViewReplayCallback = null;
    }

    setupEventListeners({ onPointerDown, onRestart, onViewReplay, onWindowResize, onViewLeaderboard, onCloseLeaderboard }) {
        window.addEventListener('pointerdown', onPointerDown);
        this.restartButton.addEventListener('click', onRestart);
        this.replayButton.addEventListener('click', onViewReplay);
        this.closeReplayButton.addEventListener('click', () => this.hideReplayViewer());
        this.downloadReplayButton.addEventListener('click', () => this.downloadReplay());
        this.leaderboardButton.addEventListener('click', onViewLeaderboard);
        this.closeLeaderboardButton.addEventListener('click', onCloseLeaderboard);
        this.prevPageButton.addEventListener('click', () => this.changePage(-1));
        this.nextPageButton.addEventListener('click', () => this.changePage(1));
        window.addEventListener('resize', onWindowResize, false);

        this.globalScoresTab = document.getElementById('global-scores-tab');
        this.myScoresTab = document.getElementById('my-scores-tab');

        this.globalScoresTab.addEventListener('click', () => {
            this.setActiveTab('global');
            this.renderCurrentPage();
        });

        this.myScoresTab.addEventListener('click', () => {
            this.setActiveTab('my-scores');
            this.renderCurrentPage();
        });
    }

    setActiveTab(tab) {
        this.activeTab = tab;
        this.currentPage = 0;
        if (tab === 'global') {
            this.globalScoresTab.classList.add('active');
            this.myScoresTab.classList.remove('active');
        } else {
            this.globalScoresTab.classList.remove('active');
            this.myScoresTab.classList.add('active');
        }
    }

    updateStreak(count, isGolden, isPerfectHit) {
        clearTimeout(this.streakTimeout);
        this.perfectStreakElement.classList.remove('visible');

        if (!isPerfectHit) {
            return;
        }

        if (isGolden) {
            this.perfectStreakElement.innerHTML = `GOLDEN! <span>${count}</span>`;
            setTimeout(() => this.perfectStreakElement.classList.add('visible'), 50);
            this.streakTimeout = setTimeout(() => this.perfectStreakElement.classList.remove('visible'), 1500);
        } else if (count > 0) {
            this.perfectStreakElement.innerHTML = `Perfect! <span>${count}</span>`;
            setTimeout(() => this.perfectStreakElement.classList.add('visible'), 50);
            this.streakTimeout = setTimeout(() => this.perfectStreakElement.classList.remove('visible'), 1500);
        }
    }

    updateScore(score) {
        this.scoreElement.innerText = score;
    }

    showInstructions(visible) {
        if (visible) {
            this.instructionsElement.classList.remove('hidden');
        } else {
            this.instructionsElement.classList.add('hidden');
        }
    }

    showGameOver(score) {
        this.finalScoreElement.innerText = score;
        this.gameOverElement.classList.remove('hidden');
        this.replayControlsElement.classList.remove('hidden');
        this.setSubmitStatus('Submitting score', 'white');
        this.currentReplayBlob = null; // Reset blob on new game over screen
    }

    hideGameOver() {
        this.gameOverElement.classList.add('hidden');
        this.replayControlsElement.classList.add('hidden');
        this.updateScore(0);
        this.showInstructions(true);
    }

    showReplayViewer(blobOrUrl) {
        let url;
        if (blobOrUrl instanceof Blob) {
            this.currentReplayBlob = blobOrUrl;
            url = URL.createObjectURL(blobOrUrl);
        } else {
            url = blobOrUrl;
            this.currentReplayBlob = null;
            this.downloadReplayButton.style.display = 'none';
        }

        this.replayVideo.src = url;
        this.gameOverElement.classList.add('hidden');
        this.hideLeaderboard();
        this.replayViewer.classList.remove('hidden');
    }

    hideReplayViewer() {
        this.replayViewer.classList.add('hidden');
        this.gameOverElement.classList.remove('hidden');
        if (this.replayVideo.src && this.currentReplayBlob) {
            URL.revokeObjectURL(this.replayVideo.src);
        }
        this.replayVideo.src = '';
        this.downloadReplayButton.style.display = 'inline-block';
    }
    
    downloadReplay() {
        if (!this.currentReplayBlob) return;
        
        const url = URL.createObjectURL(this.currentReplayBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stacker-replay-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    setReplayButtonState(disabled, text, blob = null) {
        this.replayButton.disabled = disabled;
        this.replayButton.textContent = text;
        if (blob) {
            this.currentReplayBlob = blob;
        }
    }

    getCurrentReplayBlob() {
        return this.currentReplayBlob;
    }

    setSubmitStatus(text, color = 'white') {
        if (this.submitStatusInterval) {
            clearInterval(this.submitStatusInterval);
            this.submitStatusInterval = null;
        }

        if (this.submitStatusElement) {
            this.submitStatusElement.textContent = text;
            this.submitStatusElement.style.color = color;

            if (text.startsWith('Submitting score')) {
                let dots = 0;
                const baseText = 'Submitting score';
                this.submitStatusElement.textContent = baseText; // Set initial text

                this.submitStatusInterval = setInterval(() => {
                    dots = (dots + 1) % 4;
                    this.submitStatusElement.textContent = baseText + '.'.repeat(dots);
                }, 500);
            }
        }
    }

    showLeaderboard() {
        this.currentPage = 0;
        this.leaderboardElement.classList.remove('hidden');
        this.gameOverElement.classList.add('hidden');
        this.setActiveTab('global');
        this.renderCurrentPage();
    }

    hideLeaderboard() {
        this.leaderboardElement.classList.add('hidden');
    }

    updateLeaderboard(scores, onViewReplayCallback, userProfile = null) {
        this.allScores = scores;
        this.userProfile = userProfile;
        this.onViewReplayCallback = onViewReplayCallback;
        // Don't reset current page, let it be controlled by tab switching or showLeaderboard
        // this.currentPage = 0; 
        this.renderCurrentPage();
    }

    changePage(delta) {
        const scores = this.activeTab === 'my-scores' && this.userProfile ? (this.userProfile.scores || []) : this.allScores;
        const totalPages = Math.ceil(scores.length / this.itemsPerPage);
        this.currentPage = Math.max(0, Math.min(totalPages - 1, this.currentPage + delta));
        this.renderCurrentPage();
    }

    renderCurrentPage() {
        if (this.activeTab === 'my-scores') {
            this.renderMyScoresPage();
        } else {
            this.renderGlobalPage();
        }
    }

    renderGlobalPage() {
        const totalPages = Math.ceil(this.allScores.length / this.itemsPerPage);
        const startIndex = this.currentPage * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, this.allScores.length);
        const pageScores = this.allScores.slice(startIndex, endIndex);

        this.leaderboardList.innerHTML = '';
        if (this.allScores.length === 0) {
            this.leaderboardList.innerHTML = '<li>No scores yet. Be the first!</li>';
            this.prevPageButton.disabled = true;
            this.nextPageButton.disabled = true;
            this.pageInfoElement.textContent = 'Page 0';
            return;
        }

        pageScores.forEach((entry, index) => {
            const globalRank = startIndex + index + 1;
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="rank">${globalRank}</span>
                <span class="username">${entry.username}</span>
                <span class="score">${entry.score}</span>
            `;
            if (entry.replayUrl) {
                const button = document.createElement('button');
                button.textContent = '▶️';
                button.onclick = () => this.onViewReplayCallback(entry.replayUrl);
                li.appendChild(button);
            }
            this.leaderboardList.appendChild(li);
        });

        this.prevPageButton.disabled = this.currentPage === 0;
        this.nextPageButton.disabled = this.currentPage >= totalPages - 1;
        this.pageInfoElement.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
    }

    renderMyScoresPage() {
        if (!this.userProfile || !this.userProfile.scores || this.userProfile.scores.length === 0) {
            this.leaderboardList.innerHTML = '<li>You have no scores yet.</li>';
            this.prevPageButton.disabled = true;
            this.nextPageButton.disabled = true;
            this.pageInfoElement.textContent = 'Page 0';
            return;
        }

        const myScores = [...this.userProfile.scores].sort((a, b) => b.score - a.score);
        const totalPages = Math.ceil(myScores.length / this.itemsPerPage);
        const startIndex = this.currentPage * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, myScores.length);
        const pageScores = myScores.slice(startIndex, endIndex);

        this.leaderboardList.innerHTML = '';

        pageScores.forEach((entry, index) => {
            const rank = startIndex + index + 1;
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="rank">#${rank}</span>
                <span class="username">${new Date(entry.timestamp).toLocaleDateString()}</span>
                <span class="score">${entry.score}</span>
            `;
             if (entry.replayUrl) {
                const button = document.createElement('button');
                button.textContent = '▶️';
                button.onclick = () => this.onViewReplayCallback(entry.replayUrl);
                li.appendChild(button);
            }
            this.leaderboardList.appendChild(li);
        });

        this.prevPageButton.disabled = this.currentPage === 0;
        this.nextPageButton.disabled = this.currentPage >= totalPages - 1;
        this.pageInfoElement.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
    }
}