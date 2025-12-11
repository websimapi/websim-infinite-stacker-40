// ... existing code ...
let allProfiles = [];
let allOldScores = [];
let lastFrameTime = 0;

const room = new WebsimSocket();
const OLD_SCORE_COLLECTION = 'score_v1';
// ... existing code ...
    renderer.setAnimationLoop(animate);
    startGame();
}

function getDataOnce(collection, filterFn = () => true) {
// ... existing code ...
async function handleFinishedGame(session) {
    const { score, replayRecorder } = session;
    if (!replayRecorder) {
        autoSubmitScore(null, score, false);
        return;
    }

    // Stop the recorder immediately to finalize the video
    // This is already done in onGameOver, but safe to ensure? 
    // Actually onGameOver calls stop().
    // We just need to get the blob.

    const replayBlobPromise = replayRecorder.getReplayBlob();

    replayBlobPromise.then(blob => {
// ... existing code ...
        }
    });
}

function animate(time) {
    if (!lastFrameTime) lastFrameTime = time;
    const dt = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

    // Clamp dt to avoid huge jumps on tab switch
    const safeDt = Math.min(dt, 0.1);

    world.step(1 / 60, safeDt, 3);
    game.update();
    sky.update();
    
    renderer.clear();

    // Render sky first with its own camera
    renderer.render(skyScene, skyCamera);

    // Render game scene
    renderer.render(scene, camera);

    renderer.clearDepth();
    renderer.render(uiScene, uiCamera);

    // Update recorder synchronously with render to ensure frame capture alignment
    const recorder = game.getReplayRecorder();
    if (recorder) {
        recorder.update();
    }
}

init();