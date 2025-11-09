// チュートリアル設定ファイル
// 各セグメントの再生時間と対応するファイルを定義

const TUTORIAL_CONFIG = {
    // YouTube動画URL
    // videoPath: 'https://youtu.be/-wBnHrMF4OI',
    videoPath: 'https://youtu.be/-wBnHrMF4OI',
    // YouTube埋め込みURL
    // videoEmbedUrl: 'https://www.youtube.com/embed/-wBnHrMF4OI',
    videoEmbedUrl: 'https://www.youtube.com/embed/NoMdtTrtSrM',

    // 各セグメントの設定
    // duration: そのセグメントの長さ（秒）
    // scriptFile: 台本テキストファイル
    // audioFile: 音声ファイル
    segments: [
        {
            duration: 14.5,
            scriptFile: 'script/script_01.txt',
            audioFile: 'audio/audio_01.wav'
        },
        {
            duration: 16.5,
            scriptFile: 'script/script_02.txt',
            audioFile: 'audio/audio_02.wav'
        },
        {
            duration: 21.5,
            scriptFile: 'script/script_03.txt',
            audioFile: 'audio/audio_03.wav'
        },
        {
            duration: 54.5,
            scriptFile: 'script/script_04.txt',
            audioFile: 'audio/audio_04.wav'
        },
        {
            duration: 16.5,
            scriptFile: 'script/script_05.txt',
            audioFile: 'audio/audio_05.wav'
        },
        {
            duration: 35.5,
            scriptFile: 'script/script_06.txt',
            audioFile: 'audio/audio_06.wav'
        },
        {
            duration: 33.5,
            scriptFile: 'script/script_07.txt',
            audioFile: 'audio/audio_07.wav'
        },
        {
            duration: 19.5,
            scriptFile: 'script/script_08.txt',
            audioFile: 'audio/audio_08.wav'
        },
        {
            duration: 12.5,
            scriptFile: 'script/script_09.txt',
            audioFile: 'audio/audio_09.wav'
        },
        {
            duration: 14.5,
            scriptFile: 'script/script_10.txt',
            audioFile: 'audio/audio_10.wav'
        }
    ]
};

// タイムスタンプを自動計算する関数
function calculateTimestamps() {
    let currentTime = 0;
    const timestampedSegments = [];

    TUTORIAL_CONFIG.segments.forEach((segment, index) => {
        const start = currentTime;
        const end = currentTime + segment.duration;

        timestampedSegments.push({
            index: index,
            start: start,
            end: end,
            duration: segment.duration,
            scriptFile: segment.scriptFile,
            audioFile: segment.audioFile,
            // タイムスタンプ表示用（分:秒形式）
            startLabel: formatTime(start),
            endLabel: formatTime(end)
        });

        currentTime = end;
    });

    return timestampedSegments;
}

// 秒数を "分:秒" 形式に変換
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// タイムスタンプ付きセグメントを取得
const SEGMENTS_WITH_TIMESTAMPS = calculateTimestamps();

// デバッグ用：コンソールに情報を表示
console.log('チュートリアル設定読み込み完了');
console.log('総セグメント数:', TUTORIAL_CONFIG.segments.length);
console.log('総再生時間:', formatTime(SEGMENTS_WITH_TIMESTAMPS[SEGMENTS_WITH_TIMESTAMPS.length - 1].end));
