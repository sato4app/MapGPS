// ポイントGPS チュートリアル JavaScript
// scriptフォルダのファイルを動的に読み込んで表示

// DOM要素の取得
let player; // YouTube Player オブジェクト
let scriptSection; // スクリプトセクション（DOMContentLoaded後に取得）

// 音声管理用の変数
let currentAudio = null;
let audioElements = new Map(); // 音声要素のキャッシュ
let paragraphs = []; // 動的に生成される段落要素
let updateInterval = null; // 時間更新用のインターバル

// YouTube APIの準備完了フラグ
let isYouTubeAPIReady = false;
let isDOMReady = false;

// scriptファイルを読み込む関数
async function loadScriptFile(scriptPath) {
    try {
        const response = await fetch(scriptPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        return text.trim();
    } catch (error) {
        console.error(`scriptファイルの読み込みエラー: ${scriptPath}`, error);
        return `[エラー: ${scriptPath}を読み込めませんでした]`;
    }
}

// 台本セグメントを動的に生成
async function buildScriptSections() {
    console.log('台本セグメントを生成中...');

    // tutorial-config.jsが読み込まれているか確認
    if (typeof SEGMENTS_WITH_TIMESTAMPS === 'undefined') {
        console.error('SEGMENTS_WITH_TIMESTAMPSが定義されていません。tutorial-config.jsが正しく読み込まれているか確認してください。');
        return;
    }

    console.log('セグメント数:', SEGMENTS_WITH_TIMESTAMPS.length);

    // タイトル以降の内容をクリア
    const title = scriptSection.querySelector('.script-title');
    scriptSection.innerHTML = '';
    scriptSection.appendChild(title);

    // 各セグメントを生成
    for (const segment of SEGMENTS_WITH_TIMESTAMPS) {
        // scriptファイルからテキストを読み込み
        const scriptText = await loadScriptFile(segment.scriptFile);

        // 段落要素を作成
        const paragraphDiv = document.createElement('div');
        paragraphDiv.className = 'script-paragraph';
        paragraphDiv.setAttribute('data-start', segment.start);
        paragraphDiv.setAttribute('data-end', segment.end);
        paragraphDiv.setAttribute('data-audio', segment.audioFile);
        paragraphDiv.setAttribute('data-index', segment.index);

        // タイムスタンプを作成
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = `${segment.startLabel} - ${segment.endLabel}`;

        // テキストノードを作成
        const textNode = document.createTextNode(scriptText);

        // 段落に追加
        paragraphDiv.appendChild(timestampSpan);
        paragraphDiv.appendChild(document.createElement('br'));
        paragraphDiv.appendChild(textNode);

        // scriptSectionに追加
        scriptSection.appendChild(paragraphDiv);
    }

    // 生成された段落を取得
    paragraphs = Array.from(document.querySelectorAll('.script-paragraph'));

    console.log(`台本セグメント生成完了: ${paragraphs.length}個`);
    console.log('scriptSection.children.length:', scriptSection.children.length);
    console.log('scriptSection HTML:', scriptSection.innerHTML.substring(0, 200));

    // イベントリスナーを設定
    setupEventListeners();

    // 音声ファイルを事前ロード
    preloadAudioFiles();
}

// 音声要素を事前にロードしてキャッシュ
function preloadAudioFiles() {
    paragraphs.forEach((paragraph, index) => {
        const audioSrc = paragraph.getAttribute('data-audio');
        if (audioSrc) {
            const audio = new Audio(audioSrc);
            audio.preload = 'auto';
            audioElements.set(index, audio);

            // 音声再生エラーハンドリング
            audio.addEventListener('error', function() {
                console.error(`音声ファイルの読み込みエラー: ${audioSrc}`);
            });
        }
    });
    console.log('音声ファイルの事前ロード完了');
}

// 音声を再生
function playAudio(index) {
    // 現在の音声を停止
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    // 新しい音声を再生
    const audio = audioElements.get(index);
    if (audio) {
        currentAudio = audio;
        audio.currentTime = 0;

        // 音声再生をPromiseで処理
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log(`音声再生開始: segment ${index + 1}`);
                })
                .catch(error => {
                    console.error('音声再生エラー:', error);
                });
        }
    }
}

// 音声を停止
function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

// 台本の段落をハイライトし、自動スクロール
function highlightParagraph(paragraph) {
    // 全ての段落からactiveクラスを削除
    paragraphs.forEach(p => p.classList.remove('active'));

    // 指定された段落にactiveクラスを追加
    paragraph.classList.add('active');

    // 自動スクロール
    const paragraphTop = paragraph.offsetTop;
    const sectionHeight = scriptSection.clientHeight;
    const paragraphHeight = paragraph.clientHeight;

    scriptSection.scrollTo({
        top: paragraphTop - (sectionHeight / 2) + (paragraphHeight / 2),
        behavior: 'smooth'
    });
}

// YouTube Player APIの準備完了時に呼ばれる関数
function onYouTubeIframeAPIReady() {
    console.log('YouTube API準備完了');
    isYouTubeAPIReady = true;
    initializeIfReady();
}

// DOMとYouTube APIの両方が準備完了したら初期化
function initializeIfReady() {
    console.log('initializeIfReady呼び出し - isDOMReady:', isDOMReady, 'isYouTubeAPIReady:', isYouTubeAPIReady);

    if (isDOMReady && isYouTubeAPIReady) {
        console.log('初期化開始');

        // scriptSection要素を取得
        scriptSection = document.getElementById('scriptSection');

        if (!scriptSection) {
            console.error('scriptSection要素が見つかりません');
            return;
        }

        console.log('scriptSection要素取得成功');

        // tutorial-config.jsが読み込まれているか確認
        if (typeof SEGMENTS_WITH_TIMESTAMPS === 'undefined') {
            console.error('SEGMENTS_WITH_TIMESTAMPSが定義されていません');
            return;
        }

        console.log('SEGMENTS_WITH_TIMESTAMPS取得成功:', SEGMENTS_WITH_TIMESTAMPS.length, 'セグメント');

        // YouTube Playerを初期化
        try {
            player = new YT.Player('tutorialVideo', {
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
            console.log('YouTube Player初期化成功');
        } catch (error) {
            console.error('YouTube Player初期化エラー:', error);
        }
    }
}

// プレイヤーの準備が完了したときに呼ばれる
async function onPlayerReady(event) {
    console.log('YouTube Player準備完了');
    // 台本セグメントを動的に生成
    try {
        await buildScriptSections();
        console.log('台本セグメント生成完了');
    } catch (error) {
        console.error('台本セグメント生成エラー:', error);
    }
}

// プレイヤーの状態が変化したときに呼ばれる
function onPlayerStateChange(event) {
    // YT.PlayerState.PLAYING = 1
    if (event.data === YT.PlayerState.PLAYING) {
        console.log('動画再生開始');
        startTimeUpdate();
    }
    // YT.PlayerState.PAUSED = 2
    else if (event.data === YT.PlayerState.PAUSED) {
        console.log('動画一時停止');
        stopTimeUpdate();
        stopAudio();
    }
    // YT.PlayerState.ENDED = 0
    else if (event.data === YT.PlayerState.ENDED) {
        console.log('動画再生終了');
        stopTimeUpdate();
        stopAudio();
        paragraphs.forEach(p => p.classList.remove('active'));
    }
}

// 時間更新を開始
function startTimeUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    updateInterval = setInterval(updateCurrentTime, 100); // 100msごとに更新
}

// 時間更新を停止
function stopTimeUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// 現在の再生時間を取得してハイライトを更新
function updateCurrentTime() {
    if (!player || typeof player.getCurrentTime !== 'function') {
        return;
    }

    const currentTime = player.getCurrentTime();

    paragraphs.forEach((paragraph, index) => {
        const start = parseFloat(paragraph.getAttribute('data-start'));
        const end = parseFloat(paragraph.getAttribute('data-end'));

        if (currentTime >= start && currentTime < end) {
            // まだハイライトされていない場合のみ処理
            if (!paragraph.classList.contains('active')) {
                highlightParagraph(paragraph);
                playAudio(index);
            }
        }
    });
}

// イベントリスナーを設定
function setupEventListeners() {
    // 段落をクリックすると、その時点から動画を再生
    paragraphs.forEach((paragraph, index) => {
        paragraph.addEventListener('click', function() {
            const start = parseFloat(this.getAttribute('data-start'));

            // 動画の再生位置を変更
            if (player && typeof player.seekTo === 'function') {
                player.seekTo(start, true);
                player.playVideo();

                // 該当の段落をハイライト
                highlightParagraph(paragraph);
                // 音声を再生
                playAudio(index);
            }
        });
    });
}

// DOMの準備完了時
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM準備完了');
    isDOMReady = true;
    initializeIfReady();
});

// ページを離れる前にリソースをクリーンアップ
window.addEventListener('beforeunload', () => {
    stopTimeUpdate();
    stopAudio();
    audioElements.clear();
});
