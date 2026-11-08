'use strict';
// ───────────── Мови: українська (за замовчуванням) та English ─────────────
// Усі тексти в коді написані українською; t() перекладає їх англійською за словником із застосунку
// (EN_DICT, EN_RULES згенеровано з Localization.kt) та за додатковими рядками веб-версії (EN_EXTRA).

const LANGUAGES = [{ code: 'uk', title: 'Українська' }, { code: 'en', title: 'English' }];
let LANG = 'uk';

const EN_EXTRA = {
    'Сайт': 'Website',
    'Мережа': 'Network',
    'Підключення до мосту': 'Bridge connection',
    'Адреса мосту': 'Bridge address',
    'Підключити': 'Connect',
    'Міст підключено': 'Bridge connected',
    'Міст не підключено': 'Bridge not connected',
    'Підключаємось до мосту…': 'Connecting to the bridge…',
    'Не вдалося підключитись до мосту. Запустіть його на комп’ютері (див. інструкцію).':
        'Could not connect to the bridge. Start it on your computer (see the guide).',
    'Ігри в мережі': 'Games on the network',
    'Оновити': 'Refresh',
    'Ігор не знайдено. Перевірте, що телефон і комп’ютер в одній Wi-Fi мережі, або введіть адресу вручну.':
        'No games found. Make sure the phone and the computer are on the same Wi-Fi, or enter the address manually.',
    'Вхід за адресою': 'Join by address',
    'IP хоста': 'Host IP',
    'Порт': 'Port',
    'Приєднатися': 'Join',
    'Приєднуємось…': 'Joining…',
    'Хост': 'Host',
    'Гравці': 'Players',
    'Порожньо': 'Empty',
    'Не в мережі': 'Offline',
    'Бій': 'Battle',
    'Очікуємо, поки хост розпочне бій.': 'Waiting for the host to start the battle.',
    'Вийти з кімнати': 'Leave the room',
    'Підтвердити': 'Confirm',
    'Заперечити': 'Deny',
    'Підтвердження результату': 'Result confirmation',
    'Результат занесено в статистику.': 'The result was added to the statistics.',
    'Профіль гравця': 'Player profile',
    'Скасувати турнір': 'Cancel tournament',
    'ПІДТВЕРДИТИ ВИБІР': 'CONFIRM SELECTION',
    'Експорт': 'Export',
    'Імпорт': 'Import',
    'Резервна копія': 'Backup',
    'Файл не підходить.': 'This file is not suitable.',
    'Додати': 'Add',
    'Видалити': 'Delete',
    'Назва': 'Name',
    'Створити акаунт': 'Create account',
    'Увійти': 'Sign in',
    'Вийти': 'Sign out',
    'Нікнейм': 'Nickname',
    'Пароль': 'Password',
    'Гість': 'Guest',
    'Тема': 'Theme',
    'Мова': 'Language',
    'Закрити': 'Close',
    'Старт': 'Start',
    'Стоп': 'Stop',
    'Відхилити': 'Reject',
    'Нова партія': 'New game',
    'Кількість гравців': 'Number of players',
    'Команди обирають гравці': 'Players choose teams',
    'Команда': 'Team',
    'Без повторів': 'No repeats',
    'Скинути використаних': 'Reset used',
    'Додати персонажа': 'Add character',
    'Додати поле': 'Add field',
    'Коробка': 'Box',
    'Іконка': 'Icon',
    'Файл': 'File',
    'Встановити на пристрій': 'Install on device',
    'Кімната': 'Room',
    '＋ Додати матч вручну': '＋ Add a match manually',
    'Додати матч': 'Add a match',
    'Зберегти матч': 'Save match',
    'Внесено вручну': 'Added manually',
    'Внесіть гру, зіграну без застосунку, щоб статистика була повнішою.': 'Enter a game played without the app to make your statistics more complete.',
    'Формат': 'Format',
    'Мій персонаж': 'My character',
    'Мої персонажі (1–2)': 'My characters (1–2)',
    'Поле': 'Field',
    'Результат': 'Result',
    'Порядок ходу (необов’язково)': 'Turn order (optional)',
    'Номер ходу для кожного персонажа (необов’язково)': 'Turn number for each character (optional)',
    'Перший': 'First',
    'Другий': 'Second',
    'Додатково (необов’язково)': 'Additional (optional)',
    'Суперники (нікнейми, через кому)': 'Opponents (nicknames, comma-separated)',
    'Персонажі суперників': 'Opponents’ characters',
    'Дата й час': 'Date and time',
    'Тривалість, хвилин': 'Duration, minutes',
    'Не обрано': 'Not selected',
    'Пошук': 'Search',
    'Нічого не знайдено.': 'Nothing found.',
    'Обери свого персонажа.': 'Choose your character.',
    'Обери поле.': 'Choose a field.',
    'Вкажи результат: перемога чи поразка.': 'Choose the result: win or loss.',
    'Вкажи номер ходу для кожного персонажа або прибери вибір.': 'Set a turn number for each character or clear the selection.',
    'Вкажіть дату й час.': 'Enter the date and time.',
    'Дата не може бути в майбутньому.': 'The date cannot be in the future.',
    'Тривалість — число хвилин від 0 до 600.': 'Duration is a number of minutes from 0 to 600.',
    'Матч додано до статистики.': 'The match was added to the statistics.',
    'Статистика поки порожня. Зіграйте мережеву гру або додайте матч вручну.': 'The statistics are empty. Play a network game or add a match manually.',
    'Адреса кімнати': 'Room address',
    'Введіть адресу кімнати, як у застосунку.': 'Enter the room address as shown in the app.',
    'Відкрити сторінку кімнати': 'Open the room page',
    'Не вдалося підключитись до гри.': 'Could not connect to the game.',
    'Введіть адресу з рядка «Адреса для сайту» в застосунку хоста.': 'Enter the address from the “Address for the website” line in the host app.',
    'Введіть адресу з рядка «Адреса для сайту» в застосунку хоста. Сторінка кімнати відкриється з телефона хоста, а ваш акаунт перенесеться автоматично. Потрібна та сама Wi-Fi мережа або точка доступу хоста.':
        'Enter the address from the “Address for the website” line in the host app. The room page will open from the host phone and your account will be transferred automatically. You must be on the same Wi-Fi or the host’s hotspot.',
    'Акаунт перенесено з сайту.': 'Account transferred from the website.',
    'На цьому пристрої вже є акаунт з таким нікнеймом, але з іншим паролем.': 'This device already has an account with this nickname but a different password.',
    'Офіційних персонажів видалити не можна.': 'Official characters cannot be deleted.',
    'Офіційні поля видалити не можна.': 'Official fields cannot be deleted.',
    'Офіційний персонаж': 'Official character',
    'Офіційне поле': 'Official field',
    'Усі офіційні коробки додано автоматично, їх не можна видалити чи змінити.': 'All official boxes are added automatically and cannot be deleted or changed.'
};

function tEn(raw) {
    const s = raw.replace(/\u2011/g, '-');
    if (Object.prototype.hasOwnProperty.call(EN_DICT, s)) return EN_DICT[s];
    if (Object.prototype.hasOwnProperty.call(EN_EXTRA, s)) return EN_EXTRA[s];
    if (s.includes('\n')) return s.split('\n').map(tEn).join('\n');
    if (s.includes(' • ')) return s.split(' • ').map(tEn).join(' • ');
    let m;
    if ((m = /^(.*), обери 2 персонажів, поле й хто ходить першим$/s.exec(s))) return `${m[1]}, choose 2 characters, the field and who goes first`;
    if ((m = /^(.*), обери, за кого гратимеш$/s.exec(s))) return `${m[1]}, choose who you will play`;
    for (const [re, f] of EN_RULES) {
        const mm = re.exec(s);
        if (mm) return f(mm);
    }
    return raw;
}

/** Переклад рядка (українська → поточна мова). Невідомі рядки (імена, нікнейми) показуються як є. */
function t(text) {
    if (LANG === 'uk' || !text) return text;
    return tEn(String(text));
}

function setLang(code) {
    LANG = LANGUAGES.some((l) => l.code === code) ? code : 'uk';
    document.documentElement.lang = LANG;
}

if (typeof module !== 'undefined') module.exports = { t, setLang, tEn };
