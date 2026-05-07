// メッセージ表示機能

export function showMessage(message, type = 'success') {
    const existingMsg = document.querySelector('.toast-message');
    if (existingMsg) existingMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `toast-message ${type}`;
    msgDiv.innerHTML = message.replace(/\n/g, '<br>');
    document.body.appendChild(msgDiv);

    const displayTime = type === 'error' ? 6000 : type === 'warning' ? 4500 : 3000;

    setTimeout(() => {
        msgDiv.classList.add('fade-out');
        setTimeout(() => msgDiv.remove(), 300);
    }, displayTime);
}
