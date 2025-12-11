import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { setupScene } from './setup.js';
import { UIManager } from './ui.js';
import { Game } from './game.js';
import { ReplayRecorder } from './replay.js';
import { CanvasUI } from './canvas-ui.js';
import { AudioManager } from './audio.js';
import * as ScoreStorage from './score-storage.js';

// Global state
let game, ui, canvasUI, audioManager;
let scene, world, camera, renderer, uiScene, uiCamera, sky;
let skyScene, skyCamera;
let pendingSubmissions = []; // Track background submissions
let currentUser = null;
let currentUserProfile = null;
let migrationInProgress = false;
let allProfiles = [];
let allOldScores = [];

const room = new WebsimSocket();
const OLD_SCORE_COLLECTION = 'score_v1';
const USER_PROFILE_COLLECTION = 'user_profiles_v1';
const LEADERBOARD_MAX_SIZE = 1000;

function rebuildLeaderboard() {
    const hardcodedScore = {
        username: 'SaltyEggs879845',
        score: 165,
        replayUrl: 'https://api.websim.com/blobs/019a0cf8-98e9-736f-a5b0-d2fc51f24631.webm'
    };

    const migratedUsernames = new Set(allProfiles.map(p => p.username));
    
    // 1. Process migrated users (from profiles)
    const leaderboardScores = allProfiles.map(profile => {
        const highScoreData = profile.scores?.find(s => s.score === profile.highScore);
        return {
            username: profile.username,
            score: profile.highScore || 0,
            replayUrl: highScoreData ? highScoreData.replayUrl : null,
        };
    });

    // 2. Process non-migrated users (from old scores)
    const oldScoresByUser = {};
    for (const score of allOldScores) {
        if (score.username && !migratedUsernames.has(score.username)) {
            if (!oldScoresByUser[score.username] || score.score > oldScoresByUser[score.username].score) {
                oldScoresByUser[score.username] = {
                    username: score.username,
                    score: score.score,
                    replayUrl: score.replayUrl || null,
                };
            }
        }
    }

    Object.values(oldScoresByUser).forEach(score => leaderboardScores.push(score));

    // Inject hardcoded score if user isn't already present or has a lower score
    const existingSaltyEggsScore = leaderboardScores.find(s => s.username === hardcodedScore.username);
    if (!existingSaltyEggsScore) {
        leaderboardScores.push(hardcodedScore);
    } else if (existingSaltyEggsScore.score < hardcodedScore.score) {
        existingSaltyEggsScore.score = hardcodedScore.score;
        existingSaltyEggsScore.replayUrl = hardcodedScore.replayUrl;
    }

    // 3. Sort and update UI
    const sortedScores = leaderboardScores.sort((a, b) => b.score - a.score);
    
    ui.updateLeaderboard(sortedScores, (replayUrl) => {
        ui.showReplayViewer(replayUrl);
    }, currentUserProfile);
}


async function init() {
    const {
        scene: s,
        world: w,
        camera: c,
        renderer: r,
        defaultMaterial: dm,
        uiScene: us,
        uiCamera: uc,
        sky: skyInstance,
        skyScene: ss,
        skyCamera: sc
    } = setupScene();
    scene = s;
    world = w;
    camera = c;
    renderer = r;
    uiScene = us;
    uiCamera = uc;
    sky = skyInstance;
    skyScene = ss;
    skyCamera = sc;

    ui = new UIManager();
    canvasUI = new CanvasUI(uiScene);
    audioManager = new AudioManager();
    audioManager.loadSound('place', 'block_place.mp3');
    audioManager.loadSound('fail', 'fail_sound.mp3');

    window.websim.getCurrentUser().then(async (user) => {
        currentUser = user;
        if (user) {
            migrateUserScores(); // No await here, it runs in the background
        }
        syncLocalScores();
    });

    const gameCallbacks = {
        onScoreUpdate: (score) => {
            ui.updateScore(score);
            canvasUI.updateScore(score);
        },
        onStreakUpdate: (count, isGolden, isPerfectHit) => {
            ui.updateStreak(count, isGolden, isPerfectHit);
        },
        onGameOver: (score) => {
            const endedGameSession = {
                score,
                replayRecorder: game.getReplayRecorder(),
            };
            
            // Stop the recorder immediately to finalize the video
            endedGameSession.replayRecorder?.stop();

            ui.showGameOver(score);
            ui.setReplayButtonState(true, 'Preparing...');
            
            handleFinishedGame(endedGameSession);
        }
    };

    game = new Game(scene, world, dm, camera, gameCallbacks, audioManager);
    
    setupEventListeners();
    
    room.collection(USER_PROFILE_COLLECTION).subscribe(profiles => {
        allProfiles = profiles;
        if (currentUser) {
            currentUserProfile = profiles.find(p => p.username === currentUser.username) || null;
        }
        rebuildLeaderboard();
    });

    room.collection(OLD_SCORE_COLLECTION).subscribe(scores => {
        allOldScores = scores;
        rebuildLeaderboard();
    });

    renderer.setAnimationLoop(animate);
    startGame();
}

function getDataOnce(collection, filterFn = () => true) {
    return new Promise(resolve => {
        const unsubscribe = collection.subscribe(items => {
            const filteredItems = items.filter(filterFn);
            if (items.length > 0 || (items.length === 0 && collection.getList().length === 0)) { // Ensure it's not just an initial empty list
                unsubscribe();
                resolve(filteredItems);
            }
        });
    });
}

async function migrateUserScores() {
    if (!currentUser || migrationInProgress) return;
    migrationInProgress = true;

    try {
        const [profiles, oldScores] = await Promise.all([
            getDataOnce(room.collection(USER_PROFILE_COLLECTION), p => p.username === currentUser.username),
            getDataOnce(room.collection(OLD_SCORE_COLLECTION), s => s.username === currentUser.username)
        ]);

        let userProfile = profiles[0] || null;

        if (userProfile) {
            currentUserProfile = userProfile;
            console.log("User profile already exists. No migration needed.");
            return;
        }

        if (oldScores.length > 0) {
            console.log(`Migrating ${oldScores.length} scores for user ${currentUser.username}...`);
            
            const newScoresArray = oldScores.map(s => ({
                score: s.score,
                replayUrl: s.replayUrl || null,
                timestamp: s.created_at
            })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            const highScore = Math.max(...newScoresArray.map(s => s.score), 0);
            
            const newProfile = await room.collection(USER_PROFILE_COLLECTION).create({
                scores: newScoresArray,
                highScore: highScore
            });
            currentUserProfile = newProfile;
            console.log("Migration successful. New profile created.");

            for (const oldScore of oldScores) {
                try {
                    await room.collection(OLD_SCORE_COLLECTION).delete(oldScore.id);
                } catch (deleteError) {
                    console.error(`Failed to delete old score ${oldScore.id}:`, deleteError);
                }
            }
            console.log("Old scores cleaned up.");
        } else {
            console.log("No old scores found to migrate.");
        }
    } catch (error) {
        console.error("Error during score migration:", error);
    } finally {
        migrationInProgress = false;
    }
}

function startGame() {
    // Ensure audio context is running before we start recording
    audioManager.unlockAudio();

    const newReplayRecorder = new ReplayRecorder(renderer.domElement, audioManager);
    game.start(newReplayRecorder);
    ui.hideGameOver();
    ui.showInstructions(true);
    canvasUI.updateScore(0);
}

function restart() {
    game.restart();
    startGame();
}

async function handleFinishedGame(session) {
    const { score, replayRecorder } = session;
    if (!replayRecorder) {
        autoSubmitScore(null, score, false);
        return;
    }

    const replayBlobPromise = replayRecorder.getReplayBlob();

    replayBlobPromise.then(blob => {
        ui.setReplayButtonState(false, 'Watch Replay', blob);
        autoSubmitScore(blob, score, true);
    }).catch(error => {
        console.error("Error getting replay blob:", error);
        ui.setReplayButtonState(false, 'Replay Failed');
        autoSubmitScore(null, score, false);
    });
}


async function autoSubmitScore(replayBlob, scoreToSubmit, hasReplay, localTempId = null) {
    if (hasReplay && (!replayBlob || replayBlob.size === 0) && !localTempId) {
        console.warn("Auto-submit cancelled: replay blob is invalid.");
        if (!ui.gameOverElement.classList.contains('hidden')) {
            ui.setSubmitStatus('Replay failed. Score not submitted.', '#f44336');
        }
        return;
    }

    const isResubmission = !!localTempId;
    let tempId = localTempId;
    let submissionData;

    if (isResubmission) {
        const localScores = ScoreStorage.getUserScores(currentUser.username);
        const localScore = localScores.find(s => s.tempId === localTempId);
        if (localScore) {
            submissionData = { ...localScore };
        } else {
            console.error("Could not find local score for resubmission.");
            return;
        }
    } else {
        submissionData = {
            score: scoreToSubmit,
            replayUrl: null,
            timestamp: new Date().toISOString(),
        };
    }

    if (!isResubmission && currentUser) {
        tempId = ScoreStorage.saveUserScore(currentUser.username, submissionData);
    }

    // Add visual indicator to trophy button
    const leaderboardButton = document.getElementById('leaderboard-button');
    leaderboardButton.classList.add('uploading');
    leaderboardButton.textContent = '⏳';

    const submissionPromise = (async () => {
        let isScoreSubmitted = false;
        try {
            const userForSubmission = currentUser || await window.websim.getCurrentUser();
            if (!userForSubmission) {
                throw new Error('Could not get user info for submission.');
            }
            if (!currentUser) currentUser = userForSubmission;
            
            // Wait for any pending migration to complete before proceeding
            if (migrationInProgress) {
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (!migrationInProgress) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            } 

            const allProfiles = room.collection(USER_PROFILE_COLLECTION).getList();
            
            // --- Leaderboard Cap Logic ---
            if (allProfiles.length >= LEADERBOARD_MAX_SIZE) {
                const lowestHighScore = allProfiles.reduce((min, p) => (p.highScore || 0) < min ? p.highScore : min, Infinity);
                if (submissionData.score <= lowestHighScore) {
                    console.log('Score too low for full leaderboard.');
                    if (!ui.gameOverElement.classList.contains('hidden') && !isResubmission) {
                        ui.setSubmitStatus(`Score must be > ${lowestHighScore} to make the leaderboard.`, '#ff9800');
                    }
                    if (tempId) ScoreStorage.removeUserScore(currentUser.username, tempId);
                    return;
                }
            }

            const userProfile = currentUserProfile;
            const newScoreEntry = {
                score: submissionData.score,
                replayUrl: submissionData.replayUrl,
                timestamp: submissionData.timestamp
            };
            
            let replayUrl = submissionData.replayUrl;
            if (hasReplay && replayBlob) {
                try {
                    replayUrl = await window.websim.upload(replayBlob);
                    if (!replayUrl) throw new Error('Upload returned invalid URL');
                    
                    const response = await fetch(replayUrl, { method: 'HEAD' });
                    if (!response.ok) throw new Error('Uploaded file not accessible');
                    if (tempId) ScoreStorage.updateUserScore(currentUser.username, tempId, { replayUrl });
                    newScoreEntry.replayUrl = replayUrl;

                } catch (uploadError) {
                    console.error("Replay upload failed:", uploadError);
                     if (!ui.gameOverElement.classList.contains('hidden') && !isResubmission) {
                        ui.setSubmitStatus('Replay upload failed. Score not submitted.', '#f44336');
                    }
                    if (tempId) ScoreStorage.removeUserScore(currentUser.username, tempId);
                    return; 
                }
            } else if (isResubmission) {
                const localData = ScoreStorage.getUserScores(currentUser.username).find(s => s.tempId === tempId);
                if (localData && localData.replayUrl) {
                    replayUrl = localData.replayUrl;
                    newScoreEntry.replayUrl = replayUrl;
                }
            }

            if (hasReplay && !newScoreEntry.replayUrl && !isResubmission) {
                console.error('Replay upload seems to have failed silently.');
                if (!ui.gameOverElement.classList.contains('hidden')) {
                    ui.setSubmitStatus('Replay upload incomplete. Score not submitted.', '#f44336');
                }
                if (tempId) ScoreStorage.removeUserScore(currentUser.username, tempId);
                return;
            }

            if (!ui.gameOverElement.classList.contains('hidden') && !isResubmission) {
                 ui.setSubmitStatus('Saving score...', '#ff9800');
            }

            if (userProfile) {
                let updatedScores = [newScoreEntry, ...(userProfile.scores || [])];
                
                // Limit to 10 scores, removing the lowest
                if (updatedScores.length > 10) {
                    updatedScores.sort((a, b) => b.score - a.score); // Sort descending by score
                    updatedScores = updatedScores.slice(0, 10);
                }
                
                const newHighScore = Math.max(submissionData.score, userProfile.highScore || 0);

                await room.collection(USER_PROFILE_COLLECTION).update(userProfile.id, {
                    scores: updatedScores,
                    highScore: newHighScore
                });

                if (!ui.gameOverElement.classList.contains('hidden') && !isResubmission) {
                    ui.setSubmitStatus(submissionData.score >= (userProfile.highScore || 0) ? 'High score updated!' : 'Score saved!', '#4CAF50');
                }
            } else {
                await room.collection(USER_PROFILE_COLLECTION).create({
                    scores: [newScoreEntry],
                    highScore: submissionData.score
                });
                if (!ui.gameOverElement.classList.contains('hidden') && !isResubmission) {
                    ui.setSubmitStatus('High score submitted!', '#4CAF50');
                }
            }
            isScoreSubmitted = true;
            if (tempId) ScoreStorage.removeUserScore(currentUser.username, tempId);

        } catch (error) {
            console.error("Failed to auto-submit score:", error);
            if (!ui.gameOverElement.classList.contains('hidden') && !isResubmission) {
                ui.setSubmitStatus('Error submitting score.', '#f44336');
            }
        } finally {
            if (isScoreSubmitted) {
                leaderboardButton.classList.remove('uploading');
                leaderboardButton.classList.add('upload-complete');
                leaderboardButton.textContent = '✅';
                
                setTimeout(() => {
                    leaderboardButton.classList.remove('upload-complete');
                    leaderboardButton.textContent = '🏆';
                }, 3000);
            } else {
                 leaderboardButton.classList.remove('uploading');
                 leaderboardButton.textContent = '🏆';
            }
        }
    })();

    pendingSubmissions.push(submissionPromise);
    submissionPromise.finally(() => {
        const index = pendingSubmissions.indexOf(submissionPromise);
        if (index > -1) {
            pendingSubmissions.splice(index, 1);
        }
    });
}

async function syncLocalScores() {
    if (!currentUser) return;

    let localScores = ScoreStorage.getUserScores(currentUser.username);
    const userProfile = currentUserProfile;
    const dbScores = userProfile ? (userProfile.scores || []) : [];

    if (localScores.length === 0 && dbScores.length === 0) {
        return; // Nothing to sync
    }

    console.log(`Syncing scores. Local: ${localScores.length}, DB: ${dbScores.length}`);

    const localTimestamps = new Set(localScores.map(s => s.timestamp));
    const dbTimestamps = new Set(dbScores.map(s => s.timestamp));

    // 1. Find scores in DB that are NOT in local storage and add them locally.
    const scoresToAddToLocal = dbScores.filter(dbScore => !localTimestamps.has(dbScore.timestamp));
    if (scoresToAddToLocal.length > 0) {
        console.log(`Adding ${scoresToAddToLocal.length} scores from DB to local storage.`);
        scoresToAddToLocal.forEach(score => {
            // saveUserScore will add a tempId automatically
            ScoreStorage.saveUserScore(currentUser.username, {
                score: score.score,
                replayUrl: score.replayUrl,
                timestamp: score.timestamp
            });
        });
    }
    
    // Refresh localScores after potential additions
    localScores = ScoreStorage.getUserScores(currentUser.username);

    // 2. Find scores in local storage that are NOT in DB and submit them.
    // Also handle scores that might be synced but local copy can be removed.
    for (const localScore of localScores) {
        const isSynced = dbTimestamps.has(localScore.timestamp);

        if (isSynced) {
            // It's on the server, so we can clean it up locally.
            // This case might happen if a previous sync-up succeeded but the local removal failed.
            ScoreStorage.removeUserScore(currentUser.username, localScore.tempId);
        } else {
            console.log(`Resubmitting local score: ${localScore.score} from ${localScore.timestamp}`);
            // Resubmit. This uses the autoSubmit logic which includes all checks.
            const hasReplay = !!localScore.replayUrl;
            autoSubmitScore(null, localScore.score, hasReplay, localScore.tempId);
        }
    }
}

async function viewReplay() {
    const blob = ui.getCurrentReplayBlob();
    if (!blob) {
        alert("Replay not available or still processing.");
        return;
    }

    ui.setReplayButtonState(true, 'Loading...');
    try {
        ui.showReplayViewer(blob);
    } catch (error) {
        console.error("Error viewing replay:", error);
        alert("Could not load replay.");
    } finally {
        ui.setReplayButtonState(false, 'Watch Replay', blob);
    }
}

async function submitScore() {
    // This function is no longer used and can be removed or left empty.
    // For safety, we'll just log that it was called.
    console.log("submitScore called, but functionality is now in autoSubmitScore.");
}

function setupEventListeners() {
    ui.setupEventListeners({
        onPointerDown: () => {
            audioManager.unlockAudio();
            if (game.getState() === 'playing') {
                ui.showInstructions(false);
                game.onPointerDown();
            }
        },
        onRestart: restart,
        onViewReplay: viewReplay,
        onViewLeaderboard: () => ui.showLeaderboard(),
        onCloseLeaderboard: () => {
            ui.hideLeaderboard();
            const gameState = game.getState();
            if (gameState === 'gameover') {
                ui.showGameOver(game.getScore());
            } else if (gameState !== 'playing') {
                restart();
            }
            // If game is 'playing', do nothing extra, just hide the leaderboard.
        },
        onWindowResize: () => {
            const aspect = window.innerWidth / window.innerHeight;
            const frustumSize = 4;
            camera.left = frustumSize * aspect / -2;
            camera.right = frustumSize * aspect / 2;
            camera.top = frustumSize / 2;
            camera.bottom = frustumSize / -2;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);

            uiCamera.left = -window.innerWidth / 2;
            uiCamera.right = window.innerWidth / 2;
            uiCamera.top = window.innerHeight / 2;
            uiCamera.bottom = -window.innerHeight / 2;
            uiCamera.updateProjectionMatrix();
            canvasUI.onWindowResize();
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (pendingSubmissions.length > 0) {
            event.preventDefault();
            event.returnValue = ''; // For Chrome
            return "Your score is still uploading. Are you sure you want to leave?"; // For older browsers
        }
    });
}

function animate() {
    world.step(1 / 60);
    game.update();
    sky.update();
    
    renderer.clear();

    // Render sky first with its own camera
    renderer.render(skyScene, skyCamera);

    // Render game scene
    renderer.render(scene, camera);

    renderer.clearDepth();
    renderer.render(uiScene, uiCamera);

    // Update replay recorder synchronously with render to avoid black frames / desync
    // This ensures we capture the fully rendered frame, not a cleared buffer
    const recorder = game.getReplayRecorder();
    if (recorder) {
        recorder.update();
    }
}

init();