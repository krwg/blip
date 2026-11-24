export type Lang = "en" | "ru";

const dict = {
  en: {
    peers: "Peers",
    chat: "Chat",
    settings: "Settings",
    noPeers: "No peers on LAN yet",
    dial: "Dial",
    ping: "Ping",
    send: "Send",
    placeholder: "Message…",
    profile: "Profile",
    privacy: "Privacy",
    appearance: "Appearance",
    network: "Network",
    sound: "Sound",
    about: "About",
    displayName: "Display name",
    blipId: "BLIP ID",
    save: "Save",
    language: "Language",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    call: "Call",
    emptyChat: "Pick a peer to chat",
  },
  ru: {
    peers: "Пиры",
    chat: "Чат",
    settings: "Настройки",
    noPeers: "Пока нет пиров в LAN",
    dial: "Набрать",
    ping: "Пинг",
    send: "Отправить",
    placeholder: "Сообщение…",
    profile: "Профиль",
    privacy: "Приватность",
    appearance: "Оформление",
    network: "Сеть",
    sound: "Звук",
    about: "О приложении",
    displayName: "Имя",
    blipId: "BLIP ID",
    save: "Сохранить",
    language: "Язык",
    theme: "Тема",
    dark: "Тёмная",
    light: "Светлая",
    call: "Звонок",
    emptyChat: "Выбери пира для чата",
  },
} as const;

export type DictKey = keyof typeof dict.en;

export function t(lang: Lang, key: DictKey): string {
  return dict[lang][key] ?? dict.en[key] ?? key;
}
